"""Donation hubs: nearby lookup, inventory updates, and transport pickup dispatch."""

import math
from typing import Annotated, Literal
from uuid import uuid4

import apsw
import msgspec
from litestar import Request, get, patch, post, put
from litestar.exceptions import HTTPException
from litestar.params import FromPath, FromQuery, JSONBody, Parameter

from haven.auth import authenticate, now, timestamp
from haven.db import connect

Category = Literal["water", "diapers", "formula", "canned_goods", "blankets"]
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


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Hub not found.", extra={"code": "not_found"})


async def require_operator(request: Request, connection: apsw.AsyncConnection) -> str:
    user, _ = await authenticate(request.headers.get("authorization", ""), connection)
    if user[1] != "operator":
        raise HTTPException(status_code=403, detail="Operator access required.", extra={"code": "forbidden"})
    return user[0]


def pickup_info(row: tuple) -> dict:
    return {"id": row[0], "hub_id": row[1], "status": row[2], "notes": row[3], "created_at": row[4]}


async def load_hubs(connection: apsw.AsyncConnection, where: str = "", params: tuple = ()) -> list[dict]:
    """Load hubs with their supplies and any open pickup."""
    hubs = {}
    async for row in await connection.execute(f"SELECT {_HUB_COLUMNS} FROM hubs {where}", params):
        hubs[row[0]] = dict(zip(_HUB_COLUMNS.split(", "), row)) | {"supplies": [], "open_pickup": None}
    if not hubs:
        return []
    marks = ",".join("?" * len(hubs))
    ids = tuple(hubs)
    async for hub_id, category, quantity, target in await connection.execute(
        f"SELECT hub_id, category, quantity, target FROM hub_supplies WHERE hub_id IN ({marks}) ORDER BY category", ids
    ):
        hubs[hub_id]["supplies"].append(
            {"category": category, "quantity": quantity, "target": target, "need": max(target - quantity, 0)}
        )
    async for row in await connection.execute(
        f"SELECT id, hub_id, status, notes, created_at FROM pickup_requests "
        f"WHERE status = 'dispatched' AND hub_id IN ({marks})", ids
    ):
        hubs[row[1]]["open_pickup"] = pickup_info(row)
    return list(hubs.values())


@get("/api/hubs/nearby")
async def nearby_hubs(
    lat: Annotated[float, Parameter(ge=-90, le=90)],
    lng: Annotated[float, Parameter(ge=-180, le=180)],
    radius_km: Annotated[float, Parameter(gt=0, le=500)] = 25,
    limit: Annotated[int, Parameter(ge=1, le=100)] = 20,
) -> list[dict]:
    """Hubs within `radius_km` of a point, nearest first."""
    async with connect() as connection:
        hubs = await load_hubs(connection)
    for hub in hubs:
        hub["distance_km"] = round(haversine_km(lat, lng, hub["latitude"], hub["longitude"]), 2)
    hubs = [hub for hub in hubs if hub["distance_km"] <= radius_km]
    return sorted(hubs, key=lambda hub: hub["distance_km"])[:limit]


@get("/api/hubs")
async def list_hubs(min_capacity: Annotated[int, Parameter(ge=0, le=100)] = 0) -> list[dict]:
    """All hubs at or above `min_capacity` percent full, fullest first."""
    async with connect() as connection:
        return await load_hubs(connection, "WHERE capacity_pct >= ? ORDER BY capacity_pct DESC, name", (min_capacity,))


@put("/api/hubs/{hub_id:str}/inventory")
async def update_inventory(hub_id: FromPath[str], data: JSONBody[InventoryUpdate], request: Request) -> dict:
    """Set a hub's capacity and upsert its supply levels (operator only)."""
    categories = [supply.category for supply in data.supplies]
    if len(categories) != len(set(categories)):
        raise HTTPException(status_code=400, detail="Each supply category may appear once.", extra={"code": "invalid_request"})
    async with connect() as connection:
        await require_operator(request, connection)
        async with connection:
            await connection.execute(
                "UPDATE hubs SET capacity_pct = ?, updated_at = ? WHERE id = ?",
                (data.capacity_pct, timestamp(now()), hub_id),
            )
            if not await connection.changes():
                raise not_found()
            for supply in data.supplies:
                await connection.execute(
                    "INSERT INTO hub_supplies (hub_id, category, quantity, target) VALUES (?, ?, ?, ?) "
                    "ON CONFLICT(hub_id, category) DO UPDATE SET quantity = excluded.quantity, target = excluded.target",
                    (hub_id, supply.category, supply.quantity, supply.target),
                )
        return (await load_hubs(connection, "WHERE id = ?", (hub_id,)))[0]


@post("/api/hubs/{hub_id:str}/pickups")
async def dispatch_pickup(hub_id: FromPath[str], request: Request, data: JSONBody[PickupCreate | None] = None) -> dict:
    """Dispatch a transport pickup to clear a hub (operator only)."""
    notes = data.notes if data else ""
    async with connect() as connection:
        user_id = await require_operator(request, connection)
        await connection.execute("BEGIN IMMEDIATE")
        try:
            if not await (await connection.execute("SELECT 1 FROM hubs WHERE id = ?", (hub_id,))).fetchone():
                raise not_found()
            if await (await connection.execute(
                "SELECT 1 FROM pickup_requests WHERE hub_id = ? AND status = 'dispatched'", (hub_id,)
            )).fetchone():
                raise HTTPException(status_code=409, detail="A pickup is already dispatched to this hub.",
                                    extra={"code": "pickup_already_open"})
            row = ("pickup_" + uuid4().hex, hub_id, "dispatched", notes, timestamp(now()))
            await connection.execute(
                "INSERT INTO pickup_requests (id, hub_id, status, notes, created_at, requested_by) VALUES (?, ?, ?, ?, ?, ?)",
                (*row, user_id),
            )
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return pickup_info(row)


_PICKUP_COLUMNS = "p.id, p.hub_id, p.status, p.notes, p.created_at, h.name"


@get("/api/pickups")
async def list_pickups(
    request: Request, status: FromQuery[Literal["dispatched", "completed", "cancelled"] | None] = None
) -> list[dict]:
    """Pickup requests, newest first, optionally filtered by status (operator only)."""
    where, params = ("WHERE p.status = ?", (status,)) if status else ("", ())
    async with connect() as connection:
        await require_operator(request, connection)
        rows = await (await connection.execute(
            f"SELECT {_PICKUP_COLUMNS} FROM pickup_requests p JOIN hubs h ON h.id = p.hub_id "
            f"{where} ORDER BY p.created_at DESC LIMIT 200", params,
        )).fetchall()
    return [pickup_info(row) | {"hub_name": row[5]} for row in rows]


@patch("/api/pickups/{pickup_id:str}")
async def update_pickup(pickup_id: FromPath[str], data: JSONBody[PickupUpdate], request: Request) -> dict:
    """Close a dispatched pickup as completed or cancelled (operator only)."""
    async with connect() as connection:
        await require_operator(request, connection)
        await connection.execute("BEGIN IMMEDIATE")
        try:
            row = await (await connection.execute(
                f"SELECT {_PICKUP_COLUMNS} FROM pickup_requests p JOIN hubs h ON h.id = p.hub_id WHERE p.id = ?",
                (pickup_id,),
            )).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Pickup not found.", extra={"code": "not_found"})
            if row[2] != "dispatched":
                raise HTTPException(status_code=409, detail="This pickup is already closed.", extra={"code": "pickup_closed"})
            await connection.execute("UPDATE pickup_requests SET status = ? WHERE id = ?", (data.status, pickup_id))
            if data.status == "completed" and data.capacity_pct is not None:
                await connection.execute(
                    "UPDATE hubs SET capacity_pct = ?, updated_at = ? WHERE id = ?",
                    (data.capacity_pct, timestamp(now()), row[1]),
                )
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return pickup_info((row[0], row[1], data.status, row[3], row[4])) | {"hub_name": row[5]}


HANDLERS = [nearby_hubs, list_hubs, update_inventory, dispatch_pickup, list_pickups, update_pickup]
