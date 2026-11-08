"""Versioned, transactional SQLite schema migrations.

Fresh databases are bootstrapped from ``schema.sql``. Migrations upgrade
databases created by earlier application versions; SQLite's ``user_version``
keeps the applied version in the database itself.

"""

import apsw

_MIGRATIONS: tuple[tuple[int, str], ...] = (
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
    (
        3,
        """
        -- Broadcasts written before the activity feed existed (or seeded directly)
        -- have no timeline entry. Backfill one per broadcast so the feed is complete.
        CREATE TABLE IF NOT EXISTS disaster_updates (
            id TEXT PRIMARY KEY,
            disaster_id TEXT NOT NULL REFERENCES disasters(id),
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            severity TEXT NOT NULL,
            published_at TEXT NOT NULL
        );
        INSERT INTO activity (
            id, disaster_id, type, summary, ref_kind, ref_id,
            actor_kind, actor_id, actor_name, created_at
        )
        SELECT 'act_backfill_' || u.id, u.disaster_id, 'update_published',
               'Broadcast sent: ' || u.title, 'update', u.id,
               'system', 'system', 'System', u.published_at
        FROM disaster_updates u
        WHERE NOT EXISTS (
            SELECT 1 FROM activity a WHERE a.ref_kind = 'update' AND a.ref_id = u.id
        );
        """,
    ),
)


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
            async for _ in await connection.execute(script):
                pass
            await connection.execute(f"PRAGMA user_version = {version}")
            current_version = version
        await connection.execute("COMMIT")
    except BaseException:
        await connection.execute("ROLLBACK")
        raise
