import asyncio
import threading

import apsw
import pytest

from haven.db import initialize_database, run_db


def test_database_work_does_not_block_event_loop(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "async.sqlite3"))

    async def exercise():
        await initialize_database()
        started = threading.Event()
        release = threading.Event()

        def slow_query(connection):
            started.set()
            if not release.wait(timeout=3):
                raise RuntimeError("event loop did not release worker")
            return connection.execute("SELECT 1 AS value").fetchone()

        task = asyncio.create_task(run_db(slow_query))
        try:
            assert await asyncio.to_thread(started.wait, 2)
            # A second operation can complete while the first worker is waiting.
            result = await asyncio.wait_for(run_db(lambda db: db.execute("SELECT 2 AS value").fetchone()), 2)
            assert result["value"] == 2
        finally:
            release.set()
        assert (await task)["value"] == 1

    asyncio.run(exercise())


def test_foreign_keys_are_enabled(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "foreign-keys.sqlite3"))

    async def exercise():
        await initialize_database()
        with pytest.raises(apsw.ConstraintError):
            await run_db(lambda db: db.execute(
                "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
                ("session", "missing-user", "hash", "2099-01-01"),
            ))

    asyncio.run(exercise())
