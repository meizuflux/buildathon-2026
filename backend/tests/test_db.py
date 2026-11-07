import asyncio

import apsw
import pytest

from haven.db import connect, initialize_database


def test_async_database_and_foreign_keys(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "async.sqlite3"))

    async def exercise():
        await initialize_database()
        async with connect() as connection:
            values = [row[0] async for row in await connection.execute("SELECT 1 UNION ALL SELECT 2")]
            assert values == [1, 2]
            with pytest.raises(apsw.ConstraintError):
                await connection.execute(
                    "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
                    ("session", "missing-user", "hash", "2099-01-01"),
                )

    asyncio.run(exercise())
