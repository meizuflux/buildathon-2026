"""Supply logistics: API contract part 2 (resource types, organizations, inventory, needs, shipments).

Shares the organizations/inventory tables and the stock engine with citizen donations, so a hub's
stock is the same whether it is moved by a shipment or handed to a citizen. Every endpoint here is
operator-only (403 not_permitted) except GET /resource-types, which any signed-in user may call.

Shipment status changes and their side effects, each in one transaction:

    requested  -> approved     reserve items at the source (409 insufficient_inventory if short)
    requested  -> cancelled    none
    approved   -> in_transit   source quantity -= q, reserved -= q
    approved   -> cancelled    source reserved -= q
    in_transit -> delivered    add to the destination's stock if it is an organization; raise
                               quantity_fulfilled on linked needs of the same resource type
"""

from typing import Annotated, Any, Literal
from uuid import uuid4

import apsw
import msgspec
from litestar import Request, get, patch, post
from litestar.params import FromPath, FromQuery, JSONBody

from haven.api_common import require_disaster
from haven.auth import get_authenticated_user, now, timestamp
from haven.db import connect
from haven.donations.common import (
    Items,
    ResourceTypeId,
    add_stock,
    catalog,
    consume,
    error,
    not_found,
    organization_exists,
    parse_items,
    refresh_capacity,
    release,
    require_role,
    reserve,
    stock,
    validate_items,
    write_transaction,
)
from haven.donations.matching import match_waiting_requests

Text = Annotated[str, msgspec.Meta(min_length=1, max_length=500)]
LongText = Annotated[str, msgspec.Meta(max_length=2000)]
Timestamp = Annotated[str, msgspec.Meta(max_length=40)]
OrgType = Literal["government", "nonprofit", "private", "faith", "medical"]
OrgStatus = Literal["active", "limited", "inactive"]
Service = Literal["distribution", "food", "medical", "transport", "shelter_support", "logistics"]
SiteType = Literal["mosque", "church", "fire_station", "school", "community_center", "other"]
Priority = Literal["low", "medium", "high", "critical"]
Latitude = Annotated[float, msgspec.Meta(ge=-90, le=90)]
Longitude = Annotated[float, msgspec.Meta(ge=-180, le=180)]
Percent = Annotated[int, msgspec.Meta(ge=0, le=100)]
Radius = Annotated[float, msgspec.Meta(ge=0, le=1000)]

TRANSITIONS = {
    "requested": ("approved", "cancelled"),
    "approved": ("in_transit", "cancelled"),
    "in_transit": ("delivered",),
    "delivered": (),
    "cancelled": (),
}


class Location(msgspec.Struct, forbid_unknown_fields=True):
    latitude: Latitude
    longitude: Longitude


class LocationPatch(msgspec.Struct, forbid_unknown_fields=True):
    latitude: Latitude | msgspec.UnsetType = msgspec.UNSET
    longitude: Longitude | msgspec.UnsetType = msgspec.UNSET


class Contact(msgspec.Struct, forbid_unknown_fields=True):
    name: Text | None = None
    phone: Text | None = None
    email: Text | None = None


class ContactPatch(msgspec.Struct, forbid_unknown_fields=True):
    name: Text | None | msgspec.UnsetType = msgspec.UNSET
    phone: Text | None | msgspec.UnsetType = msgspec.UNSET
    email: Text | None | msgspec.UnsetType = msgspec.UNSET


class OrganizationCreate(msgspec.Struct, forbid_unknown_fields=True):
    disaster_id: Text
    name: Text
    type: OrgType
    address: Text
    location: Location
    services: list[Service] = msgspec.field(default_factory=list)
    status: OrgStatus = "active"
    contact: Contact = msgspec.field(default_factory=Contact)
    coverage_radius_km: Radius | None = None
    notes: LongText = ""
    site_type: SiteType | None = None
    capacity_pct: Percent = 0
    storage_units: Annotated[int, msgspec.Meta(gt=0, le=100_000_000)] | None = None


class OrganizationPatch(msgspec.Struct, forbid_unknown_fields=True):
    name: Text | msgspec.UnsetType = msgspec.UNSET
    type: OrgType | msgspec.UnsetType = msgspec.UNSET
    address: Text | msgspec.UnsetType = msgspec.UNSET
    location: LocationPatch | msgspec.UnsetType = msgspec.UNSET
    services: list[Service] | msgspec.UnsetType = msgspec.UNSET
    status: OrgStatus | msgspec.UnsetType = msgspec.UNSET
    contact: ContactPatch | msgspec.UnsetType = msgspec.UNSET
    coverage_radius_km: Radius | None | msgspec.UnsetType = msgspec.UNSET
    notes: LongText | msgspec.UnsetType = msgspec.UNSET
    site_type: SiteType | None | msgspec.UnsetType = msgspec.UNSET
    capacity_pct: Percent | msgspec.UnsetType = msgspec.UNSET
    storage_units: Annotated[int, msgspec.Meta(gt=0, le=100_000_000)] | None | msgspec.UnsetType = (
        msgspec.UNSET
    )


class InventoryItem(msgspec.Struct, forbid_unknown_fields=True):
    resource_type_id: ResourceTypeId
    quantity: Annotated[int, msgspec.Meta(ge=0, le=10_000_000)]


class InventorySet(msgspec.Struct, forbid_unknown_fields=True):
    items: Annotated[list[InventoryItem], msgspec.Meta(min_length=1, max_length=100)]


class SiteRef(msgspec.Struct, forbid_unknown_fields=True):
    kind: Literal["shelter", "organization"]
    id: Text
    name: str | None = None  # ignored on input


class NeedCreate(msgspec.Struct, forbid_unknown_fields=True):
    disaster_id: Text
    requester: SiteRef
    resource_type_id: ResourceTypeId
    quantity_needed: Annotated[int, msgspec.Meta(gt=0, le=10_000_000)]
    priority: Priority
    needed_by: Timestamp | None = None
    notes: LongText = ""


class NeedPatch(msgspec.Struct, forbid_unknown_fields=True):
    quantity_needed: Annotated[int, msgspec.Meta(gt=0, le=10_000_000)] | msgspec.UnsetType = (
        msgspec.UNSET
    )
    quantity_fulfilled: Annotated[int, msgspec.Meta(ge=0, le=10_000_000)] | msgspec.UnsetType = (
        msgspec.UNSET
    )
    priority: Priority | msgspec.UnsetType = msgspec.UNSET
    status: Literal["open", "fulfilled", "cancelled"] | msgspec.UnsetType = msgspec.UNSET
    needed_by: Timestamp | None | msgspec.UnsetType = msgspec.UNSET
    notes: LongText | msgspec.UnsetType = msgspec.UNSET


class ShipmentCreate(msgspec.Struct, forbid_unknown_fields=True):
    disaster_id: Text
    to: SiteRef
    items: Items
    from_: SiteRef = msgspec.field(name="from")
    need_ids: list[Text] = msgspec.field(default_factory=list)
    priority: Priority = "medium"
    eta: Timestamp | None = None
    notes: LongText = ""


class ShipmentPatch(msgspec.Struct, forbid_unknown_fields=True):
    status: (
        Literal["requested", "approved", "in_transit", "delivered", "cancelled"] | msgspec.UnsetType
    ) = msgspec.UNSET
    eta: Timestamp | None | msgspec.UnsetType = msgspec.UNSET
    notes: LongText | msgspec.UnsetType = msgspec.UNSET


def operator(request: Request, connection: apsw.AsyncConnection):
    return require_role(request, connection, "operator", code="not_permitted")


async def site_name(connection: apsw.AsyncConnection, kind: str, site_id: str) -> str | None:
    table = "shelters" if kind == "shelter" else "organizations"
    row = await (
        await connection.execute(f"SELECT name FROM {table} WHERE id = ?", (site_id,))
    ).fetchone()
    return str(row[0]) if row else None


async def named_ref(connection: apsw.AsyncConnection, kind: str, site_id: str) -> dict:
    return {"kind": kind, "id": site_id, "name": await site_name(connection, kind, site_id)}


# Resource types --------------------------------------------------------------------------------


@get("/resource-types")
async def list_resource_types(request: Request) -> dict:
    """The fixed supply catalog (any signed-in user)."""
    get_authenticated_user(request)
    async with connect() as connection:
        entries = await catalog(connection)
    return {
        "resource_types": [
            {
                "id": e["id"],
                "name": e["name"],
                "category": e["category"],
                "unit": e["unit"],
                "citizen_requestable": e["citizen"],
            }
            for e in entries.values()
        ]
    }


# Organizations ---------------------------------------------------------------------------------

_ORG_COLUMNS = (
    "id, disaster_id, name, type, services_json, status, address, latitude, longitude, "
    "contact_json, coverage_radius_km, notes, site_type, capacity_pct, storage_units, updated_at"
)


def organization_from_row(row: tuple) -> dict:
    return {
        "id": row[0],
        "disaster_id": row[1],
        "name": row[2],
        "type": row[3],
        "services": msgspec.json.decode(row[4]),
        "status": row[5],
        "address": row[6],
        "location": {"latitude": row[7], "longitude": row[8]},
        "contact": msgspec.json.decode(row[9]),
        "coverage_radius_km": row[10],
        "notes": row[11],
        "site_type": row[12],
        "capacity_pct": row[13],
        "storage_units": row[14],
        "updated_at": row[15],
    }


async def fetch_organization(connection: apsw.AsyncConnection, organization_id: str) -> dict:
    row = await (
        await connection.execute(
            f"SELECT {_ORG_COLUMNS} FROM organizations WHERE id = ?", (organization_id,)
        )
    ).fetchone()
    if row is None:
        raise not_found("Organization", "organization_not_found")
    return organization_from_row(row)


async def save_organization(connection: apsw.AsyncConnection, org: dict) -> None:
    if not org["name"].strip() or not org["address"].strip():
        raise error(400, "invalid_request", "Organization name and address must not be blank.")
    await connection.execute(
        "INSERT INTO organizations (id, disaster_id, name, type, services_json, status, address, "
        "latitude, longitude, contact_json, coverage_radius_km, notes, site_type, capacity_pct, "
        "storage_units, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, "
        "services_json = excluded.services_json, status = excluded.status, "
        "address = excluded.address, latitude = excluded.latitude, longitude = excluded.longitude, "
        "contact_json = excluded.contact_json, coverage_radius_km = excluded.coverage_radius_km, "
        "notes = excluded.notes, site_type = excluded.site_type, "
        "capacity_pct = excluded.capacity_pct, storage_units = excluded.storage_units, "
        "updated_at = excluded.updated_at",
        (
            org["id"],
            org["disaster_id"],
            org["name"],
            org["type"],
            msgspec.json.encode(sorted(set(org["services"]))).decode(),
            org["status"],
            org["address"],
            org["location"]["latitude"],
            org["location"]["longitude"],
            msgspec.json.encode(org["contact"]).decode(),
            org["coverage_radius_km"],
            org["notes"],
            org["site_type"],
            org["capacity_pct"],
            org["storage_units"],
            org["updated_at"],
        ),
    )
    await refresh_capacity(connection, org["id"])


@get("/organizations")
async def list_organizations(request: Request, disaster_id: FromQuery[str | None] = None) -> dict:
    async with connect() as connection:
        await operator(request, connection)
        where, params = ("WHERE disaster_id = ?", (disaster_id,)) if disaster_id else ("", ())
        rows = await (
            await connection.execute(
                f"SELECT {_ORG_COLUMNS} FROM organizations {where} ORDER BY name", params
            )
        ).fetchall()
    return {"organizations": [organization_from_row(row) for row in rows]}


@post("/organizations")
async def create_organization(data: JSONBody[OrganizationCreate], request: Request) -> dict:
    async with connect() as connection:
        await operator(request, connection)
        await require_disaster(connection, data.disaster_id)
        org = msgspec.to_builtins(data) | {
            "id": "org_" + uuid4().hex,
            "updated_at": timestamp(now()),
        }
        async with connection:
            await save_organization(connection, org)
        return await fetch_organization(connection, org["id"])


@get("/organizations/{organization_id:str}")
async def get_organization(organization_id: FromPath[str], request: Request) -> dict:
    async with connect() as connection:
        await operator(request, connection)
        return await fetch_organization(connection, organization_id)


@patch("/organizations/{organization_id:str}")
async def update_organization(
    organization_id: FromPath[str], data: JSONBody[OrganizationPatch], request: Request
) -> dict:
    """Nested merge: omitted fields, and omitted keys inside location and contact, are kept."""
    async with connect() as connection:
        await operator(request, connection)
        async with write_transaction(connection):
            org = await fetch_organization(connection, organization_id)
            changes = msgspec.to_builtins(data)
            for key in ("location", "contact"):
                if key in changes:
                    org[key] = org[key] | changes.pop(key)
            org |= changes | {"updated_at": timestamp(now())}
            await save_organization(connection, org)
        return await fetch_organization(connection, organization_id)


# Inventory -------------------------------------------------------------------------------------


async def inventory_rows(connection: apsw.AsyncConnection, where: str, params: tuple) -> list[dict]:
    rows = await (
        await connection.execute(
            "SELECT i.organization_id, o.name, i.resource_type_id, i.quantity, i.reserved, "
            "i.target, i.updated_at FROM inventory i "
            "JOIN organizations o ON o.id = i.organization_id "
            f"JOIN resource_types t ON t.id = i.resource_type_id {where} "
            "ORDER BY o.name, t.sort_order",
            params,
        )
    ).fetchall()
    return [
        {
            "holder": {"kind": "organization", "id": r[0], "name": r[1]},
            "resource_type_id": r[2],
            "quantity": r[3],
            "reserved": r[4],
            "target": r[5],
            "updated_at": r[6],
        }
        for r in rows
    ]


@get("/inventory")
async def list_inventory(
    request: Request,
    disaster_id: FromQuery[str | None] = None,
    holder_kind: FromQuery[Literal["organization"] | None] = None,
    holder_id: FromQuery[str | None] = None,
) -> dict:
    clauses, params = [], []
    if disaster_id:
        clauses.append("o.disaster_id = ?")
        params.append(disaster_id)
    if holder_id:
        clauses.append("i.organization_id = ?")
        params.append(holder_id)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    async with connect() as connection:
        await operator(request, connection)
        return {"items": await inventory_rows(connection, where, tuple(params))}


@patch("/organizations/{organization_id:str}/inventory")
async def set_inventory(
    organization_id: FromPath[str], data: JSONBody[InventorySet], request: Request
) -> dict:
    """Set absolute quantities after a stock count; unlisted items stay as they are."""
    async with connect() as connection:
        await operator(request, connection)
        ids = [item.resource_type_id for item in data.items]
        if len(ids) != len(set(ids)):
            raise error(400, "invalid_request", "Each resource type may appear once.")
        known = await catalog(connection)
        for resource_type_id in ids:
            if resource_type_id not in known:
                raise error(400, "invalid_request", f"Unknown resource type: {resource_type_id}.")
        async with write_transaction(connection):
            if not await organization_exists(connection, organization_id):
                raise not_found("Organization", "organization_not_found")
            current = await stock(connection, organization_id)
            for item in data.items:
                held = current.get(item.resource_type_id, (0, 0, 0))[1]
                if item.quantity < held:
                    raise error(
                        409,
                        "inventory_conflict",
                        f"{known[item.resource_type_id]['name']}: {held} are reserved for "
                        f"shipments and citizen requests.",
                    )
            stamp = timestamp(now())
            for item in data.items:
                await connection.execute(
                    "INSERT INTO inventory (organization_id, resource_type_id, quantity, "
                    "updated_at) VALUES (?, ?, ?, ?) "
                    "ON CONFLICT(organization_id, resource_type_id) DO UPDATE SET "
                    "quantity = excluded.quantity, updated_at = excluded.updated_at",
                    (organization_id, item.resource_type_id, item.quantity, stamp),
                )
            await refresh_capacity(connection, organization_id)
            await match_waiting_requests(connection)
        return {
            "items": await inventory_rows(
                connection, "WHERE i.organization_id = ?", (organization_id,)
            )
        }


# Needs -----------------------------------------------------------------------------------------

_NEED_COLUMNS = (
    "id, disaster_id, requester_kind, requester_id, resource_type_id, quantity_needed, "
    "quantity_fulfilled, priority, status, needed_by, notes, created_at, updated_at"
)


async def need_from_row(connection: apsw.AsyncConnection, row: Any) -> dict:
    return {
        "id": row[0],
        "disaster_id": row[1],
        "requester": await named_ref(connection, row[2], row[3]),
        "resource_type_id": row[4],
        "quantity_needed": row[5],
        "quantity_fulfilled": row[6],
        "priority": row[7],
        "status": row[8],
        "needed_by": row[9],
        "notes": row[10],
        "created_at": row[11],
        "updated_at": row[12],
    }


async def fetch_need(connection: apsw.AsyncConnection, need_id: str) -> dict:
    row = await (
        await connection.execute(f"SELECT {_NEED_COLUMNS} FROM needs WHERE id = ?", (need_id,))
    ).fetchone()
    if row is None:
        raise not_found("Need", "need_not_found")
    return await need_from_row(connection, row)


async def require_site(connection: apsw.AsyncConnection, ref: SiteRef, role: str) -> None:
    if await site_name(connection, ref.kind, ref.id) is None:
        raise error(400, "invalid_request", f"The {role} {ref.kind} {ref.id} does not exist.")


@get("/needs")
async def list_needs(
    request: Request,
    disaster_id: FromQuery[str | None] = None,
    status: FromQuery[Literal["open", "fulfilled", "cancelled"] | None] = None,
) -> dict:
    clauses, params = [], []
    if disaster_id:
        clauses.append("disaster_id = ?")
        params.append(disaster_id)
    if status:
        clauses.append("status = ?")
        params.append(status)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    async with connect() as connection:
        await operator(request, connection)
        rows = await (
            await connection.execute(
                f"SELECT {_NEED_COLUMNS} FROM needs {where} ORDER BY created_at", tuple(params)
            )
        ).fetchall()
        return {"needs": [await need_from_row(connection, row) for row in rows]}


@post("/needs")
async def create_need(data: JSONBody[NeedCreate], request: Request) -> dict:
    async with connect() as connection:
        await operator(request, connection)
        await require_disaster(connection, data.disaster_id)
        await require_site(connection, data.requester, "requesting")
        if data.resource_type_id not in await catalog(connection):
            raise error(400, "invalid_request", f"Unknown resource type: {data.resource_type_id}.")
        need_id, stamp = "need_" + uuid4().hex, timestamp(now())
        async with connection:
            await connection.execute(
                f"INSERT INTO needs ({_NEED_COLUMNS}) "
                f"VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'open', ?, ?, ?, ?)",
                (
                    need_id,
                    data.disaster_id,
                    data.requester.kind,
                    data.requester.id,
                    data.resource_type_id,
                    data.quantity_needed,
                    data.priority,
                    data.needed_by,
                    data.notes,
                    stamp,
                    stamp,
                ),
            )
        return await fetch_need(connection, need_id)


@patch("/needs/{need_id:str}")
async def update_need(need_id: FromPath[str], data: JSONBody[NeedPatch], request: Request) -> dict:
    """Merge changes. An open need closes as fulfilled once quantity_fulfilled reaches the target,
    unless the patch sets status itself."""
    async with connect() as connection:
        await operator(request, connection)
        async with write_transaction(connection):
            need = await fetch_need(connection, need_id)
            changes = msgspec.to_builtins(data)
            need |= changes
            if (
                "status" not in changes
                and need["status"] == "open"
                and need["quantity_fulfilled"] >= need["quantity_needed"]
            ):
                need["status"] = "fulfilled"
            await connection.execute(
                "UPDATE needs SET quantity_needed = ?, quantity_fulfilled = ?, priority = ?, "
                "status = ?, needed_by = ?, notes = ?, updated_at = ? WHERE id = ?",
                (
                    need["quantity_needed"],
                    need["quantity_fulfilled"],
                    need["priority"],
                    need["status"],
                    need["needed_by"],
                    need["notes"],
                    timestamp(now()),
                    need_id,
                ),
            )
        return await fetch_need(connection, need_id)


# Shipments -------------------------------------------------------------------------------------

_SHIPMENT_COLUMNS = (
    "id, disaster_id, from_organization_id, to_kind, to_id, items_json, need_ids_json, priority, "
    "status, eta, notes, status_history_json, created_at, updated_at"
)


async def shipment_from_row(connection: apsw.AsyncConnection, row: Any) -> dict:
    return {
        "id": row[0],
        "disaster_id": row[1],
        "from": await named_ref(connection, "organization", row[2]),
        "to": await named_ref(connection, row[3], row[4]),
        "items": parse_items(row[5]),
        "need_ids": msgspec.json.decode(row[6]),
        "priority": row[7],
        "status": row[8],
        "eta": row[9],
        "notes": row[10],
        "status_history": msgspec.json.decode(row[11]),
        "created_at": row[12],
        "updated_at": row[13],
    }


async def fetch_shipment_row(connection: apsw.AsyncConnection, shipment_id: str) -> Any:
    row = await (
        await connection.execute(
            f"SELECT {_SHIPMENT_COLUMNS} FROM shipments WHERE id = ?", (shipment_id,)
        )
    ).fetchone()
    if row is None:
        raise not_found("Shipment", "shipment_not_found")
    return row


@get("/shipments")
async def list_shipments(request: Request, disaster_id: FromQuery[str | None] = None) -> dict:
    where, params = ("WHERE disaster_id = ?", (disaster_id,)) if disaster_id else ("", ())
    async with connect() as connection:
        await operator(request, connection)
        rows = await (
            await connection.execute(
                f"SELECT {_SHIPMENT_COLUMNS} FROM shipments {where} ORDER BY created_at DESC",
                params,
            )
        ).fetchall()
        return {"shipments": [await shipment_from_row(connection, row) for row in rows]}


@post("/shipments")
async def create_shipment(data: JSONBody[ShipmentCreate], request: Request) -> dict:
    """Operator shipments start approved, which reserves the items at the source."""
    if data.from_.kind != "organization":
        raise error(400, "invalid_request", "Shipments must come from an organization.")
    if data.from_.kind == data.to.kind and data.from_.id == data.to.id:
        raise error(400, "invalid_request", "Source and destination must differ.")
    async with connect() as connection:
        await operator(request, connection)
        await require_disaster(connection, data.disaster_id)
        if not await organization_exists(connection, data.from_.id):
            raise error(
                400, "invalid_request", f"The source organization {data.from_.id} does not exist."
            )
        await require_site(connection, data.to, "destination")
        encoded = await validate_items(connection, data.items)
        for need_id in data.need_ids:
            await fetch_need(connection, need_id)
        shipment_id, stamp = "shipment_" + uuid4().hex, timestamp(now())
        async with write_transaction(connection):
            source = await site_name(connection, "organization", data.from_.id)
            await reserve(connection, data.from_.id, parse_items(encoded), holder=str(source))
            await connection.execute(
                f"INSERT INTO shipments ({_SHIPMENT_COLUMNS}) "
                f"VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?)",
                (
                    shipment_id,
                    data.disaster_id,
                    data.from_.id,
                    data.to.kind,
                    data.to.id,
                    encoded,
                    msgspec.json.encode(data.need_ids).decode(),
                    data.priority,
                    data.eta,
                    data.notes,
                    msgspec.json.encode([{"status": "approved", "at": stamp}]).decode(),
                    stamp,
                    stamp,
                ),
            )
        return await shipment_from_row(
            connection, await fetch_shipment_row(connection, shipment_id)
        )


async def credit_needs(
    connection: apsw.AsyncConnection, need_ids: list[str], items: list[dict]
) -> None:
    """Apply delivered quantities to linked needs of the same resource type, in order."""
    for item in items:
        left = item["quantity"]
        for need_id in need_ids:
            row = await (
                await connection.execute(
                    "SELECT quantity_needed, quantity_fulfilled, status FROM needs "
                    "WHERE id = ? AND resource_type_id = ?",
                    (need_id, item["resource_type_id"]),
                )
            ).fetchone()
            if row is None or left <= 0:
                continue
            needed, fulfilled, status = int(row[0]), int(row[1]), str(row[2])  # type: ignore[arg-type]
            add = min(left, max(0, needed - fulfilled))
            left -= add
            fulfilled += add
            if fulfilled >= needed and status == "open":
                status = "fulfilled"
            await connection.execute(
                "UPDATE needs SET quantity_fulfilled = ?, status = ?, updated_at = ? WHERE id = ?",
                (fulfilled, status, timestamp(now()), need_id),
            )


@patch("/shipments/{shipment_id:str}")
async def update_shipment(
    shipment_id: FromPath[str], data: JSONBody[ShipmentPatch], request: Request
) -> dict:
    async with connect() as connection:
        await operator(request, connection)
        async with write_transaction(connection):
            row = await fetch_shipment_row(connection, shipment_id)
            current, source, items = str(row[8]), str(row[2]), parse_items(row[5])
            history = msgspec.json.decode(row[11])
            new = data.status if isinstance(data.status, str) else current
            stamp = timestamp(now())
            if new != current:
                if new not in TRANSITIONS[current]:
                    raise error(
                        409,
                        "invalid_transition",
                        f"Can't move a {current} shipment to {new}.",
                    )
                if new == "approved":
                    name = await site_name(connection, "organization", source)
                    await reserve(connection, source, items, holder=str(name))
                elif new == "in_transit":
                    await consume(connection, source, items)
                elif new == "cancelled" and current == "approved":
                    await release(connection, source, items)
                    await match_waiting_requests(connection)
                elif new == "delivered":
                    if row[3] == "organization":
                        await add_stock(connection, str(row[4]), items)
                        await match_waiting_requests(connection)
                    await credit_needs(connection, msgspec.json.decode(row[6]), items)
                history.append({"status": new, "at": stamp})
            eta = row[9] if isinstance(data.eta, msgspec.UnsetType) else data.eta
            notes = row[10] if isinstance(data.notes, msgspec.UnsetType) else data.notes
            await connection.execute(
                "UPDATE shipments SET status = ?, eta = ?, notes = ?, status_history_json = ?, "
                "updated_at = ? WHERE id = ?",
                (new, eta, notes, msgspec.json.encode(history).decode(), stamp, shipment_id),
            )
        return await shipment_from_row(
            connection, await fetch_shipment_row(connection, shipment_id)
        )


HANDLERS = [
    list_resource_types,
    list_organizations,
    create_organization,
    get_organization,
    update_organization,
    list_inventory,
    set_inventory,
    list_needs,
    create_need,
    update_need,
    list_shipments,
    create_shipment,
    update_shipment,
]
