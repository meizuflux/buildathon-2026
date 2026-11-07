"""Donation hubs: lookup, inventory check-ins, and transport pickup dispatch."""

from typing import Annotated, Literal
from uuid import uuid4

import apsw
import msgspec
from litestar import Request, get, patch, post, put
from litestar.params import FromPath, FromQuery, JSONBody, Parameter

from haven.auth import now, timestamp
from haven.db import connect
from haven.donations.common import (
    Category, error, haversine_km, hub_exists, not_found, pledged, require_hub_access, require_role, reserved,
    write_transaction,
)

NonNegative = Annotated[int, msgspec.Meta(ge=0, le=1_000_000)]


class SupplyIn(msgspec.Struct, forbid_unknown_fields=True):
    category: Category
    quantity: NonNegative
    target: NonNegative


class InventoryUpdate(msgspec.Struct, forbid_unknown_fields=True):
    capacity_pct: Annotated[int, msgspec.Meta(ge=0, le=100)]
    supplies: Annotated[list[SupplyIn], msgspec.Meta(max_length=5)] = []


class PickupCreate(msgspec.Struct, forbid_unknown_fields=True):
    notes: Annotated[str, msgspec.Meta(max_length=500)] = ""


class PickupUpdate(msgspec.Struct, forbid_unknown_fields=True):
    status: Literal["completed", "cancelled"]
    # Hub capacity after a completed pickup (the truck cleared space); ignored when cancelled.
    capacity_pct: Annotated[int, msgspec.Meta(ge=0, le=100)] | None = None


_HUB_COLUMNS = "id, name, type, address, latitude, longitude, capacity_pct, updated_at"


def pickup_info(row: tuple) -> dict:
    return {"id": row[0], "hub_id": row[1], "status": row[2], "notes": row[3], "created_at": row[4]}


async def load_hubs(connection: apsw.AsyncConnection, where: str = "", params: tuple = ()) -> list[dict]:
    """Load hubs with supplies, pledge and reservation totals, and any open pickup.

    Per supply: `available` = quantity not promised to assigned requests;
    `need` = target minus what's on hand and already pledged.
    """
    hubs = {}
    async for row in await connection.execute(f"SELECT {_HUB_COLUMNS} FROM hubs {where}", params):
        hubs[row[0]] = dict(zip(_HUB_COLUMNS.split(", "), row)) | {"supplies": [], "open_pickup": None}
    if not hubs:
        return []
    ids = tuple(hubs)
    marks = ",".join("?" * len(ids))
    pledges, reservations = await pledged(connection, ids), await reserved(connection, ids)
    async for hub_id, category, quantity, target in await connection.execute(
        f"SELECT hub_id, category, quantity, target FROM hub_supplies WHERE hub_id IN ({marks}) ORDER BY category", ids
    ):
        incoming = pledges.get(hub_id, {}).get(category, 0)
        held = reservations.get(hub_id, {}).get(category, 0)
        hubs[hub_id]["supplies"].append({
            "category": category, "quantity": quantity, "target": target, "pledged": incoming, "reserved": held,
            "available": max(quantity - held, 0), "need": max(target - quantity - incoming, 0),
        })
    async for row in await connection.execute(
        f"SELECT id, hub_id, status, notes, created_at FROM pickup_requests "
        f"WHERE status = 'dispatched' AND hub_id IN ({marks})", ids
    ):
        hubs[row[1]]["open_pickup"] = pickup_info(row)
    return list(hubs.values())


async def load_hub(connection: apsw.AsyncConnection, hub_id: str) -> dict:
    hubs = await load_hubs(connection, "WHERE id = ?", (hub_id,))
    if not hubs:
        raise not_found()
    return hubs[0]


def supply(hub: dict, category: str) -> dict:
    return next((s for s in hub["supplies"] if s["category"] == category), {"need": 0, "available": 0})


@get("/api/hubs/nearby")
async def nearby_hubs(
    lat: Annotated[float, Parameter(ge=-90, le=90)],
    lng: Annotated[float, Parameter(ge=-180, le=180)],
    radius_km: Annotated[float, Parameter(gt=0, le=500)] = 25,
    limit: Annotated[int, Parameter(ge=1, le=100)] = 20,
    needs: FromQuery[Category | None] = None,
    has: FromQuery[Category | None] = None,
) -> list[dict]:
    """Hubs within `radius_km` of a point, nearest first.

    `needs` keeps hubs short on a category (drop-off targets); `has` keeps hubs with some available.
    """
    async with connect() as connection:
        hubs = await load_hubs(connection)
    for hub in hubs:
        hub["distance_km"] = round(haversine_km(lat, lng, hub["latitude"], hub["longitude"]), 2)
    hubs = [
        hub for hub in hubs
        if hub["distance_km"] <= radius_km
        and (needs is None or supply(hub, needs)["need"] > 0)
        and (has is None or supply(hub, has)["available"] > 0)
    ]
    return sorted(hubs, key=lambda hub: hub["distance_km"])[:limit]


@get("/api/hubs")
async def list_hubs(min_capacity: Annotated[int, Parameter(ge=0, le=100)] = 0) -> list[dict]:
    """All hubs at or above `min_capacity` percent full, fullest first."""
    async with connect() as connection:
        return await load_hubs(connection, "WHERE capacity_pct >= ? ORDER BY capacity_pct DESC, name", (min_capacity,))


@get("/api/hubs/{hub_id:str}")
async def get_hub(hub_id: FromPath[str]) -> dict:
    async with connect() as connection:
        return await load_hub(connection, hub_id)


@put("/api/hubs/{hub_id:str}/inventory")
async def update_inventory(hub_id: FromPath[str], data: JSONBody[InventoryUpdate], request: Request) -> dict:
    """Hub check-in: set capacity and upsert supply levels (that hub's staff, or an operator)."""
    categories = [s.category for s in data.supplies]
    if len(categories) != len(set(categories)):
        raise error(400, "invalid_request", "Each supply category may appear once.")
    async with connect() as connection:
        actor = await require_role(request, connection, "operator", "hub_staff")
        require_hub_access(actor, hub_id)
        async with connection:
            await connection.execute(
                "UPDATE hubs SET capacity_pct = ?, updated_at = ? WHERE id = ?",
                (data.capacity_pct, timestamp(now()), hub_id),
            )
            if not await connection.changes():
                raise not_found()
            for s in data.supplies:
                await connection.execute(
                    "INSERT INTO hub_supplies (hub_id, category, quantity, target) VALUES (?, ?, ?, ?) "
                    "ON CONFLICT(hub_id, category) DO UPDATE SET quantity = excluded.quantity, target = excluded.target",
                    (hub_id, s.category, s.quantity, s.target),
                )
        return await load_hub(connection, hub_id)


@post("/api/hubs/{hub_id:str}/pickups")
async def dispatch_pickup(hub_id: FromPath[str], request: Request, data: JSONBody[PickupCreate | None] = None) -> dict:
    """Dispatch a transport pickup to clear a hub (operator only)."""
    notes = data.notes if data else ""
    async with connect() as connection:
        actor = await require_role(request, connection, "operator")
        async with write_transaction(connection):
            if not await hub_exists(connection, hub_id):
                raise not_found()
            if await (await connection.execute(
                "SELECT 1 FROM pickup_requests WHERE hub_id = ? AND status = 'dispatched'", (hub_id,)
            )).fetchone():
                raise error(409, "pickup_already_open", "A pickup is already dispatched to this hub.")
            row = ("pickup_" + uuid4().hex, hub_id, "dispatched", notes, timestamp(now()))
            await connection.execute(
                "INSERT INTO pickup_requests (id, hub_id, status, notes, created_at, requested_by) VALUES (?, ?, ?, ?, ?, ?)",
                (*row, actor.user_id),
            )
    return pickup_info(row)


_PICKUP_COLUMNS = "p.id, p.hub_id, p.status, p.notes, p.created_at, h.name"


@get("/api/pickups")
async def list_pickups(
    request: Request, status: FromQuery[Literal["dispatched", "completed", "cancelled"] | None] = None
) -> list[dict]:
    """Pickup requests, newest first, optionally filtered by status (operator only)."""
    where, params = ("WHERE p.status = ?", (status,)) if status else ("", ())
    async with connect() as connection:
        await require_role(request, connection, "operator")
        rows = await (await connection.execute(
            f"SELECT {_PICKUP_COLUMNS} FROM pickup_requests p JOIN hubs h ON h.id = p.hub_id "
            f"{where} ORDER BY p.created_at DESC LIMIT 200", params,
        )).fetchall()
    return [pickup_info(row) | {"hub_name": row[5]} for row in rows]


@patch("/api/pickups/{pickup_id:str}")
async def update_pickup(pickup_id: FromPath[str], data: JSONBody[PickupUpdate], request: Request) -> dict:
    """Close a dispatched pickup as completed or cancelled (operator only)."""
    async with connect() as connection:
        await require_role(request, connection, "operator")
        async with write_transaction(connection):
            row = await (await connection.execute(
                f"SELECT {_PICKUP_COLUMNS} FROM pickup_requests p JOIN hubs h ON h.id = p.hub_id WHERE p.id = ?",
                (pickup_id,),
            )).fetchone()
            if row is None:
                raise not_found("Pickup")
            if row[2] != "dispatched":
                raise error(409, "pickup_closed", "This pickup is already closed.")
            await connection.execute("UPDATE pickup_requests SET status = ? WHERE id = ?", (data.status, pickup_id))
            if data.status == "completed" and data.capacity_pct is not None:
                await connection.execute(
                    "UPDATE hubs SET capacity_pct = ?, updated_at = ? WHERE id = ?",
                    (data.capacity_pct, timestamp(now()), row[1]),
                )
    return pickup_info((row[0], row[1], data.status, row[3], row[4])) | {"hub_name": row[5]}


HANDLERS = [nearby_hubs, list_hubs, get_hub, update_inventory, dispatch_pickup, list_pickups, update_pickup]
