import asyncio
import json
import sqlite3

import apsw
import pytest

from haven.db import connect, initialize_schema
from haven.startup import initialize_database


def test_async_database_and_foreign_keys(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "async.sqlite3"))

    async def exercise():
        await initialize_schema()
        async with connect() as connection:
            values = [
                row[0] async for row in await connection.execute("SELECT 1 UNION ALL SELECT 2")
            ]
            assert values == [1, 2]
            with pytest.raises(apsw.ConstraintError):
                await connection.execute(
                    "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
                    ("session", "missing-user", "hash", "2099-01-01"),
                )

    asyncio.run(exercise())


def test_startup_reconciles_legacy_plans_without_consuming_capacity_twice(tmp_path, monkeypatch):
    path = tmp_path / "legacy.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(path))
    asyncio.run(initialize_database())
    with sqlite3.connect(path) as connection:
        connection.execute(
            "INSERT INTO users VALUES ('owner', 'owner@example.com', 'unused', 'family', '2026-01-01')"
        )
        connection.execute(
            "INSERT INTO disasters VALUES ('disaster', 'flooding', 'Flood', 'active', 'County', '2026-01-01')"
        )
        connection.execute(
            "INSERT INTO families VALUES ('family', 'owner', 'disaster', 2, 1, 28, -82, '{}', '{}', '2026-01-01', '2026-01-01')"
        )
        connection.execute(
            "INSERT INTO shelters VALUES ('shelter', 'disaster', 'Shelter', 'Main Street', 28, -82, 'open', ?, ?, ?, '2026-01-01')",
            (
                json.dumps({"total_people": 5, "available_people": 5}),
                json.dumps({"child_friendly": True}),
                json.dumps({"food": "available", "water": "available"}),
            ),
        )
        connection.execute(
            "INSERT INTO plans VALUES ('legacy', 'family', 7, ?, '2026-01-01')",
            (json.dumps({"family_id": "family", "version": 7, "capacity_reserved": False}),),
        )

    asyncio.run(initialize_database())
    with sqlite3.connect(path) as connection:
        plan = json.loads(
            connection.execute(
                "SELECT plan_json FROM plans ORDER BY version DESC LIMIT 1"
            ).fetchone()[0]
        )
        assert plan["version"] == 8
        assert plan["capacity_reserved"] is True
        assert plan["shelter"]["id"] == "shelter"
        assert (
            json.loads(connection.execute("SELECT capacity_json FROM shelters").fetchone()[0])[
                "available_people"
            ]
            == 2
        )

    asyncio.run(initialize_database())
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT MAX(version) FROM plans").fetchone()[0] == 8
        assert (
            json.loads(connection.execute("SELECT capacity_json FROM shelters").fetchone()[0])[
                "available_people"
            ]
            == 2
        )
