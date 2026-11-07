"""Logistics operations preserve stock and allocate deliveries once."""

from test_relief import relief_client, shelter_data  # noqa: F401


def test_dispatch_reservations_and_need_allocation(relief_client):  # noqa: F811
    client, headers = relief_client
    operator = headers["operator"]
    org = client.post(
        "/api/organizations",
        headers=operator,
        json={
            "disaster_id": "active",
            "name": "Food Bank",
            "type": "nonprofit",
            "services": ["food"],
            "status": "active",
            "address": "10 Main",
            "location": {"latitude": 27.9, "longitude": -82.4},
            "contact": {},
        },
    )
    assert org.status_code == 201, org.text
    org_id = org.json()["id"]
    shelter = client.post("/api/shelters", headers=operator, json=shelter_data()).json()
    source = {"kind": "organization", "id": org_id}
    destination = {"kind": "shelter", "id": shelter["id"]}
    inventory_url = f"/api/organizations/{org_id}/inventory"
    assert (
        client.patch(
            inventory_url,
            headers=operator,
            json={"items": [{"resource_type_id": "food_mre", "quantity": 100}]},
        ).status_code
        == 200
    )
    needs = []
    for _ in range(2):
        response = client.post(
            "/api/needs",
            headers=operator,
            json={
                "disaster_id": "active",
                "requester": destination,
                "resource_type_id": "food_mre",
                "quantity_needed": 60,
                "priority": "high",
            },
        )
        assert response.status_code == 201, response.text
        needs.append(response.json()["id"])
    body = {
        "disaster_id": "active",
        "from": source,
        "to": destination,
        "items": [{"resource_type_id": "food_mre", "quantity": 100}],
        "need_ids": needs,
        "priority": "high",
    }
    response = client.post("/api/shipments", headers=operator, json=body)
    assert response.status_code == 201, response.text
    shipment_id = response.json()["id"]
    assert (
        client.post("/api/shipments", headers=operator, json=body).json()["error"]["code"]
        == "insufficient_inventory"
    )
    assert (
        client.patch(
            inventory_url,
            headers=operator,
            json={"items": [{"resource_type_id": "food_mre", "quantity": 99}]},
        ).json()["error"]["code"]
        == "inventory_conflict"
    )
    url = f"/api/shipments/{shipment_id}"
    assert (
        client.patch(url, headers=operator, json={"status": "delivered"}).json()["error"]["code"]
        == "invalid_transition"
    )
    assert client.patch(url, headers=operator, json={"status": "in_transit"}).status_code == 200
    assert client.patch(url, headers=operator, json={"status": "delivered"}).status_code == 200
    quantities = [
        n["quantity_fulfilled"]
        for n in client.get("/api/needs?disaster_id=active", headers=operator).json()["needs"]
    ]
    assert sorted(quantities) == [40, 60]
    item = client.get("/api/inventory?disaster_id=active", headers=operator).json()["items"][0]
    assert (item["quantity"], item["reserved"]) == (0, 0)
    assert client.get("/api/needs?disaster_id=active", headers=headers["family"]).status_code == 403


def test_cancellation_releases_stock_and_rejects_duplicate_items(relief_client):  # noqa: F811
    client, headers = relief_client
    operator = headers["operator"]
    org = client.post(
        "/api/organizations",
        headers=operator,
        json={
            "disaster_id": "active",
            "name": "Depot",
            "type": "government",
            "services": [],
            "status": "active",
            "address": "10 Main",
            "location": {"latitude": 0, "longitude": 0},
            "contact": {},
        },
    ).json()
    shelter = client.post("/api/shelters", headers=operator, json=shelter_data()).json()
    org_id = org["id"]
    assert (
        client.patch(
            f"/api/organizations/{org_id}/inventory",
            headers=operator,
            json={"items": [{"resource_type_id": "water_bottled", "quantity": 10}]},
        ).status_code
        == 200
    )
    body = {
        "disaster_id": "active",
        "from": {"kind": "organization", "id": org_id},
        "to": {"kind": "shelter", "id": shelter["id"]},
        "items": [{"resource_type_id": "water_bottled", "quantity": 4}],
        "priority": "medium",
    }
    invalid = body | {"items": body["items"] * 2}
    assert client.post("/api/shipments", headers=operator, json=invalid).status_code == 400
    shipment = client.post("/api/shipments", headers=operator, json=body).json()
    assert (
        client.patch(
            f"/api/shipments/{shipment['id']}", headers=operator, json={"status": "cancelled"}
        ).status_code
        == 200
    )
    item = client.get("/api/inventory?disaster_id=active", headers=operator).json()["items"][0]
    assert (item["quantity"], item["reserved"]) == (10, 0)


def test_invalid_logistics_inputs_return_client_errors(relief_client):  # noqa: F811
    client, headers = relief_client
    operator = headers["operator"]
    org = {
        "disaster_id": "active",
        "name": "Depot",
        "type": "government",
        "services": [{}],
        "status": "active",
        "address": "10 Main",
        "location": {"latitude": 0, "longitude": 0},
        "contact": {},
    }
    assert client.post("/api/organizations", headers=operator, json=org).status_code == 400
    assert (
        client.post(
            "/api/needs",
            headers=operator,
            json={
                "disaster_id": [],
                "requester": {},
                "resource_type_id": "food_mre",
                "quantity_needed": 1,
                "priority": "high",
            },
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/needs",
            headers=operator,
            json={
                "disaster_id": "active",
                "requester": {},
                "resource_type_id": "food_mre",
                "quantity_needed": 1,
                "priority": "high",
                "needed_by": "tomorrow",
            },
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/shipments",
            headers=operator,
            json={
                "disaster_id": "active",
                "from": {},
                "to": {},
                "items": [{}],
                "priority": "high",
                "eta": "2026-11-07T15:00:00-05:00",
            },
        ).status_code
        == 400
    )
