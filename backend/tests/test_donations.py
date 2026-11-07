import pytest
from conftest import CENTER, headers_for


@pytest.fixture
def client(hub_client):
    return hub_client


def test_nearby_hubs_sorted_and_filtered_by_radius(client):
    response = client.get(
        "/api/hubs/nearby", params={"lat": CENTER[0], "lng": CENTER[1], "radius_km": 25}
    )
    assert response.status_code == 200
    body = response.json()
    assert [hub["id"] for hub in body] == ["hub_near", "hub_mid"]
    assert body[0]["distance_km"] < body[1]["distance_km"]
    water = next(s for s in body[0]["supplies"] if s["resource_type_id"] == "water_bottled")
    assert water == {
        "resource_type_id": "water_bottled",
        "name": "Bottled water",
        "unit": "cases",
        "quantity": 10,
        "target": 20,  # baseline: no demand yet
        "pledged": 0,
        "reserved": 0,
        "available": 10,
        "need": 10,
    }
    assert body[0]["open_pickup"] is None


def test_nearby_rejects_invalid_coordinates(client):
    response = client.get("/api/hubs/nearby", params={"lat": 91, "lng": 0})
    assert response.status_code == 400


def test_list_hubs_by_min_capacity(client):
    assert [hub["id"] for hub in client.get("/api/hubs", params={"min_capacity": 30}).json()] == [
        "hub_near",
        "hub_mid",
    ]
    assert len(client.get("/api/hubs").json()) == 3


def test_manual_check_in_endpoint_is_gone(client):
    operator = headers_for(client, "op@example.com")
    response = client.put(
        "/api/hubs/hub_near/inventory", json={"capacity_pct": 50}, headers=operator
    )
    assert response.status_code in (404, 405)


def test_dispatch_pickup_once(client):
    operator = headers_for(client, "op@example.com")
    response = client.post(
        "/api/hubs/hub_near/pickups", json={"notes": "Box truck 3"}, headers=operator
    )
    assert response.status_code == 201
    assert response.json()["status"] == "dispatched"
    assert response.json()["notes"] == "Box truck 3"
    again = client.post("/api/hubs/hub_near/pickups", headers=operator)
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "pickup_already_open"
    assert client.post("/api/hubs/missing/pickups", headers=operator).status_code == 404
    hub = client.get("/api/hubs", params={"min_capacity": 90}).json()[0]
    assert hub["open_pickup"]["id"] == response.json()["id"]


def test_completed_pickup_moves_surplus_to_nearest_depot(client):
    operator = headers_for(client, "op@example.com")
    depot = client.post(
        "/api/organizations",
        json={
            "disaster_id": "disaster_test",
            "name": "County Depot",
            "type": "government",
            "address": "9 Dock Rd",
            "location": {"latitude": 29.77, "longitude": -95.37},
        },
        headers=operator,
    ).json()
    client.patch("/api/organizations/hub_near", json={"storage_units": 110}, headers=operator)
    client.post(
        "/api/hubs/hub_near/walk-ins",
        json={"items": [{"resource_type_id": "water_bottled", "quantity": 90}]},
        headers=operator,
    )
    assert client.get("/api/hubs/hub_near").json()["capacity_pct"] == 91  # 100 of 110

    pickup = client.post("/api/hubs/hub_near/pickups", headers=operator).json()
    family = headers_for(client, "family@example.com")
    forbidden = client.patch(
        f"/api/pickups/{pickup['id']}", json={"status": "completed"}, headers=family
    )
    assert forbidden.status_code == 403
    done = client.patch(
        f"/api/pickups/{pickup['id']}", json={"status": "completed"}, headers=operator
    ).json()
    assert done["status"] == "completed"
    # The water target is the baseline 20, so the other 80 go to the depot.
    assert done["moved"] == {
        "to": {"id": depot["id"], "name": "County Depot"},
        "items": [{"resource_type_id": "water_bottled", "quantity": 80}],
    }
    hub = client.get("/api/hubs/hub_near").json()
    water = next(s for s in hub["supplies"] if s["resource_type_id"] == "water_bottled")
    assert (water["quantity"], hub["capacity_pct"], hub["open_pickup"]) == (20, 18, None)
    depot_stock = client.get(
        "/api/inventory", params={"holder_id": depot["id"]}, headers=operator
    ).json()["items"]
    assert [(r["resource_type_id"], r["quantity"]) for r in depot_stock] == [("water_bottled", 80)]

    again = client.patch(
        f"/api/pickups/{pickup['id']}", json={"status": "cancelled"}, headers=operator
    )
    assert again.status_code == 409
    missing = client.patch("/api/pickups/missing", json={"status": "cancelled"}, headers=operator)
    assert missing.status_code == 404
    bad = client.patch(
        f"/api/pickups/{pickup['id']}", json={"status": "dispatched"}, headers=operator
    )
    assert bad.status_code == 400
    assert client.post("/api/hubs/hub_near/pickups", headers=operator).status_code == 201


def test_cancelled_pickup_moves_nothing(client):
    operator = headers_for(client, "op@example.com")
    before = client.get("/api/hubs/hub_near").json()
    pickup = client.post("/api/hubs/hub_near/pickups", headers=operator).json()
    listed = client.get("/api/pickups", params={"status": "dispatched"}, headers=operator).json()
    assert [(p["id"], p["hub_name"]) for p in listed] == [(pickup["id"], "Near Church")]
    response = client.patch(
        f"/api/pickups/{pickup['id']}", json={"status": "cancelled"}, headers=operator
    )
    assert (response.status_code, response.json()["moved"]) == (200, None)
    after = client.get("/api/hubs/hub_near").json()
    assert after["capacity_pct"] == before["capacity_pct"] == 95
    assert after["supplies"] == before["supplies"]
