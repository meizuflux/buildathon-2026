"""Create demo accounts for functionality currently available in the API."""

import asyncio
import json
import secrets
from uuid import uuid4

from haven.allocation import recompute_disasters
from haven.auth import hash_password, now, timestamp
from haven.db import connect, initialize_database

DEMO_ACCOUNTS = (
    ("family@demo.example", "family"),
    ("government@demo.example", "operator"),
)


async def seed_demo_data() -> dict[str, str | None]:
    """Create missing accounts and return generated passwords only for new accounts."""
    await initialize_database()
    created = {}
    pending = []
    async with connect() as connection:
        for email, role in DEMO_ACCOUNTS:
            if await (
                await connection.execute("SELECT 1 FROM users WHERE email = ?", (email,))
            ).fetchone():
                created[email] = None
                continue
            password = secrets.token_urlsafe(18)
            password_hash = await asyncio.to_thread(hash_password, password)
            pending.append((email, role, password, password_hash))
        async with connection:
            for email, role, password, password_hash in pending:
                await connection.execute(
                    "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?) "
                    "ON CONFLICT(email) DO NOTHING",
                    ("user_" + uuid4().hex, email, password_hash, role, timestamp(now())),
                )
                created[email] = password if await connection.changes() else None
    return created


DEMO_DISASTER_ID = "demo_tampa_hurricane"


async def seed_tampa_scenario() -> None:
    """Insert a fictional scenario once, without overwriting subsequent edits."""
    await initialize_database()
    async with connect() as connection:
        await connection.execute("BEGIN IMMEDIATE")
        try:
            # A marker prevents reruns from undoing operator edits or resurrecting records.
            existing = await (
                await connection.execute(
                    "SELECT 1 FROM disasters WHERE id = ?",
                    (DEMO_DISASTER_ID,),
                )
            ).fetchone()
            if existing:
                await connection.execute("COMMIT")
                return
            stamp = timestamp(now())
            await connection.execute(
                "INSERT INTO disasters VALUES (?, ?, ?, ?, ?, ?)",
                (
                    DEMO_DISASTER_ID,
                    "hurricane",
                    "Demo Hurricane Tampa",
                    "active",
                    "Tampa, Florida (fictional demo)",
                    stamp,
                ),
            )
            for i in range(20):
                capacity = {"total_people": 200, "available_people": 200}
                capabilities = {
                    "pets_allowed": i % 3 != 0,
                    "child_friendly": True,
                    "wheelchair_accessible": i % 4 != 0,
                    "medical_staff": ["General medical staff"] if i % 3 != 0 else [],
                    "special_care_notes": "General special care" if i % 4 != 0 else None,
                }
                resources = {
                    "food": "available",
                    "water": "available",
                    "medication": "available" if i % 3 != 0 else "unavailable",
                    "clothes": "limited" if i % 2 else "available",
                }
                await connection.execute(
                    "INSERT INTO shelters VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        f"demo_tampa_shelter_{i + 1:02d}",
                        DEMO_DISASTER_ID,
                        f"Demo Shelter {i + 1:02d}",
                        f"Fictional location {i + 1}, Tampa, FL",
                        27.87 + (i // 5) * 0.05,
                        -82.55 + (i % 5) * 0.05,
                        "open",
                        json.dumps(capacity),
                        json.dumps(capabilities),
                        json.dumps(resources),
                        stamp,
                    ),
                )
            for i in range(1000):
                user_id = f"demo_tampa_user_{i + 1:04d}"
                await connection.execute(
                    "INSERT INTO users VALUES (?, ?, ?, ?, ?)",
                    (user_id, f"synthetic-family-{i + 1:04d}@demo.invalid", "!", "family", stamp),
                )
                needs = {
                    "pets": i % 5 == 0,
                    "immediate_medication": i % 17 == 0,
                    "medical_notes": None,
                    "accessibility_notes": "Mobility assistance" if i % 13 == 0 else None,
                    "other_special_care": None,
                }
                await connection.execute(
                    "INSERT INTO families VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        f"demo_tampa_family_{i + 1:04d}",
                        user_id,
                        DEMO_DISASTER_ID,
                        1 + i % 2,
                        i % 3,
                        27.86 + (i % 20) * 0.01,
                        -82.57 + (i % 23) * 0.01,
                        json.dumps(needs),
                        json.dumps({"has_car": i % 4 != 0}),
                        stamp,
                        stamp,
                    ),
                )
            await connection.execute(
                "INSERT INTO disaster_updates VALUES (?, ?, ?, ?, ?, ?)",
                (
                    "demo_tampa_update",
                    DEMO_DISASTER_ID,
                    "Demo hurricane update",
                    "Fictional exercise only. Follow instructions from local officials.",
                    "warning",
                    stamp,
                ),
            )
            await recompute_disasters(connection, (DEMO_DISASTER_ID,))
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise


async def main() -> None:
    for email, password in (await seed_demo_data()).items():
        if password is None:
            print(f"{email}: already exists; left unchanged")
        else:
            print(f"{email}: created; password: {password}")
    await seed_tampa_scenario()
    print("Tampa scenario ready: 20 fictional shelters and 1,000 synthetic families.")
    print("Passwords are shown only when accounts are created.")


if __name__ == "__main__":
    asyncio.run(main())
