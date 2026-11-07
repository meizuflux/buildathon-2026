"""Deterministic, coordinated family-to-shelter allocation.

Call :func:`recompute_disasters` inside the caller's ``BEGIN IMMEDIATE``
transaction. ``current_assignments`` is the active reservation ledger;
``plans`` remains the versioned family-facing history. Shelter
``capacity.available_people`` is derived free space, while
``shelter_capacity_budgets`` retains the operator-set allocation budget.

Allocation uses a deterministic scarcity-first greedy heuristic. Existing
reservations at open/full shelters are retained first; new or displaced households then
consider medication urgency before the number of eligible shelters, followed
by families without a car and larger households. Each such family receives
its closest remaining compatible shelter. This is coordinated across a
disaster. A bounded search refines small pools to maximize households placed,
then people served, then minimize total travel distance; larger pools retain
the heuristic result. Capacity does not block a destination: remaining
households overflow the least-loaded compatible shelter, or use the
least-mismatched open/full shelter with a critical plan alert.
"""

import hashlib
import json
import math
from collections.abc import Iterable
from typing import Any
from uuid import uuid4

import apsw

from haven.auth import now, timestamp

_MAX_REFINEMENT_FAMILIES = 64
_MAX_REFINEMENT_NODES = 10_000


def _loads(value: str) -> dict[str, Any]:
    return json.loads(value)


def _family(row: tuple) -> dict[str, Any]:
    return {
        "id": row[0],
        "disaster_id": row[1],
        "adults": row[2],
        "children": row[3],
        "location": {"latitude": row[4], "longitude": row[5]},
        "needs": _loads(row[6]),
        "resources": _loads(row[7]),
        "created_at": row[8],
    }


def _shelter(row: tuple, allocation_budget: int) -> dict[str, Any]:
    return {
        "id": row[0],
        "disaster_id": row[1],
        "name": row[2],
        "address": row[3],
        "location": {"latitude": row[4], "longitude": row[5]},
        "status": row[6],
        "capacity": _loads(row[7]),
        "capabilities": _loads(row[8]),
        "resources": _loads(row[9]),
        "allocation_budget": allocation_budget,
    }


def household_size(family: dict[str, Any]) -> int:
    return family["adults"] + family["children"]


def compatible(family: dict[str, Any], shelter: dict[str, Any]) -> bool:
    """Return whether an open shelter satisfies the family's listed needs."""
    return shelter["status"] == "open" and not compatibility_mismatches(family, shelter)


def compatibility_mismatches(family: dict[str, Any], shelter: dict[str, Any]) -> list[str]:
    """List unmet requirements without excluding a possible overflow destination."""
    needs = family["needs"]
    capabilities = shelter["capabilities"]
    mismatches = []
    if needs.get("pets") and not capabilities.get("pets_allowed"):
        mismatches.append("pets")
    if family["children"] > 0 and not capabilities.get("child_friendly"):
        mismatches.append("child_friendly")
    if needs.get("accessibility_notes") and not capabilities.get("wheelchair_accessible"):
        mismatches.append("wheelchair_accessible")
    if (needs.get("immediate_medication") or needs.get("medical_notes")) and not capabilities.get("medical_staff"):
        mismatches.append("medical_staff")
    if needs.get("other_special_care") and not capabilities.get("special_care_notes"):
        mismatches.append("special_care")
    # Availability labels are only a compatibility signal for an explicit
    # immediate-medication need. They are never counted or reserved as stock.
    if needs.get("immediate_medication") and shelter["resources"].get("medication") not in {"available", "limited"}:
        mismatches.append("medication")
    return mismatches


def distance(family: dict[str, Any], shelter: dict[str, Any]) -> float:
    """Great-circle distance in kilometers, used only to order candidates."""
    start, end = family["location"], shelter["location"]
    lat1, lat2 = math.radians(start["latitude"]), math.radians(end["latitude"])
    dlat = lat2 - lat1
    dlon = math.radians(end["longitude"] - start["longitude"])
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(min(1.0, max(0.0, a))))


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
    row = await (await connection.execute(
        "SELECT 1 FROM shelters WHERE id = ?", (shelter_id,),
    )).fetchone()
    if row is None:
        return 0
    reserved_row = await (await connection.execute(
        "SELECT COALESCE(SUM(people), 0) FROM current_assignments WHERE shelter_id = ?", (shelter_id,),
    )).fetchone()
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
        instructions.insert(0, f"Travel to {selected['name']} if local officials say it is safe to do so.")
        if mismatch:
            instructions.append("Confirm support for your listed needs at this shelter before traveling.")
        if overflow:
            instructions.append("This shelter may be over its reported capacity; coordinate overflow support.")
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
        } if selected else None,
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
        return [{
            "code": "no_open_shelter",
            "severity": "critical",
            "message": "No open or full shelter is listed. Arrange a safe destination immediately.",
        }]

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
        alerts.append({
            "code": "shelter_capacity_overflow",
            "severity": "critical" if physical_overflow else "warning",
            "shelter_id": selected["id"],
            "shelter_name": selected["name"],
            "assigned_people": used,
            "total_people": total,
            "people_over_capacity": physical_overflow,
            "people_over_allocation_budget": budget_overflow,
            "message": message,
        })

    mismatches = compatibility_mismatches(family, selected)
    if mismatches:
        alerts.append({
            "code": "shelter_needs_mismatch",
            "severity": "critical",
            "shelter_id": selected["id"],
            "shelter_name": selected["name"],
            "unmet_requirements": mismatches,
            "message": (
                f"{selected['name']} does not list support for all of this household's needs. "
                "Confirm the placement and coordinate support."
            ),
        })
    return alerts


def _fingerprint(family: dict[str, Any], selected: dict[str, Any] | None) -> str:
    inputs = {
        "family": _family_snapshot(family),
        "selected_shelter": _snapshot_shelter(selected) if selected else None,
    }
    canonical = json.dumps(inputs, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def public_plan(plan: dict[str, Any]) -> dict[str, Any]:
    """Return the family-facing plan without its internal version fingerprint."""
    return {key: value for key, value in plan.items() if key != "_allocation_fingerprint"}


def _same_plan(candidate: dict[str, Any], previous: dict[str, Any]) -> bool:
    return all(candidate.get(key) == previous.get(key) for key in candidate if key != "updated_at")


async def recompute_disasters(
    connection: apsw.AsyncConnection,
    disaster_ids: Iterable[str],
    *,
    changed_at: str | None = None,
) -> dict[str, dict[str, Any]]:
    """Rebuild active assignments and material plan versions for given pools.

    The caller owns an immediate write transaction. All prior reservations in
    the supplied disasters are read before allocation. Reservations at open or
    full shelters remain protected while new placements are made. Reservations
    are released when their shelter closes or moves to another disaster.
    Capacity limits may be exceeded to give every household a destination;
    affected plans carry alerts. If no compatible shelter is available, the
    least-mismatched open or full shelter is selected with a critical alert.
    A family moved between disasters or shelters cannot consume capacity twice.
    The returned map contains each affected family's current persisted plan.
    """
    ids = sorted(set(disaster_ids))
    if not ids:
        return {}
    now_text = changed_at or timestamp(now())
    marks = ",".join("?" for _ in ids)

    prior_rows = await (await connection.execute(
        f"SELECT family_id, shelter_id FROM current_assignments WHERE disaster_id IN ({marks})",
        ids,
    )).fetchall()
    prior_shelter = {family_id: shelter_id for family_id, shelter_id in prior_rows}

    family_rows = await (await connection.execute(
        f"SELECT id, disaster_id, adults, children, latitude, longitude, needs_json, resources_json, created_at "
        f"FROM families WHERE disaster_id IN ({marks}) ORDER BY disaster_id, created_at, id",
        ids,
    )).fetchall()
    families_by_disaster: dict[str, list[dict[str, Any]]] = {disaster_id: [] for disaster_id in ids}
    for row in family_rows:
        family = _family(row)
        families_by_disaster[family["disaster_id"]].append(family)

    shelter_rows = await (await connection.execute(
        f"SELECT id, disaster_id, name, address, latitude, longitude, status, capacity_json, "
        f"capabilities_json, resources_json FROM shelters WHERE disaster_id IN ({marks}) ORDER BY disaster_id, id",
        ids,
    )).fetchall()
    shelters_by_disaster: dict[str, list[dict[str, Any]]] = {disaster_id: [] for disaster_id in ids}
    for row in shelter_rows:
        raw_capacity = _loads(row[7])
        budget_row = await (await connection.execute(
            "SELECT allocation_budget FROM shelter_capacity_budgets WHERE shelter_id = ?", (row[0],),
        )).fetchone()
        budget = int(budget_row[0]) if budget_row else int(raw_capacity["available_people"])
        budget = max(0, budget)
        await connection.execute(
            "INSERT INTO shelter_capacity_budgets (shelter_id, allocation_budget) VALUES (?, ?) "
            "ON CONFLICT(shelter_id) DO UPDATE SET allocation_budget = excluded.allocation_budget",
            (row[0], budget),
        )
        shelters_by_disaster[row[1]].append(_shelter(row, budget))

    latest: dict[str, tuple[int, dict[str, Any]]] = {}
    for family in [family for pool in families_by_disaster.values() for family in pool]:
        row = await (await connection.execute(
            "SELECT version, plan_json FROM plans WHERE family_id = ? ORDER BY version DESC LIMIT 1",
            (family["id"],),
        )).fetchone()
        if row is not None:
            latest[family["id"]] = (int(row[0]), _loads(row[1]))

    # Remove the old reservation set for every requested pool before assigning
    # any of them. Compatible incumbents are restored below, before new
    # placements; this makes multi-disaster moves atomic and avoids stale use.
    await connection.execute(f"DELETE FROM current_assignments WHERE disaster_id IN ({marks})", ids)

    result: dict[str, dict[str, Any]] = {}
    chosen_by_family: dict[str, dict[str, Any] | None] = {}
    remaining_by_shelter: dict[str, int] = {}

    for disaster_id in ids:
        families = families_by_disaster[disaster_id]
        shelters = shelters_by_disaster[disaster_id]
        remaining = {shelter["id"]: shelter["allocation_budget"] for shelter in shelters}

        def initial_options(family: dict[str, Any]) -> list[dict[str, Any]]:
            size = household_size(family)
            return [
                shelter for shelter in shelters
                if compatible(family, shelter) and shelter["allocation_budget"] >= size
            ]

        options_by_family = {family["id"]: initial_options(family) for family in families}

        def priority(family: dict[str, Any]) -> tuple[Any, ...]:
            options = options_by_family[family["id"]]
            needs = family["needs"]
            has_car = bool(family["resources"].get("has_car"))
            return (
                0 if needs.get("immediate_medication") else 1,
                len(options),
                1 if has_car else 0,
                -household_size(family),
                family["created_at"],
                family["id"],
            )

        assigned: dict[str, dict[str, Any] | None] = {}
        ordered_families = sorted(families, key=priority)
        protected_ids: set[str] = set()
        shelters_by_id = {shelter["id"]: shelter for shelter in shelters}

        # Keep existing reservations when the family still matches the shelter.
        # New eligibility changes or capacity reductions cannot displace an
        # incumbent, even if the existing reservation already exceeds capacity.
        for family in ordered_families:
            previous_id = prior_shelter.get(family["id"])
            previous = shelters_by_id.get(previous_id)
            size = household_size(family)
            if (
                previous is not None
                and previous["status"] in {"open", "full"}
            ):
                assigned[family["id"]] = previous
                protected_ids.add(family["id"])
                remaining[previous["id"]] -= size
        remaining_after_reservations = remaining.copy()

        # Greedy scarcity-first placement fills the remaining capacity with
        # new families and families whose previous reservations were released.
        for family in ordered_families:
            if family["id"] in assigned:
                continue
            size = household_size(family)
            feasible = [
                shelter for shelter in shelters
                if compatible(family, shelter) and remaining[shelter["id"]] >= size
            ]
            feasible.sort(key=lambda shelter: (
                round(distance(family, shelter), 9),
                shelter["id"],
            ))
            selected = feasible[0] if feasible else None
            if selected is not None:
                remaining[selected["id"]] -= size
            assigned[family["id"]] = selected
        total_remaining = sum(remaining.values())

        # A bounded augmenting repair handles simple household-size traps. It
        # never unassigns a placed family: it moves one incumbent to a shelter
        # with enough spare space, then uses the freed space for a waiting
        # household. At most one new family is placed per pass.
        repair_checks = 0
        repair_exhausted = False
        for _ in range(min(len(ordered_families), 64)):
            repaired = False
            for waiting in ordered_families:
                repair_checks += 1
                if repair_checks > 10_000:
                    repair_exhausted = True
                    break
                if assigned[waiting["id"]] is not None:
                    continue
                waiting_size = household_size(waiting)
                if not options_by_family[waiting["id"]] or total_remaining < waiting_size:
                    continue
                direct = []
                for shelter in shelters:
                    repair_checks += 1
                    if repair_checks > 10_000:
                        repair_exhausted = True
                        break
                    if compatible(waiting, shelter) and remaining[shelter["id"]] >= waiting_size:
                        direct.append(shelter)
                if repair_exhausted:
                    break
                direct.sort(key=lambda shelter: (
                    round(distance(waiting, shelter), 9), shelter["id"],
                ))
                if direct:
                    selected = direct[0]
                    remaining[selected["id"]] -= waiting_size
                    total_remaining -= waiting_size
                    assigned[waiting["id"]] = selected
                    repaired = True
                    break

                moves: list[tuple[tuple[Any, ...], dict[str, Any], dict[str, Any], dict[str, Any]]] = []
                for incumbent in ordered_families:
                    repair_checks += 1
                    if repair_checks > 10_000:
                        repair_exhausted = True
                        break
                    if incumbent["id"] in protected_ids:
                        continue
                    source = assigned[incumbent["id"]]
                    if source is None or not compatible(waiting, source):
                        continue
                    incumbent_size = household_size(incumbent)
                    if remaining[source["id"]] + incumbent_size < waiting_size:
                        continue
                    for target in shelters:
                        repair_checks += 1
                        if repair_checks > 10_000:
                            repair_exhausted = True
                            break
                        if target["id"] == source["id"] or not compatible(incumbent, target):
                            continue
                        if remaining[target["id"]] < incumbent_size:
                            continue
                        key = (
                            round(distance(waiting, source), 9),
                            0 if incumbent["resources"].get("has_car") else 1,
                            round(distance(incumbent, target), 9),
                            incumbent["id"],
                            target["id"],
                        )
                        moves.append((key, incumbent, source, target))
                    if repair_exhausted:
                        break
                if moves:
                    _, incumbent, source, target = min(moves, key=lambda move: move[0])
                    incumbent_size = household_size(incumbent)
                    waiting_size = household_size(waiting)
                    remaining[source["id"]] += incumbent_size
                    remaining[target["id"]] -= incumbent_size
                    remaining[source["id"]] -= waiting_size
                    total_remaining -= waiting_size
                    assigned[incumbent["id"]] = target
                    assigned[waiting["id"]] = source
                    repaired = True
                    break

                # A two-shelter exchange can recover space when neither
                # household can move alone (for example sizes 4 and 3 in
                # capacities 6 and 4). The waiting household then takes the
                # freed places without evicting either incumbent.
                if not repair_exhausted:
                    swaps: list[tuple[tuple[Any, ...], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]] = []
                    for first in ordered_families:
                        repair_checks += 1
                        if repair_checks > 10_000:
                            repair_exhausted = True
                            break
                        if first["id"] in protected_ids:
                            continue
                        source = assigned[first["id"]]
                        if source is None or not compatible(waiting, source):
                            continue
                        first_size = household_size(first)
                        if remaining[source["id"]] + first_size < waiting_size:
                            continue
                        for target in shelters:
                            repair_checks += 1
                            if repair_checks > 10_000:
                                repair_exhausted = True
                                break
                            if target["id"] == source["id"] or not compatible(first, target):
                                continue
                            for second in ordered_families:
                                repair_checks += 1
                                if repair_checks > 10_000:
                                    repair_exhausted = True
                                    break
                                if (
                                    second["id"] in protected_ids
                                    or assigned[second["id"]] is None
                                    or assigned[second["id"]]["id"] != target["id"]
                                    or not compatible(second, source)
                                ):
                                    continue
                                second_size = household_size(second)
                                if remaining[target["id"]] + second_size < first_size:
                                    continue
                                if remaining[source["id"]] + first_size < second_size + waiting_size:
                                    continue
                                key = (
                                    round(distance(waiting, source), 9),
                                    0 if first["resources"].get("has_car") else 1,
                                    0 if second["resources"].get("has_car") else 1,
                                    first["id"],
                                    second["id"],
                                    target["id"],
                                )
                                swaps.append((key, waiting, source, first, target, second))
                            if repair_exhausted:
                                break
                        if repair_exhausted:
                            break
                    if swaps:
                        _, _, source, first, target, second = min(swaps, key=lambda swap: swap[0])
                        first_size = household_size(first)
                        second_size = household_size(second)
                        waiting_size = household_size(waiting)
                        remaining[source["id"]] += first_size - second_size - waiting_size
                        remaining[target["id"]] += second_size - first_size
                        total_remaining -= waiting_size
                        assigned[first["id"]] = target
                        assigned[second["id"]] = source
                        assigned[waiting["id"]] = source
                        repaired = True
                        break
            if not repaired or repair_exhausted:
                break

        # Refine small pools against an explicit objective while keeping
        # existing reservations fixed. The greedy/repair result seeds the
        # search, so hitting the node bound can never make placement worse.
        movable_families = [
            family for family in ordered_families
            if family["id"] not in protected_ids
        ]
        if movable_families and len(movable_families) <= _MAX_REFINEMENT_FAMILIES:
            def refinement_score(selection: dict[str, dict[str, Any] | None]) -> tuple[int, int, float]:
                placed = [
                    family for family in movable_families
                    if selection[family["id"]] is not None
                ]
                people = sum(household_size(family) for family in placed)
                travel = sum(
                    round(distance(family, selection[family["id"]]), 9)
                    for family in placed
                )
                return len(placed), people, -travel

            best_selection = {
                family["id"]: assigned[family["id"]]
                for family in movable_families
            }
            best_score = refinement_score(best_selection)
            search_selection: dict[str, dict[str, Any] | None] = {}
            search_remaining = remaining_after_reservations.copy()
            search_nodes = 0
            remaining_people_upper_bound = [0] * (len(movable_families) + 1)
            for index in range(len(movable_families) - 1, -1, -1):
                remaining_people_upper_bound[index] = (
                    remaining_people_upper_bound[index + 1]
                    + household_size(movable_families[index])
                )

            def search(index: int, placed_count: int, placed_people: int, travel: float) -> None:
                nonlocal best_score, best_selection, search_nodes
                if search_nodes >= _MAX_REFINEMENT_NODES:
                    return
                search_nodes += 1
                families_left = len(movable_families) - index
                if placed_count + families_left < best_score[0]:
                    return
                if (
                    placed_count + families_left == best_score[0]
                    and placed_people + remaining_people_upper_bound[index] < best_score[1]
                ):
                    return
                if index == len(movable_families):
                    score = (placed_count, placed_people, -travel)
                    if score > best_score:
                        best_score = score
                        best_selection = search_selection.copy()
                    return

                family = movable_families[index]
                size = household_size(family)
                feasible = [
                    shelter for shelter in shelters
                    if compatible(family, shelter) and search_remaining[shelter["id"]] >= size
                ]
                feasible.sort(key=lambda shelter: (
                    round(distance(family, shelter), 9), shelter["id"],
                ))
                for shelter in feasible:
                    if search_nodes >= _MAX_REFINEMENT_NODES:
                        break
                    trip = round(distance(family, shelter), 9)
                    search_remaining[shelter["id"]] -= size
                    search_selection[family["id"]] = shelter
                    search(index + 1, placed_count + 1, placed_people + size, travel + trip)
                    search_remaining[shelter["id"]] += size
                if search_nodes < _MAX_REFINEMENT_NODES:
                    search_selection[family["id"]] = None
                    search(index + 1, placed_count, placed_people, travel)

            search(0, 0, 0, 0.0)
            assigned.update(best_selection)
            remaining = remaining_after_reservations.copy()
            for family in movable_families:
                selected = best_selection[family["id"]]
                if selected is not None:
                    remaining[selected["id"]] -= household_size(family)

        # Capacity is a warning threshold, not a reason to leave a household
        # without a destination. Fill unmatched households next, choosing a
        # compatible shelter first, then the smallest physical/budget overflow.
        # If no compatible open shelter exists, use the least-mismatched open
        # or full shelter and expose the unmet requirements in a critical alert.
        mismatch_weights = {
            "pets": 3,
            "child_friendly": 2,
            "wheelchair_accessible": 5,
            "medical_staff": 8,
            "special_care": 6,
            "medication": 8,
        }
        for family in ordered_families:
            if assigned[family["id"]] is not None:
                continue
            size = household_size(family)
            candidates = [
                shelter for shelter in shelters
                if shelter["status"] in {"open", "full"}
            ]
            if not candidates:
                continue

            def fallback_key(shelter: dict[str, Any]) -> tuple[Any, ...]:
                mismatches = compatibility_mismatches(family, shelter)
                projected_people = shelter["allocation_budget"] - remaining[shelter["id"]] + size
                physical_overflow = max(0, projected_people - int(shelter["capacity"]["total_people"]))
                budget_overflow = max(0, projected_people - shelter["allocation_budget"])
                return (
                    len(mismatches),
                    sum(mismatch_weights[item] for item in mismatches),
                    physical_overflow,
                    budget_overflow,
                    round(distance(family, shelter), 9),
                    shelter["id"],
                )

            selected = min(candidates, key=fallback_key)
            remaining[selected["id"]] -= size
            assigned[family["id"]] = selected

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
) -> dict[str, dict[str, Any]]:
    """Single-pool convenience wrapper retained for startup reconciliation."""
    return await recompute_disasters(connection, (disaster_id,), changed_at=changed_at)
