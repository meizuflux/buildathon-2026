"""Demand-adjusted cap on how many active requests one citizen may hold.

A citizen's active requests are those waiting, matched, or assigned. The cap starts at BASE_CAP
and moves with demand pressure for each resource type: units wanted by waiting requests divided
by units available (on hand minus reserved) across public hubs. A request is limited by its
scarcest resource type, so a formula shortage tightens formula requests without restricting
people asking for water.

An item no hub has on hand at all isn't being competed for, so it keeps the normal cap: asking
for a generator doesn't use up anyone's share. When hubs hold an item but every unit is already
promised, that is real scarcity and the cap tightens.
"""

import apsw

from haven.donations.common import parse_items

BASE_CAP = 3
# (pressure below this, cap). Pressure at or above the last threshold gets MIN_CAP.
LEVELS = ((0.25, 4), (0.6, BASE_CAP), (1.0, 2))
MIN_CAP = 1
LEVEL_NAMES = {4: "low", BASE_CAP: "normal", 2: "high", MIN_CAP: "critical"}
INFINITE = float("inf")
NO_STOCK = -1.0  # pressure marker: no hub has any of this item on hand


def cap_for(pressure: float) -> int:
    if pressure == NO_STOCK:
        return BASE_CAP
    for threshold, cap in LEVELS:
        if pressure < threshold:
            return cap
    return MIN_CAP


def level_for(pressure: float) -> str:
    return "unavailable" if pressure == NO_STOCK else LEVEL_NAMES[cap_for(pressure)]


async def demand_pressure(connection: apsw.AsyncConnection) -> dict[str, float]:
    """Pressure per citizen-requestable resource type: waiting demand / free hub stock.

    NO_STOCK when no hub has the item on hand; infinite when it is on hand but all reserved.
    """
    free: dict[str, int] = {}
    on_hand: dict[str, int] = {}
    async for (resource_type_id,) in await connection.execute(
        "SELECT id FROM resource_types WHERE citizen_requestable = 1"
    ):
        free[str(resource_type_id)] = 0
        on_hand[str(resource_type_id)] = 0
    async for resource_type_id, quantity, reserved in await connection.execute(
        "SELECT i.resource_type_id, SUM(i.quantity), SUM(i.reserved) FROM inventory i "
        "JOIN organizations o ON o.id = i.organization_id "
        "WHERE o.site_type IS NOT NULL AND o.status != 'inactive' GROUP BY i.resource_type_id"
    ):
        key = str(resource_type_id)
        if key in free:
            on_hand[key] = int(quantity)  # type: ignore[arg-type]
            free[key] = int(quantity) - int(reserved)  # type: ignore[arg-type]
    demand = dict.fromkeys(free, 0)
    async for (raw,) in await connection.execute(
        "SELECT items_json FROM supply_requests WHERE status = 'open'"
    ):
        for item in parse_items(str(raw)):
            if item["resource_type_id"] in demand:
                demand[item["resource_type_id"]] += item["quantity"]
    pressure = {}
    for key in free:
        if on_hand[key] == 0:
            pressure[key] = NO_STOCK
        elif free[key] > 0:
            pressure[key] = demand[key] / free[key]
        else:
            pressure[key] = INFINITE
    return pressure


async def active_count(connection: apsw.AsyncConnection, user_id: str) -> int:
    row = await (
        await connection.execute(
            "SELECT COUNT(*) FROM supply_requests "
            "WHERE user_id = ? AND status IN ('open', 'matched', 'assigned')",
            (user_id,),
        )
    ).fetchone()
    return int(row[0]) if row else 0  # type: ignore[arg-type]


async def limits(connection: apsw.AsyncConnection, user_id: str) -> dict:
    """What the citizen app shows: active count plus the cap and demand level per resource type."""
    pressure = await demand_pressure(connection)
    resource_types = {}
    for resource_type_id, value in pressure.items():
        resource_types[resource_type_id] = {
            "cap": cap_for(value),
            "level": level_for(value),
            "pressure": None if value in (INFINITE, NO_STOCK) else round(value, 2),
        }
    return {
        "active": await active_count(connection, user_id),
        "base_cap": BASE_CAP,
        "resource_types": resource_types,
    }


def cap_for_items(pressure: dict[str, float], items: list[dict]) -> tuple[int, str]:
    """Cap for a request and the resource type that set it (the one with the tightest cap)."""
    ids = [i["resource_type_id"] for i in items]
    scarcest = min(ids, key=lambda r: cap_for(pressure.get(r, NO_STOCK)))
    return cap_for(pressure.get(scarcest, NO_STOCK)), scarcest
