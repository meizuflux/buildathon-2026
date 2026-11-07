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


async def initialize_schema() -> None:
    """Create tables declared in the base schema without application reconciliation."""
    schema = await asyncio.to_thread(SCHEMA.read_text, encoding="utf-8")
    async with connect() as connection:
        async for _ in await connection.execute(schema):
            pass
