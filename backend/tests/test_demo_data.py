import asyncio
import json
import sqlite3
from contextlib import closing

from litestar.testing import TestClient

from haven.app import app
from haven.db import database_path
from haven.demo_data import DEMO_ACCOUNTS, DEMO_DISASTER_ID, DEMO_LOCATIONS, seed_demo_data
from haven.demo_households import generate_households


def test_demo_accounts_can_sign_in(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "demo.sqlite3"))
    monkeypatch.delenv("DEMO_PASSWORD", raising=False)
    created = asyncio.run(seed_demo_data())
    assert set(created) == {email for email, _ in DEMO_ACCOUNTS}
    assert all(created.values())
    with TestClient(app=app) as client:
        for email, role in DEMO_ACCOUNTS:
            response = client.post(
                "/api/auth/login", json={"email": email, "password": created[email]}
            )
            assert response.status_code == 200
            assert response.json()["user"]["role"] == role


def test_shared_demo_password_and_seeded_golden_gate_scenario(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "activity.sqlite3"))
    monkeypatch.setenv("DEMO_PASSWORD", "shared-demo-password")
    assert set(asyncio.run(seed_demo_data()).values()) == {"shared-demo-password"}
    with TestClient(app=app) as client:
        operator = client.post(
            "/api/auth/login",
            json={"email": "government@demo.example", "password": "shared-demo-password"},
        )
        assert operator.status_code == 200
        headers = {"Authorization": f"Bearer {operator.json()['access_token']}"}
        assert (
            client.get("/api/disasters", headers=headers).json()["disasters"][0]["id"]
            == DEMO_DISASTER_ID
        )
        assert client.get(
            "/api/shelters", params={"disaster_id": DEMO_DISASTER_ID}, headers=headers
        ).json()["shelters"]
        assert (
            client.get(
                "/api/families", params={"disaster_id": DEMO_DISASTER_ID}, headers=headers
            ).json()["total"]
            == 1000
        )
        plans = client.get(
            f"/api/disasters/{DEMO_DISASTER_ID}/plans?limit=1000", headers=headers
        ).json()["plans"]
        assert len(plans) == 1000
        assert all(plan["shelter"] is not None and plan["capacity_reserved"] for plan in plans)
        assert all(not plan["alerts"] for plan in plans)


def test_reseeding_recreates_the_entire_demo_database(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "scenario.sqlite3"))
    first_credentials = asyncio.run(seed_demo_data())
    with TestClient(app=app) as client:
        response = client.post(
            "/api/auth/login",
            json={
                "email": "government@demo.example",
                "password": first_credentials["government@demo.example"],
            },
        )
        old_token = response.json()["access_token"]
    with closing(sqlite3.connect(database_path())) as connection:
        connection.execute("UPDATE shelters SET name = 'Edited'")
        connection.execute("UPDATE families SET latitude = 0, longitude = 0")
        connection.execute("CREATE TABLE disposable_marker (value TEXT)")
        # A disposable database should be replaced even if its schema is stale.
        connection.execute("PRAGMA user_version = 999")
        connection.commit()
    second_credentials = asyncio.run(seed_demo_data())
    assert first_credentials != second_credentials
    with closing(sqlite3.connect(database_path())) as connection:
        assert connection.execute("SELECT count(*) FROM shelters").fetchone()[0] == 9
        assert connection.execute("SELECT count(*) FROM families").fetchone()[0] == 1000
        assert connection.execute("SELECT count(*) FROM current_assignments").fetchone()[0] == 1000
        assert connection.execute("SELECT count(*) FROM plans").fetchone()[0] == 1000
        assert connection.execute(
            "SELECT min(adults + children), max(adults + children) FROM families"
        ).fetchone() == (1, 8)
        assert (
            connection.execute(
                "SELECT count(*) FROM families WHERE adults = 1 AND children = 0 "
                "AND json_extract(needs_json, '$.immediate_medication') = 1 "
                "AND json_extract(needs_json, '$.accessibility_notes') IS NOT NULL "
                "AND json_extract(resources_json, '$.has_car') = 0"
            ).fetchone()[0]
            > 0
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM families WHERE adults + children = 4 "
                "AND json_extract(resources_json, '$.has_car') = 1 "
                "AND json_extract(needs_json, '$.pets') = 1 "
                "AND json_extract(needs_json, '$.other_special_care') LIKE '%dog%'"
            ).fetchone()[0]
            > 0
        )
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        assert (
            connection.execute(
                "SELECT name FROM sqlite_master WHERE name = 'disposable_marker'"
            ).fetchone()
            is None
        )
        locations = json.loads(DEMO_LOCATIONS.read_text())
        assert connection.execute(
            "SELECT latitude, longitude FROM families ORDER BY id"
        ).fetchall() == [(h["latitude"], h["longitude"]) for h in locations["households"]]
        assert connection.execute(
            "SELECT address, latitude, longitude FROM shelters ORDER BY id"
        ).fetchall() == [
            (s["address"], s["latitude"], s["longitude"]) for s in locations["shelters"]
        ]
        assert (
            "Golden Gate Estates"
            in connection.execute(
                "SELECT name FROM disasters WHERE id = ?", (DEMO_DISASTER_ID,)
            ).fetchone()[0]
        )
    with TestClient(app=app) as client:
        assert (
            client.get("/api/me", headers={"Authorization": f"Bearer {old_token}"}).status_code
            == 401
        )
        for email, role in DEMO_ACCOUNTS:
            response = client.post(
                "/api/auth/login", json={"email": email, "password": second_credentials[email]}
            )
            assert response.status_code == 200
            assert response.json()["user"]["role"] == role


def test_household_generation_is_repeatable_and_varied():
    profiles = generate_households(1000)
    assert len(profiles) == 1000
    assert profiles == generate_households(1000)
    assert profiles != generate_households(1000, seed=43)
    assert {p["adults"] + p["children"] for p in profiles} == set(range(1, 9))
    combinations = {
        (
            p["resources"]["has_car"],
            p["needs"]["pets"],
            p["needs"]["immediate_medication"],
            bool(p["needs"]["accessibility_notes"]),
        )
        for p in profiles
    }
    assert len(combinations) == 16
    for profile in profiles:
        assert profile["adults"] >= 1 and profile["children"] >= 0
        needs = profile["needs"]
        if needs["immediate_medication"]:
            assert needs["medical_notes"]
        if needs["pets"]:
            assert needs["other_special_care"]
        if "infant" in (needs["other_special_care"] or "").lower():
            assert profile["children"] > 0


def test_household_locations_are_distinct_verified_estates_homes():
    data = json.loads(DEMO_LOCATIONS.read_text())
    homes = data["households"]
    assert len(homes) == 1000
    for field in ("address_point_id", "building_id", "address"):
        assert len({h[field] for h in homes}) == 1000
    assert len({(h["latitude"], h["longitude"]) for h in homes}) == 1000
    # The previous 20 x 23 grid reused coordinates and rows. House coordinates
    # should follow irregular building positions instead of an arithmetic lattice.
    assert len({h["latitude"] for h in homes}) > 990
    assert len({h["longitude"] for h in homes}) > 990
    west, south, east, north = data["bounds"]
    assert all(south <= h["latitude"] <= north and west <= h["longitude"] <= east for h in homes)
    assert len(data["shelters"]) == 9
    assert all("Naples, FL" in s["address"] for s in data["shelters"])
