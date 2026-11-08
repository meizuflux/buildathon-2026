"""Recreate the disposable demo database with accounts and a complete scenario."""

import asyncio
import json
import os
from pathlib import Path
from uuid import uuid4

from haven.allocation import recompute_disasters
from haven.auth import hash_password, now, timestamp
from haven.db import connect, database_path
from haven.demo_households import generate_households
from haven.startup import initialize_database

DEMO_ACCOUNTS = (("family@example.com", "family"), ("gov@example.com", "operator"))


async def seed_demo_data() -> dict[str, str]:
    """Discard the configured SQLite database and return fresh demo credentials."""
    locations = json.loads(DEMO_LOCATIONS.read_text(encoding="utf-8"))
    path = database_path()
    for suffix in ("", "-wal", "-shm", "-journal"):
        Path(str(path) + suffix).unlink(missing_ok=True)
    await initialize_database()
    created = {}
    async with connect() as connection:
        async with connection:
            for email, role in DEMO_ACCOUNTS:
                password = os.environ.get("DEMO_PASSWORD") or email.split("@", 1)[0]
                password_hash = await asyncio.to_thread(hash_password, password)
                await connection.execute(
                    "INSERT INTO users (id, email, password_hash, role, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    ("user_" + uuid4().hex, email, password_hash, role, timestamp(now())),
                )
                created[email] = password
    await _seed_golden_gate_scenario(locations)
    return created


DEMO_DISASTER_ID = "demo_golden_gate_hurricane"
DEMO_LOCATIONS = Path(__file__).with_name("data") / "golden_gate_estates.json"
DEMO_NAME = "Demo Hurricane — Golden Gate Estates"
DEMO_AREA = "Golden Gate Estates, Naples, Florida (fictional demo)"
# Simulated shelter capacities for this exercise.
SHELTER_CAPACITIES = (800, 600, 600, 600, 500, 500, 400)


async def _seed_golden_gate_scenario(locations: dict) -> None:
    """Populate an empty database using the offline geography fixture."""
    async with connect() as connection:
        await connection.execute("BEGIN IMMEDIATE")
        try:
            stamp = timestamp(now())
            await connection.execute(
                "INSERT INTO disasters (id, type, name, status, affected_area, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    DEMO_DISASTER_ID,
                    "hurricane",
                    DEMO_NAME,
                    "active",
                    DEMO_AREA,
                    stamp,
                ),
            )
            for i, site in enumerate(locations["shelters"]):
                total = SHELTER_CAPACITIES[i]
                capacity = {"total_people": total, "available_people": total}
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
                    "INSERT INTO shelters (id, disaster_id, name, address, latitude, longitude, status, "
                    "capacity_json, capabilities_json, resources_json, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        f"demo_shelter_{i + 1:02d}",
                        DEMO_DISASTER_ID,
                        f"Demo — {site['name']}",
                        site["address"],
                        site["latitude"],
                        site["longitude"],
                        "open",
                        json.dumps(capacity),
                        json.dumps(capabilities),
                        json.dumps(resources),
                        stamp,
                    ),
                )
            households = generate_households(len(locations["households"]))
            for i, (home, profile) in enumerate(
                zip(locations["households"], households, strict=True)
            ):
                family_id = f"demo_family_{i + 1:04d}"
                user_id = f"demo_user_{i + 1:04d}"
                await connection.execute(
                    "INSERT INTO users (id, email, password_hash, role, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (user_id, f"synthetic-family-{i + 1:04d}@demo.invalid", "!", "family", stamp),
                )
                await connection.execute(
                    "INSERT INTO families (id, owner_user_id, disaster_id, adults, children, latitude, longitude, "
                    "needs_json, resources_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        family_id,
                        user_id,
                        DEMO_DISASTER_ID,
                        profile["adults"],
                        profile["children"],
                        home["latitude"],
                        home["longitude"],
                        json.dumps(profile["needs"]),
                        json.dumps(profile["resources"]),
                        stamp,
                        stamp,
                    ),
                )
            await connection.execute(
                "INSERT INTO disaster_updates (id, disaster_id, title, message, severity, published_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    "demo_update",
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
    print(f"Recreating disposable demo database: {database_path()}")
    for email, password in (await seed_demo_data()).items():
        print(f"{email}: password: {password}")
    print("Golden Gate Estates ready: 7 simulated shelters and 1,000 synthetic households.")


if __name__ == "__main__":
    asyncio.run(main())
