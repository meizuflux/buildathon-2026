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

CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, disaster_id TEXT NOT NULL REFERENCES disasters(id), data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS organizations_disaster_idx ON organizations(disaster_id);
CREATE TABLE IF NOT EXISTS resource_types (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, unit TEXT NOT NULL);
INSERT OR IGNORE INTO resource_types VALUES
 ('water_bottled','Bottled water','water','cases'),
 ('food_mre','Ready-to-eat meals','food','meals'),
 ('food_canned','Canned food','food','cases'),
 ('insulin','Insulin (refrigerated)','medication','vials'),
 ('oxygen','Oxygen','medical_supplies','units'),
 ('medical_supplies','Medical supplies','medical_supplies','kits'),
 ('baby_supplies','Baby supplies','baby','kits'),
 ('bedding','Bedding','bedding','sets'),
 ('hygiene','Hygiene supplies','hygiene','kits'),
 ('clothes','Clothes','clothes','sets'),
 ('power','Power supplies','power','units');
CREATE TABLE IF NOT EXISTS inventory (organization_id TEXT NOT NULL REFERENCES organizations(id), resource_type_id TEXT NOT NULL REFERENCES resource_types(id), quantity INTEGER NOT NULL CHECK(quantity >= 0), reserved INTEGER NOT NULL CHECK(reserved >= 0 AND reserved <= quantity), updated_at TEXT NOT NULL, PRIMARY KEY(organization_id, resource_type_id));
CREATE TABLE IF NOT EXISTS needs (id TEXT PRIMARY KEY, disaster_id TEXT NOT NULL REFERENCES disasters(id), requester_kind TEXT NOT NULL, requester_id TEXT NOT NULL, resource_type_id TEXT NOT NULL REFERENCES resource_types(id), quantity_needed INTEGER NOT NULL, quantity_fulfilled INTEGER NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL, needed_by TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS needs_disaster_idx ON needs(disaster_id);
CREATE TABLE IF NOT EXISTS shipments (id TEXT PRIMARY KEY, disaster_id TEXT NOT NULL REFERENCES disasters(id), source_id TEXT NOT NULL REFERENCES organizations(id), destination_kind TEXT NOT NULL, destination_id TEXT NOT NULL, items TEXT NOT NULL, need_ids TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL, eta TEXT, notes TEXT, status_history TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS shipments_disaster_idx ON shipments(disaster_id);

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
