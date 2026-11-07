"""Shared types and helpers for the donation distribution endpoints."""

import math
from contextlib import asynccontextmanager
from typing import Annotated, Literal

import apsw
import msgspec
from litestar import Request
from litestar.exceptions import HTTPException

from haven.auth import authenticate

Category = Literal["water", "diapers", "formula", "canned_goods", "blankets"]
CATEGORIES: tuple[str, ...] = Category.__args__
Notes = Annotated[str, msgspec.Meta(max_length=500)]


class Item(msgspec.Struct, forbid_unknown_fields=True):
    category: Category
    quantity: Annotated[int, msgspec.Meta(ge=1, le=10_000)]


Items = Annotated[list[Item], msgspec.Meta(min_length=1, max_length=len(CATEGORIES))]


class Actor(msgspec.Struct):
    user_id: str
    role: str
    hub_id: str | None = None


def error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail=message, extra={"code": code})


def not_found(what: str = "Hub") -> HTTPException:
    return error(404, "not_found", f"{what} not found.")


def items_json(items: list[Item]) -> str:
    categories = [item.category for item in items]
    if len(categories) != len(set(categories)):
        raise error(400, "invalid_request", "Each supply category may appear once.")
    return msgspec.json.encode(items).decode()


def parse_items(raw: str) -> list[dict]:
    return msgspec.json.decode(raw)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


async def require_role(request: Request, connection: apsw.AsyncConnection, *roles: str) -> Actor:
    """Authenticate the caller and require one of `roles`; hub staff carry their hub id."""
    (user_id, role), _ = await authenticate(request.headers.get("authorization", ""), connection)
    if role not in roles:
        raise error(403, "forbidden", "You don't have access to this action.")
    hub_id = None
    if role == "hub_staff":
        row = await (await connection.execute("SELECT hub_id FROM hub_staff WHERE user_id = ?", (user_id,))).fetchone()
        if row is None:
            raise error(403, "forbidden", "This staff account is not linked to a hub.")
        hub_id = row[0]
    return Actor(user_id, role, hub_id)


def require_hub_access(actor: Actor, hub_id: str) -> None:
    """Operators manage every hub; hub staff only their own."""
    if actor.role == "hub_staff" and actor.hub_id != hub_id:
        raise error(403, "forbidden", "Staff can only manage their own hub.")


@asynccontextmanager
async def write_transaction(connection: apsw.AsyncConnection):
    """BEGIN IMMEDIATE so read-check-write sequences are atomic across workers."""
    await connection.execute("BEGIN IMMEDIATE")
    try:
        yield
        await connection.execute("COMMIT")
    except BaseException:
        await connection.execute("ROLLBACK")
        raise


async def hub_exists(connection: apsw.AsyncConnection, hub_id: str) -> bool:
    return await (await connection.execute("SELECT 1 FROM hubs WHERE id = ?", (hub_id,))).fetchone() is not None


async def stock(connection: apsw.AsyncConnection, hub_id: str) -> dict[str, int]:
    rows = await (await connection.execute(
        "SELECT category, quantity FROM hub_supplies WHERE hub_id = ?", (hub_id,)
    )).fetchall()
    return dict(rows)


async def reserved(connection: apsw.AsyncConnection, hub_ids: tuple[str, ...], exclude: str | None = None) -> dict:
    """Quantities promised to assigned (not yet fulfilled) requests, as {hub_id: {category: qty}}."""
    if not hub_ids:
        return {}
    marks = ",".join("?" * len(hub_ids))
    totals: dict[str, dict[str, int]] = {}
    async for request_id, hub_id, raw in await connection.execute(
        f"SELECT id, hub_id, items_json FROM supply_requests WHERE status = 'assigned' AND hub_id IN ({marks})", hub_ids
    ):
        if request_id == exclude:
            continue
        for item in parse_items(raw):
            bucket = totals.setdefault(hub_id, {})
            bucket[item["category"]] = bucket.get(item["category"], 0) + item["quantity"]
    return totals


async def pledged(connection: apsw.AsyncConnection, hub_ids: tuple[str, ...]) -> dict:
    """Quantities in pending pledges, as {hub_id: {category: qty}}."""
    if not hub_ids:
        return {}
    marks = ",".join("?" * len(hub_ids))
    totals: dict[str, dict[str, int]] = {}
    async for hub_id, raw in await connection.execute(
        f"SELECT hub_id, items_json FROM pledges WHERE status = 'pending' AND hub_id IN ({marks})", hub_ids
    ):
        for item in parse_items(raw):
            bucket = totals.setdefault(hub_id, {})
            bucket[item["category"]] = bucket.get(item["category"], 0) + item["quantity"]
    return totals


async def adjust_stock(connection: apsw.AsyncConnection, hub_id: str, items: list[dict], sign: int) -> None:
    """Add (sign=1) or remove (sign=-1) items from a hub's inventory; removal never goes below zero."""
    current = await stock(connection, hub_id)
    if sign < 0:
        for item in items:
            have = current.get(item["category"], 0)
            if have < item["quantity"]:
                raise error(409, "insufficient_stock",
                            f"Hub has {have} {item['category'].replace('_', ' ')}, {item['quantity']} needed.")
    for item in items:
        await connection.execute(
            "INSERT INTO hub_supplies (hub_id, category, quantity, target) VALUES (?, ?, ?, 0) "
            "ON CONFLICT(hub_id, category) DO UPDATE SET quantity = quantity + ?",
            (hub_id, item["category"], max(sign * item["quantity"], 0), sign * item["quantity"]),
        )
