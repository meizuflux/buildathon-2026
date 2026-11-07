"""Custom donations and requests for items outside the catalog, reviewed by a government worker.

pending --approve(hub, message)--> approved --complete--> completed
pending --decline(message)--> declined
pending/approved --cancel (citizen)--> cancelled

Each citizen may have one submission pending review at a time. Custom items aren't tracked in
inventory; the worker's hub choice and message tell the citizen where to drop off or collect.
"""

from typing import Annotated, Any, Literal, cast
from uuid import uuid4

import apsw
import msgspec
from litestar import Request, get, post
from litestar.params import FromPath, FromQuery, JSONBody

from haven.auth import now, timestamp
from haven.db import connect
from haven.donations.common import (
    Notes,
    error,
    haversine_km,
    hub_exists,
    not_found,
    require_role,
    write_transaction,
)

Kind = Literal["donation", "request"]
Status = Literal["pending", "approved", "declined", "completed", "cancelled"]
Message = Annotated[str, msgspec.Meta(min_length=1, max_length=1000)]


class CustomCreate(msgspec.Struct, forbid_unknown_fields=True):
    kind: Kind
    description: Annotated[str, msgspec.Meta(min_length=2, max_length=200)]
    latitude: Annotated[float, msgspec.Meta(ge=-90, le=90)]
    longitude: Annotated[float, msgspec.Meta(ge=-180, le=180)]
    quantity: Annotated[int, msgspec.Meta(ge=1, le=10_000)] = 1
    notes: Notes = ""


class CustomApprove(msgspec.Struct, forbid_unknown_fields=True):
    hub_id: str
    message: Message


class CustomDecline(msgspec.Struct, forbid_unknown_fields=True):
    message: Message


_COLUMNS = (
    "c.id, c.user_id, c.kind, c.description, c.quantity, c.latitude, c.longitude, c.notes, "
    "c.status, c.hub_id, c.response, c.created_at, c.updated_at, h.name, h.address, h.latitude, "
    "h.longitude, u.email, r.email"
)
_FROM = (
    "FROM custom_submissions c LEFT JOIN organizations h ON h.id = c.hub_id "
    "JOIN users u ON u.id = c.user_id LEFT JOIN users r ON r.id = c.reviewed_by"
)


def submission_info(row: Any) -> dict:
    hub = (
        None
        if row[9] is None
        else {
            "id": row[9],
            "name": row[13],
            "address": row[14],
            "latitude": row[15],
            "longitude": row[16],
        }
    )
    return {
        "id": row[0],
        "kind": row[2],
        "description": row[3],
        "quantity": row[4],
        "latitude": row[5],
        "longitude": row[6],
        "notes": row[7],
        "status": row[8],
        "hub": hub,
        "response": row[10],
        "created_at": row[11],
        "updated_at": row[12],
        "citizen_email": row[17],
        "reviewed_by_email": row[18],
    }


async def fetch(connection: apsw.AsyncConnection, submission_id: str) -> Any:
    row = await (
        await connection.execute(f"SELECT {_COLUMNS} {_FROM} WHERE c.id = ?", (submission_id,))
    ).fetchone()
    if row is None:
        raise not_found("Custom submission")
    return row


async def update(connection: apsw.AsyncConnection, submission_id: str, **fields) -> None:
    assignments = ", ".join(f"{name} = ?" for name in fields)
    await connection.execute(
        f"UPDATE custom_submissions SET {assignments}, updated_at = ? WHERE id = ?",
        (*fields.values(), timestamp(now()), submission_id),
    )


async def nearby_hubs(
    connection: apsw.AsyncConnection, latitude: float, longitude: float, limit: int = 3
) -> list[dict]:
    """The nearest active hubs, to help a worker choose where the citizen should go."""
    hubs = cast(
        list[tuple[str, str, float, float, int]],
        await (
            await connection.execute(
                "SELECT id, name, latitude, longitude, capacity_pct FROM organizations "
                "WHERE site_type IS NOT NULL AND status != 'inactive'"
            )
        ).fetchall(),
    )
    ranked = sorted(
        (
            {
                "id": hub_id,
                "name": name,
                "capacity_pct": capacity,
                "distance_km": round(haversine_km(latitude, longitude, lat, lng), 2),
            }
            for hub_id, name, lat, lng, capacity in hubs
        ),
        key=lambda hub: hub["distance_km"],
    )
    return ranked[:limit]


@post("/custom-submissions")
async def create_custom(data: JSONBody[CustomCreate], request: Request) -> dict:
    """A citizen offers or asks for something outside the catalog; it waits for worker review."""
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        submission_id, stamp = "custom_" + uuid4().hex, timestamp(now())
        async with write_transaction(connection):
            if await (
                await connection.execute(
                    "SELECT 1 FROM custom_submissions WHERE user_id = ? AND status = 'pending'",
                    (actor.user_id,),
                )
            ).fetchone():
                raise error(
                    409,
                    "custom_pending",
                    "You already have a custom item waiting for review. "
                    "You can send another once it's been reviewed.",
                )
            await connection.execute(
                "INSERT INTO custom_submissions (id, user_id, kind, description, quantity, "
                "latitude, longitude, notes, status, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
                (
                    submission_id,
                    actor.user_id,
                    data.kind,
                    data.description.strip(),
                    data.quantity,
                    data.latitude,
                    data.longitude,
                    data.notes,
                    stamp,
                    stamp,
                ),
            )
        return submission_info(await fetch(connection, submission_id))


@get("/custom-submissions/mine")
async def my_custom(request: Request) -> list[dict]:
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        rows = await (
            await connection.execute(
                f"SELECT {_COLUMNS} {_FROM} WHERE c.user_id = ? "
                f"ORDER BY c.created_at DESC LIMIT 100",
                (actor.user_id,),
            )
        ).fetchall()
    return [submission_info(row) for row in rows]


@post("/custom-submissions/{submission_id:str}/cancel", status_code=200)
async def cancel_custom(submission_id: FromPath[str], request: Request) -> dict:
    async with connect() as connection:
        actor = await require_role(request, connection, "family")
        async with write_transaction(connection):
            row = await fetch(connection, submission_id)
            if row[1] != actor.user_id:
                raise not_found("Custom submission")
            if row[8] not in ("pending", "approved"):
                raise error(409, "custom_closed", "This submission is already closed.")
            await update(connection, submission_id, status="cancelled")
        return submission_info(await fetch(connection, submission_id))


@get("/custom-submissions")
async def list_custom(
    request: Request, status: FromQuery[Status | None] = None, kind: FromQuery[Kind | None] = None
) -> list[dict]:
    """Review queue, oldest first. Pending items include the nearest hubs as suggestions."""
    async with connect() as connection:
        await require_role(request, connection, "operator")
        clauses, params = [], []
        if status:
            clauses.append("c.status = ?")
            params.append(status)
        if kind:
            clauses.append("c.kind = ?")
            params.append(kind)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        rows = await (
            await connection.execute(
                f"SELECT {_COLUMNS} {_FROM} {where} ORDER BY c.created_at LIMIT 200", tuple(params)
            )
        ).fetchall()
        items = [submission_info(row) for row in rows]
        for item in items:
            if item["status"] == "pending":
                item["nearby_hubs"] = await nearby_hubs(
                    connection, item["latitude"], item["longitude"]
                )
    return items


@post("/custom-submissions/{submission_id:str}/approve", status_code=200)
async def approve_custom(
    submission_id: FromPath[str], data: JSONBody[CustomApprove], request: Request
) -> dict:
    """Approve with the hub the citizen should use and instructions for them."""
    async with connect() as connection:
        actor = await require_role(request, connection, "operator")
        async with write_transaction(connection):
            row = await fetch(connection, submission_id)
            if row[8] != "pending":
                raise error(409, "custom_not_pending", "This submission was already reviewed.")
            if not await hub_exists(connection, data.hub_id):
                raise not_found()
            await update(
                connection,
                submission_id,
                status="approved",
                hub_id=data.hub_id,
                response=data.message.strip(),
                reviewed_by=actor.user_id,
            )
        return submission_info(await fetch(connection, submission_id))


@post("/custom-submissions/{submission_id:str}/decline", status_code=200)
async def decline_custom(
    submission_id: FromPath[str], data: JSONBody[CustomDecline], request: Request
) -> dict:
    async with connect() as connection:
        actor = await require_role(request, connection, "operator")
        async with write_transaction(connection):
            row = await fetch(connection, submission_id)
            if row[8] != "pending":
                raise error(409, "custom_not_pending", "This submission was already reviewed.")
            await update(
                connection,
                submission_id,
                status="declined",
                response=data.message.strip(),
                reviewed_by=actor.user_id,
            )
        return submission_info(await fetch(connection, submission_id))


@post("/custom-submissions/{submission_id:str}/complete", status_code=200)
async def complete_custom(submission_id: FromPath[str], request: Request) -> dict:
    """Mark an approved item handed over (dropped off or delivered)."""
    async with connect() as connection:
        await require_role(request, connection, "operator")
        async with write_transaction(connection):
            row = await fetch(connection, submission_id)
            if row[8] != "approved":
                raise error(
                    409, "custom_not_approved", "Only approved submissions can be completed."
                )
            await update(connection, submission_id, status="completed")
        return submission_info(await fetch(connection, submission_id))


HANDLERS = [
    create_custom,
    my_custom,
    cancel_custom,
    list_custom,
    approve_custom,
    decline_custom,
    complete_custom,
]
