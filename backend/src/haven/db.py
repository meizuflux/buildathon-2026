"""Async access to SQLite through APSW worker-thread operations."""

import asyncio
import os
from collections.abc import Callable
from contextlib import closing
from pathlib import Path
from typing import TypeVar

import apsw

SCHEMA = Path(__file__).with_name("schema.sql")
T = TypeVar("T")


def database_path() -> Path:
    return Path(os.environ.get("DATABASE_PATH", "disaster_response.sqlite3"))


def _connect() -> apsw.Connection:
    connection = apsw.Connection(str(database_path()))
    connection.set_busy_timeout(5000)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.set_row_trace(lambda cursor, row: dict(zip((column[0] for column in cursor.get_description()), row)))
    return connection


async def run_db(operation: Callable[[apsw.Connection], T]) -> T:
    """Run an entire operation on one connection in a worker thread.

    APSW is synchronous; keeping each transaction in one worker avoids blocking
    the event loop and avoids sharing connections between concurrent requests.
    """
    def run() -> T:
        with closing(_connect()) as connection:
            return operation(connection)

    return await asyncio.to_thread(run)


async def initialize_database() -> None:
    schema = await asyncio.to_thread(SCHEMA.read_text, encoding="utf-8")
    await run_db(lambda connection: connection.execute(schema))
