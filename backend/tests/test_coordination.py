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


def seed_family(database, identity, *, adults=2, children=1, latitude=28, longitude=-82,
                needs=None, has_car=False, disaster_id="disaster"):
    needs = needs or {
        "pets": False, "immediate_medication": False, "medical_notes": None,
        "accessibility_notes": None, "other_special_care": None,
    }
    owner_id = "owner-" + identity
    with sqlite3.connect(database) as connection:
        connection.execute(
            "INSERT INTO users VALUES (?, ?, 'unused', 'family', '2026-11-07T00:00:00Z')",
            (owner_id, owner_id + "@example.com"),
        )
        connection.execute(
            "INSERT INTO families VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-11-07T00:00:00Z', '2026-11-07T00:00:00Z')",
            (identity, owner_id, disaster_id, adults, children, latitude, longitude,
             json.dumps(needs), json.dumps({"has_car": has_car})),
        )


def api_shelter(name="Central Shelter", **overrides):
    return {
        "disaster_id": "disaster", "name": name, "address": "100 Main St",
        "location": {"latitude": 28.01, "longitude": -82}, "status": "open",
        "capacity": {"total_people": 20, "available_people": 10},
        "capabilities": {"pets_allowed": True, "child_friendly": True, "wheelchair_accessible": True,
                         "medical_staff": ["nurse"], "special_care_notes": "Can help"},
        "resources": {"medication": "available", "food": "available", "water": "available", "clothes": "unknown"},
    } | overrides


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
    assert plan["capacity_reserved"] is True
    assert "_allocation_fingerprint" not in plan
    assert generate(client).json()["version"] == 2
    assert client.get("/api/families/family/plan", headers=headers()).json() == plan
    assert client.get("/api/families/family/plan?after_version=1", headers=headers()).json() == plan
    response = client.get("/api/families/family/plan?after_version=2&wait_seconds=0", headers=headers())
    assert response.status_code == 204
    assert not response.content
    with sqlite3.connect(database) as connection:
        assert json.loads(connection.execute("SELECT capacity_json FROM shelters WHERE id='nearest'").fetchone()[0])["available_people"] == 7
    changed = client.patch("/api/shelters/nearest", headers=headers("operator"), json={"name": "Renamed"})
    assert changed.status_code == 200
    latest = client.get("/api/families/family/plan", headers=headers()).json()
    assert latest["version"] == 3
    assert latest["shelter"]["name"] == "Renamed"
    changed_resource = client.patch("/api/shelters/nearest", headers=headers("operator"),
                                    json={"resources": {"water": "limited"}})
    assert changed_resource.status_code == 200
    latest = client.get("/api/families/family/plan", headers=headers()).json()
    assert latest["version"] == 4
    assert latest["shelter"]["resources"]["water"] == "limited"
    with sqlite3.connect(database) as connection:
        assert json.loads(connection.execute("SELECT capacity_json FROM shelters WHERE id='nearest'").fetchone()[0])["available_people"] == 7
    current_capacity = client.get("/api/shelters?disaster_id=disaster").json()["shelters"]
    nearest_capacity = next(shelter["capacity"]["available_people"] for shelter in current_capacity if shelter["id"] == "nearest")
    assert nearest_capacity == 7
    capacity_noop = client.patch("/api/shelters/nearest", headers=headers("operator"),
                                 json={"capacity": {"available_people": nearest_capacity}})
    assert capacity_noop.status_code == 200
    assert client.get("/api/families/family/plan", headers=headers()).json()["version"] == 4


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
    assert {response.json()["version"] for response in results} == {1}
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT COUNT(*) FROM plans WHERE family_id='family'").fetchone()[0] == 1
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
        created = client.post("/api/shelters", headers=headers("operator"), json=api_shelter())
        assert created.status_code == 201, created.text
        updated = client.get("/api/families/family/plan", headers=headers()).json()
        response = future.result(timeout=3)
    assert response.status_code == 200
    assert response.json() == updated
    assert updated["version"] == 2
    assert updated["capacity_reserved"] is True


def test_concurrent_families_cannot_oversubscribe_shared_capacity(coordination_client):
    client, database = coordination_client
    seed_family(database, "family-two")
    seed_shelter(database, "only-three-places", available=3)

    def create_plan(family_id):
        return client.post(f"/api/families/{family_id}/plan/generate", headers=headers("operator"))

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(create_plan, ("family", "family-two")))
    assert all(response.status_code == 200 for response in responses)
    plans = [client.get(f"/api/families/{identity}/plan", headers=headers("operator")).json()
             for identity in ("family", "family-two")]
    assert sum(plan["capacity_reserved"] for plan in plans) == 1
    assert sum(plan["status"] == "recommended" for plan in plans) == 1
    with sqlite3.connect(database) as connection:
        remaining = json.loads(connection.execute(
            "SELECT capacity_json FROM shelters WHERE id='only-three-places'"
        ).fetchone()[0])["available_people"]
    assert remaining == 0


def test_profile_reassignment_and_shelter_close_release_capacity(coordination_client):
    client, database = coordination_client
    seed_shelter(database, "near", latitude=28.01)
    seed_shelter(database, "far", latitude=29)
    first = generate(client).json()
    assert first["shelter"]["id"] == "near"
    assert first["capacity_reserved"] is True

    moved = client.patch("/api/families/family", headers=headers(), json={"location": {"latitude": 29}})
    assert moved.status_code == 200, moved.text
    reassigned = client.get("/api/families/family/plan", headers=headers()).json()
    assert reassigned["version"] == first["version"] + 1
    assert reassigned["shelter"]["id"] == "far"
    with sqlite3.connect(database) as connection:
        capacities = {identity: json.loads(raw)["available_people"] for identity, raw in connection.execute(
            "SELECT id, capacity_json FROM shelters WHERE id IN ('near', 'far')"
        )}
    assert capacities == {"near": 10, "far": 7}

    closed = client.patch("/api/shelters/far", headers=headers("operator"), json={"status": "closed"})
    assert closed.status_code == 200, closed.text
    closed_view = next(shelter for shelter in client.get("/api/shelters?disaster_id=disaster").json()["shelters"]
                       if shelter["id"] == "far")
    roundtrip = client.patch("/api/shelters/far", headers=headers("operator"), json={
        "name": "Far Shelter Updated", "capacity": closed_view["capacity"],
    })
    assert roundtrip.status_code == 200, roundtrip.text
    with sqlite3.connect(database) as connection:
        assert connection.execute(
            "SELECT allocation_budget FROM shelter_capacity_budgets WHERE shelter_id='far'"
        ).fetchone()[0] == 10
    moved_back = client.get("/api/families/family/plan", headers=headers()).json()
    assert moved_back["version"] == reassigned["version"] + 1
    assert moved_back["status"] == "recommended"
    assert moved_back["shelter"]["id"] == "near"
    assert moved_back["capacity_reserved"] is True
    with sqlite3.connect(database) as connection:
        capacities_after_close = {identity: json.loads(raw)["available_people"] for identity, raw in connection.execute(
            "SELECT id, capacity_json FROM shelters WHERE id IN ('near', 'far')"
        )}
    assert capacities_after_close == {"near": 7, "far": 10}
    with sqlite3.connect(database) as connection:
        assert connection.execute(
            "SELECT allocation_budget FROM shelter_capacity_budgets WHERE shelter_id='far'"
        ).fetchone()[0] == 10

    closed = client.patch("/api/shelters/near", headers=headers("operator"), json={"status": "closed"})
    assert closed.status_code == 200, closed.text
    no_match = client.get("/api/families/family/plan", headers=headers()).json()
    assert no_match["version"] == moved_back["version"] + 1
    assert no_match["status"] == "no_match"
    assert no_match["capacity_reserved"] is False
    with sqlite3.connect(database) as connection:
        assert json.loads(connection.execute(
            "SELECT capacity_json FROM shelters WHERE id='near'"
        ).fetchone()[0])["available_people"] == 10
        assert connection.execute(
            "SELECT allocation_budget FROM shelter_capacity_budgets WHERE shelter_id='near'"
        ).fetchone()[0] == 10

    reopened = client.patch("/api/shelters/far", headers=headers("operator"), json={"status": "open"})
    assert reopened.status_code == 200, reopened.text
    restored = client.get("/api/families/family/plan", headers=headers()).json()
    assert restored["version"] == no_match["version"] + 1
    assert restored["status"] == "recommended"
    assert restored["shelter"]["id"] == "far"
    shelters = client.get("/api/shelters?disaster_id=disaster").json()["shelters"]
    assert next(shelter for shelter in shelters if shelter["id"] == "far")["capacity"]["available_people"] == 7


def test_family_disaster_move_releases_source_and_reserves_target(coordination_client):
    client, database = coordination_client
    seed_shelter(database, "source", available=3)
    seed_shelter(database, "target", disaster_id="other", latitude=28.1, available=10)
    initial = generate(client).json()
    assert initial["shelter"]["id"] == "source"
    with sqlite3.connect(database) as connection:
        assert json.loads(connection.execute(
            "SELECT capacity_json FROM shelters WHERE id='source'"
        ).fetchone()[0])["available_people"] == 0

    moved = client.patch("/api/families/family", headers=headers(), json={"disaster_id": "other"})
    assert moved.status_code == 200, moved.text
    updated = client.get("/api/families/family/plan", headers=headers()).json()
    assert updated["version"] == initial["version"] + 1
    assert updated["disaster_id"] == "other"
    assert updated["shelter"]["id"] == "target"
    with sqlite3.connect(database) as connection:
        source_free = json.loads(connection.execute(
            "SELECT capacity_json FROM shelters WHERE id='source'"
        ).fetchone()[0])["available_people"]
        target_free = json.loads(connection.execute(
            "SELECT capacity_json FROM shelters WHERE id='target'"
        ).fetchone()[0])["available_people"]
        assignment = connection.execute(
            "SELECT disaster_id, shelter_id, people FROM current_assignments WHERE family_id='family'"
        ).fetchone()
    assert (source_free, target_free) == (3, 7)
    assert assignment == ("other", "target", 3)


def test_shelter_disaster_move_replans_both_disaster_pools(coordination_client):
    client, database = coordination_client
    seed_family(database, "other-family", adults=2, children=1, latitude=28, longitude=-82,
                has_car=True, disaster_id="other")
    seed_shelter(database, "moving-shelter", latitude=28.01, available=3)
    seed_shelter(database, "other-shelter", disaster_id="other", latitude=29, available=3)
    active_initial = generate(client).json()
    other_initial_response = client.post(
        "/api/families/other-family/plan/generate", headers=headers("operator"),
    )
    assert other_initial_response.status_code == 200
    other_initial = other_initial_response.json()
    assert active_initial["shelter"]["id"] == "moving-shelter"
    assert other_initial["shelter"]["id"] == "other-shelter"

    moved = client.patch("/api/shelters/moving-shelter", headers=headers("operator"),
                         json={"disaster_id": "other"})
    assert moved.status_code == 200, moved.text
    active_plan = client.get("/api/families/family/plan", headers=headers()).json()
    other_plan = client.get("/api/families/other-family/plan", headers=headers("operator")).json()
    assert active_plan["version"] == active_initial["version"] + 1
    assert active_plan["status"] == "no_match"
    assert other_plan["version"] == other_initial["version"] + 1
    assert other_plan["shelter"]["id"] == "moving-shelter"
    with sqlite3.connect(database) as connection:
        assignments = dict(connection.execute(
            "SELECT family_id, shelter_id FROM current_assignments"
        ).fetchall())
        capacities = {identity: json.loads(raw)["available_people"] for identity, raw in connection.execute(
            "SELECT id, capacity_json FROM shelters"
        )}
    assert assignments == {"family": None, "other-family": "moving-shelter"}
    assert capacities == {"moving-shelter": 0, "other-shelter": 3}


def test_bounded_relocation_uses_fragmented_shelter_capacity(coordination_client):
    client, database = coordination_client
    no_special_needs = {
        "pets": False, "immediate_medication": False, "medical_notes": None,
        "accessibility_notes": None, "other_special_care": None,
    }
    with sqlite3.connect(database) as connection:
        connection.execute(
            "UPDATE families SET adults = 3, children = 0, needs_json = ?, resources_json = ? WHERE id = 'family'",
            (json.dumps(no_special_needs), json.dumps({"has_car": True})),
        )
    seed_family(database, "four-person", adults=4, children=0, needs=no_special_needs, has_car=True)
    seed_family(database, "third-family", adults=3, children=0, needs=no_special_needs, has_car=True)
    seed_shelter(database, "near", latitude=28.01, available=6)
    seed_shelter(database, "far", latitude=28.2, available=4)

    response = client.post("/api/families/family/plan/generate", headers=headers("operator"))
    assert response.status_code == 200, response.text
    with sqlite3.connect(database) as connection:
        rows = connection.execute(
            "SELECT family_id, shelter_id, people FROM current_assignments ORDER BY family_id"
        ).fetchall()
        free = {identity: json.loads(raw)["available_people"] for identity, raw in connection.execute(
            "SELECT id, capacity_json FROM shelters"
        )}
    assert len(rows) == 3
    assert all(shelter_id is not None for _, shelter_id, _ in rows)
    assert sum(people for _, _, people in rows) == 10
    assert free == {"near": 0, "far": 0}


def test_failed_automatic_reallocation_rolls_back_profile_and_reservations(coordination_client, monkeypatch):
    import haven.routers.families as family_routes

    client, database = coordination_client
    seed_shelter(database, "only", available=10)
    original = generate(client).json()
    assert original["capacity_reserved"] is True
    original_recompute = family_routes.recompute_disasters

    async def fail_reallocation(connection, disaster_ids):
        raise RuntimeError("injected allocation failure")

    monkeypatch.setattr(family_routes, "recompute_disasters", fail_reallocation)
    response = client.patch("/api/families/family", headers=headers(), json={"location": {"latitude": 29}})
    assert response.status_code == 500
    monkeypatch.setattr(family_routes, "recompute_disasters", original_recompute)

    assert client.get("/api/families/family", headers=headers()).json()["location"]["latitude"] == 28
    assert client.get("/api/families/family/plan", headers=headers()).json() == original
    with sqlite3.connect(database) as connection:
        free = json.loads(connection.execute(
            "SELECT capacity_json FROM shelters WHERE id='only'"
        ).fetchone()[0])["available_people"]
        assignment = connection.execute(
            "SELECT shelter_id, people FROM current_assignments WHERE family_id='family'"
        ).fetchone()
    assert free == 7
    assert assignment == ("only", 3)


def test_global_allocator_preserves_scarce_capability_for_constrained_family(coordination_client):
    client, database = coordination_client
    constrained = {
        "pets": False, "immediate_medication": False, "medical_notes": None,
        "accessibility_notes": "Wheelchair", "other_special_care": None,
    }
    with sqlite3.connect(database) as connection:
        connection.execute(
            "UPDATE families SET adults = 3, children = 0, needs_json = ?, resources_json = ? WHERE id = 'family'",
            (json.dumps(constrained), json.dumps({"has_car": False})),
        )
    seed_family(database, "flexible", adults=3, children=0)
    seed_shelter(database, "specialist", latitude=28.01, available=3)
    seed_shelter(database, "general", latitude=28.1, available=3, wheelchair=False)

    assert client.post("/api/families/flexible/plan/generate", headers=headers("operator")).status_code == 200
    constrained_plan = client.get("/api/families/family/plan", headers=headers("operator")).json()
    flexible_plan = client.get("/api/families/flexible/plan", headers=headers("operator")).json()
    assert constrained_plan["shelter"]["id"] == "specialist"
    assert flexible_plan["shelter"]["id"] == "general"
    assert constrained_plan["capacity_reserved"] and flexible_plan["capacity_reserved"]


def test_shared_scarcity_prefers_closer_shelter_for_family_without_car(coordination_client):
    client, database = coordination_client
    seed_family(database, "car-family", adults=2, children=1, has_car=True)
    seed_family(database, "no-car-family", adults=2, children=1, has_car=False)
    seed_shelter(database, "near", latitude=28.01, available=3, pets=False)
    seed_shelter(database, "far", latitude=28.2, available=3, pets=False)

    assert client.post("/api/families/car-family/plan/generate", headers=headers("operator")).status_code == 200
    no_car_plan = client.get("/api/families/no-car-family/plan", headers=headers("operator")).json()
    car_plan = client.get("/api/families/car-family/plan", headers=headers("operator")).json()
    assert no_car_plan["shelter"]["id"] == "near"
    assert car_plan["shelter"]["id"] == "far"
    assert no_car_plan["capacity_reserved"] and car_plan["capacity_reserved"]


def test_family_profile_changes_auto_version_plan_and_identical_inputs_do_not_churn(coordination_client):
    client, _ = coordination_client
    assert generate(client).json()["version"] == 1
    created = client.post("/api/shelters", headers=headers("operator"), json=api_shelter())
    assert created.status_code == 201, created.text
    original = client.get("/api/families/family/plan", headers=headers()).json()
    assert original["version"] == 2
    same = client.patch("/api/families/family", headers=headers(), json={"resources": {"has_car": True}})
    assert same.status_code == 200
    assert generate(client).json()["version"] == 2

    changed = client.patch("/api/families/family", headers=headers(), json={"resources": {"has_car": False}})
    assert changed.status_code == 200
    updated = client.get("/api/families/family/plan", headers=headers()).json()
    assert updated["version"] == 3
    assert updated["instructions"] != original["instructions"]
    assert "transportation" in " ".join(updated["instructions"]).lower()
