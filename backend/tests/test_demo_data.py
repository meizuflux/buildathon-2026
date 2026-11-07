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


def test_tampa_scenario_is_complete_and_preserves_edits(tmp_path, monkeypatch):
    from haven.demo_data import DEMO_DISASTER_ID, seed_tampa_scenario

    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "scenario.sqlite3"))
    asyncio.run(seed_tampa_scenario())
    with closing(sqlite3.connect(database_path())) as connection:
        assert connection.execute("SELECT count(*) FROM shelters WHERE disaster_id = ?", (DEMO_DISASTER_ID,)).fetchone()[0] == 20
        assert connection.execute("SELECT count(*) FROM families WHERE disaster_id = ?", (DEMO_DISASTER_ID,)).fetchone()[0] == 1000
        assert connection.execute("SELECT count(*) FROM current_assignments WHERE disaster_id = ?", (DEMO_DISASTER_ID,)).fetchone()[0] == 1000
        assert connection.execute("SELECT count(*) FROM plans").fetchone()[0] == 1000
        connection.execute("UPDATE shelters SET name = 'Edited' WHERE id = 'demo_tampa_shelter_01'")
        connection.commit()
    asyncio.run(seed_tampa_scenario())
    with closing(sqlite3.connect(database_path())) as connection:
        assert connection.execute("SELECT name FROM shelters WHERE id = 'demo_tampa_shelter_01'").fetchone()[0] == 'Edited'
        assert connection.execute("SELECT count(*) FROM families").fetchone()[0] == 1000
