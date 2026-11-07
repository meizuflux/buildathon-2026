import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest
from litestar.testing import TestClient

from haven.app import app
from haven.auth import token_hash


@pytest.fixture
def coordination_client(tmp_path, monkeypatch):
    database = tmp_path / "coordination.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(database))
    with TestClient(app=app) as client:
        with sqlite3.connect(database) as connection:
            for identity, role in (("owner", "family"), ("stranger", "family"), ("operator", "operator")):
                connection.execute("INSERT INTO users VALUES (?, ?, 'unused', ?, '2026-11-07T00:00:00Z')", (identity, identity + "@example.com", role))
                connection.execute("INSERT INTO sessions VALUES (?, ?, ?, '2099-01-01T00:00:00Z', NULL)", (identity, identity, token_hash(identity)))
            for identity in ("disaster", "other"):
                connection.execute("INSERT INTO disasters VALUES (?, 'hurricane', 'Haven', 'active', 'County', '2026-11-07T00:00:00Z')", (identity,))
            connection.execute("INSERT INTO families VALUES ('family', 'owner', 'disaster', 2, 1, 28, -82, ?, ?, '2026-11-07T00:00:00Z', '2026-11-07T00:00:00Z')", (json.dumps({"pets": True, "immediate_medication": True, "medical_notes": "Insulin", "accessibility_notes": "Wheelchair", "other_special_care": None}), json.dumps({"has_car": True})))
        yield client, database


def headers(identity="owner"):
    return {"Authorization": "Bearer " + identity}


def seed_shelter(database, identity="shelter", **overrides):
    data = {"disaster_id": "disaster", "latitude": 28.1, "longitude": -82, "status": "open", "available": 10, "pets": True, "children": True, "wheelchair": True, "staff": ["nurse"], "medication": "available"} | overrides
    with sqlite3.connect(database) as connection:
        connection.execute("INSERT INTO shelters VALUES (?, ?, ?, '100 Main St', ?, ?, ?, ?, ?, ?, '2026-11-07T00:00:00Z')", (
            identity, data["disaster_id"], identity, data["latitude"], data["longitude"], data["status"],
            json.dumps({"total_people": 20, "available_people": data["available"]}),
            json.dumps({"pets_allowed": data["pets"], "child_friendly": data["children"], "wheelchair_accessible": data["wheelchair"], "medical_staff": data["staff"], "special_care_notes": None}),
            json.dumps({"medication": data["medication"], "food": "available", "water": "available", "clothes": "unknown"}),
        ))


def generate(client):
    return client.post("/api/families/family/plan/generate", headers=headers())


def test_plan_versions_matching_and_snapshot(coordination_client):
    client, database = coordination_client
    assert client.get("/api/families/family/plan", headers=headers()).json()["error"]["code"] == "plan_not_found"
    first = generate(client)
    assert first.status_code == 200
    assert first.json()["status"] == "no_match"
    assert first.json()["version"] == 1
    seed_shelter(database, "farther", latitude=29)
    seed_shelter(database, "nearest", latitude=28.01)
    seed_shelter(database, "wrong-disaster", disaster_id="other", latitude=28)
    seed_shelter(database, "full", available=2, latitude=28)
    seed_shelter(database, "closed", status="closed", latitude=28)
    seed_shelter(database, "no-pets", pets=False, latitude=28)
    seed_shelter(database, "no-children", children=False, latitude=28)
    seed_shelter(database, "no-wheelchair", wheelchair=False, latitude=28)
    seed_shelter(database, "no-staff", staff=[], latitude=28)
    seed_shelter(database, "no-medication", medication="unavailable", latitude=28)
    plan = generate(client).json()
    assert plan["version"] == 2
    assert plan["status"] == "recommended"
    assert plan["shelter"]["id"] == "nearest"
    assert plan["capacity_reserved"] is False
    assert client.get("/api/families/family/plan", headers=headers()).json() == plan
    assert client.get("/api/families/family/plan?after_version=1", headers=headers()).json() == plan
    response = client.get("/api/families/family/plan?after_version=2&wait_seconds=0", headers=headers())
    assert response.status_code == 204
    assert not response.content
    with sqlite3.connect(database) as connection:
        assert json.loads(connection.execute("SELECT capacity_json FROM shelters WHERE id='nearest'").fetchone()[0])["available_people"] == 10
        connection.execute("UPDATE shelters SET name = 'Renamed' WHERE id='nearest'")
    assert client.get("/api/families/family/plan", headers=headers()).json()["shelter"]["name"] == "nearest"


def test_plan_access_and_poll_validation(coordination_client):
    client, _ = coordination_client
    for suffix in ("/plan", "/plan/generate"):
        method = client.post if suffix.endswith("generate") else client.get
        assert method("/api/families/family" + suffix).status_code == 401
        assert method("/api/families/family" + suffix, headers=headers("stranger")).status_code == 403
    assert client.post("/api/families/missing/plan/generate", headers=headers()).status_code == 404
    assert client.post("/api/families/family/plan/generate", headers=headers("operator")).status_code == 200
    for query in ("after_version=-1", "wait_seconds=-1", "wait_seconds=26"):
        assert client.get("/api/families/family/plan?" + query, headers=headers()).status_code == 400


def test_report_retries_conflicts_and_operator_listing(coordination_client):
    client, database = coordination_client
    payload = {"type": "need_help", "message": "Need transport", "location": {"latitude": 28, "longitude": -82}, "client_request_id": "retry-once"}
    path = "/api/families/family/reports"
    first = client.post(path, headers=headers(), json=payload)
    assert first.status_code == 201
    assert first.json()["status"] == "received"
    assert client.post(path, headers=headers(), json=payload).json() == first.json()
    conflict = client.post(path, headers=headers(), json=payload | {"message": "Different"})
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "idempotency_conflict"
    assert client.post(path, headers=headers("stranger"), json=payload).status_code == 403
    assert client.post(path, json=payload).status_code == 401
    assert client.get("/api/disasters/disaster/reports", headers=headers()).status_code == 403
    assert client.get("/api/disasters/disaster/reports", headers=headers("operator")).json() == {"reports": [first.json()]}
    assert client.get("/api/disasters/other/reports", headers=headers("operator")).json() == {"reports": []}
    assert client.get("/api/disasters/missing/reports", headers=headers("operator")).status_code == 404
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT COUNT(*) FROM reports").fetchone()[0] == 1
    for change in ({"type": "invalid"}, {"message": " "}, {"client_request_id": ""}, {"location": {"latitude": 91, "longitude": 0}}):
        assert client.post(path, headers=headers(), json=payload | change).status_code == 400


def test_concurrent_plan_versions_and_report_retries(coordination_client):
    client, database = coordination_client
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: generate(client), range(4)))
    assert sorted(response.json()["version"] for response in results) == [1, 2, 3, 4]
    payload = {"type": "other", "message": "Concurrent retry", "location": {"latitude": 0, "longitude": 0}, "client_request_id": "concurrent"}
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: client.post("/api/families/family/reports", headers=headers(), json=payload), range(4)))
    assert all(response.status_code == 201 for response in results)
    assert len({response.json()["id"] for response in results}) == 1


def test_plan_poll_wakes_for_new_version(coordination_client, monkeypatch):
    import threading

    import haven.routers.coordination as coordination

    client, _ = coordination_client
    assert generate(client).json()["version"] == 1
    # Signal when the poll has read the old version and entered its wait.
    sleeping = threading.Event()
    original_sleep = coordination.asyncio.sleep

    async def observed_sleep(delay):
        sleeping.set()
        await original_sleep(delay)

    monkeypatch.setattr(coordination.asyncio, "sleep", observed_sleep)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(client.get, "/api/families/family/plan?after_version=1&wait_seconds=2", headers=headers())
        assert sleeping.wait(timeout=1)
        updated = generate(client).json()
        response = future.result(timeout=3)
    assert response.status_code == 200
    assert response.json() == updated
    assert updated["version"] == 2
