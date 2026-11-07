"""Create demo accounts, donation hubs, and sample activity for functionality currently available in the API."""

import asyncio
import json
import os
import secrets
from uuid import uuid4

from haven.auth import hash_password, now, timestamp
from haven.db import connect, initialize_database

# Placeholder demo region (Houston, TX); change once the team picks a region.
DEMO_CENTER = (29.7604, -95.3698)
# (id, name, type, address, lat, lng, capacity_pct, {category: (quantity, target)})
DEMO_HUBS = (
    ("hub_demo_st_marks", "St. Mark's Church", "church", "3815 Bellaire Blvd", 29.7058, -95.4300, 96,
     {"water": (900, 400), "canned_goods": (650, 300), "blankets": (80, 150), "diapers": (40, 200), "formula": (10, 60)}),
    ("hub_demo_station_8", "Fire Station 8", "fire_station", "1919 Elgin St", 29.7340, -95.3700, 92,
     {"water": (1200, 500), "blankets": (300, 120), "canned_goods": (90, 200)}),
    ("hub_demo_heights_cc", "Heights Community Center", "community_center", "1200 Yale St", 29.7920, -95.3990, 74,
     {"water": (250, 300), "diapers": (180, 150), "formula": (35, 80), "canned_goods": (210, 250)}),
    ("hub_demo_lamar_hs", "Lamar High School Gym", "school", "3325 Westheimer Rd", 29.7420, -95.4290, 55,
     {"water": (150, 400), "blankets": (60, 200), "canned_goods": (120, 300)}),
    ("hub_demo_grace", "Grace Fellowship", "church", "6200 Gulf Fwy", 29.6980, -95.2990, 91,
     {"canned_goods": (800, 300), "diapers": (500, 200), "water": (100, 300)}),
    ("hub_demo_station_26", "Fire Station 26", "fire_station", "4511 Aldine Mail Rd", 29.8740, -95.3560, 30,
     {"water": (60, 300), "formula": (5, 50), "diapers": (20, 100)}),
    ("hub_demo_eastwood", "Eastwood Rec Center", "community_center", "5000 Harrisburg Blvd", 29.7300, -95.3330, 18,
     {"water": (40, 250), "blankets": (10, 100), "canned_goods": (30, 200)}),
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
    ("request_demo_formula", [{"category": "formula", "quantity": 4}, {"category": "diapers", "quantity": 2}],
     29.7500, -95.3600, "2100 Travis St, Apt 4B", "Infant, 3 months. No car."),
    ("request_demo_water", [{"category": "water", "quantity": 24}], 29.7810, -95.3850, "815 W 19th St", ""),
    ("request_demo_blankets", [{"category": "blankets", "quantity": 3}, {"category": "canned_goods", "quantity": 10}],
     29.7200, -95.3400, "4400 Lyons Ave", "Family of five, can pick up."),
)
# (id, hub_id, items, notes)
DEMO_PLEDGES = (
    ("pledge_demo_heights", "hub_demo_heights_cc", [{"category": "formula", "quantity": 12}], "Dropping off after 5pm"),
    ("pledge_demo_station_26", "hub_demo_station_26",
     [{"category": "water", "quantity": 48}, {"category": "diapers", "quantity": 30}], ""),
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
            if await (await connection.execute("SELECT 1 FROM users WHERE email = ?", (email,))).fetchone():
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
                    await connection.execute("INSERT INTO hub_staff (user_id, hub_id) VALUES (?, ?)", (user_id, hub_id))
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
        family = await (await connection.execute(
            "SELECT id FROM users WHERE email = 'family@demo.example'"
        )).fetchone()
        if family is None:
            return
        stamp = timestamp(now())
        async with connection:
            for request_id, items, lat, lng, address, notes in DEMO_REQUESTS:
                await connection.execute(
                    "INSERT INTO supply_requests (id, user_id, items_json, latitude, longitude, address, notes, status, "
                    "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?) ON CONFLICT(id) DO NOTHING",
                    (request_id, family[0], json.dumps(items), lat, lng, address, notes, stamp, stamp),
                )
            for pledge_id, hub_id, items, notes in DEMO_PLEDGES:
                await connection.execute(
                    "INSERT INTO pledges (id, user_id, hub_id, items_json, notes, status, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT(id) DO NOTHING",
                    (pledge_id, family[0], hub_id, json.dumps(items), notes, stamp, stamp),
                )


async def main() -> None:
    for email, password in (await seed_demo_data()).items():
        if password is None:
            print(f"{email}: already exists; left unchanged")
        else:
            print(f"{email}: created; password: {password}")
    print("Passwords are shown only when accounts are created.")
    print(f"Seeded {len(DEMO_HUBS)} donation hubs, {len(DEMO_REQUESTS)} sample requests, {len(DEMO_PLEDGES)} sample pledges.")


if __name__ == "__main__":
    asyncio.run(main())
