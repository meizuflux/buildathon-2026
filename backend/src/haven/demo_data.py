"""Create demo accounts, donation hubs, and sample activity for functionality currently available in the API."""

import asyncio
import json
import os
import secrets
from uuid import uuid4

from haven.auth import hash_password, now, timestamp
from haven.db import connect, initialize_database

# Demo region: Jakarta, Indonesia (flood response). Hub locations are approximate.
DEMO_CENTER = (-6.1900, 106.8350)
# (id, name, type, address, lat, lng, capacity_pct, {category: (quantity, target)})
DEMO_HUBS = (
    ("hub_demo_istiqlal", "Masjid Istiqlal", "mosque", "Jl. Taman Wijaya Kusuma, Pasar Baru", -6.1702, 106.8310, 96,
     {"water": (900, 400), "canned_goods": (650, 300), "blankets": (80, 150), "diapers": (40, 200), "formula": (10, 60)}),
    ("hub_demo_damkar_tanah_abang", "Pos Damkar Tanah Abang", "fire_station", "Jl. K.H. Mas Mansyur, Tanah Abang",
     -6.2006, 106.8150, 92, {"water": (1200, 500), "blankets": (300, 120), "canned_goods": (90, 200)}),
    ("hub_demo_gor_senen", "GOR Senen", "community_center", "Jl. Kramat Raya, Senen", -6.1830, 106.8430, 74,
     {"water": (250, 300), "diapers": (180, 150), "formula": (35, 80), "canned_goods": (210, 250)}),
    ("hub_demo_sman_8", "SMA Negeri 8 Jakarta", "school", "Jl. Taman Bukit Duri, Tebet", -6.2266, 106.8551, 55,
     {"water": (150, 400), "blankets": (60, 200), "canned_goods": (120, 300)}),
    ("hub_demo_gereja_kelapa_gading", "Gereja Santo Yakobus", "church", "Jl. Boulevard Bukit Gading Raya, Kelapa Gading",
     -6.1580, 106.9060, 91, {"canned_goods": (800, 300), "diapers": (500, 200), "water": (100, 300)}),
    ("hub_demo_damkar_penjaringan", "Pos Damkar Penjaringan", "fire_station", "Jl. Pluit Raya, Penjaringan",
     -6.1265, 106.7900, 30, {"water": (60, 300), "formula": (5, 50), "diapers": (20, 100)}),
    ("hub_demo_kampung_melayu", "Balai Warga Kampung Melayu", "community_center", "Jl. Jatinegara Barat, Kampung Melayu",
     -6.2245, 106.8670, 18, {"water": (40, 250), "blankets": (10, 100), "canned_goods": (30, 200)}),
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
     -6.2240, 106.8600, "Gg. Arus, Bukit Duri, RT 05/RW 12", "Infant, 3 months. House flooded, no vehicle."),
    ("request_demo_water", [{"category": "water", "quantity": 24}], -6.1300, 106.7950, "Kampung Muara Baru, Penjaringan", ""),
    ("request_demo_blankets", [{"category": "blankets", "quantity": 3}, {"category": "canned_goods", "quantity": 10}],
     -6.2150, 106.8700, "Jl. Kampung Melayu Kecil, RT 03", "Family of five, can pick up."),
)
# (id, hub_id, items, notes)
DEMO_PLEDGES = (
    ("pledge_demo_gor_senen", "hub_demo_gor_senen", [{"category": "formula", "quantity": 12}], "Dropping off after 5pm"),
    ("pledge_demo_penjaringan", "hub_demo_damkar_penjaringan",
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
