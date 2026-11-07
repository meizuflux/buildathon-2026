import sqlite3
from contextlib import closing

import pytest
from litestar.testing import TestClient

from haven.app import app
from haven.auth import hash_password
from haven.db import database_path

CENTER = (29.7604, -95.3698)
HUBS = [
    ("hub_near", "Near Church", "church", 29.7610, -95.3700, 95),
    ("hub_mid", "Mid Fire Station", "fire_station", 29.8000, -95.4000, 40),
    ("hub_far", "Far School", "school", 30.5000, -96.5000, 10),
]


def insert_user(email: str, role: str) -> None:
    with closing(sqlite3.connect(database_path())) as connection, connection:
        connection.execute(
            "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, '2026-01-01T00:00:00Z')",
            ("user_" + role, email, hash_password("correct-password"), role),
        )


def headers_for(client, email: str) -> dict:
    token = client.post("/api/auth/login", json={"email": email, "password": "correct-password"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "donations.sqlite3"))
    with TestClient(app=app) as client:
        with closing(sqlite3.connect(database_path())) as connection, connection:
            connection.executemany(
                "INSERT INTO hubs (id, name, type, address, latitude, longitude, capacity_pct, updated_at) "
                "VALUES (?, ?, ?, '1 Main St', ?, ?, ?, '2026-01-01T00:00:00Z')",
                HUBS,
            )
            connection.execute("INSERT INTO hub_supplies VALUES ('hub_near', 'water', 10, 50)")
        insert_user("op@example.com", "operator")
        insert_user("family@example.com", "family")
        yield client


def test_nearby_hubs_sorted_and_filtered_by_radius(client):
    response = client.get("/api/hubs/nearby", params={"lat": CENTER[0], "lng": CENTER[1], "radius_km": 25})
    assert response.status_code == 200
    body = response.json()
    assert [hub["id"] for hub in body] == ["hub_near", "hub_mid"]
    assert body[0]["distance_km"] < body[1]["distance_km"]
    assert body[0]["supplies"] == [{"category": "water", "quantity": 10, "target": 50, "need": 40}]
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
