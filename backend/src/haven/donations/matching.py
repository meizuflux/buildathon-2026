"""Automatic hub matching for citizen requests and donations.

Citizens never choose a hub. A supply request is matched to the best source hub as soon as one can
cover it, and its items are reserved there (open -> matched). Requests no hub can cover stay open
("waiting for supplies") and are retried whenever stock arrives: a pledge is received, a hub or
organization is restocked, or a shipment is delivered to an organization. A donation is matched to
the best drop-off hub when the citizen submits it.
"""

from typing import cast

import apsw
import msgspec

from haven.auth import now, timestamp
from haven.donations.common import parse_items, pledged, reserve
from haven.donations.planner import HubState, OpenRequest, best_drop_off, plan


async def hub_states(connection: apsw.AsyncConnection) -> list[HubState]:
    """Every active public hub with its free stock, reservations, targets, and pending pledges."""
    rows = cast(
        list[tuple[str, str, float, float, int]],
        await (
            await connection.execute(
                "SELECT id, name, latitude, longitude, capacity_pct FROM organizations "
                "WHERE site_type IS NOT NULL AND status != 'inactive' ORDER BY id"
            )
        ).fetchall(),
    )
    ids = tuple(row[0] for row in rows)
    incoming = await pledged(connection, ids)
    free: dict[str, dict[str, int]] = {}
    held: dict[str, dict[str, int]] = {}
    targets: dict[str, dict[str, int]] = {}
    stock_rows = cast(
        list[tuple[str, str, int, int, int]],
        await (
            await connection.execute(
                "SELECT organization_id, resource_type_id, quantity, reserved, target "
                "FROM inventory"
            )
        ).fetchall(),
    )
    for hub_id, item, quantity, reserved, target in stock_rows:
        free.setdefault(hub_id, {})[item] = quantity - reserved
        held.setdefault(hub_id, {})[item] = reserved
        targets.setdefault(hub_id, {})[item] = target
    return [
        HubState(
            id=hub_id,
            name=name,
            latitude=lat,
            longitude=lng,
            capacity_pct=capacity,
            available=free.get(hub_id, {}),
            target=targets.get(hub_id, {}),
            pledged=incoming.get(hub_id, {}),
            reserved=held.get(hub_id, {}),
        )
        for hub_id, name, lat, lng, capacity in rows
    ]


async def match_waiting_requests(connection: apsw.AsyncConnection) -> list[str]:
    """Match every open request that some hub can now cover; returns the matched request ids.

    Must run inside the caller's write transaction. All waiting requests are planned together
    (oldest first on ties) so no two are promised the same units.
    """
    rows = cast(
        list[tuple[str, float, float, str]],
        await (
            await connection.execute(
                "SELECT id, latitude, longitude, items_json FROM supply_requests "
                "WHERE status = 'open' ORDER BY created_at, id"
            )
        ).fetchall(),
    )
    if not rows:
        return []
    requests = [OpenRequest(r[0], r[1], r[2], parse_items(r[3])) for r in rows]
    plans = plan(requests, await hub_states(connection))
    matched = []
    for request in requests:
        options = plans.get(request.id) or []
        if not options:
            continue
        best = options[0]
        await reserve(connection, best["id"], request.items, code="insufficient_stock")
        match = {k: best[k] for k in ("distance_km", "score", "reasons")}
        await connection.execute(
            "UPDATE supply_requests SET status = 'matched', hub_id = ?, match_json = ?, "
            "updated_at = ? WHERE id = ?",
            (best["id"], msgspec.json.encode(match).decode(), timestamp(now()), request.id),
        )
        matched.append(request.id)
    return matched


async def match_drop_off(
    connection: apsw.AsyncConnection, items: list[dict], latitude: float, longitude: float
) -> dict | None:
    """The best hub to drop a donation off at, or None if no hub nearby has space."""
    return best_drop_off(items, latitude, longitude, await hub_states(connection))
