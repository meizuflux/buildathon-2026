"""Versioned, transactional SQLite schema migrations.

Fresh databases are bootstrapped from ``schema.sql``. Migrations upgrade
databases created by earlier application versions; SQLite's ``user_version``
keeps the applied version in the database itself.

A migration is either a SQL script or an async function for changes plain SQL can't express.
"""

import asyncio
from collections.abc import Awaitable, Callable

import apsw

from haven.db import SCHEMA

type Migration = str | Callable[[apsw.AsyncConnection], Awaitable[None]]

DONATIONS_MARKER = "-- Citizen donations, built on the logistics tables above"
_ROLE_CHECK_OLD = "CHECK (role IN ('family', 'operator'))"
_ROLE_CHECK_NEW = "CHECK (role IN ('family', 'operator', 'hub_staff'))"


async def add_donations(connection: apsw.AsyncConnection) -> None:
    """Version 3: citizen donation tables, extra catalog items, and the hub_staff role.

    The tables come from the donations section of schema.sql (all IF NOT EXISTS / OR IGNORE).
    SQLite can't alter a CHECK constraint and the users table can't be rebuilt here without
    breaking foreign keys inside the migration transaction, so the role CHECK is widened in place
    as described in https://www.sqlite.org/lang_altertable.html#otheralter.
    """
    schema = await asyncio.to_thread(SCHEMA.read_text, encoding="utf-8")
    async for _ in await connection.execute(schema[schema.index(DONATIONS_MARKER) :]):
        pass
    row = await (
        await connection.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
        )
    ).fetchone()
    if row is None or _ROLE_CHECK_NEW in str(row[0]):
        return
    if _ROLE_CHECK_OLD not in str(row[0]):
        raise RuntimeError("Unexpected users table definition; cannot add the hub_staff role.")
    version = (await (await connection.execute("PRAGMA schema_version")).fetchone() or (0,))[0]
    await connection.execute("PRAGMA writable_schema = ON")
    await connection.execute(
        "UPDATE sqlite_master SET sql = replace(sql, ?, ?) WHERE type = 'table' AND name = 'users'",
        (_ROLE_CHECK_OLD, _ROLE_CHECK_NEW),
    )
    await connection.execute("PRAGMA writable_schema = OFF")
    await connection.execute(f"PRAGMA schema_version = {int(version) + 1}")  # type: ignore[arg-type]


_MIGRATIONS: tuple[tuple[int, Migration], ...] = (
    (
        1,
        """
        -- Keep an operator's allocation budget distinct from derived free space.
        CREATE TABLE IF NOT EXISTS shelter_capacity_budgets (
            shelter_id TEXT PRIMARY KEY REFERENCES shelters(id) ON DELETE CASCADE,
            allocation_budget INTEGER NOT NULL CHECK (allocation_budget >= 0)
        );

        -- The current authoritative reservation for each family.
        CREATE TABLE IF NOT EXISTS current_assignments (
            family_id TEXT PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
            disaster_id TEXT NOT NULL REFERENCES disasters(id) ON DELETE CASCADE,
            shelter_id TEXT REFERENCES shelters(id) ON DELETE SET NULL,
            people INTEGER NOT NULL CHECK (people >= 0),
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS current_assignments_disaster_idx
            ON current_assignments(disaster_id);
        CREATE INDEX IF NOT EXISTS current_assignments_shelter_idx
            ON current_assignments(shelter_id);
        """,
    ),
    (
        2,
        """
CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    disaster_id TEXT NOT NULL REFERENCES disasters(id),
    type TEXT NOT NULL,
    summary TEXT NOT NULL,
    ref_kind TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    actor_kind TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_disaster_created_idx
    ON activity(disaster_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS broadcast_targets (
    update_id TEXT PRIMARY KEY REFERENCES disaster_updates(id) ON DELETE CASCADE,
    target_json TEXT NOT NULL
);

        """,
    ),
)

_MIGRATIONS = (*_MIGRATIONS, (3, add_donations))

_LATEST_VERSION = _MIGRATIONS[-1][0]


async def validate_schema_version(connection: apsw.AsyncConnection) -> int:
    """Reject a database created by a newer app before schema setup runs."""
    version_rows = await (await connection.execute("PRAGMA user_version")).fetchall()
    current_version = version_rows[0][0]
    if not isinstance(current_version, int):
        raise RuntimeError("SQLite returned an invalid schema version.")
    if current_version > _LATEST_VERSION:
        raise RuntimeError(
            f"Database schema version {current_version} is newer than supported version "
            f"{_LATEST_VERSION}."
        )
    return current_version


async def migrate_database(connection: apsw.AsyncConnection) -> None:
    """Apply pending migrations atomically to an already opened connection."""
    current_version = await validate_schema_version(connection)
    if current_version == _LATEST_VERSION:
        return

    await connection.execute("BEGIN IMMEDIATE")
    try:
        # Another worker may have completed migration after the initial read.
        current_version = await validate_schema_version(connection)
        for version, script in _MIGRATIONS:
            if version <= current_version:
                continue
            if version != current_version + 1:
                raise RuntimeError(
                    f"No migration is available for schema version {current_version + 1}."
                )
            if isinstance(script, str):
                async for _ in await connection.execute(script):
                    pass
            else:
                await script(connection)
            await connection.execute(f"PRAGMA user_version = {version}")
            current_version = version
        await connection.execute("COMMIT")
    except BaseException:
        await connection.execute("ROLLBACK")
        raise
