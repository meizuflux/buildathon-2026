import pytest

from conftest import CENTER, headers_for


@pytest.fixture
def client(hub_client):
    return hub_client


def test_nearby_hubs_sorted_and_filtered_by_radius(client):
    response = client.get("/api/hubs/nearby", params={"lat": CENTER[0], "lng": CENTER[1], "radius_km": 25})
    assert response.status_code == 200
    body = response.json()
    assert [hub["id"] for hub in body] == ["hub_near", "hub_mid"]
    assert body[0]["distance_km"] < body[1]["distance_km"]
    assert body[0]["supplies"] == [{"category": "water", "quantity": 10, "target": 50, "pledged": 0, "reserved": 0, "available": 10, "need": 40}]
    assert body[0]["open_pickup"] is None


def test_nearby_rejects_invalid_coordinates(client):
    response = client.get("/api/hubs/nearby", params={"lat": 91, "lng": 0})
    assert response.status_code == 400


def test_list_hubs_by_min_capacity(client):
    assert [hub["id"] for hub in client.get("/api/hubs", params={"min_capacity": 30}).json()] == ["hub_near", "hub_mid"]
    assert len(client.get("/api/hubs").json()) == 3


def test_writes_require_operator(client):
    update = {"capacity_pct": 50, "supplies": []}
    assert client.put("/api/hubs/hub_near/inventory", json=update).status_code == 401
    assert client.post("/api/hubs/hub_near/pickups", json={}).status_code == 401
    family = headers_for(client, "family@example.com")
    response = client.put("/api/hubs/hub_near/inventory", json=update, headers=family)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"
    assert client.post("/api/hubs/hub_near/pickups", json={}, headers=family).status_code == 403


def test_inventory_update_upserts_supplies(client):
    operator = headers_for(client, "op@example.com")
    update = {"capacity_pct": 70, "supplies": [
        {"category": "water", "quantity": 60, "target": 50},
        {"category": "blankets", "quantity": 2, "target": 20},
    ]}
    response = client.put("/api/hubs/hub_near/inventory", json=update, headers=operator)
    assert response.status_code == 200
    body = response.json()
    assert body["capacity_pct"] == 70
    assert {s["category"]: s["need"] for s in body["supplies"]} == {"blankets": 18, "water": 0}
    assert client.put("/api/hubs/missing/inventory", json=update, headers=operator).status_code == 404
    duplicate = {"capacity_pct": 10, "supplies": [{"category": "water", "quantity": 1, "target": 1}] * 2}
    assert client.put("/api/hubs/hub_near/inventory", json=duplicate, headers=operator).status_code == 400
    assert client.put("/api/hubs/hub_near/inventory", json={"capacity_pct": 101}, headers=operator).status_code == 400


def test_dispatch_pickup_once(client):
    operator = headers_for(client, "op@example.com")
    response = client.post("/api/hubs/hub_near/pickups", json={"notes": "Box truck 3"}, headers=operator)
    assert response.status_code == 201
    assert response.json()["status"] == "dispatched"
    assert response.json()["notes"] == "Box truck 3"
    again = client.post("/api/hubs/hub_near/pickups", headers=operator)
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "pickup_already_open"
    assert client.post("/api/hubs/missing/pickups", headers=operator).status_code == 404
    hub = client.get("/api/hubs", params={"min_capacity": 90}).json()[0]
    assert hub["open_pickup"]["id"] == response.json()["id"]


def test_complete_pickup_resets_capacity_and_allows_redispatch(client):
    operator = headers_for(client, "op@example.com")
    pickup = client.post("/api/hubs/hub_near/pickups", headers=operator).json()
    listed = client.get("/api/pickups", params={"status": "dispatched"}, headers=operator).json()
    assert [(p["id"], p["hub_name"]) for p in listed] == [(pickup["id"], "Near Church")]
    family = headers_for(client, "family@example.com")
    assert client.get("/api/pickups", headers=family).status_code == 403
    assert client.patch(f"/api/pickups/{pickup['id']}", json={"status": "completed"}, headers=family).status_code == 403

    done = client.patch(f"/api/pickups/{pickup['id']}", json={"status": "completed", "capacity_pct": 20}, headers=operator)
    assert done.status_code == 200
    assert done.json()["status"] == "completed"
    hub = next(h for h in client.get("/api/hubs").json() if h["id"] == "hub_near")
    assert hub["capacity_pct"] == 20
    assert hub["open_pickup"] is None
    again = client.patch(f"/api/pickups/{pickup['id']}", json={"status": "cancelled"}, headers=operator)
    assert again.status_code == 409
    assert client.patch("/api/pickups/missing", json={"status": "cancelled"}, headers=operator).status_code == 404
    assert client.patch(f"/api/pickups/{pickup['id']}", json={"status": "dispatched"}, headers=operator).status_code == 400
    assert client.post("/api/hubs/hub_near/pickups", headers=operator).status_code == 201


def test_cancel_pickup_keeps_capacity(client):
    operator = headers_for(client, "op@example.com")
    pickup = client.post("/api/hubs/hub_near/pickups", headers=operator).json()
    response = client.patch(f"/api/pickups/{pickup['id']}", json={"status": "cancelled", "capacity_pct": 0}, headers=operator)
    assert response.status_code == 200
    hub = next(h for h in client.get("/api/hubs").json() if h["id"] == "hub_near")
    assert hub["capacity_pct"] == 95
