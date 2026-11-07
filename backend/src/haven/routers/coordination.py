"""Persisted recommendations and idempotent family reports."""

import asyncio
import json
import time
from typing import Annotated, Literal, cast
from uuid import uuid4

import msgspec
from litestar import Request, Router, get, post
from litestar.openapi import ResponseSpec
from litestar.params import FromPath, JSONBody, QueryParameter
from litestar.response import Response

from haven.allocation import public_plan, recompute_disasters
from haven.api_common import error, require_disaster, require_family
from haven.auth import (
    authenticate_digest,
    authenticated_guard,
    get_authenticated_user,
    now,
    operator_guard,
    timestamp,
)
from haven.db import connect
from haven.openapi import BEARER, Plan, PlanPage, Report, ReportList, errors
from haven.rows import REPORT_COLUMNS, projection, report_from_row


class ReportLocation(msgspec.Struct, forbid_unknown_fields=True):
    latitude: Annotated[float, msgspec.Meta(ge=-90, le=90)]
    longitude: Annotated[float, msgspec.Meta(ge=-180, le=180)]


class ReportCreate(msgspec.Struct, forbid_unknown_fields=True):
    type: Literal["need_help", "status_update", "resource_request", "other"]
    message: Annotated[str, msgspec.Meta(min_length=1, max_length=10000)]
    location: ReportLocation
    client_request_id: Annotated[str, msgspec.Meta(min_length=1, max_length=200)]


@get(
    "/disasters/{disaster_id:str}/plans",
    tags=["Plans"],
    security=BEARER,
    guards=[operator_guard],
    responses=errors(400, 401, 403, 404, 500),
    description="Operator only. List the latest plan per family, ordered by family creation time and ID.",
)
async def list_plans(
    disaster_id: FromPath[str],
    limit: Annotated[int, QueryParameter(ge=1, le=1000)] = 100,
    offset: Annotated[int, QueryParameter(ge=0)] = 0,
) -> PlanPage:
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        rows = await (
            await connection.execute(
                "SELECT p.plan_json FROM families f JOIN plans p ON p.family_id = f.id "
                "AND p.version = (SELECT MAX(p2.version) FROM plans p2 WHERE p2.family_id = f.id) "
                "WHERE f.disaster_id = ? ORDER BY f.created_at, f.id LIMIT ? OFFSET ?",
                (disaster_id, limit, offset),
            )
        ).fetchall()
        total = (
            await (
                await connection.execute(
                    "SELECT count(*) FROM families f WHERE f.disaster_id = ? AND EXISTS "
                    "(SELECT 1 FROM plans p WHERE p.family_id = f.id)",
                    (disaster_id,),
                )
            ).fetchone()
        )[0]
    return {
        "plans": [public_plan(json.loads(row[0])) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@post(
    "/families/{family_id:str}/plan/generate",
    status_code=200,
    tags=["Plans"],
    security=BEARER,
    guards=[authenticated_guard],
    responses=errors(400, 401, 403, 404, 500),
    description="Family owner or operator only. Reallocate the disaster and return this family’s latest plan.",
)
async def generate_plan(family_id: FromPath[str], request: Request) -> Plan:
    async with connect() as connection:
        user = get_authenticated_user(request)
        await connection.execute("BEGIN IMMEDIATE")
        try:
            family = await require_family(connection, family_id, user)
            await recompute_disasters(connection, (family["disaster_id"],))
            row = await (
                await connection.execute(
                    "SELECT plan_json FROM plans WHERE family_id = ? ORDER BY version DESC LIMIT 1",
                    (family_id,),
                )
            ).fetchone()
            if row is None:
                error(
                    500,
                    "plan_unavailable",
                    "The allocation service did not persist a plan for this family.",
                )
            plan = public_plan(json.loads(row[0]))
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return plan


@get(
    "/families/{family_id:str}/plan",
    tags=["Plans"],
    security=BEARER,
    guards=[authenticated_guard],
    responses={
        **errors(400, 401, 403, 404, 500),
        200: ResponseSpec(data_container=Plan, description="Latest plan"),
        204: ResponseSpec(data_container=None, description="No newer plan before timeout"),
    },
    description="Family owner or operator only. Supply after_version and wait_seconds (0–25) to long-poll for a newer plan.",
)
async def get_plan(
    family_id: FromPath[str],
    request: Request,
    after_version: Annotated[int | None, QueryParameter(ge=0)] = None,
    wait_seconds: Annotated[int, QueryParameter(ge=0, le=25)] = 0,
) -> Plan | Response:
    deadline = time.monotonic() + wait_seconds
    auth_digest = cast(str, request.auth)
    while True:
        async with connect() as connection:
            user = await authenticate_digest(auth_digest, connection)
            await require_family(connection, family_id, user)
            row = await (
                await connection.execute(
                    "SELECT plan_json FROM plans WHERE family_id = ? ORDER BY version DESC LIMIT 1",
                    (family_id,),
                )
            ).fetchone()
        if row is None:
            error(404, "plan_not_found", "No plan has been generated for this family.")
        plan = public_plan(json.loads(row[0]))
        if after_version is None or plan["version"] > after_version:
            return plan
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return Response(content=None, status_code=204)
        await asyncio.sleep(min(0.25, remaining))


@post(
    "/families/{family_id:str}/reports",
    tags=["Reports"],
    security=BEARER,
    guards=[authenticated_guard],
    responses=errors(400, 401, 403, 404, 409, 500),
    description="Family owner or operator only. Reusing a client_request_id with the same payload returns the original report; a different payload conflicts.",
)
async def create_report(
    family_id: FromPath[str], data: JSONBody[ReportCreate], request: Request
) -> Report:
    if not data.message.strip() or not data.client_request_id.strip():
        error(400, "invalid_request", "message and client_request_id must not be blank.")
    async with connect() as connection:
        user = get_authenticated_user(request)
        await connection.execute("BEGIN IMMEDIATE")
        try:
            await require_family(connection, family_id, user)
            row = await (
                await connection.execute(
                    f"SELECT {projection(REPORT_COLUMNS)} FROM reports "
                    "WHERE family_id = ? AND client_request_id = ?",
                    (family_id, data.client_request_id),
                )
            ).fetchone()
            if row:
                report = report_from_row(row)
                if (report["type"], report["message"], report["location"]) != (
                    data.type,
                    data.message,
                    msgspec.to_builtins(data.location),
                ):
                    error(
                        409,
                        "idempotency_conflict",
                        "client_request_id was already used for a different report.",
                    )
            else:
                report = cast(
                    Report,
                    {
                        "id": "report_" + uuid4().hex,
                        "family_id": family_id,
                        **msgspec.to_builtins(data),
                        "status": "received",
                        "created_at": timestamp(now()),
                    },
                )
                await connection.execute(
                    "INSERT INTO reports (id, family_id, type, message, latitude, longitude, client_request_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        report["id"],
                        family_id,
                        data.type,
                        data.message,
                        data.location.latitude,
                        data.location.longitude,
                        data.client_request_id,
                        "received",
                        report["created_at"],
                    ),
                )
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return report


@get(
    "/disasters/{disaster_id:str}/reports",
    tags=["Reports"],
    security=BEARER,
    guards=[operator_guard],
    responses=errors(400, 401, 403, 404, 500),
    description="Operator only. List reports for a disaster.",
)
async def list_reports(disaster_id: FromPath[str]) -> ReportList:
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        cursor = await connection.execute(
            f"SELECT {projection(tuple(f'r.{column}' for column in REPORT_COLUMNS))} "
            "FROM reports r JOIN families f ON f.id = r.family_id "
            "WHERE f.disaster_id = ? ORDER BY r.created_at DESC, r.id",
            (disaster_id,),
        )
        return {"reports": [report_from_row(row) async for row in cursor]}


router = Router(
    path="/", route_handlers=[list_plans, generate_plan, get_plan, create_report, list_reports]
)
