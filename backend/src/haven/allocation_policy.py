"""Pure shelter matching policy, independent of storage and API orchestration.

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

import math
from typing import Any

_MAX_REFINEMENT_FAMILIES = 64
_MAX_REFINEMENT_NODES = 10_000


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
    if (needs.get("immediate_medication") or needs.get("medical_notes")) and not capabilities.get(
        "medical_staff"
    ):
        mismatches.append("medical_staff")
    if needs.get("other_special_care") and not capabilities.get("special_care_notes"):
        mismatches.append("special_care")
    # Availability labels are only a compatibility signal for an explicit
    # immediate-medication need. They are never counted or reserved as stock.
    if needs.get("immediate_medication") and shelter["resources"].get("medication") not in {
        "available",
        "limited",
    }:
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



def allocate_disaster(
    families: list[dict[str, Any]],
    shelters: list[dict[str, Any]],
    prior_shelter: dict[str, str],
    *,
    max_refinement_families: int | None = None,
    max_refinement_nodes: int | None = None,
) -> tuple[dict[str, dict[str, Any] | None], dict[str, int]]:
    """Return shelter choices and remaining budgets for one disaster pool.

    This function only evaluates the supplied family, shelter, and reservation
    snapshots. It performs no database reads, writes, or input mutation.
    """
    if max_refinement_families is None:
        max_refinement_families = _MAX_REFINEMENT_FAMILIES
    if max_refinement_nodes is None:
        max_refinement_nodes = _MAX_REFINEMENT_NODES

    remaining = {shelter["id"]: shelter["allocation_budget"] for shelter in shelters}

    def initial_options(family: dict[str, Any]) -> list[dict[str, Any]]:
        size = household_size(family)
        return [
            shelter
            for shelter in shelters
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
        if previous is not None and previous["status"] in {"open", "full"}:
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
            shelter
            for shelter in shelters
            if compatible(family, shelter) and remaining[shelter["id"]] >= size
        ]
        feasible.sort(
            key=lambda shelter: (
                round(distance(family, shelter), 9),
                shelter["id"],
            )
        )
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
            direct.sort(
                key=lambda shelter: (
                    round(distance(waiting, shelter), 9),
                    shelter["id"],
                )
            )
            if direct:
                selected = direct[0]
                remaining[selected["id"]] -= waiting_size
                total_remaining -= waiting_size
                assigned[waiting["id"]] = selected
                repaired = True
                break

            moves: list[
                tuple[tuple[Any, ...], dict[str, Any], dict[str, Any], dict[str, Any]]
            ] = []
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
                swaps: list[
                    tuple[
                        tuple[Any, ...],
                        dict[str, Any],
                        dict[str, Any],
                        dict[str, Any],
                        dict[str, Any],
                        dict[str, Any],
                    ]
                ] = []
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
                                or (assigned_second := assigned[second["id"]]) is None
                                or assigned_second["id"] != target["id"]
                                or not compatible(second, source)
                            ):
                                continue
                            second_size = household_size(second)
                            if remaining[target["id"]] + second_size < first_size:
                                continue
                            if (
                                remaining[source["id"]] + first_size
                                < second_size + waiting_size
                            ):
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
        family for family in ordered_families if family["id"] not in protected_ids
    ]
    if movable_families and len(movable_families) <= max_refinement_families:

        def refinement_score(
            selection: dict[str, dict[str, Any] | None],
        ) -> tuple[int, int, float]:
            placed = [
                family for family in movable_families if selection[family["id"]] is not None
            ]
            people = sum(household_size(family) for family in placed)
            travel = sum(
                round(distance(family, shelter), 9)
                for family in placed
                if (shelter := selection[family["id"]]) is not None
            )
            return len(placed), people, -travel

        best_selection = {family["id"]: assigned[family["id"]] for family in movable_families}
        best_score = refinement_score(best_selection)
        search_selection: dict[str, dict[str, Any] | None] = {}
        search_remaining = remaining_after_reservations.copy()
        search_nodes = 0
        remaining_people_upper_bound = [0] * (len(movable_families) + 1)
        for index in range(len(movable_families) - 1, -1, -1):
            remaining_people_upper_bound[index] = remaining_people_upper_bound[
                index + 1
            ] + household_size(movable_families[index])

        def search(index: int, placed_count: int, placed_people: int, travel: float) -> None:
            nonlocal best_score, best_selection, search_nodes
            if search_nodes >= max_refinement_nodes:
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
                shelter
                for shelter in shelters
                if compatible(family, shelter) and search_remaining[shelter["id"]] >= size
            ]
            feasible.sort(
                key=lambda shelter: (
                    round(distance(family, shelter), 9),
                    shelter["id"],
                )
            )
            for shelter in feasible:
                if search_nodes >= max_refinement_nodes:
                    break
                trip = round(distance(family, shelter), 9)
                search_remaining[shelter["id"]] -= size
                search_selection[family["id"]] = shelter
                search(index + 1, placed_count + 1, placed_people + size, travel + trip)
                search_remaining[shelter["id"]] += size
            if search_nodes < max_refinement_nodes:
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
        candidates = [shelter for shelter in shelters if shelter["status"] in {"open", "full"}]
        if not candidates:
            continue

        def fallback_key(shelter: dict[str, Any]) -> tuple[Any, ...]:
            mismatches = compatibility_mismatches(family, shelter)
            projected_people = shelter["allocation_budget"] - remaining[shelter["id"]] + size
            physical_overflow = max(
                0, projected_people - int(shelter["capacity"]["total_people"])
            )
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

    return assigned, remaining
