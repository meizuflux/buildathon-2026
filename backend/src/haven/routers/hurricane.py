"""Hurricane demo: peace/active status, initiation broadcast, and evacuation preview."""

import asyncio
import json
from typing import Annotated, Any, cast
from uuid import uuid4

import apsw
import msgspec
from litestar import Request, Router, get, post
from litestar.params import Body, FromPath

from haven.activity import record_activity
from haven.api_common import error, require_disaster
from haven.auth import get_authenticated_user, now, operator_guard, timestamp
from haven.db import connect
from haven.evacuation_comparison import build_preview
from haven.openapi import BEARER, EvacuationPreview, HurricaneStatus, errors
from haven.rows import (
    ALLOCATION_FAMILY_COLUMNS,
    ALLOCATION_SHELTER_COLUMNS,
    allocation_family_from_row,
    allocation_shelter_from_row,
    projection,
    row_mapping,
)

DEFAULT_NAME = "Hurricane Delia"
DEFAULT_CATEGORY = 4


class HurricaneInitiate(msgspec.Struct, forbid_unknown_fields=True):
    name: str = DEFAULT_NAME
    category: Annotated[int, msgspec.Meta(ge=1, le=5)] = DEFAULT_CATEGORY


def _status(disaster_id: str, row: Any) -> HurricaneStatus:
    if row is None or row[0] != "active":
        return {
            "disaster_id": disaster_id,
            "phase": "peace",
            "hurricane": None,
            "started_at": None,
            "updated_at": row[4] if row else None,
        }
    return {
        "disaster_id": disaster_id,
        "phase": "active",
        "hurricane": {"name": row[1], "category": row[2]},
        "started_at": row[3],
        "updated_at": row[4],
    }


async def _read_status(connection: apsw.AsyncConnection, disaster_id: str) -> HurricaneStatus:
    row = await (
        await connection.execute(
            "SELECT phase, hurricane_name, category, started_at, updated_at "
            "FROM hurricane_status WHERE disaster_id = ?",
            (disaster_id,),
        )
    ).fetchone()
    return _status(disaster_id, row)


@get(
    "/disasters/{disaster_id:str}/hurricane",
    tags=["Hurricane"],
    responses=errors(404, 500),
    description="Public. A disaster that was never initiated is in peace.",
)
async def get_hurricane(disaster_id: FromPath[str]) -> HurricaneStatus:
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        return await _read_status(connection, disaster_id)


@post(
    "/disasters/{disaster_id:str}/hurricane/initiate",
    tags=["Hurricane"],
    security=BEARER,
    guards=[operator_guard],
    status_code=200,
    responses=errors(400, 401, 403, 404, 409, 500),
    description=(
        "Operator only. Activates the hurricane and publishes a critical evacuation "
        "broadcast to all households. The body and every field in it are optional."
    ),
)
async def initiate_hurricane(
    disaster_id: FromPath[str],
    request: Request,
    data: Annotated[HurricaneInitiate | None, Body()] = None,
) -> HurricaneStatus:
    body = data or HurricaneInitiate()
    name = body.name.strip()
    if not 1 <= len(name) <= 60:
        error(400, "invalid_request", "Hurricane name must be 1 to 60 characters.")
    category = body.category
    user = get_authenticated_user(request)
    async with connect() as connection:
        await connection.execute("BEGIN IMMEDIATE")
        try:
            await require_disaster(connection, disaster_id)
            active = await (
                await connection.execute(
                    "SELECT 1 FROM hurricane_status WHERE disaster_id = ? AND phase = 'active'",
                    (disaster_id,),
                )
            ).fetchone()
            if active:
                error(409, "hurricane_already_active", "A hurricane is already active.")
            area = (
                await (
                    await connection.execute(
                        "SELECT affected_area FROM disasters WHERE id = ?", (disaster_id,)
                    )
                ).fetchone()
            )[0]
            households = (
                await (
                    await connection.execute(
                        "SELECT COUNT(*) FROM families WHERE disaster_id = ?", (disaster_id,)
                    )
                ).fetchone()
            )[0]
            stamp = timestamp(now())
            update_id = "update_" + uuid4().hex
            title = f"{name} evacuation order"
            await connection.execute(
                "INSERT INTO disaster_updates (id, disaster_id, title, message, severity, published_at) "
                "VALUES (?, ?, ?, ?, 'critical', ?)",
                (
                    update_id,
                    disaster_id,
                    title,
                    f"Category {category} hurricane. Mandatory evacuation for {area}. "
                    "Open Haven for your personalized shelter assignment and follow "
                    "instructions from local officials.",
                    stamp,
                ),
            )
            await connection.execute(
                "INSERT INTO broadcast_targets (update_id, target_json) VALUES (?, ?)",
                (update_id, json.dumps({"type": "all"})),
            )
            await record_activity(
                connection,
                disaster_id=disaster_id,
                event_type="update_published",
                summary=f"Broadcast sent to all families: {title}",
                ref_kind="update",
                ref_id=update_id,
                user=user,
            )
            await record_activity(
                connection,
                disaster_id=disaster_id,
                event_type="hurricane_initiated",
                summary=(
                    f"{name} (Category {category}) initiated: personalized assignments "
                    f"published to {households} households"
                ),
                ref_kind="disaster",
                ref_id=disaster_id,
                user=user,
            )
            await connection.execute(
                "INSERT INTO hurricane_status (disaster_id, phase, hurricane_name, category, "
                "started_at, broadcast_update_id, updated_at) VALUES (?, 'active', ?, ?, ?, ?, ?) "
                "ON CONFLICT(disaster_id) DO UPDATE SET phase = excluded.phase, "
                "hurricane_name = excluded.hurricane_name, category = excluded.category, "
                "started_at = excluded.started_at, "
                "broadcast_update_id = excluded.broadcast_update_id, "
                "updated_at = excluded.updated_at",
                (disaster_id, name, category, stamp, update_id, stamp),
            )
            result = await _read_status(connection, disaster_id)
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return result


@post(
    "/disasters/{disaster_id:str}/hurricane/reset",
    tags=["Hurricane"],
    security=BEARER,
    guards=[operator_guard],
    status_code=200,
    responses=errors(401, 403, 404, 500),
    description=(
        "Operator only and idempotent. Returns to peace and removes the broadcast and "
        "activity created by initiate so the demo can be rehearsed again."
    ),
)
async def reset_hurricane(disaster_id: FromPath[str]) -> HurricaneStatus:
    async with connect() as connection:
        await connection.execute("BEGIN IMMEDIATE")
        try:
            await require_disaster(connection, disaster_id)
            row = await (
                await connection.execute(
                    "SELECT broadcast_update_id FROM hurricane_status WHERE disaster_id = ?",
                    (disaster_id,),
                )
            ).fetchone()
            update_id = row[0] if row else None
            if update_id:
                await connection.execute(
                    "DELETE FROM activity WHERE disaster_id = ? AND ref_kind = 'update' "
                    "AND ref_id = ?",
                    (disaster_id, update_id),
                )
                await connection.execute(
                    "DELETE FROM broadcast_targets WHERE update_id = ?", (update_id,)
                )
                await connection.execute(
                    "DELETE FROM disaster_updates WHERE id = ? AND disaster_id = ?",
                    (update_id, disaster_id),
                )
            await connection.execute(
                "DELETE FROM activity WHERE disaster_id = ? AND type = 'hurricane_initiated'",
                (disaster_id,),
            )
            await connection.execute(
                "DELETE FROM hurricane_status WHERE disaster_id = ?", (disaster_id,)
            )
            result = await _read_status(connection, disaster_id)
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return result


@get(
    "/disasters/{disaster_id:str}/evacuation/preview",
    tags=["Hurricane"],
    security=BEARER,
    guards=[operator_guard],
    responses=errors(401, 403, 404, 500),
    description=(
        "Operator only, read-only. Nearest-shelter routing (old) versus the stored "
        "personalized assignments, per household and in aggregate."
    ),
)
async def evacuation_preview(disaster_id: FromPath[str]) -> EvacuationPreview:
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        family_rows = await (
            await connection.execute(
                f"SELECT {projection(ALLOCATION_FAMILY_COLUMNS)} FROM families "
                "WHERE disaster_id = ? ORDER BY created_at, id",
                (disaster_id,),
            )
        ).fetchall()
        shelter_rows = await (
            await connection.execute(
                f"SELECT {projection(ALLOCATION_SHELTER_COLUMNS)} FROM shelters "
                "WHERE disaster_id = ? ORDER BY id",
                (disaster_id,),
            )
        ).fetchall()
        budgets = dict(
            await (
                await connection.execute(
                    "SELECT b.shelter_id, b.allocation_budget FROM shelter_capacity_budgets b "
                    "JOIN shelters s ON s.id = b.shelter_id WHERE s.disaster_id = ?",
                    (disaster_id,),
                )
            ).fetchall()
        )
        assignments = dict(
            await (
                await connection.execute(
                    "SELECT family_id, shelter_id FROM current_assignments WHERE disaster_id = ?",
                    (disaster_id,),
                )
            ).fetchall()
        )
    families = [allocation_family_from_row(row) for row in family_rows]
    shelters = []
    for row in shelter_rows:
        values = row_mapping(row, ALLOCATION_SHELTER_COLUMNS)
        budget = budgets.get(values["id"])
        if budget is None:
            budget = int(json.loads(values["capacity_json"])["available_people"])
        shelters.append(allocation_shelter_from_row(row, max(0, int(budget))))
    by_id = {shelter["id"]: shelter for shelter in shelters}
    personalized = {f["id"]: by_id.get(assignments.get(f["id"])) for f in families}
    preview = await asyncio.to_thread(build_preview, families, shelters, personalized)
    return cast(
        EvacuationPreview,
        {"disaster_id": disaster_id, "generated_at": timestamp(now()), **preview},
    )


router = Router(
    path="/",
    route_handlers=[get_hurricane, initiate_hurricane, reset_hurricane, evacuation_preview],
)
