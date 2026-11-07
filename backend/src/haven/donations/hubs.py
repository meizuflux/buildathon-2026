"""Donation hubs (organizations with a public site): lookup, check-ins, and pickup dispatch."""

from typing import Annotated, Any, Literal
from uuid import uuid4

import apsw
import msgspec
from litestar import Request, get, patch, post, put
from litestar.params import FromPath, FromQuery, JSONBody, Parameter

from haven.auth import now, timestamp
from haven.db import connect
from haven.donations.common import (
    ResourceTypeId,
    catalog,
    error,
    haversine_km,
    hub_exists,
    not_found,
    pledged,
    require_hub_access,
    require_role,
    stock,
    write_transaction,
)
from haven.donations.matching import match_waiting_requests

NonNegative = Annotated[int, msgspec.Meta(ge=0, le=1_000_000)]


class SupplyIn(msgspec.Struct, forbid_unknown_fields=True):
    resource_type_id: ResourceTypeId
    quantity: NonNegative
    target: NonNegative


class InventoryUpdate(msgspec.Struct, forbid_unknown_fields=True):
    capacity_pct: Annotated[int, msgspec.Meta(ge=0, le=100)]
    supplies: Annotated[list[SupplyIn], msgspec.Meta(max_length=50)] = []


class PickupCreate(msgspec.Struct, forbid_unknown_fields=True):
    notes: Annotated[str, msgspec.Meta(max_length=500)] = ""


class PickupUpdate(msgspec.Struct, forbid_unknown_fields=True):
    status: Literal["completed", "cancelled"]
    # Hub capacity after a completed pickup (the truck cleared space); ignored when cancelled.
    capacity_pct: Annotated[int, msgspec.Meta(ge=0, le=100)] | None = None


_HUB_COLUMNS = (
    "id, disaster_id, name, site_type, status, address, latitude, longitude, capacity_pct, "
    "updated_at"
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
    "updated_at",
)


def pickup_info(row: tuple) -> dict:
    return {"id": row[0], "hub_id": row[1], "status": row[2], "notes": row[3], "created_at": row[4]}


async def load_hubs(
    connection: apsw.AsyncConnection, where: str = "", params: tuple = (), order: str = "name"
) -> list[dict]:
    """Load hubs with supplies, reservation and pledge totals, and any open pickup.

    `where` is extra SQL (starting with AND) on the organizations table. Per supply:
    `available` = on hand minus reserved (shipments and claimed citizen requests);
    `need` = target minus what's on hand and already pledged.
    """
    hubs: dict[str, dict[str, Any]] = {}
    async for row in await connection.execute(
        f"SELECT {_HUB_COLUMNS} FROM organizations WHERE site_type IS NOT NULL {where} "
        f"ORDER BY {order}",
        params,
    ):
        hubs[str(row[0])] = dict(zip(_HUB_KEYS, row)) | {"supplies": [], "open_pickup": None}
    if not hubs:
        return []
    ids = tuple(hubs)
    marks = ",".join("?" * len(ids))
    names = await catalog(connection)
    incoming = await pledged(connection, ids)
    async for hub_id, resource_type_id, quantity, held, target in await connection.execute(
        f"SELECT i.organization_id, i.resource_type_id, i.quantity, i.reserved, i.target "
        f"FROM inventory i JOIN resource_types t ON t.id = i.resource_type_id "
        f"WHERE i.organization_id IN ({marks}) ORDER BY t.sort_order",
        ids,
    ):
        coming = incoming.get(str(hub_id), {}).get(str(resource_type_id), 0)
        entry = names.get(str(resource_type_id), {})
        hubs[str(hub_id)]["supplies"].append(
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

    `needs` keeps hubs short on a resource type (drop-off targets); `has` keeps hubs with some
    available.
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


@put("/hubs/{hub_id:str}/inventory")
async def update_inventory(
    hub_id: FromPath[str], data: JSONBody[InventoryUpdate], request: Request
) -> dict:
    """Hub check-in: set capacity and on-hand/target levels (that hub's staff, or an operator).

    A quantity can't drop below what is already reserved for shipments and claimed requests.
    """
    ids = [s.resource_type_id for s in data.supplies]
    if len(ids) != len(set(ids)):
        raise error(400, "invalid_request", "Each resource type may appear once.")
    async with connect() as connection:
        actor = await require_role(request, connection, "operator", "hub_staff")
        require_hub_access(actor, hub_id)
        known = await catalog(connection)
        unknown = [i for i in ids if i not in known]
        if unknown:
            raise error(400, "invalid_request", f"Unknown resource type: {unknown[0]}.")
        async with write_transaction(connection):
            if not await hub_exists(connection, hub_id):
                raise not_found()
            current = await stock(connection, hub_id)
            for s in data.supplies:
                held = current.get(s.resource_type_id, (0, 0, 0))[1]
                if s.quantity < held:
                    raise error(
                        409,
                        "inventory_conflict",
                        f"{known[s.resource_type_id]['name']}: {held} are reserved for "
                        f"shipments and citizen requests.",
                    )
            stamp = timestamp(now())
            await connection.execute(
                "UPDATE organizations SET capacity_pct = ?, updated_at = ? WHERE id = ?",
                (data.capacity_pct, stamp, hub_id),
            )
            for s in data.supplies:
                await connection.execute(
                    "INSERT INTO inventory (organization_id, resource_type_id, quantity, target, "
                    "updated_at) VALUES (?, ?, ?, ?, ?) "
                    "ON CONFLICT(organization_id, resource_type_id) DO UPDATE SET "
                    "quantity = excluded.quantity, target = excluded.target, "
                    "updated_at = excluded.updated_at",
                    (hub_id, s.resource_type_id, s.quantity, s.target, stamp),
                )
            await match_waiting_requests(connection)
        return await load_hub(connection, hub_id)


@post("/hubs/{hub_id:str}/pickups")
async def dispatch_pickup(
    hub_id: FromPath[str], request: Request, data: JSONBody[PickupCreate | None] = None
) -> dict:
    """Dispatch a transport pickup to clear a hub (operator only)."""
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
_PICKUP_FROM = "FROM pickup_requests p JOIN organizations h ON h.id = p.hub_id"


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


@patch("/pickups/{pickup_id:str}")
async def update_pickup(
    pickup_id: FromPath[str], data: JSONBody[PickupUpdate], request: Request
) -> dict:
    """Close a dispatched pickup as completed or cancelled (operator only)."""
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
            if data.status == "completed" and data.capacity_pct is not None:
                await connection.execute(
                    "UPDATE organizations SET capacity_pct = ?, updated_at = ? WHERE id = ?",
                    (data.capacity_pct, timestamp(now()), row[1]),
                )
    return pickup_info((row[0], row[1], data.status, row[3], row[4])) | {"hub_name": row[5]}


HANDLERS = [
    nearby_hubs,
    list_hubs,
    get_hub,
    update_inventory,
    dispatch_pickup,
    list_pickups,
    update_pickup,
]
