"""Family CRUD contract, validation, and account isolation."""

import sqlite3

import pytest
from litestar.testing import TestClient

from haven.app import app
from haven.auth import token_hash


@pytest.fixture
def family_client(tmp_path, monkeypatch):
    path = tmp_path / "families.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(path))
    with TestClient(app=app) as client:
        with sqlite3.connect(path) as connection:
            for name, role in [("owner", "family"), ("stranger", "family"), ("operator", "operator")]:
                connection.execute("INSERT INTO users VALUES (?, ?, 'unused', ?, '2026-01-01T00:00:00Z')",
                                   (name, name + "@example.com", role))
                connection.execute("INSERT INTO sessions VALUES (?, ?, ?, '2099-01-01T00:00:00Z', NULL)",
                                   (name, name, token_hash(name)))
            connection.execute("INSERT INTO disasters VALUES ('disaster', 'flood', 'Flood', 'active', 'County', '2026-01-01T00:00:00Z')")
        yield client


def headers(name="owner"):
    return {"Authorization": "Bearer " + name}


def profile(**overrides):
    return {
        "disaster_id": "disaster", "adults": 2, "children": 1,
        "location": {"latitude": 27.95, "longitude": -82.45},
        "needs": {"pets": True, "medical_notes": "Insulin", "accessibility_notes": "Wheelchair"},
        "resources": {"has_car": True},
    } | overrides


def test_family_create_retrieve_and_nested_merge(family_client):
    client = family_client
    response = client.post("/api/families", headers=headers(), json=profile())
    assert response.status_code == 201, response.text
    family = response.json()
    assert "owner_user_id" not in family
    assert family["needs"]["immediate_medication"] is False
    assert family["created_at"].endswith("Z")
    url = "/api/families/" + family["id"]
    assert client.get(url, headers=headers()).json() == family
    assert client.get("/api/me", headers=headers()).json()["family_id"] == family["id"]
    response = client.patch(url, headers=headers(), json={
        "location": {"latitude": 28}, "needs": {"medical_notes": None}, "resources": {"has_car": False},
    })
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["location"] == {"latitude": 28, "longitude": -82.45}
    assert updated["needs"]["pets"] is True
    assert updated["needs"]["medical_notes"] is None
    assert updated["needs"]["accessibility_notes"] == "Wheelchair"
    assert updated["resources"]["has_car"] is False
    assert updated["created_at"] == family["created_at"]
    assert client.get(url, headers=headers()).json() == updated
    assert client.post("/api/families", headers=headers(), json=profile()).status_code == 409


def test_family_authorization_and_missing_resources(family_client):
    client = family_client
    assert client.post("/api/families", json=profile()).status_code == 401
    assert client.post("/api/families", headers=headers("operator"), json=profile()).status_code == 403
    assert client.post("/api/families", headers=headers(), json=profile(disaster_id="missing")).status_code == 404
    family_id = client.post("/api/families", headers=headers(), json=profile()).json()["id"]
    url = "/api/families/" + family_id
    assert client.get(url).status_code == 401
    assert client.get(url, headers=headers("stranger")).status_code == 403
    assert client.patch(url, headers=headers("stranger"), json={"adults": 9}).status_code == 403
    assert client.get(url, headers=headers("operator")).status_code == 200
    assert client.patch(url, headers=headers("operator"), json={"adults": 3}).status_code == 200
    response = client.get("/api/families/missing", headers=headers())
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "family_not_found"


@pytest.mark.parametrize("changes", [
    {"adults": -1}, {"adults": 0, "children": 0}, {"children": 1.5},
    {"location": {"latitude": 91, "longitude": 0}},
    {"location": {"latitude": 0, "longitude": -181}},
    {"needs": {"pets": None}}, {"resources": {"has_car": "yes"}},
    {"owner_user_id": "stranger"}, {"disaster_id": ""},
])
def test_invalid_family_creation(family_client, changes):
    response = family_client.post("/api/families", headers=headers(), json=profile(**changes))
    assert response.status_code == 400, response.text
    assert "error" in response.json()


@pytest.mark.parametrize("changes", [
    {"adults": None}, {"location": None}, {"location": {"latitude": None}},
    {"needs": None}, {"resources": None}, {"needs": {"pets": None}},
    {"children": -1}, {"adults": 0, "children": 0}, {"owner_user_id": "stranger"},
])
def test_invalid_patch_preserves_family(family_client, changes):
    client = family_client
    family = client.post("/api/families", headers=headers(), json=profile()).json()
    url = "/api/families/" + family["id"]
    response = client.patch(url, headers=headers(), json=changes)
    assert response.status_code == 400, response.text
    assert client.get(url, headers=headers()).json() == family


def test_operator_can_list_families_and_latest_plans(family_client):
    client = family_client
    first = client.post('/api/families', headers=headers(), json=profile()).json()
    client.post('/api/families', headers=headers('stranger'), json=profile())
    family_url = '/api/families?disaster_id=disaster&limit=1'
    plan_url = '/api/disasters/disaster/plans?limit=1'
    for url in (family_url, plan_url):
        assert client.get(url).status_code == 401
        assert client.get(url, headers=headers()).status_code == 403
        assert client.get(url + '&offset=-1', headers=headers('operator')).status_code == 400
    families = client.get(family_url, headers=headers('operator')).json()
    assert families['total'] == 2 and len(families['families']) == 1
    assert 'owner_user_id' not in families['families'][0]
    plans = client.get(plan_url, headers=headers('operator')).json()
    assert plans['total'] == 2 and len(plans['plans']) == 1
    assert '_allocation_fingerprint' not in plans['plans'][0]
    assert len(client.get(family_url + '&offset=1', headers=headers('operator')).json()['families']) == 1
    assert client.get('/api/disasters/missing/plans', headers=headers('operator')).status_code == 404
    assert client.get('/api/families?disaster_id=missing', headers=headers('operator')).status_code == 404
    assert first['id'] in [row['id'] for row in client.get('/api/families?disaster_id=disaster', headers=headers('operator')).json()['families']]
