"""Create demo accounts and donation hubs for functionality currently available in the API."""

import asyncio
import secrets
from uuid import uuid4

from haven.auth import hash_password, now, timestamp
from haven.db import connect, initialize_database

DEMO_ACCOUNTS = (
    ("family@demo.example", "family"),
    ("government@demo.example", "operator"),
)

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


async def seed_demo_data() -> dict[str, str | None]:
    """Create missing accounts and return generated passwords only for new accounts."""
    await initialize_database()
    created = {}
    pending = []
    async with connect() as connection:
        for email, role in DEMO_ACCOUNTS:
            if await (await connection.execute("SELECT 1 FROM users WHERE email = ?", (email,))).fetchone():
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


async def main() -> None:
    for email, password in (await seed_demo_data()).items():
        if password is None:
            print(f"{email}: already exists; left unchanged")
        else:
            print(f"{email}: created; password: {password}")
    print("Passwords are shown only when accounts are created.")
    print(f"Donation hubs: {await seed_hubs()} created, {len(DEMO_HUBS)} total in demo set.")


if __name__ == "__main__":
    asyncio.run(main())
