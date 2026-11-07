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
            for identity, role in (
                ("owner", "family"),
                ("stranger", "family"),
                ("operator", "operator"),
            ):
                connection.execute(
                    "INSERT INTO users VALUES (?, ?, 'unused', ?, '2026-11-07T00:00:00Z')",
                    (identity, identity + "@example.com", role),
                )
                connection.execute(
                    "INSERT INTO sessions VALUES (?, ?, ?, '2099-01-01T00:00:00Z', NULL)",
                    (identity, identity, token_hash(identity)),
                )
            for identity in ("disaster", "other"):
                connection.execute(
                    "INSERT INTO disasters VALUES (?, 'hurricane', 'Haven', 'active', 'County', '2026-11-07T00:00:00Z')",
                    (identity,),
                )
            connection.execute(
                "INSERT INTO families VALUES ('family', 'owner', 'disaster', 2, 1, 28, -82, ?, ?, '2026-11-07T00:00:00Z', '2026-11-07T00:00:00Z')",
                (
                    json.dumps(
                        {
                            "pets": True,
                            "immediate_medication": True,
                            "medical_notes": "Insulin",
                            "accessibility_notes": "Wheelchair",
                            "other_special_care": None,
                        }
                    ),
                    json.dumps({"has_car": True}),
                ),
            )
        yield client, database


def headers(identity="owner"):
    return {"Authorization": "Bearer " + identity}


def seed_shelter(database, identity="shelter", **overrides):
    data = {
        "disaster_id": "disaster",
        "latitude": 28.1,
        "longitude": -82,
        "status": "open",
        "available": 10,
        "pets": True,
        "children": True,
        "wheelchair": True,
        "staff": ["nurse"],
        "medication": "available",
        "special_care": None,
    } | overrides
    with sqlite3.connect(database) as connection:
        connection.execute(
            "INSERT INTO shelters VALUES (?, ?, ?, '100 Main St', ?, ?, ?, ?, ?, ?, '2026-11-07T00:00:00Z')",
            (
                identity,
                data["disaster_id"],
                identity,
                data["latitude"],
                data["longitude"],
                data["status"],
                json.dumps({"total_people": 20, "available_people": data["available"]}),
                json.dumps(
                    {
                        "pets_allowed": data["pets"],
                        "child_friendly": data["children"],
                        "wheelchair_accessible": data["wheelchair"],
                        "medical_staff": data["staff"],
                        "special_care_notes": data["special_care"],
                    }
                ),
                json.dumps(
                    {
                        "medication": data["medication"],
                        "food": "available",
                        "water": "available",
                        "clothes": "unknown",
                    }
                ),
            ),
        )


def seed_family(
    database,
    identity,
    *,
    adults=2,
    children=1,
    latitude=28,
    longitude=-82,
    needs=None,
    has_car=False,
    disaster_id="disaster",
):
    needs = needs or {
        "pets": False,
        "immediate_medication": False,
        "medical_notes": None,
        "accessibility_notes": None,
        "other_special_care": None,
    }
    owner_id = "owner-" + identity
    with sqlite3.connect(database) as connection:
        connection.execute(
            "INSERT INTO users VALUES (?, ?, 'unused', 'family', '2026-11-07T00:00:00Z')",
            (owner_id, owner_id + "@example.com"),
        )
        connection.execute(
            "INSERT INTO families VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-11-07T00:00:00Z', '2026-11-07T00:00:00Z')",
            (
                identity,
                owner_id,
                disaster_id,
                adults,
                children,
                latitude,
                longitude,
                json.dumps(needs),
                json.dumps({"has_car": has_car}),
            ),
        )


def api_shelter(name="Central Shelter", **overrides):
    return {
        "disaster_id": "disaster",
        "name": name,
        "address": "100 Main St",
        "location": {"latitude": 28.01, "longitude": -82},
        "status": "open",
        "capacity": {"total_people": 20, "available_people": 10},
        "capabilities": {
            "pets_allowed": True,
            "child_friendly": True,
            "wheelchair_accessible": True,
            "medical_staff": ["nurse"],
            "special_care_notes": "Can help",
        },
        "resources": {
            "medication": "available",
            "food": "available",
            "water": "available",
            "clothes": "unknown",
        },
    } | overrides


def generate(client):
    return client.post("/api/families/family/plan/generate", headers=headers())


def test_plan_versions_matching_and_snapshot(coordination_client):
    client, database = coordination_client
    assert (
        client.get("/api/families/family/plan", headers=headers()).json()["error"]["code"]
        == "plan_not_found"
    )
    first = generate(client)
    assert first.status_code == 200
    assert first.json()["status"] == "no_match"
    assert first.json()["version"] == 1
    assert first.json()["alerts"][0]["code"] == "no_open_shelter"
    assert first.json()["alerts"][0]["severity"] == "critical"
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
    response = client.get(
        "/api/families/family/plan?after_version=2&wait_seconds=0", headers=headers()
    )
    assert response.status_code == 204
    assert not response.content
    with sqlite3.connect(database) as connection:
        assert (
            json.loads(
                connection.execute(
                    "SELECT capacity_json FROM shelters WHERE id='nearest'"
                ).fetchone()[0]
            )["available_people"]
            == 7
        )
    changed = client.patch(
        "/api/shelters/nearest", headers=headers("operator"), json={"name": "Renamed"}
    )
    assert changed.status_code == 200
    latest = client.get("/api/families/family/plan", headers=headers()).json()
    assert latest["version"] == 3
    assert latest["shelter"]["name"] == "Renamed"
    changed_resource = client.patch(
        "/api/shelters/nearest",
        headers=headers("operator"),
        json={"resources": {"water": "limited"}},
    )
    assert changed_resource.status_code == 200
    latest = client.get("/api/families/family/plan", headers=headers()).json()
    assert latest["version"] == 4
    assert latest["shelter"]["resources"]["water"] == "limited"
    with sqlite3.connect(database) as connection:
        assert (
            json.loads(
                connection.execute(
                    "SELECT capacity_json FROM shelters WHERE id='nearest'"
                ).fetchone()[0]
            )["available_people"]
            == 7
        )
    current_capacity = client.get("/api/shelters?disaster_id=disaster").json()["shelters"]
    nearest_capacity = next(
        shelter["capacity"]["available_people"]
        for shelter in current_capacity
        if shelter["id"] == "nearest"
    )
    assert nearest_capacity == 7
    capacity_noop = client.patch(
        "/api/shelters/nearest",
        headers=headers("operator"),
        json={"capacity": {"available_people": nearest_capacity}},
    )
    assert capacity_noop.status_code == 200
    assert client.get("/api/families/family/plan", headers=headers()).json()["version"] == 4


def test_plan_access_and_poll_validation(coordination_client):
    client, _ = coordination_client
    for suffix in ("/plan", "/plan/generate"):
        method = client.post if suffix.endswith("generate") else client.get
        assert method("/api/families/family" + suffix).status_code == 401
        assert (
            method("/api/families/family" + suffix, headers=headers("stranger")).status_code == 403
        )
    assert client.post("/api/families/missing/plan/generate", headers=headers()).status_code == 404
    assert (
        client.post("/api/families/family/plan/generate", headers=headers("operator")).status_code
        == 200
    )
    for query in ("after_version=-1", "wait_seconds=-1", "wait_seconds=26"):
        assert (
            client.get("/api/families/family/plan?" + query, headers=headers()).status_code == 400
        )


def test_report_retries_conflicts_and_operator_listing(coordination_client):
    client, database = coordination_client
    payload = {
        "type": "need_help",
        "message": "Need transport",
        "location": {"latitude": 28, "longitude": -82},
        "client_request_id": "retry-once",
    }
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
    assert client.get("/api/disasters/disaster/reports", headers=headers("operator")).json() == {
        "reports": [first.json()]
    }
    assert client.get("/api/disasters/other/reports", headers=headers("operator")).json() == {
        "reports": []
    }
    assert (
        client.get("/api/disasters/missing/reports", headers=headers("operator")).status_code == 404
    )
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT COUNT(*) FROM reports").fetchone()[0] == 1
    activity_url = "/api/disasters/disaster/activity"
    assert client.get(activity_url).status_code == 401
    assert client.get(activity_url, headers=headers()).status_code == 403
    events = client.get(activity_url, headers=headers("operator")).json()["activity"]
    assert len(events) == 1
    assert events[0]["type"] == "report_received"
    assert events[0]["ref"] == {"kind": "report", "id": first.json()["id"]}
    assert events[0]["actor"] == {"kind": "family", "id": "family", "name": "Household"}
    assert client.get("/api/disasters/other/activity", headers=headers("operator")).json() == {
        "activity": []
    }
    assert (
        client.get("/api/disasters/missing/activity", headers=headers("operator")).status_code
        == 404
    )
    assert client.get(activity_url + "?limit=0", headers=headers("operator")).status_code == 400
    for change in (
        {"type": "invalid"},
        {"message": " "},
        {"client_request_id": ""},
        {"location": {"latitude": 91, "longitude": 0}},
    ):
        assert client.post(path, headers=headers(), json=payload | change).status_code == 400


def test_concurrent_plan_versions_and_report_retries(coordination_client):
    client, database = coordination_client
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: generate(client), range(4)))
    assert {response.json()["version"] for response in results} == {1}
    with sqlite3.connect(database) as connection:
        assert (
            connection.execute("SELECT COUNT(*) FROM plans WHERE family_id='family'").fetchone()[0]
            == 1
        )
    payload = {
        "type": "other",
        "message": "Concurrent retry",
        "location": {"latitude": 0, "longitude": 0},
        "client_request_id": "concurrent",
    }
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(
            pool.map(
                lambda _: client.post(
                    "/api/families/family/reports", headers=headers(), json=payload
                ),
                range(4),
            )
        )
    assert all(response.status_code == 201 for response in results)
    assert len({response.json()["id"] for response in results}) == 1


def test_plan_poll_wakes_for_new_version(coordination_client, monkeypatch):
    import threading

    from haven.routers import coordination

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
        future = pool.submit(
            client.get,
            "/api/families/family/plan?after_version=1&wait_seconds=2",
            headers=headers(),
        )
        assert sleeping.wait(timeout=1)
        created = client.post("/api/shelters", headers=headers("operator"), json=api_shelter())
        assert created.status_code == 201, created.text
        updated = client.get("/api/families/family/plan", headers=headers()).json()
        response = future.result(timeout=3)
    assert response.status_code == 200
    assert response.json() == updated
    assert updated["version"] == 2
    assert updated["capacity_reserved"] is True


def test_concurrent_families_are_assigned_with_overflow_alert(coordination_client):
    client, database = coordination_client
    seed_family(database, "family-two")
    seed_shelter(database, "only-three-places", available=3)
    with sqlite3.connect(database) as connection:
        connection.execute(
            "UPDATE shelters SET capacity_json=? WHERE id='only-three-places'",
            (json.dumps({"total_people": 3, "available_people": 3}),),
        )

    def create_plan(family_id):
        return client.post(f"/api/families/{family_id}/plan/generate", headers=headers("operator"))

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(create_plan, ("family", "family-two")))
    assert all(response.status_code == 200 for response in responses)
    plans = [
        client.get(f"/api/families/{identity}/plan", headers=headers("operator")).json()
        for identity in ("family", "family-two")
    ]
    assert sum(plan["capacity_reserved"] for plan in plans) == 2
    assert all(plan["status"] == "recommended" for plan in plans)
    for plan in plans:
        overflow = next(
            alert for alert in plan["alerts"] if alert["code"] == "shelter_capacity_overflow"
        )
        assert overflow["severity"] == "critical"
        assert overflow["people_over_capacity"] == 3
    with sqlite3.connect(database) as connection:
        remaining = json.loads(
            connection.execute(
                "SELECT capacity_json FROM shelters WHERE id='only-three-places'"
            ).fetchone()[0]
        )["available_people"]
        assigned = connection.execute(
            "SELECT SUM(people) FROM current_assignments WHERE shelter_id='only-three-places'"
        ).fetchone()[0]
    assert remaining == 0
    assert assigned == 6


def test_profile_change_preserves_reservation_and_shelter_close_releases_capacity(
    coordination_client,
):
    client, database = coordination_client
    seed_shelter(database, "near", latitude=28.01)
    seed_shelter(database, "far", latitude=29)
    first = generate(client).json()
    assert first["shelter"]["id"] == "near"
    assert first["capacity_reserved"] is True

    moved = client.patch(
        "/api/families/family", headers=headers(), json={"location": {"latitude": 29}}
    )
    assert moved.status_code == 200, moved.text
    reassigned = client.get("/api/families/family/plan", headers=headers()).json()
    assert reassigned["version"] == first["version"] + 1
    assert reassigned["shelter"]["id"] == "near"
    with sqlite3.connect(database) as connection:
        capacities = {
            identity: json.loads(raw)["available_people"]
            for identity, raw in connection.execute(
                "SELECT id, capacity_json FROM shelters WHERE id IN ('near', 'far')"
            )
        }
    assert capacities == {"near": 7, "far": 10}

    closed = client.patch(
        "/api/shelters/far", headers=headers("operator"), json={"status": "closed"}
    )
    assert closed.status_code == 200, closed.text
    closed_view = next(
        shelter
        for shelter in client.get("/api/shelters?disaster_id=disaster").json()["shelters"]
        if shelter["id"] == "far"
    )
    roundtrip = client.patch(
        "/api/shelters/far",
        headers=headers("operator"),
        json={
            "name": "Far Shelter Updated",
            "capacity": closed_view["capacity"],
        },
    )
    assert roundtrip.status_code == 200, roundtrip.text
    with sqlite3.connect(database) as connection:
        assert (
            connection.execute(
                "SELECT allocation_budget FROM shelter_capacity_budgets WHERE shelter_id='far'"
            ).fetchone()[0]
            == 10
        )
    moved_back = client.get("/api/families/family/plan", headers=headers()).json()
    assert moved_back["version"] == reassigned["version"]
    assert moved_back["status"] == "recommended"
    assert moved_back["shelter"]["id"] == "near"
    assert moved_back["capacity_reserved"] is True
    with sqlite3.connect(database) as connection:
        capacities_after_close = {
            identity: json.loads(raw)["available_people"]
            for identity, raw in connection.execute(
                "SELECT id, capacity_json FROM shelters WHERE id IN ('near', 'far')"
            )
        }
    assert capacities_after_close == {"near": 7, "far": 10}
    with sqlite3.connect(database) as connection:
        assert (
            connection.execute(
                "SELECT allocation_budget FROM shelter_capacity_budgets WHERE shelter_id='far'"
            ).fetchone()[0]
            == 10
        )

    closed = client.patch(
        "/api/shelters/near", headers=headers("operator"), json={"status": "closed"}
    )
    assert closed.status_code == 200, closed.text
    no_match = client.get("/api/families/family/plan", headers=headers()).json()
    assert no_match["version"] == moved_back["version"] + 1
    assert no_match["status"] == "no_match"
    assert no_match["capacity_reserved"] is False
    assert no_match["alerts"][0]["code"] == "no_open_shelter"
    with sqlite3.connect(database) as connection:
        assert (
            json.loads(
                connection.execute("SELECT capacity_json FROM shelters WHERE id='near'").fetchone()[
                    0
                ]
            )["available_people"]
            == 10
        )
        assert (
            connection.execute(
                "SELECT allocation_budget FROM shelter_capacity_budgets WHERE shelter_id='near'"
            ).fetchone()[0]
            == 10
        )

    reopened = client.patch(
        "/api/shelters/far", headers=headers("operator"), json={"status": "open"}
    )
    assert reopened.status_code == 200, reopened.text
    restored = client.get("/api/families/family/plan", headers=headers()).json()
    assert restored["version"] == no_match["version"] + 1
    assert restored["status"] == "recommended"
    assert restored["shelter"]["id"] == "far"
    shelters = client.get("/api/shelters?disaster_id=disaster").json()["shelters"]
    assert (
        next(shelter for shelter in shelters if shelter["id"] == "far")["capacity"][
            "available_people"
        ]
        == 7
    )


def test_family_disaster_move_releases_source_and_reserves_target(coordination_client):
    client, database = coordination_client
    seed_shelter(database, "source", available=3)
    seed_shelter(database, "target", disaster_id="other", latitude=28.1, available=10)
    initial = generate(client).json()
    assert initial["shelter"]["id"] == "source"
    with sqlite3.connect(database) as connection:
        assert (
            json.loads(
                connection.execute(
                    "SELECT capacity_json FROM shelters WHERE id='source'"
                ).fetchone()[0]
            )["available_people"]
            == 0
        )

    moved = client.patch("/api/families/family", headers=headers(), json={"disaster_id": "other"})
    assert moved.status_code == 200, moved.text
    updated = client.get("/api/families/family/plan", headers=headers()).json()
    assert updated["version"] == initial["version"] + 1
    assert updated["disaster_id"] == "other"
    assert updated["shelter"]["id"] == "target"
    with sqlite3.connect(database) as connection:
        source_free = json.loads(
            connection.execute("SELECT capacity_json FROM shelters WHERE id='source'").fetchone()[0]
        )["available_people"]
        target_free = json.loads(
            connection.execute("SELECT capacity_json FROM shelters WHERE id='target'").fetchone()[0]
        )["available_people"]
        assignment = connection.execute(
            "SELECT disaster_id, shelter_id, people FROM current_assignments WHERE family_id='family'"
        ).fetchone()
    assert (source_free, target_free) == (3, 7)
    assert assignment == ("other", "target", 3)


def test_shelter_disaster_move_preserves_other_pool_reservations(coordination_client):
    client, database = coordination_client
    seed_family(
        database,
        "other-family",
        adults=2,
        children=1,
        latitude=28,
        longitude=-82,
        has_car=True,
        disaster_id="other",
    )
    seed_shelter(database, "moving-shelter", latitude=28.01, available=3)
    seed_shelter(database, "other-shelter", disaster_id="other", latitude=29, available=3)
    active_initial = generate(client).json()
    other_initial_response = client.post(
        "/api/families/other-family/plan/generate",
        headers=headers("operator"),
    )
    assert other_initial_response.status_code == 200
    other_initial = other_initial_response.json()
    assert active_initial["shelter"]["id"] == "moving-shelter"
    assert other_initial["shelter"]["id"] == "other-shelter"

    moved = client.patch(
        "/api/shelters/moving-shelter", headers=headers("operator"), json={"disaster_id": "other"}
    )
    assert moved.status_code == 200, moved.text
    active_plan = client.get("/api/families/family/plan", headers=headers()).json()
    other_plan = client.get("/api/families/other-family/plan", headers=headers("operator")).json()
    assert active_plan["version"] == active_initial["version"] + 1
    assert active_plan["status"] == "no_match"
    assert other_plan["version"] == other_initial["version"]
    assert other_plan["shelter"]["id"] == "other-shelter"
    with sqlite3.connect(database) as connection:
        assignments = dict(
            connection.execute("SELECT family_id, shelter_id FROM current_assignments").fetchall()
        )
        capacities = {
            identity: json.loads(raw)["available_people"]
            for identity, raw in connection.execute("SELECT id, capacity_json FROM shelters")
        }
    assert assignments == {"family": None, "other-family": "other-shelter"}
    assert capacities == {"moving-shelter": 3, "other-shelter": 0}


def test_bounded_relocation_uses_fragmented_shelter_capacity(coordination_client):
    client, database = coordination_client
    no_special_needs = {
        "pets": False,
        "immediate_medication": False,
        "medical_notes": None,
        "accessibility_notes": None,
        "other_special_care": None,
    }
    with sqlite3.connect(database) as connection:
        connection.execute(
            "UPDATE families SET adults = 3, children = 0, needs_json = ?, resources_json = ? WHERE id = 'family'",
            (json.dumps(no_special_needs), json.dumps({"has_car": True})),
        )
    seed_family(database, "four-person", adults=4, children=0, needs=no_special_needs, has_car=True)
    seed_family(
        database, "third-family", adults=3, children=0, needs=no_special_needs, has_car=True
    )
    seed_shelter(database, "near", latitude=28.01, available=6)
    seed_shelter(database, "far", latitude=28.2, available=4)

    response = client.post("/api/families/family/plan/generate", headers=headers("operator"))
    assert response.status_code == 200, response.text
    with sqlite3.connect(database) as connection:
        rows = connection.execute(
            "SELECT family_id, shelter_id, people FROM current_assignments ORDER BY family_id"
        ).fetchall()
        free = {
            identity: json.loads(raw)["available_people"]
            for identity, raw in connection.execute("SELECT id, capacity_json FROM shelters")
        }
    assert len(rows) == 3
    assert all(shelter_id is not None for _, shelter_id, _ in rows)
    assert sum(people for _, _, people in rows) == 10
    assert free == {"near": 0, "far": 0}


def test_allocator_moves_incumbent_to_place_waiting_household(coordination_client, monkeypatch):
    import haven.allocation_policy as allocation_policy

    monkeypatch.setattr(allocation_policy, "_MAX_REFINEMENT_FAMILIES", 0)
    client, database = coordination_client
    no_needs = {
        "pets": False,
        "immediate_medication": False,
        "medical_notes": None,
        "accessibility_notes": None,
        "other_special_care": None,
    }
    with sqlite3.connect(database) as connection:
        # Keep the existing household first in priority through its medication need.
        connection.execute(
            "UPDATE families SET adults=3, children=0, needs_json=?, resources_json=? WHERE id='family'",
            (
                json.dumps({**no_needs, "immediate_medication": True}),
                json.dumps({"has_car": True}),
            ),
        )
    seed_family(database, "waiting", adults=4, children=0, needs=no_needs, has_car=True)
    seed_shelter(database, "near", latitude=28.01, available=6)
    seed_shelter(database, "far", latitude=28.2, available=3)

    response = client.post("/api/families/family/plan/generate", headers=headers("operator"))
    assert response.status_code == 200, response.text
    with sqlite3.connect(database) as connection:
        assignments = dict(
            connection.execute(
                "SELECT family_id, shelter_id FROM current_assignments WHERE disaster_id='disaster'"
            ).fetchall()
        )
        free = {
            identity: json.loads(raw)["available_people"]
            for identity, raw in connection.execute("SELECT id, capacity_json FROM shelters")
        }
    assert assignments == {"family": "far", "waiting": "near"}
    assert free == {"near": 2, "far": 0}


def test_allocator_uses_two_shelter_exchange_to_place_waiting_household(
    coordination_client, monkeypatch
):
    import haven.allocation_policy as allocation_policy

    monkeypatch.setattr(allocation_policy, "_MAX_REFINEMENT_FAMILIES", 0)
    client, database = coordination_client
    no_needs = {
        "pets": False,
        "immediate_medication": False,
        "medical_notes": None,
        "accessibility_notes": None,
        "other_special_care": None,
    }
    with sqlite3.connect(database) as connection:
        connection.execute(
            "UPDATE families SET adults=4, children=0, resources_json=? WHERE id='family'",
            (json.dumps({"has_car": True}),),
        )
    seed_family(database, "second", adults=3, children=0, needs=no_needs, has_car=False)
    seed_family(database, "waiting", adults=3, children=0, needs=no_needs, has_car=False)
    seed_shelter(database, "near", latitude=28.01, available=6)
    seed_shelter(database, "far", latitude=28.2, available=4)

    response = client.post("/api/families/family/plan/generate", headers=headers("operator"))
    assert response.status_code == 200, response.text
    with sqlite3.connect(database) as connection:
        assignments = dict(
            connection.execute(
                "SELECT family_id, shelter_id FROM current_assignments WHERE disaster_id='disaster'"
            ).fetchall()
        )
        people_by_shelter = dict(
            connection.execute(
                "SELECT shelter_id, SUM(people) FROM current_assignments "
                "WHERE disaster_id='disaster' GROUP BY shelter_id"
            ).fetchall()
        )
    assert assignments == {"family": "far", "second": "near", "waiting": "near"}
    assert people_by_shelter == {"far": 4, "near": 6}


def test_allocator_reports_special_care_mismatch_on_fallback(coordination_client):
    client, database = coordination_client
    needs = {
        "pets": False,
        "immediate_medication": False,
        "medical_notes": None,
        "accessibility_notes": None,
        "other_special_care": True,
    }
    with sqlite3.connect(database) as connection:
        connection.execute(
            "UPDATE families SET needs_json=? WHERE id='family'", (json.dumps(needs),)
        )
    seed_shelter(database, "only", latitude=28.01, special_care=None)

    response = client.post("/api/families/family/plan/generate", headers=headers("operator"))
    assert response.status_code == 200, response.text
    plan = client.get("/api/families/family/plan", headers=headers()).json()
    mismatch = next(alert for alert in plan["alerts"] if alert["code"] == "shelter_needs_mismatch")
    assert mismatch["unmet_requirements"] == ["special_care"]


def test_failed_automatic_reallocation_rolls_back_profile_and_reservations(
    coordination_client, monkeypatch
):
    import haven.routers.families as family_routes

    client, database = coordination_client
    seed_shelter(database, "only", available=10)
    original = generate(client).json()
    assert original["capacity_reserved"] is True
    original_recompute = family_routes.recompute_disasters

    async def fail_reallocation(connection, disaster_ids):
        raise RuntimeError("injected allocation failure")

    monkeypatch.setattr(family_routes, "recompute_disasters", fail_reallocation)
    response = client.patch(
        "/api/families/family", headers=headers(), json={"location": {"latitude": 29}}
    )
    assert response.status_code == 500
    monkeypatch.setattr(family_routes, "recompute_disasters", original_recompute)

    assert (
        client.get("/api/families/family", headers=headers()).json()["location"]["latitude"] == 28
    )
    assert client.get("/api/families/family/plan", headers=headers()).json() == original
    with sqlite3.connect(database) as connection:
        free = json.loads(
            connection.execute("SELECT capacity_json FROM shelters WHERE id='only'").fetchone()[0]
        )["available_people"]
        assignment = connection.execute(
            "SELECT shelter_id, people FROM current_assignments WHERE family_id='family'"
        ).fetchone()
    assert free == 7
    assert assignment == ("only", 3)


def test_global_allocator_preserves_scarce_capability_for_constrained_family(coordination_client):
    client, database = coordination_client
    constrained = {
        "pets": False,
        "immediate_medication": False,
        "medical_notes": None,
        "accessibility_notes": "Wheelchair",
        "other_special_care": None,
    }
    with sqlite3.connect(database) as connection:
        connection.execute(
            "UPDATE families SET adults = 3, children = 0, needs_json = ?, resources_json = ? WHERE id = 'family'",
            (json.dumps(constrained), json.dumps({"has_car": False})),
        )
    seed_family(database, "flexible", adults=3, children=0)
    seed_shelter(database, "specialist", latitude=28.01, available=3)
    seed_shelter(database, "general", latitude=28.1, available=3, wheelchair=False)

    assert (
        client.post("/api/families/flexible/plan/generate", headers=headers("operator")).status_code
        == 200
    )
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

    assert (
        client.post(
            "/api/families/car-family/plan/generate", headers=headers("operator")
        ).status_code
        == 200
    )
    no_car_plan = client.get("/api/families/no-car-family/plan", headers=headers("operator")).json()
    car_plan = client.get("/api/families/car-family/plan", headers=headers("operator")).json()
    assert no_car_plan["shelter"]["id"] == "near"
    assert car_plan["shelter"]["id"] == "far"
    assert no_car_plan["capacity_reserved"] and car_plan["capacity_reserved"]


def test_identical_recompute_keeps_repaired_assignments_and_versions(coordination_client):
    client, database = coordination_client
    no_needs = {
        "pets": False,
        "immediate_medication": False,
        "medical_notes": None,
        "accessibility_notes": None,
        "other_special_care": None,
    }
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE families SET disaster_id='other' WHERE id='family'")

    families = (
        ("f0", 6, {**no_needs, "accessibility_notes": "yes"}, False),
        ("f1", 6, {**no_needs, "pets": True, "immediate_medication": True}, True),
        ("f2", 4, no_needs, True),
        ("f3", 3, no_needs, False),
        ("f4", 3, no_needs, True),
        ("f5", 4, {**no_needs, "pets": True, "accessibility_notes": "yes"}, True),
    )
    for identity, adults, needs, has_car in families:
        seed_family(database, identity, adults=adults, children=0, needs=needs, has_car=has_car)
    seed_shelter(database, "s0", latitude=0, longitude=0, available=8)
    seed_shelter(database, "s1", latitude=0, longitude=0, available=9, wheelchair=False)
    seed_shelter(database, "s2", latitude=0, longitude=0, available=6, wheelchair=False)

    def snapshot():
        with sqlite3.connect(database) as connection:
            assignments = dict(
                connection.execute(
                    "SELECT family_id, shelter_id FROM current_assignments WHERE disaster_id='disaster'"
                ).fetchall()
            )
            people = connection.execute(
                "SELECT COALESCE(SUM(people), 0) FROM current_assignments "
                "WHERE disaster_id='disaster' AND shelter_id IS NOT NULL"
            ).fetchone()[0]
            versions = dict(
                connection.execute(
                    "SELECT family_id, MAX(version) FROM plans GROUP BY family_id"
                ).fetchall()
            )
        return assignments, people, versions

    first_response = client.post("/api/families/f0/plan/generate", headers=headers("operator"))
    assert first_response.status_code == 200, first_response.text
    first_assignments, first_people, first_versions = snapshot()
    assert sum(shelter_id is not None for shelter_id in first_assignments.values()) == 6
    assert first_people == 26

    second_response = client.post("/api/families/f0/plan/generate", headers=headers("operator"))
    assert second_response.status_code == 200, second_response.text
    second_assignments, second_people, second_versions = snapshot()
    assert second_assignments == first_assignments
    assert second_people == first_people
    assert second_versions == first_versions


def test_bounded_refinement_places_all_households_when_feasible(coordination_client):
    client, database = coordination_client
    no_needs = {
        "pets": False,
        "immediate_medication": False,
        "medical_notes": None,
        "accessibility_notes": None,
        "other_special_care": None,
    }
    with sqlite3.connect(database) as connection:
        connection.execute(
            "UPDATE families SET adults=4, children=0, needs_json=?, resources_json=? WHERE id='family'",
            (json.dumps(no_needs), json.dumps({"has_car": True})),
        )
    seed_family(
        database, "f1", adults=5, children=0, needs={**no_needs, "pets": True}, has_car=True
    )
    seed_family(database, "f2", adults=1, children=0, needs=no_needs, has_car=False)
    seed_family(
        database,
        "f3",
        adults=2,
        children=0,
        needs={**no_needs, "immediate_medication": True},
        has_car=False,
    )
    seed_family(database, "f4", adults=1, children=0, needs=no_needs, has_car=True)
    seed_family(
        database,
        "f5",
        adults=1,
        children=0,
        needs={**no_needs, "accessibility_notes": "yes", "immediate_medication": True},
        has_car=True,
    )
    seed_shelter(database, "s0", latitude=0, longitude=0, available=6)
    seed_shelter(database, "s1", latitude=0, longitude=0, available=3, staff=[])
    seed_shelter(database, "s2", latitude=0, longitude=0, available=7, wheelchair=False)

    response = client.post("/api/families/family/plan/generate", headers=headers("operator"))
    assert response.status_code == 200, response.text
    with sqlite3.connect(database) as connection:
        rows = connection.execute(
            "SELECT family_id, shelter_id, people FROM current_assignments WHERE disaster_id='disaster'"
        ).fetchall()
    assert len(rows) == 6
    assert all(shelter_id is not None for _, shelter_id, _ in rows)
    assert sum(people for _, _, people in rows) == 14


def test_zero_free_capacity_preserves_incumbent_and_flags_fallback(coordination_client):
    client, database = coordination_client
    seed_family(database, "incumbent", adults=1, children=0)
    seed_shelter(database, "only", available=3, staff=[])

    incumbent_response = client.post(
        "/api/families/incumbent/plan/generate",
        headers=headers("operator"),
    )
    assert incumbent_response.status_code == 200, incumbent_response.text
    incumbent_plan = incumbent_response.json()
    assert incumbent_plan["shelter"]["id"] == "only"
    urgent_initial = client.get("/api/families/family/plan", headers=headers("operator")).json()
    assert urgent_initial["shelter"]["id"] == "only"
    mismatch = next(
        alert for alert in urgent_initial["alerts"] if alert["code"] == "shelter_needs_mismatch"
    )
    assert mismatch["severity"] == "critical"
    assert "medical_staff" in mismatch["unmet_requirements"]
    assert any(alert["code"] == "shelter_capacity_overflow" for alert in urgent_initial["alerts"])

    zero_capacity = client.patch(
        "/api/shelters/only",
        headers=headers("operator"),
        json={"capacity": {"available_people": 0}},
    )
    assert zero_capacity.status_code == 200, zero_capacity.text
    staffed = client.patch(
        "/api/shelters/only",
        headers=headers("operator"),
        json={"capabilities": {"medical_staff": ["nurse"]}},
    )
    assert staffed.status_code == 200, staffed.text

    current_incumbent = client.get(
        "/api/families/incumbent/plan",
        headers=headers("operator"),
    ).json()
    urgent = client.get("/api/families/family/plan", headers=headers("operator")).json()
    assert current_incumbent["shelter"]["id"] == "only"
    assert current_incumbent["capacity_reserved"] is True
    assert urgent["shelter"]["id"] == "only"
    assert urgent["capacity_reserved"] is True
    assert not any(alert["code"] == "shelter_needs_mismatch" for alert in urgent["alerts"])
    with sqlite3.connect(database) as connection:
        assignments = dict(
            connection.execute(
                "SELECT family_id, shelter_id FROM current_assignments WHERE disaster_id='disaster'"
            ).fetchall()
        )
        free = json.loads(
            connection.execute("SELECT capacity_json FROM shelters WHERE id='only'").fetchone()[0]
        )["available_people"]
    assert assignments["incumbent"] == "only"
    assert assignments["family"] == "only"
    assert free == 0


def test_family_profile_changes_auto_version_plan_and_identical_inputs_do_not_churn(
    coordination_client,
):
    client, _ = coordination_client
    assert generate(client).json()["version"] == 1
    created = client.post("/api/shelters", headers=headers("operator"), json=api_shelter())
    assert created.status_code == 201, created.text
    original = client.get("/api/families/family/plan", headers=headers()).json()
    assert original["version"] == 2
    same = client.patch(
        "/api/families/family", headers=headers(), json={"resources": {"has_car": True}}
    )
    assert same.status_code == 200
    assert generate(client).json()["version"] == 2

    changed = client.patch(
        "/api/families/family", headers=headers(), json={"resources": {"has_car": False}}
    )
    assert changed.status_code == 200
    updated = client.get("/api/families/family/plan", headers=headers()).json()
    assert updated["version"] == 3
    assert updated["instructions"] != original["instructions"]
    assert "transportation" in " ".join(updated["instructions"]).lower()


def test_alert_feed_capacity_resolution_and_access(coordination_client):
    client, database = coordination_client
    url = "/api/disasters/disaster/alerts"
    assert client.get(url).status_code == 401
    assert client.get(url, headers=headers()).status_code == 403
    assert (
        client.get("/api/disasters/missing/alerts", headers=headers("operator")).status_code == 404
    )
    assert client.get(url, headers=headers("operator")).json()["alerts"] == []
    seed_shelter(database, "only", available=1)
    seed_family(database, "second")
    assert generate(client).status_code == 200
    response = client.patch(
        "/api/shelters/only",
        headers=headers("operator"),
        json={"capacity": {"total_people": 2}, "resources": {"water": "unavailable"}},
    )
    assert response.status_code == 200, response.text
    feed = client.get(url, headers=headers("operator")).json()
    capacity = [a for a in feed["alerts"] if a["code"] == "shelter_capacity_overflow"]
    assert len(capacity) == 1
    assert capacity[0]["severity"] == "critical"
    assert capacity[0]["details"]["people_over_capacity"] == 4
    assert capacity[0]["family_id"] is None
    assert any(a["code"] == "shelter_water_unavailable" for a in feed["alerts"])
    assert client.get(url, headers=headers("operator")).json() == feed
    page = client.get(url + "?limit=1&offset=1", headers=headers("operator")).json()
    assert page["alerts"] == feed["alerts"][1:2]
    assert page["total"] == feed["total"]
    assert client.get(url + "?limit=0", headers=headers("operator")).status_code == 400
    assert (
        client.get("/api/disasters/other/alerts", headers=headers("operator")).json()["alerts"]
        == []
    )
    assert (
        client.patch(
            "/api/shelters/only",
            headers=headers("operator"),
            json={
                "capacity": {"total_people": 20, "available_people": 10},
                "resources": {"water": "available"},
            },
        ).status_code
        == 200
    )
    assert client.get(url, headers=headers("operator")).json()["alerts"] == []


def test_alert_feed_uses_only_latest_plan(coordination_client):
    client, database = coordination_client
    assert generate(client).status_code == 200
    url = "/api/disasters/disaster/alerts"
    first = client.get(url, headers=headers("operator")).json()["alerts"]
    assert len(first) == 1
    assert first[0]["code"] == "no_open_shelter"
    assert first[0]["family_id"] == "family"
    assert (
        client.post("/api/shelters", headers=headers("operator"), json=api_shelter()).status_code
        == 201
    )
    assert client.get(url, headers=headers("operator")).json()["alerts"] == []
    schema = client.get("/schema/openapi.json").json()
    assert schema["paths"]["/api/disasters/{disaster_id}/alerts"]["get"]["security"] == [
        {"BearerAuth": []}
    ]
