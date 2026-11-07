"""Operator-only disaster activity timeline."""

from typing import Annotated, TypedDict

from litestar import Router, get
from litestar.connection import ASGIConnection
from litestar.handlers.base import BaseRouteHandler
from litestar.params import FromPath, QueryParameter

from haven.api_common import error, require_disaster
from haven.auth import get_authenticated_user
from haven.db import connect
from haven.openapi import BEARER, errors


class ActivityReference(TypedDict):
    kind: str
    id: str


class ActivityActor(ActivityReference):
    name: str


class ActivityEntry(TypedDict):
    id: str
    disaster_id: str
    type: str
    summary: str
    ref: ActivityReference
    actor: ActivityActor
    created_at: str


class ActivityList(TypedDict):
    activity: list[ActivityEntry]


def activity_operator_guard(connection: ASGIConnection, _: BaseRouteHandler) -> None:
    if get_authenticated_user(connection).role != "operator":
        error(403, "not_permitted", "Operator access required.")


@get(
    "/disasters/{disaster_id:str}/activity",
    tags=["Activity"],
    security=BEARER,
    guards=[activity_operator_guard],
    responses=errors(400, 401, 403, 404, 500),
    description="Operator-only newest-first activity timeline.",
)
async def list_activity(
    disaster_id: FromPath[str],
    limit: Annotated[int, QueryParameter(ge=1, le=1000)] = 50,
) -> ActivityList:
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        rows = await (
            await connection.execute(
                "SELECT id, disaster_id, type, summary, ref_kind, ref_id, actor_kind, "
                "actor_id, actor_name, created_at FROM activity WHERE disaster_id = ? "
                "ORDER BY created_at DESC, id DESC LIMIT ?",
                (disaster_id, limit),
            )
        ).fetchall()
    return {
        "activity": [
            {
                "id": row[0],
                "disaster_id": row[1],
                "type": row[2],
                "summary": row[3],
                "ref": {"kind": row[4], "id": row[5]},
                "actor": {"kind": row[6], "id": row[7], "name": row[8]},
                "created_at": row[9],
            }
            for row in rows
        ]
    }


router = Router(path="/", route_handlers=[list_activity])
