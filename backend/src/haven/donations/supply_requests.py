"""Citizen supply requests and the operator workflow that fulfills them.

open --claim(hub, method)--> assigned --fulfill--> fulfilled (items leave hub inventory)
   ^------------release------------'
open/assigned --cancel (citizen)--> cancelled
"""

from typing import Annotated, Literal, cast
from uuid import uuid4

import apsw
import msgspec
from litestar import Request, get, post
from litestar.params import FromPath, FromQuery, JSONBody

from haven.auth import now, timestamp
from haven.db import connect
from haven.donations.common import (
    Items,
    Notes,
    adjust_stock,
    error,
    hub_exists,
    items_json,
    not_found,
    parse_items,
    pledged,
    require_role,
    reserved,
    stock,
    write_transaction,
)
from haven.donations.fairness import BASE_CAP, active_count, cap_for_items, demand_pressure, limits
from haven.donations.planner import HubState, OpenRequest, plan

Status = Literal["open", "assigned", "fulfilled", "cancelled"]
Method = Literal["delivery", "pickup"]


class RequestCreate(msgspec.Struct, forbid_unknown_fields=True):
    items: Items
    latitude: Annotated[float, msgspec.Meta(ge=-90, le=90)]
    longitude: Annotated[float, msgspec.Meta(ge=-180, le=180)]
    address: Annotated[str, msgspec.Meta(max_length=200)] = ""
    notes: Notes = ""


class RequestClaim(msgspec.Struct, forbid_unknown_fields=True):
    hub_id: str
    method: Method


_COLUMNS = (
    "r.id, r.user_id, r.items_json, r.latitude, r.longitude, r.address, r.notes, r.status, r.hub_id, r.method, "
    "r.assigned_to, r.created_at, r.updated_at, h.name, h.address, h.latitude, h.longitude, u.email"
)
_FROM = "FROM supply_requests r LEFT JOIN hubs h ON h.id = r.hub_id LEFT JOIN users u ON u.id = r.assigned_to"


def request_info(row: tuple) -> dict:
    hub = (
        None
        if row[8] is None
        else {
            "id": row[8],
            "name": row[13],
            "address": row[14],
            "latitude": row[15],
            "longitude": row[16],
        }
    )
    return {
        "id": row[0],
        "items": parse_items(row[2]),
        "latitude": row[3],
        "longitude": row[4],
        "address": row[5],
        "notes": row[6],
        "status": row[7],
        "hub": hub,
        "method": row[9],
        "assigned_to": row[10],
        "assigned_to_email": row[17],
        "created_at": row[11],
        "updated_at": row[12],
    }


async def fetch(connection: apsw.AsyncConnection, request_id: str) -> tuple:
    row = await (
        await connection.execute(f"SELECT {_COLUMNS} {_FROM} WHERE r.id = ?", (request_id,))
    ).fetchone()
    if row is None:
        raise not_found("Request")
    return row


async def set_status(connection, request_id: str, status: str, **fields) -> None:
    assignments = "".join(f", {name} = ?" for name in fields)
    await connection.execute(
        f"UPDATE supply_requests SET status = ?, updated_at = ?{assignments} WHERE id = ?",
        (status, timestamp(now()), *fields.values(), request_id),
    )


async def suggest_hubs(connection: apsw.AsyncConnection, requests: list[dict]) -> None:
    """Attach ranked `suggested_hubs` to each open request in `requests`.

    Every open request is planned together (see planner.py) so suggestions never double-book stock;
    the first suggestion is the planned assignment.
    """
    if not any(r["status"] == "open" for r in requests):
        return
    hubs = cast(
        list[tuple[str, str, float, float, int]],
        await (
            await connection.execute("SELECT id, name, latitude, longitude, capacity_pct FROM hubs")
        ).fetchall(),
    )
    ids = tuple(h[0] for h in hubs)
    held, incoming = await reserved(connection, ids), await pledged(connection, ids)
    quantities: dict[str, dict[str, int]] = {}
    targets: dict[str, dict[str, int]] = {}
    async for hub_id, category, quantity, target in await connection.execute(
        "SELECT hub_id, category, quantity, target FROM hub_supplies"
    ):
        quantities.setdefault(hub_id, {})[category] = quantity
        targets.setdefault(hub_id, {})[category] = target
    states = [
        HubState(
            id=hub_id,
            name=name,
            latitude=lat,
            longitude=lng,
            capacity_pct=capacity,
            available={
                c: q - held.get(hub_id, {}).get(c, 0) for c, q in quantities.get(hub_id, {}).items()
            },
            target=targets.get(hub_id, {}),
            pledged=incoming.get(hub_id, {}),
        )
        for hub_id, name, lat, lng, capacity in hubs
    ]
    open_rows = cast(
        list[tuple[str, float, float, str]],
        await (
            await connection.execute(
                "SELECT id, latitude, longitude, items_json FROM supply_requests "
                "WHERE status = 'open' ORDER BY created_at, id"
            )
        ).fetchall(),
    )
    plans = plan(
        [OpenRequest(row[0], row[1], row[2], parse_items(row[3])) for row in open_rows],
        states,
    )
    for item in requests:
        if item["status"] == "open":
            item["suggested_hubs"] = plans.get(item["id"], [])


@post("/requests")
async def create_request(data: JSONBody[RequestCreate], request: Request) -> dict:
    """A citizen asks for goods to be delivered or made ready for pickup.

    Limited to a demand-adjusted number of active requests per citizen (see fairness.py).
    """
    encoded = items_json(data.items)
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        request_id, stamp = "request_" + uuid4().hex, timestamp(now())
        async with write_transaction(connection):
            cap, scarcest = cap_for_items(
                await demand_pressure(connection), msgspec.to_builtins(data.items)
            )
            active = await active_count(connection, actor.user_id)
            if active >= cap:
                have = f"You have {active} active request{'s' * (active != 1)}"
                if cap < BASE_CAP:
                    level = "very high" if cap == 1 else "high"
                    message = (
                        f"{have}. While demand for {scarcest.replace('_', ' ')} is {level}, each person can "
                        f"have {cap} at a time so supplies reach everyone."
                    )
                else:
                    message = f"{have}, the most each person can have right now. Cancel one or wait for a delivery."
                raise error(409, "request_limit", message)
            await connection.execute(
                "INSERT INTO supply_requests (id, user_id, items_json, latitude, longitude, address, notes, status, "
                "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)",
                (
                    request_id,
                    actor.user_id,
                    encoded,
                    data.latitude,
                    data.longitude,
                    data.address,
                    data.notes,
                    stamp,
                    stamp,
                ),
            )
        return request_info(await fetch(connection, request_id))


@get("/requests/limits")
async def request_limits(request: Request) -> dict:
    """The citizen's active request count and the current per-category cap and demand level."""
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        return await limits(connection, actor.user_id)


@get("/requests/mine")
async def my_requests(request: Request) -> list[dict]:
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        rows = await (
            await connection.execute(
                f"SELECT {_COLUMNS} {_FROM} WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 100",
                (actor.user_id,),
            )
        ).fetchall()
    return [request_info(row) for row in rows]


@post("/requests/{request_id:str}/cancel", status_code=200)
async def cancel_request(request_id: FromPath[str], request: Request) -> dict:
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        async with write_transaction(connection):
            row = await fetch(connection, request_id)
            if row[1] != actor.user_id:
                raise not_found("Request")
            if row[7] not in ("open", "assigned"):
                raise error(409, "request_closed", "This request is already closed.")
            await set_status(connection, request_id, "cancelled")
        return request_info(await fetch(connection, request_id))


@get("/requests")
async def list_requests(
    request: Request,
    status: FromQuery[Status | None] = None,
    assigned_to_me: FromQuery[bool] = False,
) -> list[dict]:
    """Operator queue. Open requests include ranked `suggested_hubs` with a score and reasons (best first)."""
    async with connect() as connection:
        actor = await require_role(request, connection, "operator")
        clauses, params = [], []
        if status:
            clauses.append("r.status = ?")
            params.append(status)
        if assigned_to_me:
            clauses.append("r.assigned_to = ?")
            params.append(actor.user_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        rows = await (
            await connection.execute(
                f"SELECT {_COLUMNS} {_FROM} {where} ORDER BY r.created_at LIMIT 200", tuple(params)
            )
        ).fetchall()
        items = [request_info(row) for row in rows]
        await suggest_hubs(connection, items)
    return items


@post("/requests/{request_id:str}/claim", status_code=200)
async def claim_request(
    request_id: FromPath[str], data: JSONBody[RequestClaim], request: Request
) -> dict:
    """An operator takes an open request, choosing the source hub and how the goods reach the citizen.

    The hub must have enough stock not already promised to other assigned requests.
    """
    async with connect() as connection:
        actor = await require_role(request, connection, "operator")
        async with write_transaction(connection):
            row = await fetch(connection, request_id)
            if row[7] != "open":
                raise error(
                    409, "request_not_open", "This request has already been claimed or closed."
                )
            if not await hub_exists(connection, data.hub_id):
                raise not_found()
            on_hand = await stock(connection, data.hub_id)
            held = (await reserved(connection, (data.hub_id,))).get(data.hub_id, {})
            for item in parse_items(row[2]):
                free = on_hand.get(item["category"], 0) - held.get(item["category"], 0)
                if free < item["quantity"]:
                    raise error(
                        409,
                        "insufficient_stock",
                        f"Hub has {max(free, 0)} {item['category'].replace('_', ' ')} available, "
                        f"{item['quantity']} requested.",
                    )
            await set_status(
                connection,
                request_id,
                "assigned",
                hub_id=data.hub_id,
                method=data.method,
                assigned_to=actor.user_id,
            )
        return request_info(await fetch(connection, request_id))


async def assigned_to_actor(connection, request_id: str, user_id: str) -> tuple:
    row = await fetch(connection, request_id)
    if row[7] != "assigned":
        raise error(409, "request_not_assigned", "This request isn't currently assigned.")
    if row[10] != user_id:
        raise error(403, "forbidden", "This request is assigned to another worker.")
    return row


@post("/requests/{request_id:str}/release", status_code=200)
async def release_request(request_id: FromPath[str], request: Request) -> dict:
    """Return an assigned request to the open queue (assignee only)."""
    async with connect() as connection:
        actor = await require_role(request, connection, "operator")
        async with write_transaction(connection):
            await assigned_to_actor(connection, request_id, actor.user_id)
            await set_status(
                connection, request_id, "open", hub_id=None, method=None, assigned_to=None
            )
        return request_info(await fetch(connection, request_id))


@post("/requests/{request_id:str}/fulfill", status_code=200)
async def fulfill_request(request_id: FromPath[str], request: Request) -> dict:
    """Mark goods handed over; they are removed from the source hub's inventory (assignee only)."""
    async with connect() as connection:
        actor = await require_role(request, connection, "operator")
        async with write_transaction(connection):
            row = await assigned_to_actor(connection, request_id, actor.user_id)
            await adjust_stock(connection, row[8], parse_items(row[2]), -1)
            await set_status(connection, request_id, "fulfilled")
        return request_info(await fetch(connection, request_id))


HANDLERS = [
    create_request,
    request_limits,
    my_requests,
    cancel_request,
    list_requests,
    claim_request,
    release_request,
    fulfill_request,
]
