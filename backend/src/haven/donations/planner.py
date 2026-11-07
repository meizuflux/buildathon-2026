"""Matching citizens to hubs: source hubs for supply requests and drop-off hubs for donations.

Supply requests:

Each (request, hub) pair gets a cost in kilometre-equivalents, lower is better:

    cost = distance_km
         + BELOW_TARGET_PENALTY_KM * (share of the drawn units that pushes the hub below its target)
         - over-capacity bonus (OVER_90_BONUS_KM at 90%+, OVER_70_BONUS_KM at 70%+)

so a hub is preferred when it is close, gives from surplus rather than stock it needs, and is full
(sending goods out frees space). Pending pledges count toward a hub's future stock when judging surplus.

Requests are planned together so two requests are never promised the same units. Assignment uses a
regret heuristic for capacitated assignment: repeatedly pick the request that would lose the most by not
getting its best hub (second-best cost minus best cost; a request with one option has infinite regret),
give it that hub, and deduct the stock. Oldest requests win ties.
"""

import math
from dataclasses import dataclass, field

from haven.donations.common import haversine_km

BELOW_TARGET_PENALTY_KM = 15.0
OVER_90_BONUS_KM = 5.0
OVER_70_BONUS_KM = 2.0
MAX_OPTIONS = 3


@dataclass
class HubState:
    id: str
    name: str
    latitude: float
    longitude: float
    capacity_pct: int
    available: dict[str, int]  # on hand minus already-reserved
    target: dict[str, int] = field(default_factory=dict)
    pledged: dict[str, int] = field(default_factory=dict)
    reserved: dict[str, int] = field(default_factory=dict)


@dataclass
class OpenRequest:
    id: str
    latitude: float
    longitude: float
    items: list[dict]  # [{"resource_type_id", "quantity"}]


def evaluate(request: OpenRequest, hub: HubState, remaining: dict[str, int]) -> dict | None:
    """Cost and explanation for serving `request` from `hub`, or None if the hub can't cover every item."""
    if any(remaining.get(i["resource_type_id"], 0) < i["quantity"] for i in request.items):
        return None
    distance = haversine_km(request.latitude, request.longitude, hub.latitude, hub.longitude)
    drawn = below = 0
    for item in request.items:
        category, quantity = item["resource_type_id"], item["quantity"]
        # Units above this floor are surplus; incoming pledges lower how much the hub must keep.
        floor = max(hub.target.get(category, 0) - hub.pledged.get(category, 0), 0)
        surplus = max(remaining[category] - floor, 0)
        drawn += quantity
        below += max(quantity - surplus, 0)
    below_share = below / drawn
    bonus = (
        OVER_90_BONUS_KM
        if hub.capacity_pct >= 90
        else OVER_70_BONUS_KM
        if hub.capacity_pct >= 70
        else 0.0
    )
    cost = distance + BELOW_TARGET_PENALTY_KM * below_share - bonus

    reasons = [f"{distance:.1f} km away"]
    if below == 0:
        reasons.append("gives from surplus")
    elif below < drawn:
        reasons.append("partly dips below its target")
    else:
        reasons.append("dips below its target")
    if hub.capacity_pct >= 90:
        reasons.append(f"frees space at a full hub ({hub.capacity_pct}%)")
    elif hub.capacity_pct >= 70:
        reasons.append(f"frees space ({hub.capacity_pct}% full)")
    return {
        "id": hub.id,
        "name": hub.name,
        "distance_km": round(distance, 2),
        "score": round(cost, 2),
        "reasons": reasons,
    }


def plan(requests: list[OpenRequest], hubs: list[HubState]) -> dict[str, list[dict]]:
    """Ranked hub options per request id (best first); the first option is the planned assignment.

    Requests no hub can cover map to an empty list.
    """
    remaining = {hub.id: dict(hub.available) for hub in hubs}
    order = {r.id: index for index, r in enumerate(requests)}
    pending = {r.id: r for r in requests}
    result: dict[str, list[dict]] = {}

    while pending:
        best_choice = None
        for request in pending.values():
            options = [o for hub in hubs if (o := evaluate(request, hub, remaining[hub.id]))]
            options.sort(key=lambda o: o["score"])
            if not options:
                continue
            regret = options[1]["score"] - options[0]["score"] if len(options) > 1 else math.inf
            key = (regret, -order[request.id])
            if best_choice is None or key > best_choice[0]:
                best_choice = (key, request, options)
        if best_choice is None:
            break  # nothing left can be served
        _, request, options = best_choice
        result[request.id] = options[:MAX_OPTIONS]
        chosen = remaining[options[0]["id"]]
        for item in request.items:
            chosen[item["resource_type_id"]] -= item["quantity"]
        del pending[request.id]

    for request_id in pending:
        result[request_id] = []
    return result


# Donations -------------------------------------------------------------------------------------

FULL_PCT = 90
UNNEEDED_PENALTY_KM = 10.0
NEARLY_FULL_PENALTY_KM = 3.0
MAX_DROP_OFF_KM = 50.0


def need(hub: HubState, resource_type_id: str) -> int:
    """Units still wanted: target minus what's on hand (incl. reserved) and already pledged."""
    on_hand = hub.available.get(resource_type_id, 0) + hub.reserved.get(resource_type_id, 0)
    wanted = hub.target.get(resource_type_id, 0) - on_hand - hub.pledged.get(resource_type_id, 0)
    return max(wanted, 0)


def evaluate_drop_off(items: list[dict], lat: float, lng: float, hub: HubState) -> dict | None:
    """Cost of dropping `items` off at `hub`, or None if the hub is full or too far.

    cost = distance_km + UNNEEDED_PENALTY_KM * (share of units the hub doesn't need)
           + NEARLY_FULL_PENALTY_KM if the hub is 70%+ full
    """
    if hub.capacity_pct >= FULL_PCT:
        return None
    distance = haversine_km(lat, lng, hub.latitude, hub.longitude)
    if distance > MAX_DROP_OFF_KM:
        return None
    total = sum(item["quantity"] for item in items)
    useful = sum(min(item["quantity"], need(hub, item["resource_type_id"])) for item in items)
    unneeded_share = 1 - useful / total
    crowded = hub.capacity_pct >= 70
    cost = (
        distance + UNNEEDED_PENALTY_KM * unneeded_share + (NEARLY_FULL_PENALTY_KM if crowded else 0)
    )
    reasons = [f"{distance:.1f} km away"]
    if useful == total:
        reasons.append("needs everything you're bringing")
    elif useful:
        reasons.append("needs some of what you're bringing")
    else:
        reasons.append("has room for it")
    reasons.append(f"{hub.capacity_pct}% full" if crowded else "plenty of storage space")
    return {
        "id": hub.id,
        "name": hub.name,
        "distance_km": round(distance, 2),
        "score": round(cost, 2),
        "reasons": reasons,
    }


def best_drop_off(items: list[dict], lat: float, lng: float, hubs: list[HubState]) -> dict | None:
    """The lowest-cost hub for a donation, or None when no hub within range has space."""
    options = [o for hub in hubs if (o := evaluate_drop_off(items, lat, lng, hub))]
    return min(options, key=lambda o: o["score"]) if options else None
