"""Recreate the disposable demo database with accounts and a complete scenario."""

import asyncio
import json
import os
import secrets
from pathlib import Path
from typing import Any
from uuid import uuid4

from haven.allocation import recompute_disasters
from haven.auth import hash_password, now, timestamp
from haven.db import connect, database_path
from haven.demo_households import generate_households
from haven.startup import initialize_database

DEMO_ACCOUNTS = (("family@demo.example", "family"), ("government@demo.example", "operator"))


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
                password = os.environ.get("DEMO_PASSWORD") or secrets.token_urlsafe(18)
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
DEMO_SHELTER_OPERATIONS = {
    # Capacity, medical staff, pets, special care, clothes availability.
    "demo_shelter_01": (1800, True, True, True, "available"),
    "demo_shelter_04": (1200, True, True, True, "available"),
    "demo_shelter_05": (500, True, True, True, "available"),
    "demo_shelter_06": (500, True, True, True, "limited"),
    "demo_shelter_08": (500, False, True, False, "limited"),
    "demo_shelter_09": (250, True, False, True, "available"),
    "demo_shelter_10": (500, True, True, True, "available"),
    "demo_shelter_11": (500, False, False, True, "limited"),
    "demo_shelter_12": (250, True, False, True, "limited"),
}


def demo_shelter_snapshots(locations: dict[str, Any]) -> list[dict[str, Any]]:
    """Build the same fictional shelter inputs for seeding and offline analysis."""
    result = []
    for i, site in enumerate(locations["shelters"]):
        identity = site.get("id", f"demo_shelter_{i + 1:02d}")
        total, medical, pets, special_care, clothes = DEMO_SHELTER_OPERATIONS[identity]
        result.append(
            {
                "id": identity,
                "disaster_id": DEMO_DISASTER_ID,
                "name": f"Demo — {site['name']}",
                "address": site["address"],
                "status": "open",
                "location": {"latitude": site["latitude"], "longitude": site["longitude"]},
                "allocation_budget": total,
                "capacity": {"total_people": total, "available_people": total},
                "capabilities": {
                    "pets_allowed": pets,
                    "child_friendly": True,
                    "wheelchair_accessible": True,
                    "medical_staff": ["General medical staff"] if medical else [],
                    "special_care_notes": "General special care" if special_care else None,
                },
                "resources": {
                    "food": "available",
                    "water": "available",
                    "medication": "available" if medical else "unavailable",
                    "clothes": clothes,
                },
            }
        )
    return result


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
            for shelter in demo_shelter_snapshots(locations):
                await connection.execute(
                    "INSERT INTO shelters (id, disaster_id, name, address, latitude, longitude, status, "
                    "capacity_json, capabilities_json, resources_json, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        shelter["id"],
                        DEMO_DISASTER_ID,
                        shelter["name"],
                        shelter["address"],
                        shelter["location"]["latitude"],
                        shelter["location"]["longitude"],
                        "open",
                        json.dumps(shelter["capacity"]),
                        json.dumps(shelter["capabilities"]),
                        json.dumps(shelter["resources"]),
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
            await connection.execute(
                "INSERT INTO activity (id, disaster_id, type, summary, ref_kind, ref_id, "
                "actor_kind, actor_id, actor_name, created_at) "
                "VALUES (?, ?, 'update_published', ?, 'update', ?, 'system', 'system', 'System', ?)",
                (
                    "act_demo_update",
                    DEMO_DISASTER_ID,
                    "Broadcast sent to all families: Demo hurricane update",
                    "demo_update",
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
    print(
        f"Golden Gate Estates ready: {len(DEMO_SHELTER_OPERATIONS)} simulated hubs and 1,000 synthetic households."
    )


if __name__ == "__main__":
    asyncio.run(main())
