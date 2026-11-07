"""Disasters, relief locations, and official announcements."""

import json
from typing import Annotated, Literal
from uuid import uuid4

import msgspec
from litestar import Request, Router, get, patch, post
from litestar.params import FromPath, FromQuery, JSONBody

from haven.api_common import current_user, error, require_disaster, require_operator
from haven.auth import now, timestamp
from haven.allocation import recompute_disasters, set_shelter_allocation_budget
from haven.db import connect

NonNegative = Annotated[int, msgspec.Meta(ge=0)]
Text = Annotated[str, msgspec.Meta(min_length=1, max_length=10000)]
Availability = Literal["available", "limited", "unavailable", "unknown"]
ShelterStatus = Literal["open", "closed", "full"]


class Location(msgspec.Struct, forbid_unknown_fields=True):
    latitude: Annotated[float, msgspec.Meta(ge=-90, le=90)]
    longitude: Annotated[float, msgspec.Meta(ge=-180, le=180)]


class LocationPatch(msgspec.Struct, forbid_unknown_fields=True):
    latitude: Annotated[float, msgspec.Meta(ge=-90, le=90)] | msgspec.UnsetType = msgspec.UNSET
    longitude: Annotated[float, msgspec.Meta(ge=-180, le=180)] | msgspec.UnsetType = msgspec.UNSET


class Capacity(msgspec.Struct, forbid_unknown_fields=True):
    total_people: NonNegative
    available_people: NonNegative


class CapacityPatch(msgspec.Struct, forbid_unknown_fields=True):
    total_people: NonNegative | msgspec.UnsetType = msgspec.UNSET
    available_people: NonNegative | msgspec.UnsetType = msgspec.UNSET


class Capabilities(msgspec.Struct, forbid_unknown_fields=True):
    pets_allowed: bool = False
    child_friendly: bool = False
    wheelchair_accessible: bool = False
    medical_staff: list[Text] = msgspec.field(default_factory=list)
    special_care_notes: Text | None = None


class CapabilitiesPatch(msgspec.Struct, forbid_unknown_fields=True):
    pets_allowed: bool | msgspec.UnsetType = msgspec.UNSET
    child_friendly: bool | msgspec.UnsetType = msgspec.UNSET
    wheelchair_accessible: bool | msgspec.UnsetType = msgspec.UNSET
    medical_staff: list[Text] | msgspec.UnsetType = msgspec.UNSET
    special_care_notes: Text | None | msgspec.UnsetType = msgspec.UNSET


class Resources(msgspec.Struct, forbid_unknown_fields=True):
    food: Availability = "unknown"
    water: Availability = "unknown"
    medication: Availability = "unknown"
    clothes: Availability = "unknown"


class ResourcesPatch(msgspec.Struct, forbid_unknown_fields=True):
    food: Availability | msgspec.UnsetType = msgspec.UNSET
    water: Availability | msgspec.UnsetType = msgspec.UNSET
    medication: Availability | msgspec.UnsetType = msgspec.UNSET
    clothes: Availability | msgspec.UnsetType = msgspec.UNSET


class ShelterCreate(msgspec.Struct, forbid_unknown_fields=True):
    disaster_id: Text
    name: Text
    address: Text
    location: Location
    status: ShelterStatus
    capacity: Capacity
    capabilities: Capabilities
    resources: Resources


class ShelterPatch(msgspec.Struct, forbid_unknown_fields=True):
    disaster_id: Text | msgspec.UnsetType = msgspec.UNSET
    name: Text | msgspec.UnsetType = msgspec.UNSET
    address: Text | msgspec.UnsetType = msgspec.UNSET
    location: LocationPatch | msgspec.UnsetType = msgspec.UNSET
    status: ShelterStatus | msgspec.UnsetType = msgspec.UNSET
    capacity: CapacityPatch | msgspec.UnsetType = msgspec.UNSET
    capabilities: CapabilitiesPatch | msgspec.UnsetType = msgspec.UNSET
    resources: ResourcesPatch | msgspec.UnsetType = msgspec.UNSET


class UpdateCreate(msgspec.Struct, forbid_unknown_fields=True):
    title: Text
    message: Text
    severity: Literal["info", "warning", "critical"]


def shelter_from_row(row: tuple) -> dict:
    return {
        "id": row[0], "disaster_id": row[1], "name": row[2], "address": row[3],
        "location": {"latitude": row[4], "longitude": row[5]}, "status": row[6],
        "capacity": json.loads(row[7]), "capabilities": json.loads(row[8]),
        "resources": json.loads(row[9]), "updated_at": row[10],
    }


def validate_shelter(shelter: dict, *, allow_derived_capacity_overflow: bool = False) -> None:
    capacity = shelter["capacity"]
    if not allow_derived_capacity_overflow and capacity["available_people"] > capacity["total_people"]:
        error(400, "invalid_request", "Available capacity cannot exceed total capacity.")
    if not shelter["name"].strip() or not shelter["address"].strip():
        error(400, "invalid_request", "Shelter name and address must not be blank.")


def update_from_row(row: tuple) -> dict:
    return dict(zip(("id", "disaster_id", "title", "message", "severity", "published_at"), row))


@get("/disasters", tags=["Disasters"])
async def list_disasters() -> dict:
    async with connect() as connection:
        rows = await (await connection.execute("SELECT * FROM disasters WHERE status = 'active' ORDER BY updated_at DESC, id")).fetchall()
    fields = ("id", "type", "name", "status", "affected_area", "updated_at")
    return {"disasters": [dict(zip(fields, row)) for row in rows]}


@get("/shelters", tags=["Shelters"])
async def list_shelters(disaster_id: FromQuery[str]) -> dict:
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        rows = await (await connection.execute("SELECT * FROM shelters WHERE disaster_id = ? ORDER BY name, id", (disaster_id,))).fetchall()
    return {"shelters": [shelter_from_row(row) for row in rows]}


@post("/shelters", tags=["Shelters"])
async def create_shelter(data: JSONBody[ShelterCreate], request: Request) -> dict:
    shelter = msgspec.to_builtins(data)
    async with connect() as connection:
        require_operator(await current_user(request, connection))
        await connection.execute("BEGIN IMMEDIATE")
        try:
            await require_disaster(connection, data.disaster_id)
            validate_shelter(shelter)
            shelter.update(id="shelter_" + uuid4().hex, updated_at=timestamp(now()))
            await connection.execute(
                "INSERT INTO shelters VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (shelter["id"], data.disaster_id, data.name, data.address, data.location.latitude,
                 data.location.longitude, data.status, json.dumps(shelter["capacity"]),
                 json.dumps(shelter["capabilities"]), json.dumps(shelter["resources"]), shelter["updated_at"]),
            )
            await recompute_disasters(connection, (data.disaster_id,))
            row = await (await connection.execute("SELECT * FROM shelters WHERE id = ?", (shelter["id"],))).fetchone()
            shelter = shelter_from_row(row)
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return shelter


@patch("/shelters/{shelter_id:str}", tags=["Shelters"])
async def update_shelter(shelter_id: FromPath[str], data: JSONBody[ShelterPatch], request: Request) -> dict:
    async with connect() as connection:
        require_operator(await current_user(request, connection))
        await connection.execute("BEGIN IMMEDIATE")
        try:
            row = await (await connection.execute("SELECT * FROM shelters WHERE id = ?", (shelter_id,))).fetchone()
            if row is None:
                error(404, "shelter_not_found", "Shelter not found.")
            shelter = shelter_from_row(row)
            original = {
                "disaster_id": shelter["disaster_id"], "name": shelter["name"], "address": shelter["address"],
                "location": shelter["location"].copy(), "status": shelter["status"],
                "capacity": shelter["capacity"].copy(), "capabilities": shelter["capabilities"].copy(),
                "resources": shelter["resources"].copy(),
            }
            for key, value in msgspec.to_builtins(data).items():
                if isinstance(value, dict):
                    shelter[key].update(value)
                else:
                    shelter[key] = value
            capacity_patch = data.capacity
            has_capacity_patch = capacity_patch is not msgspec.UNSET
            requested_available = (
                capacity_patch.available_people if has_capacity_patch else msgspec.UNSET
            )
            has_requested_available = requested_available is not msgspec.UNSET
            has_requested_total = (
                has_capacity_patch and capacity_patch.total_people is not msgspec.UNSET
            )
            lowering_total_only = (
                has_requested_total
                and not has_requested_available
                and shelter["capacity"]["available_people"] > shelter["capacity"]["total_people"]
            )
            await require_disaster(connection, shelter["disaster_id"])
            validate_shelter(shelter, allow_derived_capacity_overflow=lowering_total_only)
            current = {key: shelter[key] for key in original}
            if current != original:
                old_disaster_id = original["disaster_id"]
                shelter["updated_at"] = timestamp(now())
                await connection.execute(
                    "UPDATE shelters SET disaster_id = ?, name = ?, address = ?, latitude = ?, longitude = ?, "
                    "status = ?, capacity_json = ?, capabilities_json = ?, resources_json = ?, updated_at = ? WHERE id = ?",
                    (shelter["disaster_id"], shelter["name"], shelter["address"], shelter["location"]["latitude"],
                     shelter["location"]["longitude"], shelter["status"], json.dumps(shelter["capacity"]),
                     json.dumps(shelter["capabilities"]), json.dumps(shelter["resources"]), shelter["updated_at"], shelter_id),
                )
                if has_requested_available:
                    await set_shelter_allocation_budget(connection, shelter_id, requested_available)
                await recompute_disasters(connection, sorted({old_disaster_id, shelter["disaster_id"]}))
                updated_row = await (await connection.execute("SELECT * FROM shelters WHERE id = ?", (shelter_id,))).fetchone()
                shelter = shelter_from_row(updated_row)
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return shelter


@get("/disasters/{disaster_id:str}/updates", tags=["Updates"])
async def list_updates(disaster_id: FromPath[str]) -> dict:
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        rows = await (await connection.execute(
            "SELECT * FROM disaster_updates WHERE disaster_id = ? ORDER BY published_at DESC, id", (disaster_id,),
        )).fetchall()
    return {"updates": [update_from_row(row) for row in rows]}


@post("/disasters/{disaster_id:str}/updates", tags=["Updates"])
async def publish_update(disaster_id: FromPath[str], data: JSONBody[UpdateCreate], request: Request) -> dict:
    async with connect() as connection:
        require_operator(await current_user(request, connection))
        await require_disaster(connection, disaster_id)
        if not data.title.strip() or not data.message.strip():
            error(400, "invalid_request", "Update title and message must not be blank.")
        result = {"id": "update_" + uuid4().hex, "disaster_id": disaster_id, **msgspec.to_builtins(data), "published_at": timestamp(now())}
        await connection.execute("INSERT INTO disaster_updates VALUES (?, ?, ?, ?, ?, ?)", tuple(result.values()))
    return result


router = Router(path="/", route_handlers=[list_disasters, list_shelters, create_shelter, update_shelter, list_updates, publish_update])
