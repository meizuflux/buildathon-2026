"""Explicit SQLite projections and their API serializers.

Keep each column tuple as the single source for both a SELECT projection and
its row mapper. This lets stored schema order evolve without silently changing
the meaning of tuple offsets.
"""

import json
from collections.abc import Sequence
from typing import Any, cast

from haven.openapi import Disaster, Family, Report, Shelter, Update

FAMILY_COLUMNS = (
    "id",
    "owner_user_id",
    "disaster_id",
    "adults",
    "children",
    "latitude",
    "longitude",
    "needs_json",
    "resources_json",
    "created_at",
    "updated_at",
)
SHELTER_COLUMNS = (
    "id",
    "disaster_id",
    "name",
    "address",
    "latitude",
    "longitude",
    "status",
    "capacity_json",
    "capabilities_json",
    "resources_json",
    "updated_at",
)
DISASTER_COLUMNS = ("id", "type", "name", "status", "affected_area", "updated_at")
UPDATE_COLUMNS = ("id", "disaster_id", "title", "message", "severity", "published_at")
REPORT_COLUMNS = (
    "id",
    "family_id",
    "type",
    "message",
    "latitude",
    "longitude",
    "client_request_id",
    "status",
    "created_at",
)
ALLOCATION_FAMILY_COLUMNS = (
    "id",
    "disaster_id",
    "adults",
    "children",
    "latitude",
    "longitude",
    "needs_json",
    "resources_json",
    "created_at",
)
ALLOCATION_SHELTER_COLUMNS = (
    "id",
    "disaster_id",
    "name",
    "address",
    "latitude",
    "longitude",
    "status",
    "capacity_json",
    "capabilities_json",
    "resources_json",
)


def projection(columns: Sequence[str]) -> str:
    """Return an explicit SQL projection from a canonical column tuple."""
    return ", ".join(columns)


def row_mapping(row: Sequence[Any], columns: Sequence[str]) -> dict[str, Any]:
    """Map a projected SQLite row by its declared column names."""
    return dict(zip(columns, row, strict=True))


def family_from_row(row: Sequence[Any]) -> Family:
    values = row_mapping(row, FAMILY_COLUMNS)
    return {
        "id": values["id"],
        "disaster_id": values["disaster_id"],
        "adults": values["adults"],
        "children": values["children"],
        "location": {"latitude": values["latitude"], "longitude": values["longitude"]},
        "needs": json.loads(values["needs_json"]),
        "resources": json.loads(values["resources_json"]),
        "created_at": values["created_at"],
        "updated_at": values["updated_at"],
    }


def shelter_from_row(row: Sequence[Any]) -> Shelter:
    values = row_mapping(row, SHELTER_COLUMNS)
    return {
        "id": values["id"],
        "disaster_id": values["disaster_id"],
        "name": values["name"],
        "address": values["address"],
        "location": {"latitude": values["latitude"], "longitude": values["longitude"]},
        "status": values["status"],
        "capacity": json.loads(values["capacity_json"]),
        "capabilities": json.loads(values["capabilities_json"]),
        "resources": json.loads(values["resources_json"]),
        "updated_at": values["updated_at"],
    }


def disaster_from_row(row: Sequence[Any]) -> Disaster:
    return cast(Disaster, row_mapping(row, DISASTER_COLUMNS))


def update_from_row(row: Sequence[Any]) -> Update:
    return cast(Update, row_mapping(row, UPDATE_COLUMNS))


def report_from_row(row: Sequence[Any]) -> Report:
    values = row_mapping(row, REPORT_COLUMNS)
    return {
        "id": values["id"],
        "family_id": values["family_id"],
        "type": values["type"],
        "message": values["message"],
        "location": (
            {"latitude": values["latitude"], "longitude": values["longitude"]}
            if values["latitude"] is not None
            else None
        ),
        "client_request_id": values["client_request_id"],
        "status": values["status"],
        "created_at": values["created_at"],
    }


def allocation_family_from_row(row: Sequence[Any]) -> dict[str, Any]:
    values = row_mapping(row, ALLOCATION_FAMILY_COLUMNS)
    return {
        "id": values["id"],
        "disaster_id": values["disaster_id"],
        "adults": values["adults"],
        "children": values["children"],
        "location": {"latitude": values["latitude"], "longitude": values["longitude"]},
        "needs": json.loads(values["needs_json"]),
        "resources": json.loads(values["resources_json"]),
        "created_at": values["created_at"],
    }


def allocation_shelter_from_row(row: Sequence[Any], allocation_budget: int) -> dict[str, Any]:
    values = row_mapping(row, ALLOCATION_SHELTER_COLUMNS)
    return {
        "id": values["id"],
        "disaster_id": values["disaster_id"],
        "name": values["name"],
        "address": values["address"],
        "location": {"latitude": values["latitude"], "longitude": values["longitude"]},
        "status": values["status"],
        "capacity": json.loads(values["capacity_json"]),
        "capabilities": json.loads(values["capabilities_json"]),
        "resources": json.loads(values["resources_json"]),
        "allocation_budget": allocation_budget,
    }
