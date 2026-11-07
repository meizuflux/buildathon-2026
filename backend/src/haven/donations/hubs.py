"""Donation hubs (organizations with a public site): lookup, walk-in donations, pickup dispatch.

Hub stock is never typed in wholesale: it changes through app events (pledges received, requests
fulfilled, shipments, walk-ins, pickups). "% full" is derived from stock and the hub's storage size,
and targets come from demand near the hub (targets.py).
"""

from typing import Annotated, Any, Literal, cast
from uuid import uuid4

import apsw
import msgspec
from litestar import Request, get, patch, post, put
from litestar.params import FromPath, FromQuery, JSONBody, Parameter

from haven.auth import now, timestamp
from haven.db import connect
from haven.donations.common import (
    Items,
    Notes,
    ResourceTypeId,
    add_stock,
    catalog,
    error,
    haversine_km,
    hub_exists,
    not_found,
    organization_exists,
    parse_items,
    pledged,
    remove_stock,
    require_hub_access,
    require_role,
    stock,
    validate_items,
    write_transaction,
)
from haven.donations.matching import match_waiting_requests
from haven.donations.targets import hub_targets

SiteType = Literal["mosque", "church", "fire_station", "school", "community_center", "other"]


class HubSetup(msgspec.Struct, forbid_unknown_fields=True):
    site_type: SiteType
    storage_units: Annotated[int, msgspec.Meta(gt=0, le=100_000_000)] | None = None
    capacity_pct: Annotated[int, msgspec.Meta(ge=0, le=100)] = 0


class WalkIn(msgspec.Struct, forbid_unknown_fields=True):
    items: Items
    notes: Notes = ""


class PickupCreate(msgspec.Struct, forbid_unknown_fields=True):
    notes: Annotated[str, msgspec.Meta(max_length=500)] = ""


class PickupUpdate(msgspec.Struct, forbid_unknown_fields=True):
    status: Literal["completed", "cancelled"]


_HUB_COLUMNS = (
    "id, disaster_id, name, site_type, status, address, latitude, longitude, capacity_pct, "
    "storage_units, updated_at"
)
_HUB_KEYS = (
    "id",
    "disaster_id",
    "name",
    "type",
    "status",
    "address",
    "latitude",
    "longitude",
    "capacity_pct",
    "storage_units",
    "updated_at",
)


def pickup_info(row: tuple) -> dict:
    return {"id": row[0], "hub_id": row[1], "status": row[2], "notes": row[3], "created_at": row[4]}


async def load_hubs(
    connection: apsw.AsyncConnection, where: str = "", params: tuple = (), order: str = "name"
) -> list[dict]:
    """Load hubs with supplies, reservation and pledge totals, and any open pickup.

    `where` is extra SQL (starting with AND) on hub_view. Supplies list every item
    the hub holds or wants. Per supply: `available` = on hand minus reserved; `target` comes from
    demand; `need` = target minus what's on hand and already pledged.
    """
    hubs: dict[str, dict[str, Any]] = {}
    async for row in await connection.execute(
        f"SELECT {_HUB_COLUMNS} FROM hub_view WHERE 1 = 1 {where} ORDER BY {order}",
        params,
    ):
        hubs[str(row[0])] = dict(zip(_HUB_KEYS, row)) | {"supplies": [], "open_pickup": None}
    if not hubs:
        return []
    ids = tuple(hubs)
    marks = ",".join("?" * len(ids))
    names = await catalog(connection)
    order_of = {key: index for index, key in enumerate(names)}
    incoming = await pledged(connection, ids)
    targets = await hub_targets(connection)
    on_hand: dict[str, dict[str, tuple[int, int]]] = {}
    rows = cast(
        list[tuple[str, str, int, int]],
        await (
            await connection.execute(
                f"SELECT organization_id, resource_type_id, quantity, reserved FROM inventory "
                f"WHERE organization_id IN ({marks})",
                ids,
            )
        ).fetchall(),
    )
    for hub_id, resource_type_id, quantity, held in rows:
        on_hand.setdefault(hub_id, {})[resource_type_id] = (quantity, held)
    for hub_id, hub in hubs.items():
        stocked, wanted = on_hand.get(hub_id, {}), targets.get(hub_id, {})
        for resource_type_id in sorted(
            set(stocked) | set(wanted), key=lambda r: order_of.get(r, 99)
        ):
            quantity, held = stocked.get(resource_type_id, (0, 0))
            target = wanted.get(resource_type_id, 0)
            coming = incoming.get(hub_id, {}).get(resource_type_id, 0)
            entry = names.get(resource_type_id, {})
            hub["supplies"].append(
                {
                    "resource_type_id": resource_type_id,
                    "name": entry.get("name", resource_type_id),
                    "unit": entry.get("unit", ""),
                    "quantity": quantity,
                    "target": target,
                    "pledged": coming,
                    "reserved": held,
                    "available": max(quantity - held, 0),
                    "need": max(target - quantity - coming, 0),
                }
            )
    async for row in await connection.execute(
        f"SELECT id, hub_id, status, notes, created_at FROM pickup_requests "
        f"WHERE status = 'dispatched' AND hub_id IN ({marks})",
        ids,
    ):
        hubs[str(row[1])]["open_pickup"] = pickup_info(row)
    return list(hubs.values())


async def load_hub(connection: apsw.AsyncConnection, hub_id: str) -> dict:
    hubs = await load_hubs(connection, "AND id = ?", (hub_id,))
    if not hubs:
        raise not_found()
    return hubs[0]


def supply(hub: dict, resource_type_id: str) -> dict:
    return next(
        (s for s in hub["supplies"] if s["resource_type_id"] == resource_type_id),
        {"need": 0, "available": 0},
    )


@get("/hubs/nearby")
async def nearby_hubs(
    lat: Annotated[float, Parameter(ge=-90, le=90)],
    lng: Annotated[float, Parameter(ge=-180, le=180)],
    radius_km: Annotated[float, Parameter(gt=0, le=500)] = 25,
    limit: Annotated[int, Parameter(ge=1, le=100)] = 20,
    needs: FromQuery[ResourceTypeId | None] = None,
    has: FromQuery[ResourceTypeId | None] = None,
) -> list[dict]:
    """Active hubs within `radius_km` of a point, nearest first.

    `needs` keeps hubs short on a resource type; `has` keeps hubs with some available.
    """
    async with connect() as connection:
        hubs = await load_hubs(connection, "AND status != 'inactive'")
    for hub in hubs:
        hub["distance_km"] = round(haversine_km(lat, lng, hub["latitude"], hub["longitude"]), 2)
    hubs = [
        hub
        for hub in hubs
        if hub["distance_km"] <= radius_km
        and (needs is None or supply(hub, needs)["need"] > 0)
        and (has is None or supply(hub, has)["available"] > 0)
    ]
    return sorted(hubs, key=lambda hub: hub["distance_km"])[:limit]


@get("/hubs")
async def list_hubs(min_capacity: Annotated[int, Parameter(ge=0, le=100)] = 0) -> list[dict]:
    """All hubs at or above `min_capacity` percent full, fullest first."""
    async with connect() as connection:
        return await load_hubs(
            connection, "AND capacity_pct >= ?", (min_capacity,), "capacity_pct DESC, name"
        )


@get("/hubs/{hub_id:str}")
async def get_hub(hub_id: FromPath[str]) -> dict:
    async with connect() as connection:
        return await load_hub(connection, hub_id)


@put("/hubs/{hub_id:str}")
async def set_up_hub(hub_id: FromPath[str], data: JSONBody[HubSetup], request: Request) -> dict:
    """Make an organization a public donation hub, or change its site type or storage size
    (operator only). With `storage_units`, % full follows stock; `capacity_pct` is only used when
    no storage size is given."""
    async with connect() as connection:
        await require_role(request, connection, "operator")
        async with write_transaction(connection):
            if not await organization_exists(connection, hub_id):
                raise not_found("Organization", "organization_not_found")
            await connection.execute(
                "INSERT INTO hubs (organization_id, site_type, storage_units, capacity_pct) "
                "VALUES (?, ?, ?, ?) ON CONFLICT(organization_id) DO UPDATE SET "
                "site_type = excluded.site_type, storage_units = excluded.storage_units, "
                "capacity_pct = excluded.capacity_pct",
                (hub_id, data.site_type, data.storage_units, data.capacity_pct),
            )
            await match_waiting_requests(connection)
        return await load_hub(connection, hub_id)


@post("/hubs/{hub_id:str}/walk-ins", status_code=200)
async def log_walk_in(hub_id: FromPath[str], data: JSONBody[WalkIn], request: Request) -> dict:
    """Log an unannounced drop-off at a hub (that hub's staff, or an operator).

    The items are added to stock, which may let waiting citizen requests be matched.
    """
    async with connect() as connection:
        actor = await require_role(request, connection, "operator", "hub_staff")
        require_hub_access(actor, hub_id)
        encoded = await validate_items(connection, data.items)
        async with write_transaction(connection):
            if not await hub_exists(connection, hub_id):
                raise not_found()
            await add_stock(connection, hub_id, parse_items(encoded))
            await match_waiting_requests(connection)
        return await load_hub(connection, hub_id)


@post("/hubs/{hub_id:str}/pickups")
async def dispatch_pickup(
    hub_id: FromPath[str], request: Request, data: JSONBody[PickupCreate | None] = None
) -> dict:
    """Dispatch a transport pickup to clear a hub's surplus (operator only)."""
    notes = data.notes if data else ""
    async with connect() as connection:
        actor = await require_role(request, connection, "operator")
        async with write_transaction(connection):
            if not await hub_exists(connection, hub_id):
                raise not_found()
            if await (
                await connection.execute(
                    "SELECT 1 FROM pickup_requests WHERE hub_id = ? AND status = 'dispatched'",
                    (hub_id,),
                )
            ).fetchone():
                raise error(
                    409, "pickup_already_open", "A pickup is already dispatched to this hub."
                )
            row = ("pickup_" + uuid4().hex, hub_id, "dispatched", notes, timestamp(now()))
            await connection.execute(
                "INSERT INTO pickup_requests (id, hub_id, status, notes, created_at, "
                "requested_by) VALUES (?, ?, ?, ?, ?, ?)",
                (*row, actor.user_id),
            )
    return pickup_info(row)


_PICKUP_COLUMNS = "p.id, p.hub_id, p.status, p.notes, p.created_at, h.name"
_PICKUP_FROM = "FROM pickup_requests p JOIN hub_view h ON h.id = p.hub_id"


@get("/pickups")
async def list_pickups(
    request: Request,
    status: FromQuery[Literal["dispatched", "completed", "cancelled"] | None] = None,
) -> list[dict]:
    """Pickup requests, newest first, optionally filtered by status (operator only)."""
    where, params = ("WHERE p.status = ?", (status,)) if status else ("", ())
    async with connect() as connection:
        await require_role(request, connection, "operator")
        rows = await (
            await connection.execute(
                f"SELECT {_PICKUP_COLUMNS} {_PICKUP_FROM} {where} "
                f"ORDER BY p.created_at DESC LIMIT 200",
                params,
            )
        ).fetchall()
    return [pickup_info(row) | {"hub_name": row[5]} for row in rows]


async def nearest_depot(connection: apsw.AsyncConnection, hub_id: str) -> tuple[str, str] | None:
    """The closest active non-hub organization in the hub's disaster, as (id, name)."""
    hub = await (
        await connection.execute(
            "SELECT disaster_id, latitude, longitude FROM hub_view WHERE id = ?", (hub_id,)
        )
    ).fetchone()
    if hub is None:
        return None
    depots = cast(
        list[tuple[str, str, float, float]],
        await (
            await connection.execute(
                "SELECT id, json_extract(data, '$.name'), "
                "json_extract(data, '$.location.latitude'), json_extract(data, '$.location.longitude') "
                "FROM organizations WHERE id NOT IN (SELECT organization_id FROM hubs) "
                "AND COALESCE(json_extract(data, '$.status'), 'active') != 'inactive' "
                "AND disaster_id = ?",
                (hub[0],),
            )
        ).fetchall(),
    )
    if not depots:
        return None
    lat, lng = float(hub[1]), float(hub[2])  # type: ignore[arg-type]
    best = min(depots, key=lambda d: haversine_km(lat, lng, d[2], d[3]))
    return best[0], best[1]


async def collect_surplus(connection: apsw.AsyncConnection, hub_id: str) -> dict:
    """Move stock above the hub's targets (and not promised to anyone) to the nearest depot."""
    wanted = (await hub_targets(connection)).get(hub_id, {})
    items = []
    for resource_type_id, (quantity, held, _) in (await stock(connection, hub_id)).items():
        surplus = quantity - held - wanted.get(resource_type_id, 0)
        if surplus > 0:
            items.append({"resource_type_id": resource_type_id, "quantity": surplus})
    depot = await nearest_depot(connection, hub_id)
    if items:
        await remove_stock(connection, hub_id, items)
        if depot:
            await add_stock(connection, depot[0], items)
            await match_waiting_requests(connection)
    return {"to": None if depot is None else {"id": depot[0], "name": depot[1]}, "items": items}


@patch("/pickups/{pickup_id:str}")
async def update_pickup(
    pickup_id: FromPath[str], data: JSONBody[PickupUpdate], request: Request
) -> dict:
    """Close a dispatched pickup (operator only). Completing it moves the hub's surplus (stock
    above its targets that isn't reserved) to the nearest depot, which lowers its % full."""
    async with connect() as connection:
        await require_role(request, connection, "operator")
        async with write_transaction(connection):
            row = await (
                await connection.execute(
                    f"SELECT {_PICKUP_COLUMNS} {_PICKUP_FROM} WHERE p.id = ?", (pickup_id,)
                )
            ).fetchone()
            if row is None:
                raise not_found("Pickup")
            if row[2] != "dispatched":
                raise error(409, "pickup_closed", "This pickup is already closed.")
            await connection.execute(
                "UPDATE pickup_requests SET status = ? WHERE id = ?", (data.status, pickup_id)
            )
            moved = (
                await collect_surplus(connection, str(row[1]))
                if data.status == "completed"
                else None
            )
    info = pickup_info((row[0], row[1], data.status, row[3], row[4])) | {"hub_name": row[5]}
    return info | {"moved": moved}


HANDLERS = [
    nearby_hubs,
    list_hubs,
    get_hub,
    set_up_hub,
    log_walk_in,
    dispatch_pickup,
    list_pickups,
    update_pickup,
]
