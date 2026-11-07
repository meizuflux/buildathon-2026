"""Demand-adjusted cap on how many active requests one citizen may hold.

A citizen's active requests are those waiting, matched, or assigned. The cap starts at BASE_CAP and moves with
demand pressure for each resource type: units wanted by open requests divided by units available
(on hand minus reserved) across public hubs. A request is limited by its scarcest resource type,
so a formula shortage tightens formula requests without restricting people asking for water.
"""

import apsw

from haven.donations.common import parse_items

BASE_CAP = 3
# (pressure below this, cap). Pressure at or above the last threshold gets MIN_CAP.
LEVELS = ((0.25, 4), (0.6, BASE_CAP), (1.0, 2))
MIN_CAP = 1
LEVEL_NAMES = {4: "low", BASE_CAP: "normal", 2: "high", MIN_CAP: "critical"}
INFINITE = float("inf")


def cap_for(pressure: float) -> int:
    for threshold, cap in LEVELS:
        if pressure < threshold:
            return cap
    return MIN_CAP


async def demand_pressure(connection: apsw.AsyncConnection) -> dict[str, float]:
    """Pressure per citizen-requestable resource type: open demand / available hub stock.

    Infinite when nothing is available.
    """
    available: dict[str, int] = {}
    async for (resource_type_id,) in await connection.execute(
        "SELECT id FROM resource_types WHERE citizen_requestable = 1"
    ):
        available[str(resource_type_id)] = 0
    async for resource_type_id, total in await connection.execute(
        "SELECT i.resource_type_id, SUM(i.quantity - i.reserved) FROM inventory i "
        "JOIN organizations o ON o.id = i.organization_id "
        "WHERE o.site_type IS NOT NULL AND o.status != 'inactive' GROUP BY i.resource_type_id"
    ):
        if str(resource_type_id) in available:
            available[str(resource_type_id)] = int(total)  # type: ignore[arg-type]
    demand = dict.fromkeys(available, 0)
    async for (raw,) in await connection.execute(
        "SELECT items_json FROM supply_requests WHERE status = 'open'"
    ):
        for item in parse_items(str(raw)):
            if item["resource_type_id"] in demand:
                demand[item["resource_type_id"]] += item["quantity"]
    return {
        resource_type_id: (demand[resource_type_id] / available[resource_type_id])
        if available[resource_type_id] > 0
        else INFINITE
        for resource_type_id in available
    }


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
        cap = cap_for(value)
        resource_types[resource_type_id] = {
            "cap": cap,
            "level": LEVEL_NAMES[cap],
            "pressure": None if value == INFINITE else round(value, 2),
        }
    return {
        "active": await active_count(connection, user_id),
        "base_cap": BASE_CAP,
        "resource_types": resource_types,
    }


def cap_for_items(pressure: dict[str, float], items: list[dict]) -> tuple[int, str]:
    """Cap for a request and the resource type that set it (the scarcest one requested)."""
    scarcest = max((i["resource_type_id"] for i in items), key=lambda r: pressure.get(r, INFINITE))
    return cap_for(pressure.get(scarcest, INFINITE)), scarcest
