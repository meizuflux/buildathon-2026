"""Shared types, authorization, and the stock engine for citizen donations.

Every movement of stock goes through reserve / release / consume / add_stock so that shipments
(organization -> shelter or organization) and citizen requests (hub -> citizen) share one ledger:

    reserve   available (quantity - reserved) must cover the items; reserved += q
    release   reserved -= q                         (cancelled shipment, released claim)
    consume   quantity -= q and reserved -= q       (shipment leaves, citizen request fulfilled)
    add_stock quantity += q, creating the row       (shipment delivered, pledge or walk-in received)
    remove_stock quantity -= q (unreserved stock)   (surplus collected by a transport pickup)

These operate on the shared logistics inventory table, so the operator shipments in
haven.routers.logistics and citizen requests draw on the same stock. A hub's "% full" is computed
from that stock by the hub_view database view, so it is always current.
"""

import math
from contextlib import asynccontextmanager
from typing import Annotated, cast

import apsw
import msgspec
from litestar import Request
from litestar.exceptions import HTTPException

from haven.auth import get_authenticated_user, now, timestamp

ResourceTypeId = Annotated[str, msgspec.Meta(pattern=r"^[a-z0-9_]{1,40}$")]
Notes = Annotated[str, msgspec.Meta(max_length=500)]


class Item(msgspec.Struct, forbid_unknown_fields=True):
    resource_type_id: ResourceTypeId
    quantity: Annotated[int, msgspec.Meta(ge=1, le=100_000)]


Items = Annotated[list[Item], msgspec.Meta(min_length=1, max_length=20)]


class Actor(msgspec.Struct):
    user_id: str
    role: str
    hub_id: str | None = None


def error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail=message, extra={"code": code})


def not_found(what: str = "Hub", code: str = "not_found") -> HTTPException:
    return error(404, code, f"{what} not found.")


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    )
    return 2 * 6371.0 * math.asin(math.sqrt(a))


# Authorization -------------------------------------------------------------------------------


async def require_role(
    request: Request, connection: apsw.AsyncConnection, *roles: str, code: str = "forbidden"
) -> Actor:
    """Require a signed-in caller with one of `roles`; hub staff carry their hub id.

    The auth middleware has already resolved the bearer token into `request.user`.
    """
    user = get_authenticated_user(request)
    if user.role not in roles:
        raise error(403, code, "You don't have access to this action.")
    hub_id = None
    if user.role == "hub_staff":
        row = await (
            await connection.execute("SELECT hub_id FROM hub_staff WHERE user_id = ?", (user.id,))
        ).fetchone()
        if row is None:
            raise error(403, "forbidden", "This staff account is not linked to a hub.")
        hub_id = str(row[0])
    return Actor(user.id, user.role, hub_id)


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


# Catalog and item lists ----------------------------------------------------------------------


async def catalog(connection: apsw.AsyncConnection) -> dict[str, dict]:
    rows = await (
        await connection.execute(
            "SELECT t.id, t.name, t.category, t.unit, COALESCE(d.citizen_requestable, 0) "
            "FROM resource_types t LEFT JOIN resource_type_details d ON d.resource_type_id = t.id "
            "ORDER BY COALESCE(d.sort_order, 1000), t.id"
        )
    ).fetchall()
    return {
        str(r[0]): {"id": r[0], "name": r[1], "category": r[2], "unit": r[3], "citizen": bool(r[4])}
        for r in rows
    }


async def validate_items(
    connection: apsw.AsyncConnection, items: list[Item], *, citizen: bool = False
) -> str:
    """Check items reference known (and, for citizens, citizen-requestable) resource types.

    Returns the items encoded as JSON for storage.
    """
    ids = [item.resource_type_id for item in items]
    if len(ids) != len(set(ids)):
        raise error(400, "invalid_request", "Each resource type may appear once.")
    known = await catalog(connection)
    for resource_type_id in ids:
        entry = known.get(resource_type_id)
        if entry is None:
            raise error(400, "invalid_request", f"Unknown resource type: {resource_type_id}.")
        if citizen and not entry["citizen"]:
            raise error(
                400,
                "not_citizen_requestable",
                f"{entry['name']} can't be requested or donated through the citizen app.",
            )
    return msgspec.json.encode(items).decode()


def parse_items(raw: str) -> list[dict]:
    return msgspec.json.decode(raw)


def named_items(items: list[dict], names: dict[str, dict]) -> list[dict]:
    """Add each item's catalog name and unit for display."""
    return [
        item
        | {
            "name": names.get(item["resource_type_id"], {}).get("name", item["resource_type_id"]),
            "unit": names.get(item["resource_type_id"], {}).get("unit", ""),
        }
        for item in items
    ]


async def resource_name(connection: apsw.AsyncConnection, resource_type_id: str) -> str:
    row = await (
        await connection.execute(
            "SELECT name FROM resource_types WHERE id = ?", (resource_type_id,)
        )
    ).fetchone()
    return str(row[0]) if row else resource_type_id


# Organizations and hubs ----------------------------------------------------------------------


async def organization_exists(connection: apsw.AsyncConnection, organization_id: str) -> bool:
    row = await (
        await connection.execute("SELECT 1 FROM organizations WHERE id = ?", (organization_id,))
    ).fetchone()
    return row is not None


async def hub_exists(connection: apsw.AsyncConnection, hub_id: str) -> bool:
    """A hub is an organization with a public site type."""
    row = await (
        await connection.execute("SELECT 1 FROM hubs WHERE organization_id = ?", (hub_id,))
    ).fetchone()
    return row is not None


# Stock engine --------------------------------------------------------------------------------


async def stock(connection: apsw.AsyncConnection, organization_id: str) -> dict[str, tuple]:
    """{resource_type_id: (quantity, reserved, 0)} for one organization (targets are computed)."""
    rows = await (
        await connection.execute(
            "SELECT resource_type_id, quantity, reserved, 0 FROM inventory "
            "WHERE organization_id = ?",
            (organization_id,),
        )
    ).fetchall()
    return {str(r[0]): (r[1], r[2], r[3]) for r in cast(list[tuple[str, int, int, int]], rows)}


async def reserve(
    connection: apsw.AsyncConnection,
    organization_id: str,
    items: list[dict],
    *,
    code: str = "insufficient_inventory",
    holder: str = "This organization",
) -> None:
    """Promise items from available stock; all-or-nothing."""
    current = await stock(connection, organization_id)
    for item in items:
        quantity, held, _ = current.get(item["resource_type_id"], (0, 0, 0))
        available = quantity - held
        if available < item["quantity"]:
            name = await resource_name(connection, item["resource_type_id"])
            raise error(
                409,
                code,
                f"{holder} has only {max(available, 0)} {name} available; "
                f"{item['quantity']} requested.",
            )
    for item in items:
        await connection.execute(
            "UPDATE inventory SET reserved = reserved + ?, updated_at = ? "
            "WHERE organization_id = ? AND resource_type_id = ?",
            (item["quantity"], timestamp(now()), organization_id, item["resource_type_id"]),
        )


async def release(
    connection: apsw.AsyncConnection, organization_id: str, items: list[dict]
) -> None:
    """Return previously reserved items to available stock."""
    for item in items:
        await connection.execute(
            "UPDATE inventory SET reserved = MAX(reserved - ?, 0), updated_at = ? "
            "WHERE organization_id = ? AND resource_type_id = ?",
            (item["quantity"], timestamp(now()), organization_id, item["resource_type_id"]),
        )


async def consume(
    connection: apsw.AsyncConnection, organization_id: str, items: list[dict]
) -> None:
    """Remove previously reserved items from stock (they have left the building)."""
    for item in items:
        await connection.execute(
            "UPDATE inventory SET quantity = quantity - ?, reserved = reserved - ?, updated_at = ? "
            "WHERE organization_id = ? AND resource_type_id = ?",
            (
                item["quantity"],
                item["quantity"],
                timestamp(now()),
                organization_id,
                item["resource_type_id"],
            ),
        )


async def remove_stock(
    connection: apsw.AsyncConnection, organization_id: str, items: list[dict]
) -> None:
    """Remove unreserved items from stock. Callers must not exceed quantity - reserved."""
    for item in items:
        await connection.execute(
            "UPDATE inventory SET quantity = quantity - ?, updated_at = ? "
            "WHERE organization_id = ? AND resource_type_id = ?",
            (item["quantity"], timestamp(now()), organization_id, item["resource_type_id"]),
        )


async def add_stock(
    connection: apsw.AsyncConnection, organization_id: str, items: list[dict]
) -> None:
    for item in items:
        await connection.execute(
            "INSERT INTO inventory (organization_id, resource_type_id, quantity, reserved, "
            "updated_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT(organization_id, resource_type_id) "
            "DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at",
            (organization_id, item["resource_type_id"], item["quantity"], timestamp(now())),
        )


async def pledged(connection: apsw.AsyncConnection, hub_ids: tuple[str, ...]) -> dict:
    """Quantities in pending pledges, as {hub_id: {resource_type_id: qty}}."""
    if not hub_ids:
        return {}
    marks = ",".join("?" * len(hub_ids))
    totals: dict[str, dict[str, int]] = {}
    async for hub_id, raw in await connection.execute(
        f"SELECT hub_id, items_json FROM pledges WHERE status = 'pending' AND hub_id IN ({marks})",
        hub_ids,
    ):
        for item in parse_items(str(raw)):
            bucket = totals.setdefault(str(hub_id), {})
            key = item["resource_type_id"]
            bucket[key] = bucket.get(key, 0) + item["quantity"]
    return totals
