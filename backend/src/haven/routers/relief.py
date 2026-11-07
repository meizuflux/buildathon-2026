"""Disasters, relief locations, and official announcements."""

import json
from collections.abc import Mapping
from typing import Annotated, Any, Literal, TypedDict, cast
from uuid import uuid4

import msgspec
from litestar import Request, Router, get, patch, post
from litestar.params import FromPath, FromQuery, JSONBody

from haven.activity import record_activity
from haven.allocation import recompute_disasters, set_shelter_allocation_budget
from haven.api_common import error, require_disaster
from haven.auth import AuthenticatedUser, get_authenticated_user, now, operator_guard, timestamp
from haven.db import connect
from haven.openapi import (
    BEARER,
    DisasterList,
    Shelter,
    ShelterList,
    Update,
    UpdateList,
    errors,
)
from haven.rows import (
    DISASTER_COLUMNS,
    SHELTER_COLUMNS,
    UPDATE_COLUMNS,
    disaster_from_row,
    projection,
    shelter_from_row,
    update_from_row,
)

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


class UpdateTarget(msgspec.Struct, forbid_unknown_fields=True):
    type: Literal["all", "shelter"]
    shelter_id: Text | None = None


class UpdateCreate(msgspec.Struct, forbid_unknown_fields=True):
    title: Text
    message: Text
    severity: Literal["info", "warning", "critical"]
    target: UpdateTarget | None = None


class UpdatePreview(msgspec.Struct, forbid_unknown_fields=True):
    target: UpdateTarget


class RecipientCount(TypedDict):
    recipient_count: int


def validate_shelter(
    shelter: Mapping[str, Any], *, allow_derived_capacity_overflow: bool = False
) -> None:
    capacity = shelter["capacity"]
    if (
        not allow_derived_capacity_overflow
        and capacity["available_people"] > capacity["total_people"]
    ):
        error(400, "invalid_request", "Available capacity cannot exceed total capacity.")
    if not shelter["name"].strip() or not shelter["address"].strip():
        error(400, "invalid_request", "Shelter name and address must not be blank.")


@get("/disasters", tags=["Disasters"], responses=errors(500), description="List active disasters.")
async def list_disasters() -> DisasterList:
    async with connect() as connection:
        rows = await (
            await connection.execute(
                f"SELECT {projection(DISASTER_COLUMNS)} FROM disasters "
                "WHERE status = 'active' ORDER BY updated_at DESC, id"
            )
        ).fetchall()
    return {"disasters": [disaster_from_row(row) for row in rows]}


@get(
    "/shelters",
    tags=["Shelters"],
    responses=errors(400, 404, 500),
    description="Public listing with available capacity, capabilities and resource availability labels; labels are not quantities.",
)
async def list_shelters(disaster_id: FromQuery[str]) -> ShelterList:
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        rows = await (
            await connection.execute(
                f"SELECT {projection(SHELTER_COLUMNS)} FROM shelters "
                "WHERE disaster_id = ? ORDER BY name, id",
                (disaster_id,),
            )
        ).fetchall()
    return {"shelters": [shelter_from_row(row) for row in rows]}


@post(
    "/disasters/{disaster_id:str}/updates/preview",
    tags=["Updates"],
    security=BEARER,
    guards=[operator_guard],
    status_code=200,
    responses=errors(400, 401, 403, 404, 500),
    description="Count family profiles currently matching an update target.",
)
async def preview_update(
    disaster_id: FromPath[str], data: JSONBody[UpdatePreview]
) -> RecipientCount:
    target = data.target
    if (target.type == "all" and target.shelter_id is not None) or (
        target.type == "shelter" and target.shelter_id is None
    ):
        error(400, "invalid_request", "Target fields do not match target type.")
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        if target.type == "shelter":
            shelter = await (
                await connection.execute(
                    "SELECT 1 FROM shelters WHERE id = ? AND disaster_id = ?",
                    (target.shelter_id, disaster_id),
                )
            ).fetchone()
            if shelter is None:
                error(404, "shelter_not_found", "Shelter not found in this disaster.")
            row = await (
                await connection.execute(
                    "SELECT COUNT(*) FROM families f JOIN current_assignments a ON a.family_id = f.id "
                    "WHERE f.disaster_id = ? AND a.shelter_id = ?",
                    (disaster_id, target.shelter_id),
                )
            ).fetchone()
        else:
            row = await (
                await connection.execute(
                    "SELECT COUNT(*) FROM families WHERE disaster_id = ?", (disaster_id,)
                )
            ).fetchone()
    return {"recipient_count": row[0]}


@post(
    "/shelters",
    tags=["Shelters"],
    security=BEARER,
    guards=[operator_guard],
    responses=errors(400, 401, 403, 404, 500),
    description="Operator only. Creating a shelter triggers reallocation.",
)
async def create_shelter(data: JSONBody[ShelterCreate], request: Request) -> Shelter:
    shelter = msgspec.to_builtins(data)
    async with connect() as connection:
        await connection.execute("BEGIN IMMEDIATE")
        try:
            await require_disaster(connection, data.disaster_id)
            validate_shelter(shelter)
            shelter.update(id="shelter_" + uuid4().hex, updated_at=timestamp(now()))
            await connection.execute(
                "INSERT INTO shelters (id, disaster_id, name, address, latitude, longitude, status, "
                "capacity_json, capabilities_json, resources_json, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    shelter["id"],
                    data.disaster_id,
                    data.name,
                    data.address,
                    data.location.latitude,
                    data.location.longitude,
                    data.status,
                    json.dumps(shelter["capacity"]),
                    json.dumps(shelter["capabilities"]),
                    json.dumps(shelter["resources"]),
                    shelter["updated_at"],
                ),
            )
            await recompute_disasters(connection, (data.disaster_id,))
            await record_activity(
                connection,
                disaster_id=data.disaster_id,
                event_type="shelter_created",
                summary=f"Shelter {data.name} created",
                ref_kind="shelter",
                ref_id=shelter["id"],
                user=get_authenticated_user(request),
            )
            row = await (
                await connection.execute(
                    f"SELECT {projection(SHELTER_COLUMNS)} FROM shelters WHERE id = ?",
                    (shelter["id"],),
                )
            ).fetchone()
            shelter = shelter_from_row(row)
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return shelter


@patch(
    "/shelters/{shelter_id:str}",
    tags=["Shelters"],
    security=BEARER,
    guards=[operator_guard],
    responses=errors(400, 401, 403, 404, 500),
    description="Operator only. Nested fields merge and relevant changes trigger reallocation.",
)
async def update_shelter(
    shelter_id: FromPath[str], data: JSONBody[ShelterPatch], request: Request
) -> Shelter:
    async with connect() as connection:
        await connection.execute("BEGIN IMMEDIATE")
        try:
            row = await (
                await connection.execute(
                    f"SELECT {projection(SHELTER_COLUMNS)} FROM shelters WHERE id = ?",
                    (shelter_id,),
                )
            ).fetchone()
            if row is None:
                error(404, "shelter_not_found", "Shelter not found.")
            shelter = shelter_from_row(row)
            shelter_data = cast(dict[str, Any], shelter)
            original = {
                "disaster_id": shelter["disaster_id"],
                "name": shelter["name"],
                "address": shelter["address"],
                "location": shelter["location"].copy(),
                "status": shelter["status"],
                "capacity": shelter["capacity"].copy(),
                "capabilities": shelter["capabilities"].copy(),
                "resources": shelter["resources"].copy(),
            }
            for key, value in msgspec.to_builtins(data).items():
                if isinstance(value, dict):
                    shelter_data[key].update(value)
                else:
                    shelter_data[key] = value
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
            current = {key: shelter_data[key] for key in original}
            if current != original:
                old_disaster_id = original["disaster_id"]
                shelter["updated_at"] = timestamp(now())
                await connection.execute(
                    "UPDATE shelters SET disaster_id = ?, name = ?, address = ?, latitude = ?, longitude = ?, "
                    "status = ?, capacity_json = ?, capabilities_json = ?, resources_json = ?, updated_at = ? WHERE id = ?",
                    (
                        shelter["disaster_id"],
                        shelter["name"],
                        shelter["address"],
                        shelter["location"]["latitude"],
                        shelter["location"]["longitude"],
                        shelter["status"],
                        json.dumps(shelter["capacity"]),
                        json.dumps(shelter["capabilities"]),
                        json.dumps(shelter["resources"]),
                        shelter["updated_at"],
                        shelter_id,
                    ),
                )
                if (
                    has_requested_available
                    and requested_available != original["capacity"]["available_people"]
                ):
                    await set_shelter_allocation_budget(connection, shelter_id, requested_available)
                await recompute_disasters(
                    connection, sorted({old_disaster_id, shelter["disaster_id"]})
                )
                await record_activity(
                    connection,
                    disaster_id=shelter["disaster_id"],
                    event_type="shelter_updated",
                    summary=f"Shelter {shelter['name']} updated",
                    ref_kind="shelter",
                    ref_id=shelter_id,
                    user=get_authenticated_user(request),
                )
                updated_row = await (
                    await connection.execute(
                        f"SELECT {projection(SHELTER_COLUMNS)} FROM shelters WHERE id = ?",
                        (shelter_id,),
                    )
                ).fetchone()
                shelter = shelter_from_row(updated_row)
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return shelter


@get("/disasters/{disaster_id:str}/updates", tags=["Updates"], responses=errors(400, 401, 404, 500))
async def list_updates(disaster_id: FromPath[str], request: Request) -> UpdateList:
    """Public updates are visible to everyone; targeted updates require a matching family."""
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        user = request.user
        assigned_shelter = None
        if isinstance(user, AuthenticatedUser) and user.role == "family":
            assigned_shelter = await (
                await connection.execute(
                    "SELECT s.id FROM families f "
                    "JOIN current_assignments a ON a.family_id = f.id "
                    "JOIN shelters s ON s.id = a.shelter_id AND s.disaster_id = f.disaster_id "
                    "WHERE f.owner_user_id = ? AND f.disaster_id = ?",
                    (user.id, disaster_id),
                )
            ).fetchone()
        columns = ", ".join("u." + name for name in UPDATE_COLUMNS)
        rows = await (
            await connection.execute(
                f"SELECT {columns}, t.target_json FROM disaster_updates u "
                "LEFT JOIN broadcast_targets t ON t.update_id = u.id "
                "WHERE u.disaster_id = ? ORDER BY u.published_at DESC, u.id",
                (disaster_id,),
            )
        ).fetchall()
    updates = []
    for row in rows:
        target = json.loads(row[-1]) if row[-1] else None
        operator = isinstance(user, AuthenticatedUser) and user.role == "operator"
        matches = target is None or target["type"] == "all"
        if target and assigned_shelter:
            if target["type"] == "shelter":
                matches = assigned_shelter[0] == target["shelter_id"]
        if operator or matches:
            update = update_from_row(row[:-1])
            if operator and target:
                update["target"] = target
            updates.append(update)
    return {"updates": updates}


@post(
    "/disasters/{disaster_id:str}/updates",
    tags=["Updates"],
    security=BEARER,
    guards=[operator_guard],
    responses=errors(400, 401, 403, 404, 500),
    description="Operator only. Publish globally or target families by assigned shelter.",
)
async def publish_update(
    disaster_id: FromPath[str], data: JSONBody[UpdateCreate], request: Request
) -> Update:
    target = msgspec.to_builtins(data.target) if data.target else None
    if target:
        kind = target["type"]
        if (kind == "all" and target["shelter_id"] is not None) or (
            kind == "shelter" and not target["shelter_id"]
        ):
            error(400, "invalid_request", "Target fields do not match target type.")
        target = {key: value for key, value in target.items() if value is not None}
    async with connect() as connection:
        await connection.execute("BEGIN IMMEDIATE")
        try:
            await require_disaster(connection, disaster_id)
            if not data.title.strip() or not data.message.strip():
                error(400, "invalid_request", "Update title and message must not be blank.")
            if target and target["type"] == "shelter":
                shelter = await (
                    await connection.execute(
                        "SELECT 1 FROM shelters WHERE id = ? AND disaster_id = ?",
                        (target["shelter_id"], disaster_id),
                    )
                ).fetchone()
                if shelter is None:
                    error(404, "shelter_not_found", "Shelter not found in this disaster.")
            result = cast(
                Update,
                {
                    "id": "update_" + uuid4().hex,
                    "disaster_id": disaster_id,
                    "title": data.title,
                    "message": data.message,
                    "severity": data.severity,
                    "published_at": timestamp(now()),
                },
            )
            await connection.execute(
                "INSERT INTO disaster_updates (id, disaster_id, title, message, severity, published_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    result["id"],
                    disaster_id,
                    data.title,
                    data.message,
                    data.severity,
                    result["published_at"],
                ),
            )
            if target:
                await connection.execute(
                    "INSERT INTO broadcast_targets (update_id, target_json) VALUES (?, ?)",
                    (result["id"], json.dumps(target)),
                )
                result["target"] = target
            await record_activity(
                connection,
                disaster_id=disaster_id,
                event_type="update_published",
                summary=f"Update {data.title} published",
                ref_kind="update",
                ref_id=result["id"],
                user=get_authenticated_user(request),
            )
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return result


router = Router(
    path="/",
    route_handlers=[
        list_disasters,
        list_shelters,
        create_shelter,
        update_shelter,
        list_updates,
        preview_update,
        publish_update,
    ],
)
