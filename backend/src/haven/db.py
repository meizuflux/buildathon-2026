"""Async SQLite connections using APSW."""

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

import apsw

SCHEMA = Path(__file__).with_name("schema.sql")


def database_path() -> Path:
    return Path(os.environ.get("DATABASE_PATH", "disaster_response.sqlite3"))


@asynccontextmanager
async def connect():
    connection = await apsw.Connection.as_async(str(database_path()))
    try:
        await connection.set_busy_timeout(5000)
        await connection.execute("PRAGMA foreign_keys = ON")
        yield connection
    finally:
        await connection.aclose()


async def initialize_database() -> None:
    schema = await asyncio.to_thread(SCHEMA.read_text, encoding="utf-8")
    async with connect() as connection:
        async for _ in await connection.execute(schema):
            pass
        # Existing installations may contain recommendation-only plans. Reconcile
        # them through the same ledger as live edits before serving requests.
        from haven.allocation import recompute_disasters

        await connection.execute("BEGIN IMMEDIATE")
        try:
            disasters = await (await connection.execute("SELECT id FROM disasters ORDER BY id")).fetchall()
            await recompute_disasters(connection, (row[0] for row in disasters))
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
