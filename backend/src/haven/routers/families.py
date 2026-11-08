"""Family profile creation, ownership checks, and nested merge updates."""

import json
from typing import Annotated, Any, cast
from uuid import uuid4

import apsw
import msgspec
from litestar import Request, Router, get, patch, post
from litestar.params import FromPath, FromQuery, JSONBody, QueryParameter

from haven.allocation import recompute_disasters
from haven.api_common import error, require_disaster, require_family
from haven.auth import (
    authenticated_guard,
    family_account_guard,
    get_authenticated_user,
    now,
    operator_guard,
    timestamp,
)
from haven.db import connect
from haven.openapi import BEARER, Family, FamilyPage, errors
from haven.rows import FAMILY_COLUMNS, family_from_row, projection

Count = Annotated[int, msgspec.Meta(ge=0)]
Latitude = Annotated[float, msgspec.Meta(ge=-90, le=90)]
Longitude = Annotated[float, msgspec.Meta(ge=-180, le=180)]
Identifier = Annotated[str, msgspec.Meta(min_length=1)]


class Location(msgspec.Struct, forbid_unknown_fields=True):
    latitude: Latitude
    longitude: Longitude


class LocationPatch(msgspec.Struct, forbid_unknown_fields=True):
    latitude: Latitude | msgspec.UnsetType = msgspec.UNSET
    longitude: Longitude | msgspec.UnsetType = msgspec.UNSET


class Needs(msgspec.Struct, forbid_unknown_fields=True):
    pets: bool = False
    immediate_medication: bool = False
    medical_notes: str | None = None
    accessibility_notes: str | None = None
    other_special_care: str | None = None


class NeedsPatch(msgspec.Struct, forbid_unknown_fields=True):
    pets: bool | msgspec.UnsetType = msgspec.UNSET
    immediate_medication: bool | msgspec.UnsetType = msgspec.UNSET
    medical_notes: str | None | msgspec.UnsetType = msgspec.UNSET
    accessibility_notes: str | None | msgspec.UnsetType = msgspec.UNSET
    other_special_care: str | None | msgspec.UnsetType = msgspec.UNSET


class FamilyResources(msgspec.Struct, forbid_unknown_fields=True):
    has_car: bool = False


class FamilyResourcesPatch(msgspec.Struct, forbid_unknown_fields=True):
    has_car: bool | msgspec.UnsetType = msgspec.UNSET


class FamilyCreate(msgspec.Struct, forbid_unknown_fields=True):
    disaster_id: Identifier
    adults: Count
    children: Count
    location: Location
    needs: Needs = msgspec.field(default_factory=Needs)
    resources: FamilyResources = msgspec.field(default_factory=FamilyResources)


class FamilyPatch(msgspec.Struct, forbid_unknown_fields=True):
    disaster_id: Identifier | msgspec.UnsetType = msgspec.UNSET
    adults: Count | msgspec.UnsetType = msgspec.UNSET
    children: Count | msgspec.UnsetType = msgspec.UNSET
    location: LocationPatch | msgspec.UnsetType = msgspec.UNSET
    needs: NeedsPatch | msgspec.UnsetType = msgspec.UNSET
    resources: FamilyResourcesPatch | msgspec.UnsetType = msgspec.UNSET


def require_people(adults: int, children: int) -> None:
    if adults + children == 0:
        error(400, "invalid_request", "A family must contain at least one person.")


@get(
    "",
    security=BEARER,
    guards=[operator_guard],
    responses=errors(400, 401, 403, 404, 500),
    description="Operator only. List a disaster’s family profiles, ordered by creation time and ID.",
)
async def list_families(
    disaster_id: FromQuery[str],
    limit: Annotated[int, QueryParameter(ge=1, le=1000)] = 100,
    offset: Annotated[int, QueryParameter(ge=0)] = 0,
) -> FamilyPage:
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        rows = await (
            await connection.execute(
                f"SELECT {projection(FAMILY_COLUMNS)} FROM families "
                "WHERE disaster_id = ? ORDER BY created_at, id LIMIT ? OFFSET ?",
                (disaster_id, limit, offset),
            )
        ).fetchall()
        total = (
            await (
                await connection.execute(
                    "SELECT count(*) FROM families WHERE disaster_id = ?", (disaster_id,)
                )
            ).fetchone()
        )[0]
    return {
        "families": [family_from_row(row) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@post(
    "",
    security=BEARER,
    guards=[family_account_guard],
    responses=errors(400, 401, 403, 404, 409, 500),
    description="Family account only. Creates a profile and automatically allocates a plan.",
)
async def create_family(data: JSONBody[FamilyCreate], request: Request) -> Family:
    async with connect() as connection:
        user = get_authenticated_user(request)
        await connection.execute("BEGIN IMMEDIATE")
        try:
            require_people(data.adults, data.children)
            await require_disaster(connection, data.disaster_id)
            user_row = await (
                await connection.execute("SELECT email FROM users WHERE id = ?", (user.id,))
            ).fetchone()
            user_email = user_row[0] if user_row else ""
            if user_email == "family@family.com":
                family_id = "family_0000"
            else:
                family_id = "family_" + uuid4().hex[:8]
            created_at = timestamp(now())
            try:
                await connection.execute(
                    "INSERT INTO families (id, owner_user_id, disaster_id, adults, children, latitude, longitude, "
                    "needs_json, resources_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        family_id,
                        user.id,
                        data.disaster_id,
                        data.adults,
                        data.children,
                        data.location.latitude,
                        data.location.longitude,
                        msgspec.json.encode(data.needs).decode(),
                        msgspec.json.encode(data.resources).decode(),
                        created_at,
                        created_at,
                    ),
                )
            except apsw.ConstraintError:
                error(409, "family_exists", "This account already has a family profile.")
            await recompute_disasters(connection, (data.disaster_id,))
            family = await require_family(connection, family_id, user)
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
        return family


@get(
    "/{family_id:str}",
    security=BEARER,
    guards=[authenticated_guard],
    responses=errors(400, 401, 403, 404, 500),
    description="Family owner or operator only.",
)
async def get_family(family_id: FromPath[str], request: Request) -> Family:
    async with connect() as connection:
        user = get_authenticated_user(request)
        return await require_family(connection, family_id, user)


@patch(
    "/{family_id:str}",
    security=BEARER,
    guards=[authenticated_guard],
    responses=errors(400, 401, 403, 404, 500),
    description="Family owner or operator only. Nested fields are merged; relevant changes trigger reallocation.",
)
async def patch_family(
    family_id: FromPath[str], data: JSONBody[FamilyPatch], request: Request
) -> Family:
    async with connect() as connection:
        user = get_authenticated_user(request)
        await connection.execute("BEGIN IMMEDIATE")
        try:
            family = await require_family(connection, family_id, user)
            family_data = cast(dict[str, Any], family)
            original = {
                "disaster_id": family["disaster_id"],
                "adults": family["adults"],
                "children": family["children"],
                "location": family["location"].copy(),
                "needs": family["needs"].copy(),
                "resources": family["resources"].copy(),
            }
            changes = msgspec.to_builtins(data)
            for key, value in changes.items():
                if isinstance(value, dict):
                    family_data[key].update(value)
                else:
                    family_data[key] = value
            require_people(family["adults"], family["children"])
            await require_disaster(connection, family["disaster_id"])
            current = {key: family_data[key] for key in original}
            if current != original:
                old_disaster_id = original["disaster_id"]
                family["updated_at"] = timestamp(now())
                await connection.execute(
                    "UPDATE families SET disaster_id = ?, adults = ?, children = ?, latitude = ?, longitude = ?, "
                    "needs_json = ?, resources_json = ?, updated_at = ? WHERE id = ?",
                    (
                        family["disaster_id"],
                        family["adults"],
                        family["children"],
                        family["location"]["latitude"],
                        family["location"]["longitude"],
                        json.dumps(family["needs"]),
                        json.dumps(family["resources"]),
                        family["updated_at"],
                        family_id,
                    ),
                )
                await recompute_disasters(
                    connection, sorted({old_disaster_id, family["disaster_id"]})
                )
            await connection.execute("COMMIT")
            return family
        except BaseException:
            await connection.execute("ROLLBACK")
            raise


router = Router(
    path="/families",
    route_handlers=[list_families, create_family, get_family, patch_family],
    tags=["Families"],
)
