"""Database orchestration for family-to-shelter allocation.

Call :func:`recompute_disasters` inside the caller's ``BEGIN IMMEDIATE``
transaction. ``current_assignments`` is the active reservation ledger;
``plans`` remains the versioned family-facing history. Shelter
``capacity.available_people`` is derived free space, while
``shelter_capacity_budgets`` retains the operator-set allocation budget.
"""

import asyncio
import hashlib
import json
from collections.abc import Iterable
from typing import Any, cast
from uuid import uuid4

import apsw

from haven.allocation_policy import (
    allocate_disaster,
    compatibility_mismatches,
    household_size,
)
from haven.auth import now, timestamp
from haven.openapi import Plan
from haven.rows import (
    ALLOCATION_FAMILY_COLUMNS,
    ALLOCATION_SHELTER_COLUMNS,
    allocation_family_from_row,
    allocation_shelter_from_row,
    projection,
    row_mapping,
)


def _loads(value: str) -> dict[str, Any]:
    return json.loads(value)


async def set_shelter_allocation_budget(
    connection: apsw.AsyncConnection,
    shelter_id: str,
    requested_available: int,
) -> int:
    """Set free capacity from an operator PATCH without evicting reservations.

    The API's ``available_people`` value is the currently unreserved amount.
    Thus PATCHing that value back unchanged reconstructs the same budget by
    adding the active reservations. The budget may exceed physical capacity
    when existing reservations or forced placements already do so.
    """
    row = await (
        await connection.execute(
            "SELECT 1 FROM shelters WHERE id = ?",
            (shelter_id,),
        )
    ).fetchone()
    if row is None:
        return 0
    reserved_row = await (
        await connection.execute(
            "SELECT COALESCE(SUM(people), 0) FROM current_assignments WHERE shelter_id = ?",
            (shelter_id,),
        )
    ).fetchone()
    if reserved_row is None:
        raise RuntimeError("The shelter reservation aggregate returned no row.")
    # Existing reservations may already exceed physical capacity. Keep their
    # full accounting budget so a capacity edit cannot silently discard them.
    budget = max(0, int(requested_available)) + int(reserved_row[0])
    await connection.execute(
        "INSERT INTO shelter_capacity_budgets (shelter_id, allocation_budget) VALUES (?, ?) "
        "ON CONFLICT(shelter_id) DO UPDATE SET allocation_budget = excluded.allocation_budget",
        (shelter_id, budget),
    )
    return budget


def _snapshot_shelter(shelter: dict[str, Any]) -> dict[str, Any]:
    """Include selected-shelter inputs while excluding derived free capacity."""
    return {
        "id": shelter["id"],
        "location": shelter["location"],
        "status": shelter["status"],
        "capacity": {
            "total_people": shelter["capacity"]["total_people"],
            "allocation_budget": shelter["allocation_budget"],
        },
        "capabilities": shelter["capabilities"],
        "resources": shelter["resources"],
    }


def _family_snapshot(family: dict[str, Any]) -> dict[str, Any]:
    return {
        "adults": family["adults"],
        "children": family["children"],
        "location": family["location"],
        "needs": family["needs"],
        "resources": family["resources"],
    }


def _plan(
    family: dict[str, Any],
    selected: dict[str, Any] | None,
    *,
    updated_at: str,
    alerts: list[dict[str, Any]],
) -> dict[str, Any]:
    instructions = ["Check official local emergency updates."]
    if selected is None:
        reason = "No open or full shelter is currently listed as a possible destination. Contact emergency management to arrange a safe alternative."
        status = "no_match"
    else:
        mismatch = any(alert["code"] == "shelter_needs_mismatch" for alert in alerts)
        overflow = any(alert["code"] == "shelter_capacity_overflow" for alert in alerts)
        if mismatch and overflow:
            reason = "Assigned to this shelter to provide a destination; review the capacity and needs alerts and coordinate support."
        elif mismatch:
            reason = "This is the best listed destination available, but it may not match all your needs. Review the critical alert."
        elif overflow:
            reason = "Assigned to this shelter despite its reported capacity limit. Coordinate overflow support using the alert."
        else:
            reason = "Has space for your whole household and matches your listed shelter needs."
        status = "recommended"
        instructions.insert(
            0, f"Travel to {selected['name']} if local officials say it is safe to do so."
        )
        if mismatch:
            instructions.append(
                "Confirm support for your listed needs at this shelter before traveling."
            )
        if overflow:
            instructions.append(
                "This shelter may be over its reported capacity; coordinate overflow support."
            )
        if family["needs"].get("immediate_medication") or family["needs"].get("medical_notes"):
            instructions.append("Bring your medication and any required medical supplies.")
        if family["needs"].get("pets"):
            instructions.append("Bring supplies for your pets.")
        if not family["resources"].get("has_car"):
            instructions.append("Check official transportation assistance before traveling.")
    return {
        "family_id": family["id"],
        "disaster_id": family["disaster_id"],
        "status": status,
        "shelter": {
            "id": selected["id"],
            "name": selected["name"],
            "address": selected["address"],
            "location": selected["location"],
            "status": selected["status"],
            "capacity": {"total_people": selected["capacity"]["total_people"]},
            "capabilities": selected["capabilities"],
            "resources": selected["resources"],
        }
        if selected
        else None,
        "reason": reason,
        "instructions": instructions,
        "alerts": alerts,
        "capacity_reserved": selected is not None,
        "_allocation_fingerprint": _fingerprint(family, selected),
        "updated_at": updated_at,
    }


def _assignment_alerts(
    family: dict[str, Any],
    selected: dict[str, Any] | None,
    remaining_by_shelter: dict[str, int],
) -> list[dict[str, Any]]:
    if selected is None:
        return [
            {
                "code": "no_open_shelter",
                "severity": "critical",
                "message": "No open or full shelter is listed. Arrange a safe destination immediately.",
            }
        ]

    used = selected["allocation_budget"] - remaining_by_shelter[selected["id"]]
    total = int(selected["capacity"]["total_people"])
    physical_overflow = max(0, used - total)
    budget_overflow = max(0, used - selected["allocation_budget"])
    alerts = []
    if budget_overflow or physical_overflow or selected["status"] == "full":
        if physical_overflow:
            message = (
                f"{selected['name']} is over its listed capacity by {physical_overflow} people. "
                "Coordinate overflow support."
            )
        else:
            message = (
                f"{selected['name']} has no reported free capacity. "
                "Coordinate overflow support for this placement."
            )
        alerts.append(
            {
                "code": "shelter_capacity_overflow",
                "severity": "critical" if physical_overflow else "warning",
                "shelter_id": selected["id"],
                "shelter_name": selected["name"],
                "assigned_people": used,
                "total_people": total,
                "people_over_capacity": physical_overflow,
                "people_over_allocation_budget": budget_overflow,
                "message": message,
            }
        )

    mismatches = compatibility_mismatches(family, selected)
    if mismatches:
        alerts.append(
            {
                "code": "shelter_needs_mismatch",
                "severity": "critical",
                "shelter_id": selected["id"],
                "shelter_name": selected["name"],
                "unmet_requirements": mismatches,
                "message": (
                    f"{selected['name']} does not list support for all of this household's needs. "
                    "Confirm the placement and coordinate support."
                ),
            }
        )
    return alerts


def _fingerprint(family: dict[str, Any], selected: dict[str, Any] | None) -> str:
    inputs = {
        "family": _family_snapshot(family),
        "selected_shelter": _snapshot_shelter(selected) if selected else None,
    }
    canonical = json.dumps(inputs, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def public_plan(plan: dict[str, Any]) -> Plan:
    """Return the family-facing plan without its internal version fingerprint."""
    return cast(
        Plan, {key: value for key, value in plan.items() if key != "_allocation_fingerprint"}
    )


def _same_plan(candidate: dict[str, Any], previous: dict[str, Any]) -> bool:
    return all(candidate.get(key) == previous.get(key) for key in candidate if key != "updated_at")


async def recompute_disasters(
    connection: apsw.AsyncConnection,
    disaster_ids: Iterable[str],
    *,
    changed_at: str | None = None,
) -> dict[str, Plan]:
    """Rebuild active assignments and material plan versions for given pools.

    The caller owns an immediate write transaction. All prior reservations in
    the supplied disasters are read before allocation. All households are
    reconsidered together; retaining a reservation is a final tie-breaker after
    needs, capacity, supplies, and travel. Reservations are released when their
    shelter closes or moves to another disaster.
    Capacity limits may be exceeded to give every household a destination;
    affected plans carry alerts. If no compatible shelter is available, the
    best clinical/other-needs match is selected with a critical alert.
    A family moved between disasters or shelters cannot consume capacity twice.
    The returned map contains each affected family's current persisted plan.
    """
    ids = sorted(set(disaster_ids))
    if not ids:
        return {}
    now_text = changed_at or timestamp(now())
    marks = ",".join("?" for _ in ids)

    prior_rows = await (
        await connection.execute(
            f"SELECT family_id, shelter_id FROM current_assignments WHERE disaster_id IN ({marks})",
            ids,
        )
    ).fetchall()
    prior_shelter = dict(cast(list[tuple[str, str | None]], prior_rows))

    family_rows = await (
        await connection.execute(
            f"SELECT {projection(ALLOCATION_FAMILY_COLUMNS)} "
            f"FROM families WHERE disaster_id IN ({marks}) ORDER BY disaster_id, created_at, id",
            ids,
        )
    ).fetchall()
    families_by_disaster: dict[str, list[dict[str, Any]]] = {disaster_id: [] for disaster_id in ids}
    for row in family_rows:
        family = allocation_family_from_row(row)
        families_by_disaster[family["disaster_id"]].append(family)

    shelter_rows = await (
        await connection.execute(
            f"SELECT {projection(ALLOCATION_SHELTER_COLUMNS)} "
            f"FROM shelters WHERE disaster_id IN ({marks}) ORDER BY disaster_id, id",
            ids,
        )
    ).fetchall()
    shelters_by_disaster: dict[str, list[dict[str, Any]]] = {disaster_id: [] for disaster_id in ids}
    for row in shelter_rows:
        values = row_mapping(row, ALLOCATION_SHELTER_COLUMNS)
        raw_capacity = _loads(values["capacity_json"])
        budget_row = await (
            await connection.execute(
                "SELECT allocation_budget FROM shelter_capacity_budgets WHERE shelter_id = ?",
                (values["id"],),
            )
        ).fetchone()
        budget = int(budget_row[0]) if budget_row else int(raw_capacity["available_people"])
        budget = max(0, budget)
        await connection.execute(
            "INSERT INTO shelter_capacity_budgets (shelter_id, allocation_budget) VALUES (?, ?) "
            "ON CONFLICT(shelter_id) DO UPDATE SET allocation_budget = excluded.allocation_budget",
            (values["id"], budget),
        )
        shelters_by_disaster[values["disaster_id"]].append(allocation_shelter_from_row(row, budget))

    latest: dict[str, tuple[int, dict[str, Any]]] = {}
    for family in [family for pool in families_by_disaster.values() for family in pool]:
        row = await (
            await connection.execute(
                "SELECT version, plan_json FROM plans WHERE family_id = ? ORDER BY version DESC LIMIT 1",
                (family["id"],),
            )
        ).fetchone()
        if row is not None:
            latest[family["id"]] = (int(row[0]), _loads(row[1]))

    # Remove the old reservation set for every requested pool before assigning
    # any of them. Reoptimize each complete pool; this makes multi-disaster
    # moves atomic and avoids stale use or double reservations.
    await connection.execute(f"DELETE FROM current_assignments WHERE disaster_id IN ({marks})", ids)

    result: dict[str, Plan] = {}
    chosen_by_family: dict[str, dict[str, Any] | None] = {}
    remaining_by_shelter: dict[str, int] = {}

    for disaster_id in ids:
        families = families_by_disaster[disaster_id]
        shelters = shelters_by_disaster[disaster_id]
        assigned, remaining = await asyncio.to_thread(
            allocate_disaster, families, shelters, prior_shelter
        )
        remaining_by_shelter.update(remaining)
        chosen_by_family.update(assigned)

    # Persist all active reservations as one replacement set.
    for disaster_id in ids:
        for family in families_by_disaster[disaster_id]:
            selected = chosen_by_family[family["id"]]
            people = household_size(family) if selected else 0
            await connection.execute(
                "INSERT INTO current_assignments (family_id, disaster_id, shelter_id, people, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (family["id"], disaster_id, selected["id"] if selected else None, people, now_text),
            )

    # Keep the existing public capacity field meaningful: free, unreserved
    # places. The baseline stays in shelter_capacity_budgets.
    for disaster_id in ids:
        for shelter in shelters_by_disaster[disaster_id]:
            free = remaining_by_shelter[shelter["id"]]
            capacity = dict(shelter["capacity"])
            capacity["available_people"] = max(0, min(int(capacity["total_people"]), free))
            await connection.execute(
                "UPDATE shelters SET capacity_json = ? WHERE id = ?",
                (json.dumps(capacity, sort_keys=True), shelter["id"]),
            )

    # Persist only material changes, preserving plan version and timestamp on
    # repeated generation or empty/identical updates.
    for disaster_id in ids:
        shelters = shelters_by_disaster[disaster_id]
        for family in families_by_disaster[disaster_id]:
            selected = chosen_by_family[family["id"]]
            candidate = _plan(
                family,
                selected,
                updated_at=now_text,
                alerts=_assignment_alerts(
                    family,
                    selected,
                    remaining_by_shelter,
                ),
            )
            previous = latest.get(family["id"])
            if previous and _same_plan(candidate, previous[1]):
                result[family["id"]] = public_plan(previous[1])
                continue
            version = previous[0] + 1 if previous else 1
            candidate["version"] = version
            await connection.execute(
                "INSERT INTO plans (id, family_id, version, plan_json, updated_at) VALUES (?, ?, ?, ?, ?)",
                (
                    "plan_" + uuid4().hex,
                    family["id"],
                    version,
                    json.dumps(candidate, sort_keys=True),
                    now_text,
                ),
            )
            result[family["id"]] = public_plan(candidate)

    return result


async def reallocate_disaster(
    connection: apsw.AsyncConnection,
    disaster_id: str,
    *,
    changed_at: str | None = None,
) -> dict[str, Plan]:
    """Single-pool convenience wrapper retained for startup reconciliation."""
    return await recompute_disasters(connection, (disaster_id,), changed_at=changed_at)
