"""Citizen drop-off pledges, confirmed by hub staff.

pending --receive (staff)--> received (items added to hub inventory)
pending --no-show (staff)--> no_show
pending --cancel (citizen)--> cancelled
"""

from typing import Literal
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
    items_json,
    not_found,
    parse_items,
    require_hub_access,
    require_role,
    write_transaction,
)

Status = Literal["pending", "received", "no_show", "cancelled"]
FULL_PCT = 90


class PledgeCreate(msgspec.Struct, forbid_unknown_fields=True):
    items: Items
    notes: Notes = ""


_COLUMNS = "p.id, p.user_id, p.hub_id, p.items_json, p.notes, p.status, p.created_at, p.updated_at, h.name, h.address, u.email"
_FROM = "FROM pledges p JOIN hubs h ON h.id = p.hub_id JOIN users u ON u.id = p.user_id"


def pledge_info(row: tuple) -> dict:
    return {
        "id": row[0],
        "hub": {"id": row[2], "name": row[8], "address": row[9]},
        "items": parse_items(row[3]),
        "notes": row[4],
        "status": row[5],
        "created_at": row[6],
        "updated_at": row[7],
        "donor_email": row[10],
    }


async def fetch(connection: apsw.AsyncConnection, pledge_id: str) -> tuple:
    row = await (
        await connection.execute(f"SELECT {_COLUMNS} {_FROM} WHERE p.id = ?", (pledge_id,))
    ).fetchone()
    if row is None:
        raise not_found("Pledge")
    return row


async def set_status(connection: apsw.AsyncConnection, pledge_id: str, status: str) -> None:
    await connection.execute(
        "UPDATE pledges SET status = ?, updated_at = ? WHERE id = ?",
        (status, timestamp(now()), pledge_id),
    )


@post("/hubs/{hub_id:str}/pledges")
async def create_pledge(
    hub_id: FromPath[str], data: JSONBody[PledgeCreate], request: Request
) -> dict:
    """A citizen pledges to drop goods off. Full hubs (90%+) don't accept new pledges."""
    encoded = items_json(data.items)
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        pledge_id, stamp = "pledge_" + uuid4().hex, timestamp(now())
        async with write_transaction(connection):
            hub = await (
                await connection.execute("SELECT capacity_pct FROM hubs WHERE id = ?", (hub_id,))
            ).fetchone()
            if hub is None:
                raise not_found()
            if hub[0] >= FULL_PCT:
                raise error(
                    409, "hub_full", "This hub is full and isn't taking drop-offs right now."
                )
            await connection.execute(
                "INSERT INTO pledges (id, user_id, hub_id, items_json, notes, status, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
                (pledge_id, actor.user_id, hub_id, encoded, data.notes, stamp, stamp),
            )
        return pledge_info(await fetch(connection, pledge_id))


@get("/pledges/mine")
async def my_pledges(request: Request) -> list[dict]:
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        rows = await (
            await connection.execute(
                f"SELECT {_COLUMNS} {_FROM} WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 100",
                (actor.user_id,),
            )
        ).fetchall()
    return [pledge_info(row) for row in rows]


@post("/pledges/{pledge_id:str}/cancel", status_code=200)
async def cancel_pledge(pledge_id: FromPath[str], request: Request) -> dict:
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        async with write_transaction(connection):
            row = await fetch(connection, pledge_id)
            if row[1] != actor.user_id:
                raise not_found("Pledge")
            if row[5] != "pending":
                raise error(409, "pledge_closed", "This pledge is already closed.")
            await set_status(connection, pledge_id, "cancelled")
        return pledge_info(await fetch(connection, pledge_id))


@get("/hubs/{hub_id:str}/pledges")
async def hub_pledges(
    hub_id: FromPath[str], request: Request, status: FromQuery[Status | None] = "pending"
) -> list[dict]:
    """Pledges for one hub, oldest first (that hub's staff, or an operator)."""
    async with connect() as connection:
        actor = await require_role(request, connection, "operator", "hub_staff")
        require_hub_access(actor, hub_id)
        where, params = ("AND p.status = ?", (hub_id, status)) if status else ("", (hub_id,))
        rows = await (
            await connection.execute(
                f"SELECT {_COLUMNS} {_FROM} WHERE p.hub_id = ? {where} ORDER BY p.created_at LIMIT 200",
                params,
            )
        ).fetchall()
    return [pledge_info(row) for row in rows]


async def close_by_staff(pledge_id: str, request: Request, status: str) -> dict:
    async with connect() as connection:
        actor = await require_role(request, connection, "operator", "hub_staff")
        async with write_transaction(connection):
            row = await fetch(connection, pledge_id)
            require_hub_access(actor, row[2])
            if row[5] != "pending":
                raise error(409, "pledge_closed", "This pledge is already closed.")
            if status == "received":
                await adjust_stock(connection, row[2], parse_items(row[3]), 1)
            await set_status(connection, pledge_id, status)
        return pledge_info(await fetch(connection, pledge_id))


@post("/pledges/{pledge_id:str}/receive", status_code=200)
async def receive_pledge(pledge_id: FromPath[str], request: Request) -> dict:
    """Confirm the drop-off arrived; its items are added to the hub's inventory."""
    return await close_by_staff(pledge_id, request, "received")


@post("/pledges/{pledge_id:str}/no-show", status_code=200)
async def no_show_pledge(pledge_id: FromPath[str], request: Request) -> dict:
    return await close_by_staff(pledge_id, request, "no_show")


HANDLERS = [create_pledge, my_pledges, cancel_pledge, hub_pledges, receive_pledge, no_show_pledge]
