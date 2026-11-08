"""Recreate the disposable demo database with accounts and a complete scenario."""

import asyncio
import json
import math
import os
import secrets
from pathlib import Path
from uuid import uuid4

from haven.allocation import recompute_disasters
from haven.auth import hash_password, now, timestamp
from haven.db import connect, database_path
from haven.demo_households import generate_households
from haven.startup import initialize_database

# Demo region: the fictional Tampa hurricane scenario (see seed_tampa_scenario). Hubs are
# fictional sites in real Tampa neighbourhoods, inside the scenario's shelter and family area.
DEMO_CENTER = (27.9506, -82.4572)
# Public hubs (organizations with a site type).
# (id, name, site_type, address, lat, lng, starting % full, {resource_type_id: (quantity, _)}).
# Each hub's storage size is chosen so its starting stock fills it to that percentage; from then on
# % full follows stock. Targets come from demand (donations/targets.py); the second number in
# each supply tuple is unused.
DEMO_HUBS = (
    (
        "hub_demo_ybor",
        "Ybor City Community Church",
        "church",
        "Fictional address, Ybor City, Tampa, FL",
        27.9600,
        -82.4360,
        96,
        {
            "water_bottled": (900, 400),
            "food_canned": (650, 300),
            "blankets": (80, 150),
            "diapers": (40, 200),
            "baby_formula": (10, 60),
        },
    ),
    (
        "hub_demo_downtown_fire",
        "Downtown Fire Station",
        "fire_station",
        "Fictional address, Downtown, Tampa, FL",
        27.9480,
        -82.4580,
        92,
        {"water_bottled": (1200, 500), "blankets": (300, 120), "food_canned": (90, 200)},
    ),
    (
        "hub_demo_seminole_heights",
        "Seminole Heights Community Center",
        "community_center",
        "Fictional address, Seminole Heights, Tampa, FL",
        28.0010,
        -82.4590,
        74,
        {
            "water_bottled": (250, 300),
            "diapers": (180, 150),
            "baby_formula": (35, 80),
            "food_canned": (210, 250),
        },
    ),
    (
        "hub_demo_westshore_school",
        "Westshore Middle School Gym",
        "school",
        "Fictional address, Westshore, Tampa, FL",
        27.9480,
        -82.5250,
        55,
        {"water_bottled": (150, 400), "blankets": (60, 200), "food_canned": (120, 300)},
    ),
    (
        "hub_demo_east_tampa_mosque",
        "East Tampa Islamic Center",
        "mosque",
        "Fictional address, East Tampa, Tampa, FL",
        27.9800,
        -82.4150,
        91,
        {"food_canned": (800, 300), "diapers": (500, 200), "water_bottled": (100, 300)},
    ),
    (
        "hub_demo_sulphur_springs_fire",
        "Sulphur Springs Fire Station",
        "fire_station",
        "Fictional address, Sulphur Springs, Tampa, FL",
        28.0230,
        -82.4520,
        30,
        {"water_bottled": (60, 300), "baby_formula": (5, 50), "diapers": (20, 100)},
    ),
    (
        "hub_demo_palmetto_beach",
        "Palmetto Beach Rec Center",
        "community_center",
        "Fictional address, Palmetto Beach, Tampa, FL",
        27.9520,
        -82.4140,
        18,
        {"water_bottled": (40, 250), "blankets": (10, 100), "food_canned": (30, 200)},
    ),
)

ORG_TYPE_FOR_SITE = {
    "church": "faith",
    "mosque": "faith",
    "fire_station": "government",
    "school": "government",
    "community_center": "nonprofit",
}

# Back-office organizations that hold bulk stock but aren't citizen-facing hubs.
# (id, name, type, services, address, lat, lng, notes, {resource_type_id: quantity})
DEMO_DEPOTS = (
    (
        "org_demo_county_depot",
        "Hillsborough Relief Depot",
        "government",
        ["distribution", "logistics", "transport"],
        "Fictional address, Port Tampa Bay, Tampa, FL",
        27.9370,
        -82.4430,
        "Forklift and two box trucks on site.",
        {
            "water_bottled": 4000,
            "water_gallon": 1500,
            "food_mre": 6000,
            "cots": 300,
            "blankets": 800,
            "generator": 12,
            "fuel": 900,
            "first_aid": 250,
        },
    ),
    (
        "org_demo_food_bank",
        "Bayside Food Bank",
        "nonprofit",
        ["distribution", "food"],
        "Fictional address, Drew Park, Tampa, FL",
        27.9750,
        -82.4990,
        "Refrigerated truck available.",
        {
            "food_canned": 2500,
            "food_mre": 1200,
            "baby_formula": 400,
            "diapers": 600,
            "hygiene_kit": 500,
            "insulin": 60,
        },
    ),
)

# Open shelter needs for the logistics dashboard: (id, shelter_id, resource_type_id, quantity,
# priority, notes)
DEMO_NEEDS = (
    (
        "need_demo_water",
        "demo_tampa_shelter_03",
        "water_bottled",
        40,
        "critical",
        "Over capacity, turning families away.",
    ),
    ("need_demo_cots", "demo_tampa_shelter_07", "cots", 60, "high", "Overflow sleeping area."),
    (
        "need_demo_insulin",
        "demo_tampa_shelter_12",
        "insulin",
        15,
        "critical",
        "Two diabetic residents.",
    ),
    ("need_demo_formula", "demo_tampa_shelter_15", "baby_formula", 30, "medium", ""),
)


def staff_email(hub_id: str) -> str:
    return f"staff.{hub_id.removeprefix('hub_demo_').replace('_', '-')}@demo.example"


# (email, role, hub_id for hub staff)
DEMO_ACCOUNTS = (
    ("family@demo.example", "family", None),
    ("government@demo.example", "operator", None),
    *((staff_email(hub[0]), "hub_staff", hub[0]) for hub in DEMO_HUBS),
)

# Sample activity from the demo family so queues aren't empty.
# (id, items, lat, lng, address, notes)
DEMO_REQUESTS = (
    (
        "request_demo_formula",
        [
            {"resource_type_id": "baby_formula", "quantity": 4},
            {"resource_type_id": "diapers", "quantity": 2},
        ],
        28.0180,
        -82.4600,
        "Fictional address, Sulphur Springs, Tampa, FL",
        "Infant, 3 months. House flooded, no car.",
    ),
    (
        "request_demo_water",
        [{"resource_type_id": "water_bottled", "quantity": 24}],
        27.9550,
        -82.4180,
        "Fictional address, Palmetto Beach, Tampa, FL",
        "",
    ),
    (
        "request_demo_blankets",
        [
            {"resource_type_id": "blankets", "quantity": 3},
            {"resource_type_id": "food_canned", "quantity": 10},
        ],
        27.9620,
        -82.4850,
        "Fictional address, West Tampa, Tampa, FL",
        "Family of five, can pick up.",
    ),
)
# (id, hub_id, items, notes)
DEMO_PLEDGES = (
    (
        "pledge_demo_seminole_heights",
        "hub_demo_seminole_heights",
        [{"resource_type_id": "baby_formula", "quantity": 12}],
        "Dropping off after 5pm",
    ),
    (
        "pledge_demo_sulphur_springs",
        "hub_demo_sulphur_springs_fire",
        [
            {"resource_type_id": "water_bottled", "quantity": 48},
            {"resource_type_id": "diapers", "quantity": 30},
        ],
        "",
    ),
)


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
                password = secrets.token_urlsafe(18)
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
