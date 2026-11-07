"""Contract coverage for relief resources and operator announcements."""

import sqlite3

import pytest
from litestar.testing import TestClient

from haven.app import app
from haven.db import database_path


@pytest.fixture
def relief_client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "relief.sqlite3"))
    with TestClient(app=app) as client:
        with sqlite3.connect(database_path()) as connection:
            connection.executemany("INSERT INTO disasters VALUES (?, ?, ?, ?, ?, ?)", [
                ("active", "hurricane", "Haven", "active", "Example County", "2026-11-07T15:00:00Z"),
                ("other", "flood", "Other", "active", "Elsewhere", "2026-11-07T15:00:00Z"),
                ("ended", "tornado", "Ended", "ended", "Elsewhere", "2026-11-06T15:00:00Z"),
            ])
        headers = {}
        for role in ("family", "operator"):
            credentials = {"email": f"{role}@example.com", "password": "correct-password"}
            assert client.post("/api/auth/register", json=credentials).status_code == 201
            if role == "operator":
                with sqlite3.connect(database_path()) as connection:
                    connection.execute("UPDATE users SET role = 'operator' WHERE email = ?", (credentials["email"],))
            token = client.post("/api/auth/login", json=credentials).json()["access_token"]
            headers[role] = {"Authorization": "Bearer " + token}
        yield client, headers


def shelter_data(**overrides):
    return {
        "disaster_id": "active", "name": "Central Community Center", "address": "100 Main Street",
        "location": {"latitude": 27.96, "longitude": -82.45}, "status": "open",
        "capacity": {"total_people": 100, "available_people": 30},
        "capabilities": {"pets_allowed": True, "child_friendly": True, "wheelchair_accessible": True,
                         "medical_staff": ["doctor", "nurse"], "special_care_notes": "Can refrigerate insulin"},
        "resources": {"food": "available", "water": "available", "medication": "limited", "clothes": "available"},
    } | overrides


def test_relief_resources_and_merge(relief_client):
    client, headers = relief_client
    disasters = client.get("/api/disasters").json()["disasters"]
    assert {row["id"] for row in disasters} == {"active", "other"}
    response = client.post("/api/shelters", headers=headers["operator"], json=shelter_data())
    assert response.status_code == 201, response.text
    shelter = response.json()
    assert shelter["id"].startswith("shelter_")
    assert shelter["updated_at"].endswith("Z")
    assert client.get("/api/shelters", params={"disaster_id": "active"}).json() == {"shelters": [shelter]}
    assert client.get("/api/shelters", params={"disaster_id": "other"}).json() == {"shelters": []}
    response = client.patch(f"/api/shelters/{shelter['id']}", headers=headers["operator"], json={
        "capacity": {"available_people": 12}, "resources": {"water": "limited"},
        "capabilities": {"special_care_notes": None}, "location": {"latitude": 28.0},
    })
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["capacity"] == {"available_people": 12, "total_people": 100}
    assert updated["resources"] == shelter["resources"] | {"water": "limited"}
    assert updated["capabilities"] == shelter["capabilities"] | {"special_care_notes": None}
    assert updated["location"] == {"latitude": 28.0, "longitude": -82.45}


def test_relief_authorization_and_validation(relief_client):
    client, headers = relief_client
    assert client.post("/api/shelters", json=shelter_data()).status_code == 401
    assert client.post("/api/shelters", headers=headers["family"], json=shelter_data()).status_code == 403
    assert client.patch("/api/shelters/missing", headers=headers["family"], json={}).status_code == 403
    response = client.patch("/api/shelters/missing", headers=headers["operator"], json={})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "shelter_not_found"
    assert client.post("/api/shelters", headers=headers["operator"], json=shelter_data(disaster_id="missing")).status_code == 404
    for change in (
        {"location": {"latitude": 91, "longitude": 0}},
        {"capacity": {"total_people": 20, "available_people": 21}},
        {"capacity": {"total_people": -1, "available_people": 0}},
        {"resources": {"water": "plentiful"}},
        {"name": " "}, {"status": "nonsense"},
    ):
        response = client.post("/api/shelters", headers=headers["operator"], json=shelter_data(**change))
        assert response.status_code == 400, response.text
    shelter = client.post("/api/shelters", headers=headers["operator"], json=shelter_data()).json()
    for change in ({"resources": None}, {"capacity": {"available_people": None}}, {"surprise": True}):
        response = client.patch(f"/api/shelters/{shelter['id']}", headers=headers["operator"], json=change)
        assert response.status_code == 400, response.text
    assert client.get("/api/shelters", params={"disaster_id": "active"}).json()["shelters"][0]["capacity"] == shelter["capacity"]
    reduced = client.patch(f"/api/shelters/{shelter['id']}", headers=headers["operator"],
                           json={"capacity": {"total_people": 1}})
    assert reduced.status_code == 200, reduced.text
    assert reduced.json()["capacity"] == {"total_people": 1, "available_people": 1}
    assert client.get("/api/shelters").status_code == 400
    assert client.get("/api/shelters", params={"disaster_id": "missing"}).status_code == 404


def test_official_updates(relief_client):
    client, headers = relief_client
    payload = {"title": "Shelter availability changed", "message": "Central is open.", "severity": "info"}
    path = "/api/disasters/active/updates"
    assert client.get(path).json() == {"updates": []}
    assert client.post(path, json=payload).status_code == 401
    assert client.post(path, headers=headers["family"], json=payload).status_code == 403
    response = client.post(path, headers=headers["operator"], json=payload)
    assert response.status_code == 201, response.text
    update = response.json()
    assert update.items() >= payload.items()
    assert update["disaster_id"] == "active"
    assert update["published_at"].endswith("Z")
    assert client.get(path).json() == {"updates": [update]}
    assert client.get("/api/disasters/other/updates").json() == {"updates": []}
    assert client.get("/api/disasters/missing/updates").status_code == 404
    assert client.post("/api/disasters/missing/updates", headers=headers["operator"], json=payload).status_code == 404
    assert client.post(path, headers=headers["operator"], json=payload | {"severity": "severe"}).status_code == 400
    assert client.post(path, headers=headers["operator"], json=payload | {"message": " "}).status_code == 400


def test_family_to_operator_contract_flow(relief_client):
    client, headers = relief_client
    response = client.post("/api/families", headers=headers["family"], json={
        "disaster_id": "active", "adults": 2, "children": 2,
        "location": {"latitude": 27.9506, "longitude": -82.4572},
        "needs": {"pets": True, "immediate_medication": True, "medical_notes": "Insulin required",
                  "accessibility_notes": "Wheelchair accessible", "other_special_care": None},
        "resources": {"has_car": True},
    })
    assert response.status_code == 201, response.text
    family_id = response.json()["id"]
    plan_path = f"/api/families/{family_id}/plan"
    initial_plan = client.get(plan_path, headers=headers["family"])
    assert initial_plan.status_code == 200
    assert initial_plan.json()["status"] == "no_match"
    assert initial_plan.json()["version"] == 1
    shelter = client.post("/api/shelters", headers=headers["operator"], json=shelter_data()).json()
    response = client.post(plan_path + "/generate", headers=headers["family"])
    assert response.status_code == 200, response.text
    plan = response.json()
    assert plan["status"] == "recommended"
    assert plan["shelter"]["id"] == shelter["id"]
    assert plan["version"] == initial_plan.json()["version"] + 1
    assert plan["capacity_reserved"] is True
    assert client.get(plan_path, headers=headers["family"]).json() == plan
    response = client.patch(f"/api/shelters/{shelter['id']}", headers=headers["operator"],
                            json={"status": "closed"})
    assert response.status_code == 200
    updated_plan = client.get(plan_path, headers=headers["family"]).json()
    assert updated_plan["status"] == "no_match"
    assert updated_plan["capacity_reserved"] is False
    assert updated_plan["version"] == plan["version"] + 1
    response = client.post(f"/api/families/{family_id}/reports", headers=headers["family"], json={
        "type": "need_help", "message": "Need transportation", "client_request_id": "integration-retry",
        "location": {"latitude": 27.9506, "longitude": -82.4572},
    })
    assert response.status_code == 201
    assert client.get("/api/disasters/active/reports", headers=headers["operator"]).json()["reports"] == [response.json()]
