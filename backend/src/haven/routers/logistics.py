"""Operator logistics: organizations, stock, needs and dispatch."""

import json
from contextlib import asynccontextmanager
from typing import Any, NoReturn
from uuid import uuid4

import apsw
from litestar import Request, Router, get, patch, post
from litestar.params import FromPath, JSONBody

from haven.activity import record_activity
from haven.api_common import error, require_disaster
from haven.auth import authenticated_guard, get_authenticated_user, now, operator_guard, timestamp
from haven.db import connect
from haven.openapi import BEARER

PRIORITIES = {"low", "medium", "high", "critical"}


def invalid(message: str) -> NoReturn:
    error(400, "invalid_request", message)


def text_value(value: Any, name: str, nullable: bool = False) -> None:
    if value is None and nullable:
        return
    if not isinstance(value, str) or not value.strip():
        invalid(f"{name} must be a non-empty string.")


def quantity(value: Any, name: str, minimum: int = 0) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        invalid(f"{name} must be an integer of at least {minimum}.")


def merge(current: dict, updates: dict) -> dict:
    result = current.copy()
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = merge(result[key], value)
        else:
            result[key] = value
    return result


@asynccontextmanager
async def transaction():
    async with connect() as connection:
        await connection.execute("BEGIN IMMEDIATE")
        try:
            yield connection
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise


async def row(connection: apsw.AsyncConnection, sql: str, args: tuple = ()) -> Any:
    return await (await connection.execute(sql, args)).fetchone()


async def resource(connection: apsw.AsyncConnection, resource_id: Any) -> None:
    text_value(resource_id, "resource_type_id")
    if not await row(connection, "SELECT 1 FROM resource_types WHERE id = ?", (resource_id,)):
        invalid("Unknown resource type.")


async def site(connection: apsw.AsyncConnection, reference: Any, disaster_id: str) -> dict:
    if not isinstance(reference, dict) or reference.get("kind") not in ("organization", "shelter"):
        invalid("Site must identify an organization or shelter.")
    kind, site_id = reference["kind"], reference.get("id")
    text_value(site_id, "site id")
    table = "organizations" if kind == "organization" else "shelters"
    found = await row(
        connection,
        f"SELECT name, disaster_id FROM {table} WHERE id = ?"
        if kind == "shelter"
        else "SELECT json_extract(data, '$.name'), disaster_id FROM organizations WHERE id = ?",
        (site_id,),
    )
    if not found or found[1] != disaster_id:
        invalid("Site must exist in the same disaster.")
    return {"kind": kind, "id": site_id, "name": found[0]}


async def organization(connection: apsw.AsyncConnection, organization_id: str) -> dict:
    found = await row(
        connection, "SELECT data, updated_at FROM organizations WHERE id = ?", (organization_id,)
    )
    if not found:
        error(404, "organization_not_found", "Organization not found.")
    return {"id": organization_id, **json.loads(found[0]), "updated_at": found[1]}


def validate_org(data: dict) -> None:
    for key in ("disaster_id", "name", "address"):
        text_value(data.get(key), key)
    if not isinstance(data.get("type"), str) or data.get("type") not in {
        "government",
        "nonprofit",
        "private",
        "faith",
        "medical",
    }:
        invalid("Invalid organization type.")
    if not isinstance(data.get("status"), str) or data.get("status") not in {
        "active",
        "limited",
        "inactive",
    }:
        invalid("Invalid organization status.")
    services = data.get("services")
    if not isinstance(services, list) or any(
        x not in {"distribution", "food", "medical", "transport", "shelter_support", "logistics"}
        for x in services
    ):
        invalid("Invalid organization services.")
    location = data.get("location")
    if not isinstance(location, dict) or any(
        isinstance(location.get(k), bool)
        or not isinstance(location.get(k), (int, float))
        or not lo <= location[k] <= hi
        for k, lo, hi in (("latitude", -90, 90), ("longitude", -180, 180))
    ):
        invalid("Invalid organization location.")
    if not isinstance(data.get("contact"), dict):
        invalid("contact must be an object.")
    radius = data.get("coverage_radius_km")
    if radius is not None and (
        isinstance(radius, bool) or not isinstance(radius, (int, float)) or radius < 0
    ):
        invalid("Invalid coverage radius.")


@get("/resource-types", guards=[authenticated_guard], security=BEARER)
async def list_resource_types() -> dict:
    async with connect() as connection:
        rows = await (
            await connection.execute(
                "SELECT id, name, category, unit FROM resource_types ORDER BY id"
            )
        ).fetchall()
    return {"resource_types": [dict(zip(("id", "name", "category", "unit"), r)) for r in rows]}


@get("/organizations", guards=[operator_guard], security=BEARER)
async def list_organizations(disaster_id: str) -> dict:
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        rows = await (
            await connection.execute(
                "SELECT id, data, updated_at FROM organizations WHERE disaster_id = ? ORDER BY id",
                (disaster_id,),
            )
        ).fetchall()
    return {"organizations": [{"id": r[0], **json.loads(r[1]), "updated_at": r[2]} for r in rows]}


@get("/organizations/{organization_id:str}", guards=[operator_guard], security=BEARER)
async def get_organization(organization_id: FromPath[str]) -> dict:
    async with connect() as connection:
        return await organization(connection, organization_id)


@post("/organizations", guards=[operator_guard], security=BEARER)
async def create_organization(data: JSONBody[dict[str, Any]], request: Request) -> dict:
    allowed = {
        "disaster_id",
        "name",
        "type",
        "services",
        "status",
        "address",
        "location",
        "contact",
        "coverage_radius_km",
        "notes",
    }
    if set(data) - allowed:
        invalid("Unknown organization field.")
    validate_org(data)
    org_id, at = "org_" + uuid4().hex, timestamp(now())
    async with transaction() as connection:
        await require_disaster(connection, data["disaster_id"])
        await connection.execute(
            "INSERT INTO organizations VALUES (?, ?, ?, ?)",
            (org_id, data["disaster_id"], json.dumps(data), at),
        )
        await record_activity(
            connection,
            disaster_id=data["disaster_id"],
            event_type="org_created",
            summary=f"Organization {data['name']} created",
            ref_kind="organization",
            ref_id=org_id,
            user=get_authenticated_user(request),
        )
    return {"id": org_id, **data, "updated_at": at}


@patch("/organizations/{organization_id:str}", guards=[operator_guard], security=BEARER)
async def update_organization(
    organization_id: FromPath[str], data: JSONBody[dict[str, Any]], request: Request
) -> dict:
    allowed = {
        "name",
        "type",
        "services",
        "status",
        "address",
        "location",
        "contact",
        "coverage_radius_km",
        "notes",
    }
    if set(data) - allowed:
        invalid("Unknown or immutable organization field.")
    async with transaction() as connection:
        existing = await organization(connection, organization_id)
        merged = merge({k: v for k, v in existing.items() if k not in {"id", "updated_at"}}, data)
        validate_org(merged)
        at = timestamp(now())
        await connection.execute(
            "UPDATE organizations SET data = ?, updated_at = ? WHERE id = ?",
            (json.dumps(merged), at, organization_id),
        )
        await record_activity(
            connection,
            disaster_id=merged["disaster_id"],
            event_type="org_updated",
            summary=f"Organization {merged['name']} updated",
            ref_kind="organization",
            ref_id=organization_id,
            user=get_authenticated_user(request),
        )
    return {"id": organization_id, **merged, "updated_at": at}


async def inventory_rows(
    connection: apsw.AsyncConnection, disaster_id: str, organization_id: str | None = None
) -> list[dict]:
    rows = await (
        await connection.execute(
            "SELECT i.organization_id, json_extract(o.data, '$.name'), i.resource_type_id, i.quantity, i.reserved, i.updated_at FROM inventory i JOIN organizations o ON o.id = i.organization_id WHERE o.disaster_id = ? AND (? IS NULL OR i.organization_id = ?) ORDER BY i.organization_id, i.resource_type_id",
            (disaster_id, organization_id, organization_id),
        )
    ).fetchall()
    return [
        {
            "holder": {"kind": "organization", "id": r[0], "name": r[1]},
            "resource_type_id": r[2],
            "quantity": r[3],
            "reserved": r[4],
            "updated_at": r[5],
        }
        for r in rows
    ]


@get("/inventory", guards=[operator_guard], security=BEARER)
async def list_inventory(
    disaster_id: str, holder_kind: str | None = None, holder_id: str | None = None
) -> dict:
    if (holder_kind is None) != (holder_id is None) or (
        holder_kind is not None and holder_kind != "organization"
    ):
        invalid("Provide an organization holder kind and id together.")
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        return {"items": await inventory_rows(connection, disaster_id, holder_id)}


@patch("/organizations/{organization_id:str}/inventory", guards=[operator_guard], security=BEARER)
async def update_inventory(
    organization_id: FromPath[str], data: JSONBody[dict[str, Any]], request: Request
) -> dict:
    items = data.get("items")
    if set(data) != {"items"} or not isinstance(items, list) or not items:
        invalid("items must be a nonempty list.")
    async with transaction() as connection:
        org = await organization(connection, organization_id)
        seen = set()
        for item in items:
            if not isinstance(item, dict) or set(item) != {"resource_type_id", "quantity"}:
                invalid("Invalid inventory item.")
            rid = item["resource_type_id"]
            await resource(connection, rid)
            if rid in seen:
                invalid("Duplicate resource type.")
            seen.add(rid)
            quantity(item["quantity"], "quantity")
            current = await row(
                connection,
                "SELECT reserved FROM inventory WHERE organization_id = ? AND resource_type_id = ?",
                (organization_id, rid),
            )
            if current and item["quantity"] < current[0]:
                error(409, "inventory_conflict", "Quantity is below reserved stock.")
            await connection.execute(
                "INSERT INTO inventory VALUES (?, ?, ?, 0, ?) ON CONFLICT(organization_id, resource_type_id) DO UPDATE SET quantity=excluded.quantity, updated_at=excluded.updated_at",
                (organization_id, rid, item["quantity"], timestamp(now())),
            )
        await record_activity(
            connection,
            disaster_id=org["disaster_id"],
            event_type="inventory_updated",
            summary=f"Inventory for {org['name']} updated",
            ref_kind="organization",
            ref_id=organization_id,
            user=get_authenticated_user(request),
        )
        result = await inventory_rows(connection, org["disaster_id"], organization_id)
    return {"items": result}


async def need(connection: apsw.AsyncConnection, need_id: str) -> dict:
    found = await row(
        connection,
        "SELECT id, disaster_id, requester_kind, requester_id, resource_type_id, quantity_needed, quantity_fulfilled, priority, status, needed_by, notes, created_at, updated_at FROM needs WHERE id = ?",
        (need_id,),
    )
    if not found:
        error(404, "need_not_found", "Need not found.")
    keys = (
        "id",
        "disaster_id",
        "requester_kind",
        "requester_id",
        "resource_type_id",
        "quantity_needed",
        "quantity_fulfilled",
        "priority",
        "status",
        "needed_by",
        "notes",
        "created_at",
        "updated_at",
    )
    result = dict(zip(keys, found))
    result["requester"] = await site(
        connection,
        {"kind": result.pop("requester_kind"), "id": result.pop("requester_id")},
        result["disaster_id"],
    )
    return result


@get("/needs", guards=[operator_guard], security=BEARER)
async def list_needs(disaster_id: str, status: str | None = None) -> dict:
    if status is not None and status not in {"open", "fulfilled", "cancelled"}:
        invalid("Invalid need status.")
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        rows = await (
            await connection.execute(
                "SELECT id FROM needs WHERE disaster_id = ? AND (? IS NULL OR status = ?) ORDER BY created_at, id",
                (disaster_id, status, status),
            )
        ).fetchall()
        return {"needs": [await need(connection, r[0]) for r in rows]}


@post("/needs", guards=[operator_guard], security=BEARER)
async def create_need(data: JSONBody[dict[str, Any]], request: Request) -> dict:
    required = {"disaster_id", "requester", "resource_type_id", "quantity_needed", "priority"}
    if not required <= set(data) or set(data) - (required | {"needed_by", "notes"}):
        invalid("Invalid need fields.")
    quantity(data["quantity_needed"], "quantity_needed", 1)
    if not isinstance(data["priority"], str) or data["priority"] not in PRIORITIES:
        invalid("Invalid priority.")
    text_value(data.get("needed_by"), "needed_by", True)
    text_value(data.get("notes"), "notes", True)
    need_id, at = "need_" + uuid4().hex, timestamp(now())
    async with transaction() as connection:
        await require_disaster(connection, data["disaster_id"])
        requester = await site(connection, data["requester"], data["disaster_id"])
        await resource(connection, data["resource_type_id"])
        await connection.execute(
            "INSERT INTO needs VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'open', ?, ?, ?, ?)",
            (
                need_id,
                data["disaster_id"],
                requester["kind"],
                requester["id"],
                data["resource_type_id"],
                data["quantity_needed"],
                data["priority"],
                data.get("needed_by"),
                data.get("notes"),
                at,
                at,
            ),
        )
        await record_activity(
            connection,
            disaster_id=data["disaster_id"],
            event_type="need_created",
            summary=f"Need created for {requester['name']}",
            ref_kind="need",
            ref_id=need_id,
            user=get_authenticated_user(request),
        )
        result = await need(connection, need_id)
    return result


@patch("/needs/{need_id:str}", guards=[operator_guard], security=BEARER)
async def update_need(
    need_id: FromPath[str], data: JSONBody[dict[str, Any]], request: Request
) -> dict:
    if not data or set(data) - {
        "quantity_needed",
        "quantity_fulfilled",
        "priority",
        "status",
        "needed_by",
        "notes",
    }:
        invalid("Invalid need fields.")
    async with transaction() as connection:
        current = await need(connection, need_id)
        if "quantity_needed" in data:
            quantity(data["quantity_needed"], "quantity_needed", 1)
        if "quantity_fulfilled" in data:
            quantity(data["quantity_fulfilled"], "quantity_fulfilled")
        if "priority" in data and (
            not isinstance(data["priority"], str) or data["priority"] not in PRIORITIES
        ):
            invalid("Invalid priority.")
        if "status" in data and (
            not isinstance(data["status"], str) or data["status"] not in {"cancelled", "fulfilled"}
        ):
            invalid("Invalid need status.")
        for key in ("needed_by", "notes"):
            if key in data:
                text_value(data[key], key, True)
        current.update(data)
        if (
            current["status"] != "cancelled"
            and current["quantity_fulfilled"] >= current["quantity_needed"]
        ):
            current["status"] = "fulfilled"
        elif current["status"] == "fulfilled" and "status" not in data:
            current["status"] = "open"
        current["updated_at"] = timestamp(now())
        await connection.execute(
            "UPDATE needs SET quantity_needed=?, quantity_fulfilled=?, priority=?, status=?, needed_by=?, notes=?, updated_at=? WHERE id=?",
            (
                current["quantity_needed"],
                current["quantity_fulfilled"],
                current["priority"],
                current["status"],
                current["needed_by"],
                current["notes"],
                current["updated_at"],
                need_id,
            ),
        )
        await record_activity(
            connection,
            disaster_id=current["disaster_id"],
            event_type="need_updated",
            summary=f"Need for {current['requester']['name']} updated",
            ref_kind="need",
            ref_id=need_id,
            user=get_authenticated_user(request),
        )
    return current


async def shipment(connection: apsw.AsyncConnection, shipment_id: str) -> dict:
    found = await row(
        connection,
        "SELECT id, disaster_id, source_id, destination_kind, destination_id, items, need_ids, priority, status, eta, notes, status_history, created_at, updated_at FROM shipments WHERE id=?",
        (shipment_id,),
    )
    if not found:
        error(404, "shipment_not_found", "Shipment not found.")
    result = dict(
        zip(
            (
                "id",
                "disaster_id",
                "source_id",
                "destination_kind",
                "destination_id",
                "items",
                "need_ids",
                "priority",
                "status",
                "eta",
                "notes",
                "status_history",
                "created_at",
                "updated_at",
            ),
            found,
        )
    )
    result["from"] = await site(
        connection, {"kind": "organization", "id": result.pop("source_id")}, result["disaster_id"]
    )
    result["to"] = await site(
        connection,
        {"kind": result.pop("destination_kind"), "id": result.pop("destination_id")},
        result["disaster_id"],
    )
    for key in ("items", "need_ids", "status_history"):
        result[key] = json.loads(result[key])
    return result


@get("/shipments", guards=[operator_guard], security=BEARER)
async def list_shipments(disaster_id: str) -> dict:
    async with connect() as connection:
        await require_disaster(connection, disaster_id)
        rows = await (
            await connection.execute(
                "SELECT id FROM shipments WHERE disaster_id=? ORDER BY created_at, id",
                (disaster_id,),
            )
        ).fetchall()
        return {"shipments": [await shipment(connection, r[0]) for r in rows]}


async def reserve(
    connection: apsw.AsyncConnection, org_id: str, items: list[dict], at: str
) -> None:
    for item in items:
        current = await row(
            connection,
            "SELECT quantity, reserved FROM inventory WHERE organization_id=? AND resource_type_id=?",
            (org_id, item["resource_type_id"]),
        )
        if not current or current[0] - current[1] < item["quantity"]:
            error(409, "insufficient_inventory", "Insufficient available inventory.")
    for item in items:
        await connection.execute(
            "UPDATE inventory SET reserved=reserved+?, updated_at=? WHERE organization_id=? AND resource_type_id=?",
            (item["quantity"], at, org_id, item["resource_type_id"]),
        )


@post("/shipments", guards=[operator_guard], security=BEARER)
async def create_shipment(data: JSONBody[dict[str, Any]], request: Request) -> dict:
    required = {"disaster_id", "from", "to", "items", "priority"}
    if not required <= set(data) or set(data) - (required | {"need_ids", "eta", "notes"}):
        invalid("Invalid shipment fields.")
    if not isinstance(data["priority"], str) or data["priority"] not in PRIORITIES:
        invalid("Invalid priority.")
    if not isinstance(data["items"], list) or not data["items"]:
        invalid("items must be a nonempty list.")
    need_ids = data.get("need_ids", [])
    if (
        not isinstance(need_ids, list)
        or any(not isinstance(x, str) or not x for x in need_ids)
        or len(set(need_ids)) != len(need_ids)
    ):
        invalid("Invalid need_ids.")
    for key in ("eta", "notes"):
        text_value(data.get(key), key, True)
    shipment_id, at = "shipment_" + uuid4().hex, timestamp(now())
    async with transaction() as connection:
        await require_disaster(connection, data["disaster_id"])
        source = await site(connection, data["from"], data["disaster_id"])
        dest = await site(connection, data["to"], data["disaster_id"])
        if source["kind"] != "organization" or (source["kind"], source["id"]) == (
            dest["kind"],
            dest["id"],
        ):
            invalid("Shipment source must be an organization distinct from the destination.")
        seen = set()
        for item in data["items"]:
            if not isinstance(item, dict) or set(item) != {"resource_type_id", "quantity"}:
                invalid("Invalid shipment item.")
            rid = item["resource_type_id"]
            await resource(connection, rid)
            quantity(item["quantity"], "quantity", 1)
            if rid in seen:
                invalid("Duplicate resource type.")
            seen.add(rid)
        for need_id in need_ids:
            linked = await need(connection, need_id)
            if (
                linked["disaster_id"] != data["disaster_id"]
                or linked["requester"]["kind"] != dest["kind"]
                or linked["requester"]["id"] != dest["id"]
                or linked["resource_type_id"] not in seen
                or linked["status"] != "open"
            ):
                invalid("Linked needs must be open, match the destination and shipped resources.")
        await reserve(connection, source["id"], data["items"], at)
        history = [{"status": "approved", "at": at}]
        await connection.execute(
            "INSERT INTO shipments VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?)",
            (
                shipment_id,
                data["disaster_id"],
                source["id"],
                dest["kind"],
                dest["id"],
                json.dumps(data["items"]),
                json.dumps(need_ids),
                data["priority"],
                data.get("eta"),
                data.get("notes"),
                json.dumps(history),
                at,
                at,
            ),
        )
        await record_activity(
            connection,
            disaster_id=data["disaster_id"],
            event_type="shipment_created",
            summary=f"Shipment to {dest['name']} created",
            ref_kind="shipment",
            ref_id=shipment_id,
            user=get_authenticated_user(request),
        )
        result = await shipment(connection, shipment_id)
    return result


@patch("/shipments/{shipment_id:str}", guards=[operator_guard], security=BEARER)
async def update_shipment(
    shipment_id: FromPath[str], data: JSONBody[dict[str, Any]], request: Request
) -> dict:
    if not data or set(data) - {"status", "eta", "notes"}:
        invalid("Invalid shipment fields.")
    for key in ("eta", "notes"):
        if key in data:
            text_value(data[key], key, True)
    async with transaction() as connection:
        current = await shipment(connection, shipment_id)
        at = timestamp(now())
        status = data.get("status", current["status"])
        if "status" in data:
            transition = (current["status"], status)
            if not isinstance(status, str) or transition not in {
                ("requested", "approved"),
                ("requested", "cancelled"),
                ("approved", "in_transit"),
                ("approved", "cancelled"),
                ("in_transit", "delivered"),
            }:
                error(409, "invalid_transition", "Invalid shipment transition.")
            if transition == ("requested", "approved"):
                await reserve(connection, current["from"]["id"], current["items"], at)
            if current["status"] == "approved":
                for item in current["items"]:
                    delta = item["quantity"] if status == "in_transit" else 0
                    await connection.execute(
                        "UPDATE inventory SET quantity=quantity-?, reserved=reserved-?, updated_at=? WHERE organization_id=? AND resource_type_id=?",
                        (
                            delta,
                            item["quantity"],
                            at,
                            current["from"]["id"],
                            item["resource_type_id"],
                        ),
                    )
            if status == "delivered":
                remaining = {
                    item["resource_type_id"]: item["quantity"] for item in current["items"]
                }
                if current["to"]["kind"] == "organization":
                    for item in current["items"]:
                        await connection.execute(
                            "INSERT INTO inventory VALUES (?, ?, ?, 0, ?) ON CONFLICT(organization_id, resource_type_id) DO UPDATE SET quantity=quantity+excluded.quantity, updated_at=excluded.updated_at",
                            (current["to"]["id"], item["resource_type_id"], item["quantity"], at),
                        )
                for linked_id in current["need_ids"]:
                    linked = await need(connection, linked_id)
                    rid = linked["resource_type_id"]
                    if linked["status"] != "open":
                        continue
                    increment = min(
                        remaining.get(rid, 0),
                        max(0, linked["quantity_needed"] - linked["quantity_fulfilled"]),
                    )
                    remaining[rid] -= increment
                    fulfilled = linked["quantity_fulfilled"] + increment
                    await connection.execute(
                        "UPDATE needs SET quantity_fulfilled=?, status=?, updated_at=? WHERE id=?",
                        (
                            fulfilled,
                            "fulfilled" if fulfilled >= linked["quantity_needed"] else "open",
                            at,
                            linked_id,
                        ),
                    )
            current["status_history"].append({"status": status, "at": at})
        await connection.execute(
            "UPDATE shipments SET status=?, eta=?, notes=?, status_history=?, updated_at=? WHERE id=?",
            (
                status,
                data.get("eta", current["eta"]),
                data.get("notes", current["notes"]),
                json.dumps(current["status_history"]),
                at,
                shipment_id,
            ),
        )
        if "status" in data:
            await record_activity(
                connection,
                disaster_id=current["disaster_id"],
                event_type="shipment_status",
                summary=f"Shipment to {current['to']['name']} marked {status}",
                ref_kind="shipment",
                ref_id=shipment_id,
                user=get_authenticated_user(request),
            )
        result = await shipment(connection, shipment_id)
    return result


router = Router(
    path="/",
    route_handlers=[
        list_resource_types,
        list_organizations,
        get_organization,
        create_organization,
        update_organization,
        list_inventory,
        update_inventory,
        list_needs,
        create_need,
        update_need,
        list_shipments,
        create_shipment,
        update_shipment,
    ],
)
