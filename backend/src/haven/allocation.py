"""Deterministic, coordinated family-to-shelter allocation.

Call :func:`recompute_disasters` inside the caller's ``BEGIN IMMEDIATE``
transaction. ``current_assignments`` is the active reservation ledger;
``plans`` remains the versioned family-facing history. Shelter
``capacity.available_people`` is derived free space, while
``shelter_capacity_budgets`` retains the operator-set allocation budget.

Allocation uses a deterministic scarcity-first greedy heuristic. It assigns
whole households, considers medication urgency before the number of eligible
shelters, then prioritizes families without a car and larger households. Each
family receives its closest remaining compatible shelter. This is coordinated
across a disaster, but is not a claim of globally optimal matching.
"""

import hashlib
import json
import math
from collections.abc import Iterable
from typing import Any
from uuid import uuid4

import apsw

from haven.auth import now, timestamp


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
    """Apply the product's existing explicit need/capability rules."""
    needs = family["needs"]
    capabilities = shelter["capabilities"]
    if shelter["status"] != "open":
        return False
    requirements = (
        (bool(needs.get("pets")), bool(capabilities.get("pets_allowed"))),
        (family["children"] > 0, bool(capabilities.get("child_friendly"))),
        (bool(needs.get("accessibility_notes")), bool(capabilities.get("wheelchair_accessible"))),
        (
            bool(needs.get("immediate_medication") or needs.get("medical_notes")),
            bool(capabilities.get("medical_staff")),
        ),
        (bool(needs.get("other_special_care")), bool(capabilities.get("special_care_notes"))),
    )
    if any(required and not supported for required, supported in requirements):
        return False
    # Availability labels are only a compatibility signal for an explicit
    # immediate-medication need. They are never counted or reserved as stock.
    if needs.get("immediate_medication") and shelter["resources"].get("medication") not in {"available", "limited"}:
        return False
    return True


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
    adding the active reservations. Impossible free-space requests are capped
    by ``total_people`` and the next recompute derives the actual remainder.
    """
    row = await (await connection.execute(
        "SELECT capacity_json FROM shelters WHERE id = ?", (shelter_id,),
    )).fetchone()
    if row is None:
        return 0
    capacity = _loads(row[0])
    total_people = int(capacity["total_people"])
    reserved_row = await (await connection.execute(
        "SELECT COALESCE(SUM(people), 0) FROM current_assignments WHERE shelter_id = ?", (shelter_id,),
    )).fetchone()
    budget = min(total_people, max(0, int(requested_available)) + int(reserved_row[0]))
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
) -> dict[str, Any]:
    instructions = ["Check official local emergency updates."]
    if selected is None:
        reason = "No currently listed open shelter has enough space for your whole household and matches your family's listed needs."
        status = "no_match"
    else:
        reason = "Has space for your whole household and matches your listed shelter needs."
        status = "recommended"
        instructions.insert(0, f"Travel to {selected['name']} if local officials say it is safe to do so.")
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
        "capacity_reserved": selected is not None,
        "_allocation_fingerprint": _fingerprint(family, selected),
        "updated_at": updated_at,
    }


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
    the supplied disasters are released before any pool is allocated, so a
    family moved between disasters or shelters cannot consume capacity twice.
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
        budget = max(0, min(int(raw_capacity["total_people"]), budget))
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
    # any of them. This makes multi-disaster moves atomic and avoids stale use.
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
        # Greedy scarcity-first placement keeps whole households together.
        for family in ordered_families:
            size = household_size(family)
            feasible = [
                shelter for shelter in shelters
                if compatible(family, shelter) and remaining[shelter["id"]] >= size
            ]
            previous_id = prior_shelter.get(family["id"])
            feasible.sort(key=lambda shelter: (
                round(distance(family, shelter), 9),
                0 if shelter["id"] == previous_id else 1,
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
                                    assigned[second["id"]] is None
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
