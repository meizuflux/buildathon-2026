"""Migration 3 adds the donation tables and the hub_staff role to databases made before them."""

import asyncio

import apsw

from haven.migrations import migrate_database

OLD_USERS = (
    "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL, "
    "role TEXT NOT NULL CHECK (role IN ('family', 'operator')), created_at TEXT NOT NULL); "
    "CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id)); "
    "CREATE TABLE disasters (id TEXT PRIMARY KEY); "
    "CREATE TABLE families (id TEXT PRIMARY KEY, owner_user_id TEXT REFERENCES users(id)); "
    "CREATE TABLE shelters (id TEXT PRIMARY KEY, capacity_json TEXT NOT NULL); "
    "INSERT INTO users VALUES ('u1', 'a@b.c', 'x', 'family', 't'); "
    "INSERT INTO sessions VALUES ('s1', 'u1'); "
    "INSERT INTO families VALUES ('f1', 'u1'); "
    "PRAGMA user_version = 0;"
)


def test_hub_staff_role_and_donation_tables_added_to_existing_database():
    async def exercise():
        connection = await apsw.Connection.as_async(":memory:")
        try:
            await connection.execute("PRAGMA foreign_keys = ON")
            async for _ in await connection.execute(OLD_USERS):
                pass
            await migrate_database(connection)
            await migrate_database(connection)  # idempotent

            assert await (await connection.execute("PRAGMA user_version")).fetchone() == (3,)
            names = {
                row[0]
                for row in await (
                    await connection.execute("SELECT name FROM sqlite_master")
                ).fetchall()
            }
            assert {"hubs", "hub_view", "supply_requests", "pledges", "custom_submissions"} <= names
            await connection.execute(
                "INSERT INTO users VALUES ('u2', 'staff@b.c', 'x', 'hub_staff', 't')"
            )
            for bad in (
                "INSERT INTO users VALUES ('u3', 'x@b.c', 'x', 'admin', 't')",
                "INSERT INTO sessions VALUES ('s2', 'nobody')",
            ):
                try:
                    await connection.execute(bad)
                except apsw.ConstraintError:
                    continue
                raise AssertionError(f"constraint not enforced: {bad}")
            rows = await (await connection.execute("SELECT id FROM sessions")).fetchall()
            assert rows == [("s1",)]
            assert (await (await connection.execute("PRAGMA integrity_check")).fetchone()) == (
                "ok",
            )
            details = await (
                await connection.execute(
                    "SELECT citizen_requestable FROM resource_type_details "
                    "WHERE resource_type_id = 'baby_formula'"
                )
            ).fetchone()
            assert details == (1,)
        finally:
            await connection.aclose()

    asyncio.run(exercise())
