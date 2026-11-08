"""Citizen supply requests and the operator workflow that fulfills them.

open --auto-match--> matched --claim(method)--> assigned --fulfill--> fulfilled
                       ^--------release---------'
open/matched/assigned --cancel (citizen)--> cancelled

Citizens never pick a hub: matching.py assigns the best source hub and reserves the items as soon
as one can cover the request. A worker then claims it and chooses delivery or pickup. Cancelling
returns reserved items to stock; fulfilling removes them.
"""

from typing import Annotated, Literal
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
    catalog,
    consume,
    error,
    named_items,
    not_found,
    parse_items,
    release,
    require_role,
    validate_items,
    write_transaction,
)
from haven.donations.fairness import BASE_CAP, active_count, cap_for_items, demand_pressure, limits
from haven.donations.matching import match_waiting_requests

Status = Literal["open", "matched", "assigned", "fulfilled", "cancelled"]
Method = Literal["delivery", "pickup"]


class RequestCreate(msgspec.Struct, forbid_unknown_fields=True):
    items: Items
    latitude: Annotated[float, msgspec.Meta(ge=-90, le=90)]
    longitude: Annotated[float, msgspec.Meta(ge=-180, le=180)]
    address: Annotated[str, msgspec.Meta(max_length=200)] = ""
    notes: Notes = ""


class RequestClaim(msgspec.Struct, forbid_unknown_fields=True):
    method: Method


_COLUMNS = (
    "r.id, r.user_id, r.items_json, r.latitude, r.longitude, r.address, r.notes, r.status, "
    "r.hub_id, r.method, r.assigned_to, r.created_at, r.updated_at, h.name, h.address, "
    "h.latitude, h.longitude, u.email, r.match_json"
)
_FROM = (
    "FROM supply_requests r LEFT JOIN hub_view h ON h.id = r.hub_id "
    "LEFT JOIN users u ON u.id = r.assigned_to"
)


def request_info(row: tuple, names: dict[str, dict]) -> dict:
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
        "items": named_items(parse_items(row[2]), names),
        "latitude": row[3],
        "longitude": row[4],
        "address": row[5],
        "notes": row[6],
        "status": row[7],
        "hub": hub,
        "match": msgspec.json.decode(row[18]) if row[18] else None,
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


async def fetch_info(connection: apsw.AsyncConnection, request_id: str) -> dict:
    return request_info(await fetch(connection, request_id), await catalog(connection))


async def set_status(connection, request_id: str, status: str, **fields) -> None:
    assignments = "".join(f", {name} = ?" for name in fields)
    await connection.execute(
        f"UPDATE supply_requests SET status = ?, updated_at = ?{assignments} WHERE id = ?",
        (status, timestamp(now()), *fields.values(), request_id),
    )


async def rematch(connection: apsw.AsyncConnection) -> None:
    """Match waiting requests before reading them. Stock can also arrive through operator
    shipments (haven.routers.logistics), which don't run the matcher themselves."""
    async with write_transaction(connection):
        await match_waiting_requests(connection)


@post("/requests")
async def create_request(data: JSONBody[RequestCreate], request: Request) -> dict:
    """A citizen asks for goods. The request is matched to the best hub straight away when one can
    cover it (status `matched`), otherwise it waits (`open`) and is matched when stock arrives.

    Limited to a demand-adjusted number of active requests per citizen (see fairness.py).
    """
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        encoded = await validate_items(connection, data.items, citizen=True)
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
                    name = (await catalog(connection))[scarcest]["name"].lower()
                    message = (
                        f"{have}. While demand for {name} is {level}, each person can have "
                        f"{cap} at a time so supplies reach everyone."
                    )
                else:
                    message = (
                        f"{have}, the most each person can have right now. "
                        f"Cancel one or wait for a delivery."
                    )
                raise error(409, "request_limit", message)
            await connection.execute(
                "INSERT INTO supply_requests (id, user_id, items_json, latitude, longitude, "
                "address, notes, status, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)",
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
            await match_waiting_requests(connection)
        return await fetch_info(connection, request_id)


@get("/requests/limits")
async def request_limits(request: Request) -> dict:
    """The citizen's active request count and the current per-resource cap and demand level."""
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        return await limits(connection, actor.user_id)


@get("/requests/mine")
async def my_requests(request: Request) -> list[dict]:
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        await rematch(connection)
        rows = await (
            await connection.execute(
                f"SELECT {_COLUMNS} {_FROM} WHERE r.user_id = ? "
                f"ORDER BY r.created_at DESC LIMIT 100",
                (actor.user_id,),
            )
        ).fetchall()
        names = await catalog(connection)
    return [request_info(row, names) for row in rows]


@post("/requests/{request_id:str}/cancel", status_code=200)
async def cancel_request(request_id: FromPath[str], request: Request) -> dict:
    """The citizen withdraws a request. Its reserved items return to stock, which may let a
    waiting request be matched."""
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        async with write_transaction(connection):
            row = await fetch(connection, request_id)
            if row[1] != actor.user_id:
                raise not_found("Request")
            if row[7] not in ("open", "matched", "assigned"):
                raise error(409, "request_closed", "This request is already closed.")
            if row[7] in ("matched", "assigned"):
                await release(connection, row[8], parse_items(row[2]))
            await set_status(connection, request_id, "cancelled")
            await match_waiting_requests(connection)
        return await fetch_info(connection, request_id)


@get("/requests")
async def list_requests(
    request: Request,
    status: FromQuery[Status | None] = None,
    assigned_to_me: FromQuery[bool] = False,
) -> list[dict]:
    """Operator queue: `matched` requests are ready to claim; `open` ones wait for stock."""
    async with connect() as connection:
        actor = await require_role(request, connection, "operator")
        await rematch(connection)
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
                f"SELECT {_COLUMNS} {_FROM} {where} ORDER BY r.created_at LIMIT 200",
                tuple(params),
            )
        ).fetchall()
        names = await catalog(connection)
    return [request_info(row, names) for row in rows]


@post("/requests/{request_id:str}/claim", status_code=200)
async def claim_request(
    request_id: FromPath[str], data: JSONBody[RequestClaim], request: Request
) -> dict:
    """A worker takes a matched request and chooses delivery or citizen pickup. The source hub was
    chosen by the matcher and its items are already reserved."""
    async with connect() as connection:
        actor = await require_role(request, connection, "operator")
        async with write_transaction(connection):
            row = await fetch(connection, request_id)
            if row[7] != "matched":
                raise error(
                    409,
                    "request_not_matched",
                    "Only requests matched to a hub and not yet claimed can be claimed.",
                )
            await set_status(
                connection, request_id, "assigned", method=data.method, assigned_to=actor.user_id
            )
        return await fetch_info(connection, request_id)


async def assigned_to_actor(connection, request_id: str, user_id: str) -> tuple:
    row = await fetch(connection, request_id)
    if row[7] != "assigned":
        raise error(409, "request_not_assigned", "This request isn't currently assigned.")
    if row[10] != user_id:
        raise error(403, "forbidden", "This request is assigned to another worker.")
    return row


@post("/requests/{request_id:str}/release", status_code=200)
async def release_request(request_id: FromPath[str], request: Request) -> dict:
    """Hand a claimed request back to the queue; it stays matched to its hub (assignee only)."""
    async with connect() as connection:
        actor = await require_role(request, connection, "operator")
        async with write_transaction(connection):
            await assigned_to_actor(connection, request_id, actor.user_id)
            await set_status(connection, request_id, "matched", method=None, assigned_to=None)
        return await fetch_info(connection, request_id)


@post("/requests/{request_id:str}/fulfill", status_code=200)
async def fulfill_request(request_id: FromPath[str], request: Request) -> dict:
    """Mark goods handed over; the reserved items leave the hub's stock (assignee only)."""
    async with connect() as connection:
        actor = await require_role(request, connection, "operator")
        async with write_transaction(connection):
            row = await assigned_to_actor(connection, request_id, actor.user_id)
            await consume(connection, row[8], parse_items(row[2]))
            await set_status(connection, request_id, "fulfilled")
        return await fetch_info(connection, request_id)


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
