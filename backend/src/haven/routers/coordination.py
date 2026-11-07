"""Persisted recommendations and idempotent family reports."""

import asyncio
import json
import math
import time
from typing import Annotated, Literal
from uuid import uuid4

import msgspec
from litestar import Request, Router, get, post
from litestar.params import FromPath, FromQuery, JSONBody
from litestar.response import Response

from haven.api_common import current_user, error, require_disaster, require_family, require_operator
from haven.auth import now, timestamp
from haven.db import connect
from haven.routers.relief import shelter_from_row


class ReportLocation(msgspec.Struct, forbid_unknown_fields=True):
    latitude: Annotated[float, msgspec.Meta(ge=-90, le=90)]
    longitude: Annotated[float, msgspec.Meta(ge=-180, le=180)]


class ReportCreate(msgspec.Struct, forbid_unknown_fields=True):
    type: Literal["need_help", "status_update", "resource_request", "other"]
    message: Annotated[str, msgspec.Meta(min_length=1, max_length=10000)]
    location: ReportLocation
    client_request_id: Annotated[str, msgspec.Meta(min_length=1, max_length=200)]


def report_from_row(row: tuple) -> dict:
    return {
        "id": row[0], "family_id": row[1], "type": row[2], "message": row[3],
        "location": {"latitude": row[4], "longitude": row[5]} if row[4] is not None else None,
        "client_request_id": row[6], "status": row[7], "created_at": row[8],
    }


def matches(family: dict, shelter: dict) -> bool:
    needs, capabilities = family["needs"], shelter["capabilities"]
    if shelter["status"] != "open" or shelter["capacity"]["available_people"] < family["adults"] + family["children"]:
        return False
    requirements = (
        (needs.get("pets"), capabilities.get("pets_allowed")),
        (family["children"] > 0, capabilities.get("child_friendly")),
        (bool(needs.get("accessibility_notes")), capabilities.get("wheelchair_accessible")),
        (needs.get("immediate_medication") or bool(needs.get("medical_notes")), bool(capabilities.get("medical_staff"))),
        (bool(needs.get("other_special_care")), bool(capabilities.get("special_care_notes"))),
    )
    if any(required and not supported for required, supported in requirements):
        return False
    return not needs.get("immediate_medication") or shelter["resources"].get("medication") in {"available", "limited"}


def distance(family: dict, shelter: dict) -> float:
    """Great-circle angular distance, sufficient to rank candidates."""
    start, end = family["location"], shelter["location"]
    lat1, lat2 = math.radians(start["latitude"]), math.radians(end["latitude"])
    dlat = lat2 - lat1
    dlon = math.radians(end["longitude"] - start["longitude"])
    return math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2


def recommendation(family: dict, shelters: list[dict], version: int) -> dict:
    candidates = [shelter for shelter in shelters if matches(family, shelter)]
    selected = min(candidates, key=lambda shelter: (distance(family, shelter), shelter["id"])) if candidates else None
    instructions = ["Check official local emergency updates."]
    reason = "No currently listed shelter meets your family's requirements."
    if selected:
        reason = "Has space for your family and meets your listed shelter requirements."
        instructions = [f"Travel to {selected['name']} if local officials say it is safe to do so."]
        if family["needs"].get("immediate_medication") or family["needs"].get("medical_notes"):
            instructions.append("Bring your medication and any required medical supplies.")
        if family["needs"].get("pets"):
            instructions.append("Bring supplies for your pets.")
        if not family["resources"].get("has_car"):
            instructions.append("Check official transportation assistance before traveling.")
    return {
        "family_id": family["id"], "disaster_id": family["disaster_id"], "version": version,
        "status": "recommended" if selected else "no_match",
        "shelter": {key: selected[key] for key in ("id", "name", "address", "location")} if selected else None,
        "reason": reason, "instructions": instructions, "capacity_reserved": False, "updated_at": timestamp(now()),
    }


@post("/families/{family_id:str}/plan/generate", status_code=200, tags=["Plans"])
async def generate_plan(family_id: FromPath[str], request: Request) -> dict:
    async with connect() as connection:
        user = await current_user(request, connection)
        await connection.execute("BEGIN IMMEDIATE")
        try:
            family = await require_family(connection, family_id, user)
            cursor = await connection.execute("SELECT * FROM shelters WHERE disaster_id = ? AND status = 'open'", (family["disaster_id"],))
            shelters = [shelter_from_row(row) async for row in cursor]
            row = await (await connection.execute("SELECT COALESCE(MAX(version), 0) FROM plans WHERE family_id = ?", (family_id,))).fetchone()
            plan = recommendation(family, shelters, row[0] + 1)
            await connection.execute("INSERT INTO plans (id, family_id, version, plan_json, updated_at) VALUES (?, ?, ?, ?, ?)",
                                     ("plan_" + uuid4().hex, family_id, plan["version"], json.dumps(plan), plan["updated_at"]))
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return plan


@get("/families/{family_id:str}/plan", tags=["Plans"])
async def get_plan(family_id: FromPath[str], request: Request, after_version: FromQuery[int | None] = None, wait_seconds: FromQuery[int] = 0) -> dict | Response:
    if (after_version is not None and after_version < 0) or not 0 <= wait_seconds <= 25:
        error(400, "invalid_request", "after_version must be nonnegative and wait_seconds must be between 0 and 25.")
    deadline = time.monotonic() + wait_seconds
    while True:
        async with connect() as connection:
            user = await current_user(request, connection)
            await require_family(connection, family_id, user)
            row = await (await connection.execute("SELECT plan_json FROM plans WHERE family_id = ? ORDER BY version DESC LIMIT 1", (family_id,))).fetchone()
        if row is None:
            error(404, "plan_not_found", "No plan has been generated for this family.")
        plan = json.loads(row[0])
        if after_version is None or plan["version"] > after_version:
            return plan
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return Response(content=None, status_code=204)
        await asyncio.sleep(min(0.25, remaining))


@post("/families/{family_id:str}/reports", tags=["Reports"])
async def create_report(family_id: FromPath[str], data: JSONBody[ReportCreate], request: Request) -> dict:
    if not data.message.strip() or not data.client_request_id.strip():
        error(400, "invalid_request", "message and client_request_id must not be blank.")
    async with connect() as connection:
        user = await current_user(request, connection)
        await connection.execute("BEGIN IMMEDIATE")
        try:
            await require_family(connection, family_id, user)
            row = await (await connection.execute("SELECT * FROM reports WHERE family_id = ? AND client_request_id = ?", (family_id, data.client_request_id))).fetchone()
            if row:
                report = report_from_row(row)
                if (report["type"], report["message"], report["location"]) != (data.type, data.message, msgspec.to_builtins(data.location)):
                    error(409, "idempotency_conflict", "client_request_id was already used for a different report.")
            else:
                report = {"id": "report_" + uuid4().hex, "family_id": family_id, **msgspec.to_builtins(data), "status": "received", "created_at": timestamp(now())}
                await connection.execute("INSERT INTO reports (id, family_id, type, message, latitude, longitude, client_request_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                         (report["id"], family_id, data.type, data.message, data.location.latitude, data.location.longitude, data.client_request_id, "received", report["created_at"]))
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return report


@get("/disasters/{disaster_id:str}/reports", tags=["Reports"])
async def list_reports(disaster_id: FromPath[str], request: Request) -> dict:
    async with connect() as connection:
        user = await current_user(request, connection)
        require_operator(user)
        await require_disaster(connection, disaster_id)
        cursor = await connection.execute("SELECT r.* FROM reports r JOIN families f ON f.id = r.family_id WHERE f.disaster_id = ? ORDER BY r.created_at DESC, r.id", (disaster_id,))
        return {"reports": [report_from_row(row) async for row in cursor]}


router = Router(path="/", route_handlers=[generate_plan, get_plan, create_report, list_reports])
