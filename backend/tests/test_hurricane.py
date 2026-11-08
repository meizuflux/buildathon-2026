"""Contract coverage for the hurricane demo: status, initiate, reset, and preview."""

import sqlite3

import pytest
from litestar.testing import TestClient

from haven.allocation_policy import distance
from haven.app import app
from haven.auth import token_hash
from haven.db import database_path

DISASTER = "storm"
BASE = f"/api/disasters/{DISASTER}"
REQUIREMENTS = [
    "medication",
    "medical_staff",
    "wheelchair_accessible",
    "pets",
    "child_friendly",
    "special_care",
]


def auth(name):
    return {"Authorization": "Bearer " + name}


def shelter(name, longitude, total, *, capable, status="open"):
    return {
        "disaster_id": DISASTER,
        "name": name,
        "address": "1 Main Street",
        "location": {"latitude": 27.0, "longitude": longitude},
        "status": status,
        "capacity": {"total_people": total, "available_people": total},
        "capabilities": {
            "pets_allowed": capable,
            "child_friendly": True,
            "wheelchair_accessible": True,
            "medical_staff": ["nurse"] if capable else [],
            "special_care_notes": None,
        },
        "resources": {
            "food": "available",
            "water": "available",
            "medication": "available" if capable else "unavailable",
            "clothes": "available",
        },
    }


@pytest.fixture
def hurricane_client(tmp_path, monkeypatch):
    """Two near-by households; the closest shelter is small and lacks medical staff."""
    path = tmp_path / "hurricane.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(path))
    with TestClient(app=app) as client:
        with sqlite3.connect(path) as connection:
            for name, role in [
                ("operator", "operator"),
                ("sick", "family"),
                ("healthy", "family"),
                ("outsider", "family"),
            ]:
                connection.execute(
                    "INSERT INTO users VALUES (?, ?, 'unused', ?, '2026-01-01T00:00:00Z')",
                    (name, name + "@example.com", role),
                )
                connection.execute(
                    "INSERT INTO sessions VALUES (?, ?, ?, '2099-01-01T00:00:00Z', NULL)",
                    (name, name, token_hash(name)),
                )
            connection.execute(
                "INSERT INTO disasters VALUES (?, 'hurricane', 'Storm', 'active', "
                "'Coastal County', '2026-01-01T00:00:00Z')",
                (DISASTER,),
            )
            connection.execute(
                "INSERT INTO disasters VALUES ('other', 'flood', 'Other', 'active', "
                "'Elsewhere', '2026-01-01T00:00:00Z')"
            )
        for body in (
            shelter("Near Gym", -82.0, 4, capable=False),
            shelter("Far Hospital", -81.0, 100, capable=True),
            shelter("Closed School", -82.0001, 100, capable=True, status="closed"),
        ):
            assert (
                client.post("/api/shelters", headers=auth("operator"), json=body).status_code == 201
            )
        profiles = {
            "sick": {
                "adults": 2,
                "children": 1,
                "needs": {"immediate_medication": True, "pets": True},
                "resources": {"has_car": False},
            },
            "healthy": {"adults": 2, "children": 0, "needs": {}, "resources": {"has_car": True}},
        }
        for owner, profile in profiles.items():
            response = client.post(
                "/api/families",
                headers=auth(owner),
                json={
                    "disaster_id": DISASTER,
                    "location": {"latitude": 27.0, "longitude": -81.99},
                    **profile,
                },
            )
            assert response.status_code == 201, response.text
        yield client


def operator(client):
    return client.get(f"{BASE}/evacuation/preview", headers=auth("operator")).json()


def updates(client, who):
    headers = auth(who) if who else {}
    return client.get(f"{BASE}/updates", headers=headers).json()["updates"]


def activity(client):
    return client.get(f"{BASE}/activity", headers=auth("operator")).json()["activity"]


def test_status_is_peace_by_default_and_public(hurricane_client):
    response = hurricane_client.get(f"{BASE}/hurricane")
    assert response.status_code == 200
    assert response.json() == {
        "disaster_id": DISASTER,
        "phase": "peace",
        "hurricane": None,
        "started_at": None,
        "updated_at": None,
    }


@pytest.mark.parametrize(
    ("method", "path", "who"),
    [
        ("get", "hurricane", None),
        ("post", "hurricane/initiate", "operator"),
        ("post", "hurricane/reset", "operator"),
        ("get", "evacuation/preview", "operator"),
    ],
)
def test_unknown_disaster_is_404(hurricane_client, method, path, who):
    response = getattr(hurricane_client, method)(
        f"/api/disasters/missing/{path}", headers=auth(who) if who else {}
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "disaster_not_found"


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "hurricane/initiate"),
        ("post", "hurricane/reset"),
        ("get", "evacuation/preview"),
    ],
)
def test_operator_only_endpoints_enforce_roles(hurricane_client, method, path):
    call = getattr(hurricane_client, method)
    assert call(f"{BASE}/{path}").status_code == 401
    assert call(f"{BASE}/{path}", headers=auth("sick")).status_code == 403
    assert call(f"{BASE}/{path}", headers=auth("operator")).status_code == 200
    assert hurricane_client.get(f"{BASE}/hurricane").json()["phase"] == (
        "active" if path.endswith("initiate") else "peace"
    )


def test_initiate_with_defaults_and_empty_bodies(hurricane_client):
    client = hurricane_client
    response = client.post(f"{BASE}/hurricane/initiate", headers=auth("operator"))
    assert response.status_code == 200, response.text
    status = response.json()
    assert status["phase"] == "active"
    assert status["hurricane"] == {"name": "Hurricane Delia", "category": 4}
    assert status["started_at"].endswith("Z") and status["updated_at"].endswith("Z")
    assert client.get(f"{BASE}/hurricane").json() == status
    client.post(f"{BASE}/hurricane/reset", headers=auth("operator"))
    for body in ({}, {"name": "Hurricane Delia"}):
        response = client.post(f"{BASE}/hurricane/initiate", headers=auth("operator"), json=body)
        assert response.status_code == 200, response.text
        assert response.json()["hurricane"] == {"name": "Hurricane Delia", "category": 4}
        client.post(f"{BASE}/hurricane/reset", headers=auth("operator"))


def test_initiate_with_custom_name_and_category(hurricane_client):
    response = hurricane_client.post(
        f"{BASE}/hurricane/initiate",
        headers=auth("operator"),
        json={"name": "  Hurricane Ida ", "category": 5},
    )
    assert response.status_code == 200
    assert response.json()["hurricane"] == {"name": "Hurricane Ida", "category": 5}


@pytest.mark.parametrize(
    "body",
    [
        {"name": ""},
        {"name": "   "},
        {"name": "x" * 61},
        {"name": None},
        {"category": 0},
        {"category": 6},
        {"category": 2.5},
        {"unknown": 1},
    ],
)
def test_initiate_validation_errors(hurricane_client, body):
    response = hurricane_client.post(
        f"{BASE}/hurricane/initiate", headers=auth("operator"), json=body
    )
    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "invalid_request"
    assert hurricane_client.get(f"{BASE}/hurricane").json()["phase"] == "peace"
    assert updates(hurricane_client, "operator") == []


def test_initiate_creates_broadcast_and_activity_and_conflicts_when_repeated(hurricane_client):
    client = hurricane_client
    response = client.post(
        f"{BASE}/hurricane/initiate",
        headers=auth("operator"),
        json={"name": "Delia", "category": 3},
    )
    assert response.status_code == 200
    with sqlite3.connect(database_path()) as connection:
        update = connection.execute(
            "SELECT id, title, message, severity FROM disaster_updates WHERE disaster_id = ?",
            (DISASTER,),
        ).fetchall()
        assert len(update) == 1
        update_id, title, message, severity = update[0]
        assert title == "Delia evacuation order" and severity == "critical"
        assert message == (
            "Category 3 hurricane. Mandatory evacuation for Coastal County. Open Haven for your "
            "personalized shelter assignment and follow instructions from local officials."
        )
        assert connection.execute(
            "SELECT target_json FROM broadcast_targets WHERE update_id = ?", (update_id,)
        ).fetchall() == [('{"type": "all"}',)]
        stored = connection.execute(
            "SELECT phase, hurricane_name, category, broadcast_update_id FROM hurricane_status"
        ).fetchall()
        assert stored == [("active", "Delia", 3, update_id)]
    entries = {entry["type"]: entry for entry in activity(client)}
    assert {"update_published", "hurricane_initiated"} <= set(entries)
    assert (
        sum(e["type"] in {"update_published", "hurricane_initiated"} for e in activity(client)) == 2
    )
    assert entries["update_published"]["ref"] == {"kind": "update", "id": update_id}
    assert entries["update_published"]["actor"]["name"] == "operator@example.com"
    assert entries["hurricane_initiated"]["ref"] == {"kind": "disaster", "id": DISASTER}
    assert entries["hurricane_initiated"]["summary"] == (
        "Delia (Category 3) initiated: personalized assignments published to 2 households"
    )

    again = client.post(f"{BASE}/hurricane/initiate", headers=auth("operator"))
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "hurricane_already_active"
    assert len(updates(client, "operator")) == 1


def test_families_see_the_evacuation_broadcast(hurricane_client):
    client = hurricane_client
    for who in ("sick", "healthy", "outsider", None):
        assert updates(client, who) == []
    client.post(f"{BASE}/hurricane/initiate", headers=auth("operator"))
    for who in ("sick", "healthy", "outsider", None):
        visible = updates(client, who)
        assert [u["title"] for u in visible] == ["Hurricane Delia evacuation order"]
        assert visible[0]["severity"] == "critical"
    operator_view = updates(client, "operator")
    assert operator_view[0]["target"] == {"type": "all"}


def test_reset_removes_broadcast_and_activity_and_is_idempotent(hurricane_client):
    client = hurricane_client
    baseline = {entry["id"] for entry in activity(client)}
    client.post(f"{BASE}/hurricane/initiate", headers=auth("operator"))
    assert {entry["id"] for entry in activity(client)} > baseline
    for _ in range(2):
        response = client.post(f"{BASE}/hurricane/reset", headers=auth("operator"))
        assert response.status_code == 200
        assert response.json() == {
            "disaster_id": DISASTER,
            "phase": "peace",
            "hurricane": None,
            "started_at": None,
            "updated_at": None,
        }
        assert {entry["id"] for entry in activity(client)} == baseline
        assert updates(client, "operator") == []
    with sqlite3.connect(database_path()) as connection:
        for table in ("disaster_updates", "broadcast_targets", "hurricane_status"):
            assert connection.execute(f"SELECT count(*) FROM {table}").fetchone() == (0,)
    # Households and shelters are kept, and the demo can run again.
    assert len(operator(client)["households"]) == 2
    assert client.post(f"{BASE}/hurricane/initiate", headers=auth("operator")).status_code == 200
    assert len(updates(client, "sick")) == 1


def test_reset_keeps_other_broadcasts_and_disasters(hurricane_client):
    client = hurricane_client
    manual = client.post(
        f"{BASE}/updates",
        headers=auth("operator"),
        json={"title": "Manual", "message": "Keep me", "severity": "info"},
    )
    assert manual.status_code == 201
    client.post(f"{BASE}/hurricane/initiate", headers=auth("operator"))
    client.post("/api/disasters/other/hurricane/initiate", headers=auth("operator"))
    client.post(f"{BASE}/hurricane/reset", headers=auth("operator"))
    assert [u["title"] for u in updates(client, "operator")] == ["Manual"]
    assert client.get("/api/disasters/other/hurricane").json()["phase"] == "active"
    other = client.get("/api/disasters/other/updates", headers=auth("operator")).json()["updates"]
    assert len(other) == 1


def test_preview_shapes_and_policies(hurricane_client):
    client = hurricane_client
    preview = operator(client)
    assert set(preview) == {"disaster_id", "generated_at", "households", "naive", "personalized"}
    assert preview["disaster_id"] == DISASTER and preview["generated_at"].endswith("Z")
    by_people = {h["people"]: h for h in preview["households"]}
    sick, healthy = by_people[3], by_people[2]
    assert set(sick) == {
        "family_id",
        "location",
        "people",
        "has_car",
        "requirements",
        "naive",
        "personalized",
    }
    assert sick["location"] == {"latitude": 27.0, "longitude": -81.99}
    assert sick["has_car"] is False and healthy["has_car"] is True
    assert sick["requirements"] == ["medication", "medical_staff", "pets", "child_friendly"]
    assert healthy["requirements"] == []

    shelters = {row["name"]: row["shelter_id"] for row in preview["naive"]["shelters"]}
    near, far, closed = shelters["Near Gym"], shelters["Far Hospital"], shelters["Closed School"]
    # Nearest ignores needs and skips the closer closed shelter.
    for household in preview["households"]:
        assert household["naive"]["shelter_id"] == near
        assert household["naive"]["distance_km"] > 0
    assert sick["naive"]["unmet"] == ["medication", "medical_staff", "pets"]
    assert healthy["naive"]["unmet"] == []
    # Personalized is exactly what current_assignments holds.
    with sqlite3.connect(database_path()) as connection:
        stored = dict(
            connection.execute(
                "SELECT family_id, shelter_id FROM current_assignments WHERE disaster_id = ?",
                (DISASTER,),
            )
        )
    assert {
        h["family_id"]: h["personalized"]["shelter_id"] for h in preview["households"]
    } == stored
    assert sick["personalized"]["shelter_id"] == far
    assert sick["personalized"]["unmet"] == []
    assert closed not in stored.values()

    naive, personalized = preview["naive"], preview["personalized"]
    assert [row["requirement"] for row in naive["needs"]] == REQUIREMENTS
    assert naive["households"] == 2 and naive["people"] == 5
    assert naive["unmet_households"] == 1 and personalized["unmet_households"] == 0
    assert naive["households_with_needs"] == 1
    assert naive["people_over_capacity"] == 1 and naive["overcrowded_shelters"] == 1
    assert personalized["people_over_capacity"] == 0
    assert naive["travel"]["total_km"] == pytest.approx(
        sum(h["naive"]["distance_km"] for h in preview["households"]), abs=2e-3
    )
    assert personalized["travel"]["mean_km"] > naive["travel"]["mean_km"]
    assert sick["personalized"]["distance_km"] == pytest.approx(
        distance(
            {"location": sick["location"]},
            {"location": {"latitude": 27.0, "longitude": -81.0}},
        ),
        abs=1e-3,
    )


def test_preview_is_phase_independent_and_writes_nothing(hurricane_client):
    client = hurricane_client

    def snapshot():
        with sqlite3.connect(database_path()) as connection:
            return {
                table: connection.execute(f"SELECT * FROM {table} ORDER BY 1, 2").fetchall()
                for table in (
                    "current_assignments",
                    "plans",
                    "activity",
                    "disaster_updates",
                    "hurricane_status",
                    "shelters",
                    "shelter_capacity_budgets",
                    "families",
                )
            }

    before = snapshot()
    peace = operator(client)
    assert snapshot() == before
    client.post(f"{BASE}/hurricane/initiate", headers=auth("operator"))
    after_initiate = snapshot()
    active = operator(client)
    assert snapshot() == after_initiate
    assert peace["households"] == active["households"]
    assert peace["personalized"] == active["personalized"]
