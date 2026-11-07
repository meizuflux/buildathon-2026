import asyncio
import sqlite3
from contextlib import closing

from litestar.testing import TestClient

from haven.app import app
from haven.db import database_path
from haven.demo_data import (
    DEMO_ACCOUNTS,
    DEMO_CENTER,
    DEMO_HUBS,
    DEMO_PLEDGES,
    DEMO_REQUESTS,
    seed_demo_data,
    seed_hubs,
    staff_email,
)


def test_demo_accounts_can_sign_in_and_reseeding_preserves_them(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "demo.sqlite3"))
    monkeypatch.delenv("DEMO_PASSWORD", raising=False)
    created = asyncio.run(seed_demo_data())
    assert all(created.values())
    assert len(set(created.values())) == len(DEMO_ACCOUNTS)
    with closing(sqlite3.connect(database_path())) as connection:
        before = [
            tuple(row)
            for row in connection.execute(
                "SELECT id, email, password_hash, role FROM users ORDER BY email"
            )
        ]
    assert asyncio.run(seed_demo_data()) == {email: None for email, _, _ in DEMO_ACCOUNTS}
    with closing(sqlite3.connect(database_path())) as connection:
        after = [
            tuple(row)
            for row in connection.execute(
                "SELECT id, email, password_hash, role FROM users ORDER BY email"
            )
        ]
    assert before == after
    with TestClient(app=app) as client:
        for email, role, hub_id in DEMO_ACCOUNTS:
            response = client.post(
                "/api/auth/login", json={"email": email, "password": created[email]}
            )
            assert response.status_code == 200
            assert response.json()["user"]["role"] == role
            assert response.json()["user"]["hub_id"] == hub_id


def test_demo_hubs_seed_idempotently_near_center(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "hubs.sqlite3"))
    assert asyncio.run(seed_hubs()) == len(DEMO_HUBS)
    assert asyncio.run(seed_hubs()) == 0
    with TestClient(app=app) as client:
        nearby = client.get(
            "/api/hubs/nearby", params={"lat": DEMO_CENTER[0], "lng": DEMO_CENTER[1]}
        ).json()
        assert len(nearby) == len(DEMO_HUBS)
        assert len(client.get("/api/hubs", params={"min_capacity": 90}).json()) == 3


def test_shared_demo_password_and_sample_activity(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "activity.sqlite3"))
    monkeypatch.setenv("DEMO_PASSWORD", "shared-demo-password")
    assert set(asyncio.run(seed_demo_data()).values()) == {"shared-demo-password"}
    asyncio.run(seed_demo_data())
    with TestClient(app=app) as client:
        operator = client.post(
            "/api/auth/login",
            json={"email": "government@demo.example", "password": "shared-demo-password"},
        )
        headers = {"Authorization": f"Bearer {operator.json()['access_token']}"}
        open_requests = client.get(
            "/api/requests", params={"status": "open"}, headers=headers
        ).json()
        assert len(open_requests) == len(DEMO_REQUESTS)
        assert all(r["suggested_hubs"] for r in open_requests)
        pending = [
            p
            for _, hub_id, _, _ in DEMO_PLEDGES
            for p in client.get(f"/api/hubs/{hub_id}/pledges", headers=headers).json()
        ]
        assert len(pending) == len(DEMO_PLEDGES)
        assert staff_email("hub_demo_downtown_fire") == "staff.downtown-fire@demo.example"


def test_tampa_scenario_is_complete_and_preserves_edits(tmp_path, monkeypatch):
    from haven.demo_data import DEMO_DISASTER_ID, seed_tampa_scenario

    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "scenario.sqlite3"))
    asyncio.run(seed_tampa_scenario())
    with closing(sqlite3.connect(database_path())) as connection:
        assert (
            connection.execute(
                "SELECT count(*) FROM shelters WHERE disaster_id = ?", (DEMO_DISASTER_ID,)
            ).fetchone()[0]
            == 20
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM families WHERE disaster_id = ?", (DEMO_DISASTER_ID,)
            ).fetchone()[0]
            == 1000
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM current_assignments WHERE disaster_id = ?",
                (DEMO_DISASTER_ID,),
            ).fetchone()[0]
            == 1000
        )
        assert connection.execute("SELECT count(*) FROM plans").fetchone()[0] == 1000
        connection.execute("UPDATE shelters SET name = 'Edited' WHERE id = 'demo_tampa_shelter_01'")
        connection.commit()
    asyncio.run(seed_tampa_scenario())
    with closing(sqlite3.connect(database_path())) as connection:
        assert (
            connection.execute(
                "SELECT name FROM shelters WHERE id = 'demo_tampa_shelter_01'"
            ).fetchone()[0]
            == "Edited"
        )
        assert connection.execute("SELECT count(*) FROM families").fetchone()[0] == 1000
