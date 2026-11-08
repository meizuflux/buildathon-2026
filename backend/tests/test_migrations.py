import asyncio
import sqlite3

import apsw
import pytest

from haven.migrations import migrate_database
from haven.startup import initialize_database


def test_legacy_database_is_migrated_once_without_losing_data():
    async def exercise():
        connection = await apsw.Connection.as_async(":memory:")
        try:
            await connection.execute("PRAGMA foreign_keys = ON")
            async for _ in await connection.execute(
                "CREATE TABLE disasters (id TEXT PRIMARY KEY); "
                "CREATE TABLE families (id TEXT PRIMARY KEY); "
                "CREATE TABLE shelters (id TEXT PRIMARY KEY, capacity_json TEXT NOT NULL); "
                "INSERT INTO disasters VALUES ('disaster'); "
                "INSERT INTO families VALUES ('family'); "
                "INSERT INTO shelters VALUES ('shelter', '{\"total_people\": 10}');"
            ):
                pass

            await migrate_database(connection)
            await migrate_database(connection)

            version = await (await connection.execute("PRAGMA user_version")).fetchone()
            assert version == (3,)
            tables = await (
                await connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
                )
            ).fetchall()
            assert ("current_assignments",) in tables
            assert ("shelter_capacity_budgets",) in tables
            assert ("activity",) in tables
            assert ("broadcast_targets",) in tables
            assert ("shipments",) in tables
            assert await (
                await connection.execute("SELECT count(*) FROM resource_types")
            ).fetchone() != (0,)
            assert await (await connection.execute("SELECT id FROM disasters")).fetchone() == (
                "disaster",
            )
            assert await (await connection.execute("SELECT id FROM shelters")).fetchone() == (
                "shelter",
            )
        finally:
            await connection.aclose()

    asyncio.run(exercise())


def test_newer_schema_version_is_rejected():
    async def exercise():
        connection = await apsw.Connection.as_async(":memory:")
        try:
            await connection.execute("PRAGMA user_version = 99")
            with pytest.raises(RuntimeError, match="newer than supported"):
                await migrate_database(connection)
        finally:
            await connection.aclose()

    asyncio.run(exercise())


def test_startup_rejects_newer_schema_before_creating_tables(tmp_path, monkeypatch):
    path = tmp_path / "future.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(path))
    with sqlite3.connect(path) as connection:
        connection.execute("PRAGMA user_version = 99")

    with pytest.raises(RuntimeError, match="newer than supported"):
        asyncio.run(initialize_database())

    with sqlite3.connect(path) as connection:
        table_count = connection.execute(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table'"
        ).fetchone()[0]
    assert table_count == 0
