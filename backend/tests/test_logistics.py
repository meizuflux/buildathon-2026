"""Supply logistics (API contract part 2) and its shared stock engine with citizen donations."""

import json
import sqlite3
from contextlib import closing

import pytest
from conftest import CENTER, headers_for

from haven.db import database_path

DISASTER = "disaster_test"


@pytest.fixture
def client(hub_client):
    with closing(sqlite3.connect(database_path())) as connection, connection:
        connection.execute(
            "INSERT INTO shelters VALUES ('shelter_a', ?, 'Shelter A', '2 Main St', ?, ?, 'open', "
            "?, ?, ?, '2026-01-01T00:00:00Z')",
            (
                DISASTER,
                CENTER[0],
                CENTER[1],
                json.dumps({"total_people": 100, "available_people": 100}),
                json.dumps(
                    {
                        "pets_allowed": False,
                        "child_friendly": True,
                        "wheelchair_accessible": True,
                        "medical_staff": [],
                        "special_care_notes": None,
                    }
                ),
                json.dumps(
                    {
                        "food": "available",
                        "water": "limited",
                        "medication": "unknown",
                        "clothes": "unknown",
                    }
                ),
            ),
        )
    return hub_client


@pytest.fixture
def op(client):
    return headers_for(client, "op@example.com")


@pytest.fixture
def family(client):
    return headers_for(client, "family@example.com")


def new_org(client, headers, **overrides):
    body = {
        "disaster_id": DISASTER,
        "name": "Bayside Food Bank",
        "type": "nonprofit",
        "services": ["distribution", "food"],
        "status": "active",
        "address": "55 Port Ave",
        "location": {"latitude": 27.94, "longitude": -82.43},
        "contact": {"name": "Dana Ruiz", "phone": "+1-555-0102", "email": "ops@bayside.example"},
        "coverage_radius_km": 15,
        "notes": "Refrigerated truck available.",
    } | overrides
    response = client.post("/api/organizations", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def set_stock(client, headers, org_id, **quantities):
    items = [{"resource_type_id": k, "quantity": v} for k, v in quantities.items()]
    response = client.patch(
        f"/api/organizations/{org_id}/inventory", json={"items": items}, headers=headers
    )
    assert response.status_code == 200, response.text
    return {row["resource_type_id"]: row for row in response.json()["items"]}


def ship(client, headers, org_id, to=("shelter", "shelter_a"), need_ids=(), **items):
    body = {
        "disaster_id": DISASTER,
        "from": {"kind": "organization", "id": org_id},
        "to": {"kind": to[0], "id": to[1]},
        "items": [{"resource_type_id": k, "quantity": v} for k, v in items.items()],
        "need_ids": list(need_ids),
        "priority": "high",
    }
    return client.post("/api/shipments", json=body, headers=headers)


def inventory(client, headers, org_id):
    rows = client.get(
        "/api/inventory",
        params={"holder_kind": "organization", "holder_id": org_id},
        headers=headers,
    ).json()["items"]
    return {row["resource_type_id"]: (row["quantity"], row["reserved"]) for row in rows}


def test_resource_types_need_any_sign_in(client, family):
    assert client.get("/api/resource-types").status_code == 401
    types = client.get("/api/resource-types", headers=family).json()["resource_types"]
    assert len(types) == 16
    by_id = {t["id"]: t for t in types}
    assert by_id["water_bottled"] == {
        "id": "water_bottled",
        "name": "Bottled water",
        "category": "water",
        "unit": "cases",
        "citizen_requestable": True,
    }
    assert by_id["insulin"]["citizen_requestable"] is False


def test_part_two_is_operator_only(client, family):
    for method, path in [
        ("get", "/api/organizations"),
        ("get", "/api/inventory"),
        ("get", "/api/needs"),
        ("get", "/api/shipments"),
    ]:
        response = getattr(client, method)(path, headers=family)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "not_permitted"


def test_organization_crud_and_nested_merge(client, op):
    org = new_org(client, op)
    assert org["services"] == ["distribution", "food"]
    assert org["site_type"] is None
    patched = client.patch(
        f"/api/organizations/{org['id']}",
        json={"status": "limited", "contact": {"email": "new@bayside.example"}},
        headers=op,
    ).json()
    assert patched["status"] == "limited"
    assert patched["contact"] == {
        "name": "Dana Ruiz",
        "phone": "+1-555-0102",
        "email": "new@bayside.example",
    }
    assert client.get(f"/api/organizations/{org['id']}", headers=op).json() == patched
    listed = client.get("/api/organizations", params={"disaster_id": DISASTER}, headers=op).json()
    assert org["id"] in {o["id"] for o in listed["organizations"]}
    assert "hub_near" in {o["id"] for o in listed["organizations"]}  # hubs are organizations
    missing = client.post(
        "/api/organizations",
        json={
            "disaster_id": "nope",
            "name": "X",
            "type": "private",
            "address": "1 St",
            "location": {"latitude": 0, "longitude": 0},
        },
        headers=op,
    )
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "disaster_not_found"
    assert client.get("/api/organizations/nope", headers=op).json()["error"]["code"] == (
        "organization_not_found"
    )


def test_inventory_set_and_conflict_with_reservations(client, op):
    org = new_org(client, op)
    rows = set_stock(client, op, org["id"], food_mre=600, water_bottled=40)
    assert rows["food_mre"]["holder"] == {
        "kind": "organization",
        "id": org["id"],
        "name": "Bayside Food Bank",
    }
    assert ship(client, op, org["id"], food_mre=100).status_code == 201
    assert inventory(client, op, org["id"])["food_mre"] == (600, 100)
    conflict = client.patch(
        f"/api/organizations/{org['id']}/inventory",
        json={"items": [{"resource_type_id": "food_mre", "quantity": 50}]},
        headers=op,
    )
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "inventory_conflict"
    unknown = client.patch(
        f"/api/organizations/{org['id']}/inventory",
        json={"items": [{"resource_type_id": "gold", "quantity": 1}]},
        headers=op,
    )
    assert unknown.status_code == 400


def test_needs_create_patch_and_auto_fulfil(client, op):
    body = {
        "disaster_id": DISASTER,
        "requester": {"kind": "shelter", "id": "shelter_a"},
        "resource_type_id": "water_bottled",
        "quantity_needed": 40,
        "priority": "critical",
        "notes": "Over capacity.",
    }
    need = client.post("/api/needs", json=body, headers=op)
    assert need.status_code == 201
    need = need.json()
    assert need["requester"] == {"kind": "shelter", "id": "shelter_a", "name": "Shelter A"}
    assert (need["status"], need["quantity_fulfilled"]) == ("open", 0)
    bad = body | {"requester": {"kind": "shelter", "id": "missing"}}
    assert client.post("/api/needs", json=bad, headers=op).status_code == 400
    partial = client.patch(f"/api/needs/{need['id']}", json={"quantity_fulfilled": 10}, headers=op)
    assert partial.json()["status"] == "open"
    done = client.patch(f"/api/needs/{need['id']}", json={"quantity_fulfilled": 40}, headers=op)
    assert done.json()["status"] == "fulfilled"
    open_only = client.get("/api/needs", params={"status": "open"}, headers=op).json()["needs"]
    assert open_only == []


def test_shipment_lifecycle_moves_stock_and_fulfils_needs(client, op):
    source = new_org(client, op)
    depot = new_org(client, op, name="North Depot")
    set_stock(client, op, source["id"], water_bottled=100)
    need = client.post(
        "/api/needs",
        json={
            "disaster_id": DISASTER,
            "requester": {"kind": "organization", "id": depot["id"]},
            "resource_type_id": "water_bottled",
            "quantity_needed": 30,
            "priority": "high",
        },
        headers=op,
    ).json()
    created = ship(
        client,
        op,
        source["id"],
        to=("organization", depot["id"]),
        need_ids=[need["id"]],
        water_bottled=40,
    )
    assert created.status_code == 201
    shipment = created.json()
    assert shipment["status"] == "approved"
    assert shipment["from"]["name"] == "Bayside Food Bank"
    assert shipment["to"] == {"kind": "organization", "id": depot["id"], "name": "North Depot"}
    assert inventory(client, op, source["id"])["water_bottled"] == (100, 40)

    url = f"/api/shipments/{shipment['id']}"
    invalid = client.patch(url, json={"status": "delivered"}, headers=op)
    assert invalid.status_code == 409
    assert invalid.json()["error"]["code"] == "invalid_transition"
    client.patch(url, json={"status": "in_transit", "eta": "2026-11-07T16:00:00Z"}, headers=op)
    assert inventory(client, op, source["id"])["water_bottled"] == (60, 0)
    delivered = client.patch(url, json={"status": "delivered"}, headers=op).json()
    assert [h["status"] for h in delivered["status_history"]] == [
        "approved",
        "in_transit",
        "delivered",
    ]
    assert delivered["eta"] == "2026-11-07T16:00:00Z"
    assert inventory(client, op, depot["id"])["water_bottled"] == (40, 0)
    credited = client.get("/api/needs", headers=op).json()["needs"][0]
    assert (credited["quantity_fulfilled"], credited["status"]) == (30, "fulfilled")


def test_shipment_errors_and_cancel_releases(client, op):
    source = new_org(client, op)
    set_stock(client, op, source["id"], cots=10)
    short = ship(client, op, source["id"], cots=11)
    assert short.status_code == 409
    assert short.json()["error"]["code"] == "insufficient_inventory"
    same = ship(client, op, source["id"], to=("organization", source["id"]), cots=1)
    assert same.status_code == 400
    shipment = ship(client, op, source["id"], cots=10).json()
    assert inventory(client, op, source["id"])["cots"] == (10, 10)
    client.patch(f"/api/shipments/{shipment['id']}", json={"status": "cancelled"}, headers=op)
    assert inventory(client, op, source["id"])["cots"] == (10, 0)
    listed = client.get("/api/shipments", params={"disaster_id": DISASTER}, headers=op).json()
    assert [s["status"] for s in listed["shipments"]] == ["cancelled"]


def test_hub_stock_is_shared_between_shipments_and_citizen_requests(client, op, family):
    """A shipment reservation at a hub reduces what citizens can be given, and vice versa."""
    # hub_near starts with 10 bottled water (target 50).
    assert ship(client, op, "hub_near", water_bottled=8).status_code == 201
    hub = client.get("/api/hubs/hub_near").json()
    water = next(s for s in hub["supplies"] if s["resource_type_id"] == "water_bottled")
    assert (water["quantity"], water["reserved"], water["available"]) == (10, 8, 2)

    request_body = {
        "items": [{"resource_type_id": "water_bottled", "quantity": 3}],
        "latitude": CENTER[0],
        "longitude": CENTER[1],
    }
    request_id = client.post("/api/requests", json=request_body, headers=family).json()["id"]
    claim = client.post(
        f"/api/requests/{request_id}/claim",
        json={"hub_id": "hub_near", "method": "pickup"},
        headers=op,
    )
    assert claim.status_code == 409
    assert claim.json()["error"]["code"] == "insufficient_stock"
    # Water is now scarce, so the fair-share cap is 1: withdraw before asking for less.
    client.post(f"/api/requests/{request_id}/cancel", headers=family)

    small = client.post(
        "/api/requests",
        json=request_body | {"items": [{"resource_type_id": "water_bottled", "quantity": 2}]},
        headers=family,
    ).json()["id"]
    claimed = client.post(
        f"/api/requests/{small}/claim",
        json={"hub_id": "hub_near", "method": "pickup"},
        headers=op,
    )
    assert claimed.status_code == 200
    assert ship(client, op, "hub_near", water_bottled=1).json()["error"]["code"] == (
        "insufficient_inventory"
    )
    client.post(f"/api/requests/{small}/release", headers=op)
    assert inventory(client, op, "hub_near")["water_bottled"] == (10, 8)


def test_citizens_cannot_request_clinical_items(client, family):
    response = client.post(
        "/api/requests",
        json={
            "items": [{"resource_type_id": "insulin", "quantity": 1}],
            "latitude": CENTER[0],
            "longitude": CENTER[1],
        },
        headers=family,
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "not_citizen_requestable"
