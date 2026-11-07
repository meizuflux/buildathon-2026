"""Create demo accounts, the fictional Tampa scenario, donation hubs, depots, shelter needs, and
sample citizen activity."""

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
# Public hubs (organizations with a site type).
# (id, name, site_type, address, lat, lng, capacity_pct, {resource_type_id: (quantity, target)})
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
    """Insert demo hubs, depots, and shelter needs into the Tampa scenario; existing rows are left
    unchanged. Returns the number of hubs created.

    Seeds the Tampa scenario first because every organization belongs to its disaster.
    """
    await seed_tampa_scenario()
    created = 0
    stamp = timestamp(now())
    async with connect() as connection:
        async with connection:
            for hub_id, name, site_type, address, lat, lng, capacity, supplies in DEMO_HUBS:
                await connection.execute(
                    "INSERT INTO organizations (id, disaster_id, name, type, services_json, status, "
                    "address, latitude, longitude, contact_json, coverage_radius_km, notes, "
                    "site_type, capacity_pct, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 5, '', ?, ?, ?) "
                    "ON CONFLICT(id) DO NOTHING",
                    (
                        hub_id,
                        DEMO_DISASTER_ID,
                        name,
                        ORG_TYPE_FOR_SITE[site_type],
                        json.dumps(["distribution"]),
                        address,
                        lat,
                        lng,
                        json.dumps({"name": None, "phone": None, "email": staff_email(hub_id)}),
                        site_type,
                        capacity,
                        stamp,
                    ),
                )
                if not await connection.changes():
                    continue
                created += 1
                for resource_type_id, (quantity, target) in supplies.items():
                    await connection.execute(
                        "INSERT INTO inventory (organization_id, resource_type_id, quantity, "
                        "target, updated_at) VALUES (?, ?, ?, ?, ?)",
                        (hub_id, resource_type_id, quantity, target, stamp),
                    )
            for org_id, name, kind, services, address, lat, lng, notes, stock in DEMO_DEPOTS:
                await connection.execute(
                    "INSERT INTO organizations (id, disaster_id, name, type, services_json, status, "
                    "address, latitude, longitude, contact_json, coverage_radius_km, notes, "
                    "updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 25, ?, ?) "
                    "ON CONFLICT(id) DO NOTHING",
                    (
                        org_id,
                        DEMO_DISASTER_ID,
                        name,
                        kind,
                        json.dumps(services),
                        address,
                        lat,
                        lng,
                        json.dumps({"name": None, "phone": None, "email": None}),
                        notes,
                        stamp,
                    ),
                )
                if not await connection.changes():
                    continue
                for resource_type_id, quantity in stock.items():
                    await connection.execute(
                        "INSERT INTO inventory (organization_id, resource_type_id, quantity, "
                        "updated_at) VALUES (?, ?, ?, ?)",
                        (org_id, resource_type_id, quantity, stamp),
                    )
            for need_id, shelter_id, resource_type_id, quantity, priority, notes in DEMO_NEEDS:
                await connection.execute(
                    "INSERT INTO needs (id, disaster_id, requester_kind, requester_id, "
                    "resource_type_id, quantity_needed, quantity_fulfilled, priority, status, "
                    "needed_by, notes, created_at, updated_at) "
                    "VALUES (?, ?, 'shelter', ?, ?, ?, 0, ?, 'open', NULL, ?, ?, ?) "
                    "ON CONFLICT(id) DO NOTHING",
                    (
                        need_id,
                        DEMO_DISASTER_ID,
                        shelter_id,
                        resource_type_id,
                        quantity,
                        priority,
                        notes,
                        stamp,
                        stamp,
                    ),
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
    print(f"Logistics ready: {len(DEMO_DEPOTS)} depots and {len(DEMO_NEEDS)} open shelter needs.")
    print(
        f"Seeded {len(DEMO_HUBS)} donation hubs, {len(DEMO_REQUESTS)} sample requests, "
        f"{len(DEMO_PLEDGES)} sample pledges."
    )
    print("Passwords are shown only when accounts are created.")


if __name__ == "__main__":
    asyncio.run(main())
