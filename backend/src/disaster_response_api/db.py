"""SQLite setup for the API."""

import os
from contextlib import closing
import sqlite3
from pathlib import Path

SCHEMA = Path(__file__).with_name("schema.sql")


def database_path() -> Path:
    return Path(os.environ.get("DATABASE_PATH", "disaster_response.sqlite3"))


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(database_path())
    connection.execute("PRAGMA foreign_keys = ON")
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    with closing(connect()) as connection:
        connection.executescript(SCHEMA.read_text(encoding="utf-8"))
