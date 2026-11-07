"""Create demo accounts, the fictional Tampa scenario, and donation hubs with sample activity."""

import asyncio
import json
import os
import secrets
from uuid import uuid4

from haven.allocation import recompute_disasters
from haven.auth import hash_password, now, timestamp
from haven.db import connect, initialize_database

# Demo region: the fictional Tampa hurricane scenario (see seed_tampa_scenario). Hubs are
# fictional sites in real Tampa neighbourhoods, inside the scenario's shelter and family area.
DEMO_CENTER = (27.9506, -82.4572)
# (id, name, type, address, lat, lng, capacity_pct, {category: (quantity, target)})
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
            "water": (900, 400),
            "canned_goods": (650, 300),
            "blankets": (80, 150),
            "diapers": (40, 200),
            "formula": (10, 60),
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
        {"water": (1200, 500), "blankets": (300, 120), "canned_goods": (90, 200)},
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
            "water": (250, 300),
            "diapers": (180, 150),
            "formula": (35, 80),
            "canned_goods": (210, 250),
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
        {"water": (150, 400), "blankets": (60, 200), "canned_goods": (120, 300)},
    ),
    (
        "hub_demo_east_tampa_mosque",
        "East Tampa Islamic Center",
        "mosque",
        "Fictional address, East Tampa, Tampa, FL",
        27.9800,
        -82.4150,
        91,
        {"canned_goods": (800, 300), "diapers": (500, 200), "water": (100, 300)},
    ),
    (
        "hub_demo_sulphur_springs_fire",
        "Sulphur Springs Fire Station",
        "fire_station",
        "Fictional address, Sulphur Springs, Tampa, FL",
        28.0230,
        -82.4520,
        30,
        {"water": (60, 300), "formula": (5, 50), "diapers": (20, 100)},
    ),
    (
        "hub_demo_palmetto_beach",
        "Palmetto Beach Rec Center",
        "community_center",
        "Fictional address, Palmetto Beach, Tampa, FL",
        27.9520,
        -82.4140,
        18,
        {"water": (40, 250), "blankets": (10, 100), "canned_goods": (30, 200)},
    ),
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
        [{"category": "formula", "quantity": 4}, {"category": "diapers", "quantity": 2}],
        28.0180,
        -82.4600,
        "Fictional address, Sulphur Springs, Tampa, FL",
        "Infant, 3 months. House flooded, no car.",
    ),
    (
        "request_demo_water",
        [{"category": "water", "quantity": 24}],
        27.9550,
        -82.4180,
        "Fictional address, Palmetto Beach, Tampa, FL",
        "",
    ),
    (
        "request_demo_blankets",
        [{"category": "blankets", "quantity": 3}, {"category": "canned_goods", "quantity": 10}],
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
        [{"category": "formula", "quantity": 12}],
        "Dropping off after 5pm",
    ),
    (
        "pledge_demo_sulphur_springs",
        "hub_demo_sulphur_springs_fire",
        [{"category": "water", "quantity": 48}, {"category": "diapers", "quantity": 30}],
        "",
    ),
)


async def seed_demo_data() -> dict[str, str | None]:
    """Create hubs, missing accounts, and sample activity; return passwords only for new accounts.

    New accounts get a generated password each, or `DEMO_PASSWORD` for all of them when that is set.
    """
    await seed_hubs()
    shared = os.environ.get("DEMO_PASSWORD")
    created = {}
    pending = []
    async with connect() as connection:
        for email, role, hub_id in DEMO_ACCOUNTS:
            if await (
                await connection.execute("SELECT 1 FROM users WHERE email = ?", (email,))
            ).fetchone():
                created[email] = None
                continue
            password = shared or secrets.token_urlsafe(18)
            password_hash = await asyncio.to_thread(hash_password, password)
            pending.append((email, role, hub_id, password, password_hash))
        async with connection:
            for email, role, hub_id, password, password_hash in pending:
                user_id = "user_" + uuid4().hex
                await connection.execute(
                    "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?) "
                    "ON CONFLICT(email) DO NOTHING",
                    (user_id, email, password_hash, role, timestamp(now())),
                )
                created[email] = password if await connection.changes() else None
                if created[email] and hub_id:
                    await connection.execute(
                        "INSERT INTO hub_staff (user_id, hub_id) VALUES (?, ?)", (user_id, hub_id)
                    )
    await seed_activity()
    return created


async def seed_hubs() -> int:
    """Insert demo hubs and their supplies; existing hubs are left unchanged. Returns hubs created."""
    await initialize_database()
    created = 0
    async with connect() as connection:
        async with connection:
            for hub_id, name, kind, address, lat, lng, capacity, supplies in DEMO_HUBS:
                await connection.execute(
                    "INSERT INTO hubs (id, name, type, address, latitude, longitude, capacity_pct, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
                    (hub_id, name, kind, address, lat, lng, capacity, timestamp(now())),
                )
                if not await connection.changes():
                    continue
                created += 1
                for category, (quantity, target) in supplies.items():
                    await connection.execute(
                        "INSERT INTO hub_supplies (hub_id, category, quantity, target) VALUES (?, ?, ?, ?)",
                        (hub_id, category, quantity, target),
                    )
    return created


async def seed_activity() -> None:
    """Sample open requests and pending pledges from the demo family; existing rows are left unchanged."""
    async with connect() as connection:
        family = await (
            await connection.execute("SELECT id FROM users WHERE email = 'family@demo.example'")
        ).fetchone()
        if family is None:
            return
        stamp = timestamp(now())
        async with connection:
            for request_id, items, lat, lng, address, notes in DEMO_REQUESTS:
                await connection.execute(
                    "INSERT INTO supply_requests (id, user_id, items_json, latitude, longitude, address, notes, status, "
                    "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?) ON CONFLICT(id) DO NOTHING",
                    (
                        request_id,
                        family[0],
                        json.dumps(items),
                        lat,
                        lng,
                        address,
                        notes,
                        stamp,
                        stamp,
                    ),
                )
            for pledge_id, hub_id, items, notes in DEMO_PLEDGES:
                await connection.execute(
                    "INSERT INTO pledges (id, user_id, hub_id, items_json, notes, status, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT(id) DO NOTHING",
                    (pledge_id, family[0], hub_id, json.dumps(items), notes, stamp, stamp),
                )


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
    print(
        f"Seeded {len(DEMO_HUBS)} donation hubs, {len(DEMO_REQUESTS)} sample requests, "
        f"{len(DEMO_PLEDGES)} sample pledges."
    )
    print("Passwords are shown only when accounts are created.")


if __name__ == "__main__":
    asyncio.run(main())
