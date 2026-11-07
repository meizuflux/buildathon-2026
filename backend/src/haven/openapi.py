"""Shared API response types and Litestar OpenAPI metadata."""

from typing import Literal, NotRequired, TypedDict

from litestar.openapi import ResponseSpec


class ErrorDetail(TypedDict):
    code: str
    message: str


class ErrorResponse(TypedDict):
    error: ErrorDetail


class User(TypedDict):
    id: str
    role: Literal["family", "operator"]
    family_id: str | None


class Registration(TypedDict):
    user_id: str
    role: Literal["family"]


class Session(TypedDict):
    access_token: str
    token_type: Literal["Bearer"]
    expires_at: str
    user: User


class LocationResponse(TypedDict):
    latitude: float
    longitude: float


class FamilyNeeds(TypedDict):
    pets: bool
    immediate_medication: bool
    medical_notes: str | None
    accessibility_notes: str | None
    other_special_care: str | None


class FamilyResourcesResponse(TypedDict):
    has_car: bool


class Family(TypedDict):
    id: str
    disaster_id: str
    adults: int
    children: int
    location: LocationResponse
    needs: FamilyNeeds
    resources: FamilyResourcesResponse
    created_at: str
    updated_at: str


class FamilyPage(TypedDict):
    families: list[Family]
    total: int
    limit: int
    offset: int


class Disaster(TypedDict):
    id: str
    type: str
    name: str
    status: str
    affected_area: str
    updated_at: str


class DisasterList(TypedDict):
    disasters: list[Disaster]


class ShelterCapacity(TypedDict):
    total_people: int
    available_people: int


class PlanCapacity(TypedDict):
    total_people: int


class ShelterCapabilities(TypedDict):
    pets_allowed: bool
    child_friendly: bool
    wheelchair_accessible: bool
    medical_staff: list[str]
    special_care_notes: str | None


class ShelterResources(TypedDict):
    food: Literal["available", "limited", "unavailable", "unknown"]
    water: Literal["available", "limited", "unavailable", "unknown"]
    medication: Literal["available", "limited", "unavailable", "unknown"]
    clothes: Literal["available", "limited", "unavailable", "unknown"]


class Shelter(TypedDict):
    id: str
    disaster_id: str
    name: str
    address: str
    location: LocationResponse
    status: Literal["open", "closed", "full"]
    capacity: ShelterCapacity
    capabilities: ShelterCapabilities
    resources: ShelterResources
    updated_at: str


class ShelterList(TypedDict):
    shelters: list[Shelter]


class PlanShelter(TypedDict):
    id: str
    name: str
    address: str
    location: LocationResponse
    status: Literal["open", "closed", "full"]
    capacity: PlanCapacity
    capabilities: ShelterCapabilities
    resources: ShelterResources


class PlanAlert(TypedDict):
    code: str
    severity: Literal["warning", "critical"]
    message: str
    shelter_id: NotRequired[str]
    shelter_name: NotRequired[str]
    assigned_people: NotRequired[int]
    total_people: NotRequired[int]
    people_over_capacity: NotRequired[int]
    people_over_allocation_budget: NotRequired[int]
    unmet_requirements: NotRequired[list[str]]


class Alert(TypedDict):
    id: str
    disaster_id: str
    code: str
    severity: Literal["info", "warning", "critical"]
    message: str
    shelter_id: str | None
    family_id: str | None
    updated_at: str
    details: dict[str, str | int | list[str]]


class AlertPage(TypedDict):
    alerts: list[Alert]
    total: int
    limit: int
    offset: int


class Plan(TypedDict):
    family_id: str
    disaster_id: str
    status: Literal["recommended", "no_match"]
    shelter: PlanShelter | None
    reason: str
    instructions: list[str]
    alerts: list[PlanAlert]
    capacity_reserved: bool
    version: int
    updated_at: str


class PlanPage(TypedDict):
    plans: list[Plan]
    total: int
    limit: int
    offset: int


class Update(TypedDict):
    id: str
    disaster_id: str
    title: str
    message: str
    severity: Literal["info", "warning", "critical"]
    published_at: str
    target: NotRequired[dict[str, str]]


class UpdateList(TypedDict):
    updates: list[Update]


class Report(TypedDict):
    id: str
    family_id: str
    type: Literal["need_help", "status_update", "resource_request", "other"]
    message: str
    location: LocationResponse | None
    client_request_id: str
    status: str
    created_at: str


class ReportList(TypedDict):
    reports: list[Report]


BEARER = [{"BearerAuth": []}]


def errors(*statuses: int) -> dict[int, ResponseSpec]:
    descriptions = {
        400: "Invalid request",
        401: "Authentication required or invalid credentials",
        403: "Not authorized for this resource",
        404: "Resource not found",
        409: "Conflict",
        429: "Too many login attempts",
        500: "Internal server error",
    }
    return {
        status: ResponseSpec(data_container=ErrorResponse, description=descriptions[status])
        for status in statuses
    }
