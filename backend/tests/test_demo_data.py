import asyncio
import sqlite3
from contextlib import closing

from litestar.testing import TestClient

from haven.app import app
from haven.db import database_path
from haven.demo_data import DEMO_ACCOUNTS, seed_demo_data


def test_demo_accounts_can_sign_in_and_reseeding_preserves_them(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "demo.sqlite3"))
    created = asyncio.run(seed_demo_data())
    assert all(created.values())
    with closing(sqlite3.connect(database_path())) as connection:
        before = [tuple(row) for row in connection.execute("SELECT id, email, password_hash, role FROM users ORDER BY email")]
    assert asyncio.run(seed_demo_data()) == {email: None for email, _ in DEMO_ACCOUNTS}
    with closing(sqlite3.connect(database_path())) as connection:
        after = [tuple(row) for row in connection.execute("SELECT id, email, password_hash, role FROM users ORDER BY email")]
    assert before == after
    with TestClient(app=app) as client:
        for email, role in DEMO_ACCOUNTS:
            response = client.post("/api/auth/login", json={"email": email, "password": created[email]})
            assert response.status_code == 200
            assert response.json()["user"]["role"] == role


def test_demo_hubs_seed_idempotently_near_center(tmp_path, monkeypatch):
    from haven.demo_data import DEMO_CENTER, DEMO_HUBS, seed_hubs

    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "hubs.sqlite3"))
    assert asyncio.run(seed_hubs()) == len(DEMO_HUBS)
    assert asyncio.run(seed_hubs()) == 0
    with TestClient(app=app) as client:
        nearby = client.get("/api/hubs/nearby", params={"lat": DEMO_CENTER[0], "lng": DEMO_CENTER[1]}).json()
        assert len(nearby) == len(DEMO_HUBS)
        assert len(client.get("/api/hubs", params={"min_capacity": 90}).json()) == 3
