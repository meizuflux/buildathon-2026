"""Demand-driven stock targets for hubs, so nobody has to type them in.

A hub's target for an item is what it should hold to serve the people around it:

    target = ceil(DEMAND_MULTIPLIER * recent demand near the hub) + BASELINE[item]

Recent demand is every citizen request from the last DEMAND_WINDOW (except cancelled ones) plus
the unfilled part of open shelter and organization needs, each counted at the active hub nearest
to where it came from. BASELINE keeps a small stock of essentials before any demand shows up.
Targets feed the "needs" citizens see, drop-off matching, and the request planner's surplus check.
"""

import math
from datetime import timedelta
from typing import cast

import apsw

from haven.auth import now, timestamp
from haven.donations.common import haversine_km, parse_items

DEMAND_WINDOW = timedelta(days=7)
DEMAND_MULTIPLIER = 1.5
BASELINE = {
    "water_bottled": 20,
    "food_canned": 20,
    "baby_formula": 10,
    "diapers": 10,
    "blankets": 10,
    "hygiene_kit": 10,
    "first_aid": 5,
}


def nearest(hubs: list[tuple[str, float, float]], lat: float, lng: float) -> str | None:
    if not hubs:
        return None
    return min(hubs, key=lambda h: haversine_km(lat, lng, h[1], h[2]))[0]


async def hub_targets(connection: apsw.AsyncConnection) -> dict[str, dict[str, int]]:
    """{hub_id: {resource_type_id: target}} for every active public hub."""
    hubs = cast(
        list[tuple[str, float, float]],
        await (
            await connection.execute(
                "SELECT id, latitude, longitude FROM organizations "
                "WHERE site_type IS NOT NULL AND status != 'inactive'"
            )
        ).fetchall(),
    )
    demand: dict[str, dict[str, int]] = {hub_id: {} for hub_id, _, _ in hubs}

    def count(lat: float, lng: float, resource_type_id: str, quantity: int) -> None:
        hub_id = nearest(hubs, lat, lng)
        if hub_id is not None and quantity > 0:
            bucket = demand[hub_id]
            bucket[resource_type_id] = bucket.get(resource_type_id, 0) + quantity

    since = timestamp(now() - DEMAND_WINDOW)
    requests = cast(
        list[tuple[float, float, str]],
        await (
            await connection.execute(
                "SELECT latitude, longitude, items_json FROM supply_requests "
                "WHERE status != 'cancelled' AND created_at >= ?",
                (since,),
            )
        ).fetchall(),
    )
    for lat, lng, raw in requests:
        for item in parse_items(raw):
            count(lat, lng, item["resource_type_id"], item["quantity"])

    needs = cast(
        list[tuple[float, float, str, int]],
        await (
            await connection.execute(
                "SELECT COALESCE(s.latitude, o.latitude), COALESCE(s.longitude, o.longitude), "
                "n.resource_type_id, n.quantity_needed - n.quantity_fulfilled FROM needs n "
                "LEFT JOIN shelters s ON n.requester_kind = 'shelter' AND s.id = n.requester_id "
                "LEFT JOIN organizations o ON n.requester_kind = 'organization' "
                "AND o.id = n.requester_id "
                "WHERE n.status = 'open' AND COALESCE(s.latitude, o.latitude) IS NOT NULL"
            )
        ).fetchall(),
    )
    for lat, lng, resource_type_id, remaining in needs:
        count(lat, lng, resource_type_id, remaining)

    targets: dict[str, dict[str, int]] = {}
    for hub_id, by_item in demand.items():
        items = set(by_item) | set(BASELINE)
        targets[hub_id] = {
            item: math.ceil(DEMAND_MULTIPLIER * by_item.get(item, 0)) + BASELINE.get(item, 0)
            for item in items
        }
    return targets
