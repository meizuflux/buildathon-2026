"""Coordinated household allocation with Google OR-Tools CP-SAT.

Every household gets one open/full destination whenever one exists. Requirements
outrank capacity, supplies, travel without a car, all travel, and finally moves.
Capacity is soft: shortages produce overflow rather than dropped households.
The bounded solver starts from complete assignments and never returns a result
worse than its seed under the same lexicographic objective.
"""

import logging
import math
import time
from typing import Any

from ortools.sat.python import cp_model

logger = logging.getLogger(__name__)
_MAX_SOLVE_SECONDS = 2.0
_CLINICAL_REQUIREMENTS = {"medical_staff", "medication", "wheelchair_accessible", "special_care"}
_SUPPLY_PENALTY = {"available": 0, "limited": 1, "unknown": 2, "unavailable": 3}


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
    """Great-circle distance in kilometers for the travel objectives."""
    start, end = family["location"], shelter["location"]
    lat1, lat2 = math.radians(start["latitude"]), math.radians(end["latitude"])
    dlat = lat2 - lat1
    dlon = math.radians(end["longitude"] - start["longitude"])
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(min(1.0, max(0.0, a))))


def _needs_score(family: dict[str, Any], shelter: dict[str, Any]) -> tuple[int, int]:
    unmet = compatibility_mismatches(family, shelter)
    clinical = sum(item in _CLINICAL_REQUIREMENTS for item in unmet)
    return clinical, len(unmet) - clinical


def _supply_cost(family: dict[str, Any], shelter: dict[str, Any]) -> int:
    fields = ["food", "water", "clothes"]
    if family["needs"].get("immediate_medication"):
        fields.append("medication")
    return household_size(family) * sum(
        _SUPPLY_PENALTY[shelter["resources"].get(field, "unknown")] for field in fields
    )


def allocate_disaster(
    families: list[dict[str, Any]],
    shelters: list[dict[str, Any]],
    prior_shelter: dict[str, str | None],
    *,
    max_solve_seconds: float | None = None,
) -> tuple[dict[str, dict[str, Any] | None], dict[str, int]]:
    """Return complete choices and remaining budgets without mutating inputs.

    Minimum unmet clinical requirements, then other requirements, are determined
    per household. Because capacities are soft, these minima can all be achieved
    simultaneously; eliminating worse matches makes them hard solver guarantees,
    including on timeout. Subsequent objectives are solved in order, fixing each
    optimum before starting the next. An unproved stage stops the search.

    Distance is rounded to meters and summed per household. Supply labels are
    preferences weighted by household size, never invented inventory quantities.
    Closed/absent shelters are the only reason a destination can be None.
    """
    remaining = {s["id"]: s["allocation_budget"] for s in shelters}
    destinations = sorted(
        (s for s in shelters if s["status"] in {"open", "full"}), key=lambda s: s["id"]
    )
    if not families or not destinations:
        return {f["id"]: None for f in families}, remaining

    ordered = sorted(families, key=lambda f: (f["created_at"], f["id"]))
    sizes = [household_size(f) for f in ordered]
    total_people = sum(sizes)
    totals = [int(s["capacity"]["total_people"]) for s in destinations]
    # A full shelter offers no new budget even if its stored count is positive.
    budgets = [s["allocation_budget"] if s["status"] == "open" else 0 for s in destinations]
    options: list[list[int]] = []
    trips: list[dict[int, int]] = []
    supplies: list[dict[int, int]] = []
    moves: list[dict[int, int]] = []
    for family in ordered:
        scores = [_needs_score(family, shelter) for shelter in destinations]
        best_needs = min(scores)
        eligible = [j for j, score in enumerate(scores) if score == best_needs]
        options.append(eligible)
        trips.append({j: round(distance(family, destinations[j]) * 1000) for j in eligible})
        supplies.append({j: _supply_cost(family, destinations[j]) for j in eligible})
        previous = prior_shelter.get(family["id"])
        moves.append(
            {j: int(previous is not None and previous != destinations[j]["id"]) for j in eligible}
        )

    def loads_for(selection: list[int]) -> list[int]:
        loads = [0] * len(destinations)
        for i, j in enumerate(selection):
            loads[j] += sizes[i]
        return loads

    def score(selection: list[int]) -> tuple[int, ...]:
        loads = loads_for(selection)
        physical = [max(0, loads[j] - totals[j]) for j in range(len(destinations))]
        return (
            sum(physical),
            sum(max(0, loads[j] - budgets[j]) for j in range(len(destinations))),
            max(
                (1000 * physical[j] + max(1, totals[j]) - 1) // max(1, totals[j])
                for j in range(len(destinations))
            ),
            sum(supplies[i][j] for i, j in enumerate(selection)),
            sum(
                trips[i][j]
                for i, j in enumerate(selection)
                if not ordered[i]["resources"].get("has_car")
            ),
            sum(trips[i][j] for i, j in enumerate(selection)),
            sum(moves[i][j] for i, j in enumerate(selection)),
        )

    # Always have a complete, needs-respecting placement before calling CP-SAT.
    best = [0] * len(ordered)
    loads = [0] * len(destinations)
    for i in sorted(
        range(len(ordered)),
        key=lambda i: (
            len(options[i]),
            not ordered[i]["needs"].get("immediate_medication", False),
            bool(ordered[i]["resources"].get("has_car")),
            -sizes[i],
            i,
        ),
    ):

        def seed_key(j: int) -> tuple[int, ...]:
            projected = loads[j] + sizes[i]
            return (
                max(0, projected - totals[j]) - max(0, loads[j] - totals[j]),
                max(0, projected - budgets[j]) - max(0, loads[j] - budgets[j]),
                (1000 * max(0, projected - totals[j]) + max(1, totals[j]) - 1) // max(1, totals[j]),
                supplies[i][j],
                trips[i][j],
                moves[i][j],
                j,
            )

        best[i] = min(options[i], key=seed_key)
        loads[best[i]] += sizes[i]

    # A prior complete result can be better than the greedy seed, particularly
    # after a bounded run. Retain it unless this invocation improves the score.
    previous = [
        next(
            (j for j in options[i] if destinations[j]["id"] == prior_shelter.get(f["id"])), best[i]
        )
        for i, f in enumerate(ordered)
    ]
    if score(previous) < score(best):
        best = previous
    best_score = score(best)

    model = cp_model.CpModel()
    choices = [
        {j: model.new_bool_var(f"assign_{i}_{j}") for j in eligible}
        for i, eligible in enumerate(options)
    ]
    for row in choices:
        model.add_exactly_one(row.values())
    physical_overflow = []
    budget_overflow = []
    peak_overflow = model.new_int_var(0, total_people * 1000, "peak_overflow_per_thousand")
    for j in range(len(destinations)):
        load = cp_model.LinearExpr.sum(
            [sizes[i] * row[j] for i, row in enumerate(choices) if j in row]
        )
        physical = model.new_int_var(0, total_people, f"physical_overflow_{j}")
        budget = model.new_int_var(0, total_people, f"budget_overflow_{j}")
        model.add_max_equality(physical, [0, load - totals[j]])
        model.add_max_equality(budget, [0, load - budgets[j]])
        model.add(peak_overflow * max(1, totals[j]) >= physical * 1000)
        physical_overflow.append(physical)
        budget_overflow.append(budget)

    def assignment_cost(
        costs: list[dict[int, int]], *, without_car: bool = False
    ) -> cp_model.LinearExpr:
        return cp_model.LinearExpr.sum(
            [
                costs[i][j] * variable
                for i, row in enumerate(choices)
                for j, variable in row.items()
                if not without_car or not ordered[i]["resources"].get("has_car")
            ]
        )

    objectives = [
        cp_model.LinearExpr.sum(physical_overflow),
        cp_model.LinearExpr.sum(budget_overflow),
        peak_overflow,
        assignment_cost(supplies),
        assignment_cost(trips, without_car=True),
        assignment_cost(trips),
        assignment_cost(moves),
    ]
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    seconds = _MAX_SOLVE_SECONDS if max_solve_seconds is None else max_solve_seconds
    deadline = time.monotonic() + max(0.0, seconds)
    for index, objective in enumerate(objectives):
        # All objectives are nonnegative; zero already proves optimality.
        if best_score[index] == 0:
            model.add(objective == 0)
            continue
        time_left = deadline - time.monotonic()
        if time_left <= 0:
            logger.info("Allocation search budget exhausted; retaining complete best placement.")
            break
        model.clear_hints()
        for i, row in enumerate(choices):
            for j, variable in row.items():
                model.add_hint(variable, int(best[i] == j))
        model.add(objective <= best_score[index])
        model.minimize(objective)
        solver.parameters.max_time_in_seconds = time_left
        status = solver.solve(model)
        if status == cp_model.MODEL_INVALID or status == cp_model.INFEASIBLE:
            raise RuntimeError(f"Invalid allocation model: {solver.status_name(status)}")
        if status not in {cp_model.OPTIMAL, cp_model.FEASIBLE}:
            logger.info("Allocation search stopped without a solution; retaining complete seed.")
            break
        candidate = [
            next(j for j, variable in row.items() if solver.boolean_value(variable))
            for row in choices
        ]
        candidate_score = score(candidate)
        if candidate_score < best_score:
            best, best_score = candidate, candidate_score
        if status != cp_model.OPTIMAL:
            logger.info("Allocation stage %s not proved optimal; retaining best placement.", index)
            break
        model.add(objective == best_score[index])

    assigned: dict[str, dict[str, Any] | None] = {}
    for i, family in enumerate(ordered):
        selected = destinations[best[i]]
        assigned[family["id"]] = selected
        remaining[selected["id"]] -= sizes[i]
    return assigned, remaining
