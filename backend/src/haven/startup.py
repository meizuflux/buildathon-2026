"""Application startup orchestration for database setup and reconciliation."""

from haven.allocation import recompute_disasters
from haven.db import connect, initialize_schema
from haven.migrations import migrate_database, validate_schema_version


async def initialize_database() -> None:
    """Create and migrate the schema, then reconcile existing plans once."""
    async with connect() as connection:
        await validate_schema_version(connection)
    await initialize_schema()
    async with connect() as connection:
        await migrate_database(connection)
        # Existing installations may contain recommendation-only plans. Reconcile
        # them through the same ledger as live edits before serving requests.
        await connection.execute("BEGIN IMMEDIATE")
        try:
            disasters = await (
                await connection.execute("SELECT id FROM disasters ORDER BY id")
            ).fetchall()
            await recompute_disasters(connection, (row[0] for row in disasters))
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
