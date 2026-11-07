"""Demand-adjusted cap on how many active requests one citizen may hold.

A citizen's active requests are those open or assigned. The cap starts at BASE_CAP and moves with
demand pressure for each category: units wanted by open requests divided by units available
(on hand minus reserved) across all hubs. A request is limited by its scarcest category, so a
formula shortage tightens formula requests without restricting people asking for water.
"""

import apsw

from haven.donations.common import CATEGORIES, parse_items, reserved

BASE_CAP = 3
# (pressure below this, cap). Pressure at or above the last threshold gets MIN_CAP.
LEVELS = ((0.25, 4), (0.6, BASE_CAP), (1.0, 2))
MIN_CAP = 1
LEVEL_NAMES = {4: "low", BASE_CAP: "normal", 2: "high", MIN_CAP: "critical"}


def cap_for(pressure: float) -> int:
    for threshold, cap in LEVELS:
        if pressure < threshold:
            return cap
    return MIN_CAP


async def demand_pressure(connection: apsw.AsyncConnection) -> dict[str, float]:
    """Pressure per category: open demand / available stock (infinite when nothing is available)."""
    available = dict.fromkeys(CATEGORIES, 0)
    async for category, total in await connection.execute(
        "SELECT category, SUM(quantity) FROM hub_supplies GROUP BY category"
    ):
        available[category] = total
    hubs = tuple(
        str(row[0]) for row in await (await connection.execute("SELECT id FROM hubs")).fetchall()
    )
    for per_hub in (await reserved(connection, hubs)).values():
        for category, quantity in per_hub.items():
            available[category] -= quantity
    demand = dict.fromkeys(CATEGORIES, 0)
    async for (raw,) in await connection.execute(
        "SELECT items_json FROM supply_requests WHERE status = 'open'"
    ):
        for item in parse_items(raw):
            demand[item["category"]] += item["quantity"]
    return {
        category: (demand[category] / available[category])
        if available[category] > 0
        else float("inf")
        for category in CATEGORIES
    }


async def active_count(connection: apsw.AsyncConnection, user_id: str) -> int:
    row = await (
        await connection.execute(
            "SELECT COUNT(*) FROM supply_requests WHERE user_id = ? AND status IN ('open', 'assigned')",
            (user_id,),
        )
    ).fetchone()
    return int(row[0]) if row else 0


async def limits(connection: apsw.AsyncConnection, user_id: str) -> dict:
    """What the citizen app shows: active count plus the cap and demand level for each category."""
    pressure = await demand_pressure(connection)
    categories = {}
    for category, value in pressure.items():
        cap = cap_for(value)
        categories[category] = {
            "cap": cap,
            "level": LEVEL_NAMES[cap],
            "pressure": None if value == float("inf") else round(value, 2),
        }
    return {
        "active": await active_count(connection, user_id),
        "base_cap": BASE_CAP,
        "categories": categories,
    }


def cap_for_items(pressure: dict[str, float], items: list[dict]) -> tuple[int, str]:
    """Cap for a request and the category that set it (the scarcest one requested)."""
    scarcest = max((i["category"] for i in items), key=lambda c: pressure[c])
    return cap_for(pressure[scarcest]), scarcest
