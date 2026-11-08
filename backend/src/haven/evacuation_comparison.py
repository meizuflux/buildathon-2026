"""Compare the old nearest-shelter approach with Haven's personalized allocation.

Used by the operator evacuation preview endpoint and by
``python scripts/compare_naive.py``. Requirements and unmet needs come from the
allocator's own ``compatibility_mismatches`` so the two can never drift apart.
"""

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path
from typing import Any, cast, get_args

from haven.allocation_analysis import database_inputs, demo_inputs, distribution
from haven.allocation_policy import (
    DEFAULT_SOLVE_SECONDS,
    allocate_disaster,
    compatibility_mismatches,
    distance,
    household_size,
)
from haven.demo_data import DEMO_DISASTER_ID
from haven.naive_allocation import allocate_nearest
from haven.openapi import EvacuationMetrics, Requirement

REQUIREMENTS: tuple[Requirement, ...] = get_args(Requirement)

# A shelter that supports nothing: every need the household has is a mismatch.
_BARE_SHELTER: dict[str, Any] = {
    "status": "open",
    "capabilities": {
        "pets_allowed": False,
        "child_friendly": False,
        "wheelchair_accessible": False,
        "medical_staff": [],
        "special_care_notes": None,
    },
    "resources": {
        "food": "unavailable",
        "water": "unavailable",
        "medication": "unavailable",
        "clothes": "unavailable",
    },
}


def _in_order(requirements: list[str]) -> list[Requirement]:
    return [r for r in REQUIREMENTS if r in requirements]


def household_requirements(family: dict[str, Any]) -> list[Requirement]:
    """The household's needs, in ``REQUIREMENTS`` order."""
    return _in_order(compatibility_mismatches(family, _BARE_SHELTER))


def unmet_requirements(family: dict[str, Any], shelter: dict[str, Any] | None) -> list[Requirement]:
    """Requirements the destination fails to satisfy, in ``REQUIREMENTS`` order."""
    return _in_order(compatibility_mismatches(family, shelter)) if shelter else []


def summarize(
    families: list[dict[str, Any]],
    shelters: list[dict[str, Any]],
    assigned: dict[str, dict[str, Any] | None],
) -> EvacuationMetrics:
    """Outcome counts for one assignment of households to shelters."""
    loads: Counter[str] = Counter()
    shelter_unmet: Counter[str] = Counter()
    needed: Counter[str] = Counter()
    unmet_by_need: Counter[str] = Counter()
    unassigned = households_with_needs = unmet_households = 0
    km_all: list[float] = []
    km_no_car: list[float] = []
    for family in families:
        requirements = household_requirements(family)
        households_with_needs += bool(requirements)
        needed.update(requirements)
        selected = assigned.get(family["id"])
        if selected is None:
            unassigned += 1
            continue
        loads[selected["id"]] += household_size(family)
        unmet = unmet_requirements(family, selected)
        unmet_households += bool(unmet)
        unmet_by_need.update(unmet)
        shelter_unmet[selected["id"]] += bool(unmet)
        km = distance(family, selected)
        km_all.append(km)
        if not family["resources"].get("has_car"):
            km_no_car.append(km)

    shelter_rows = []
    utilizations = []
    people_over = overcrowded = idle = 0
    for shelter in sorted(shelters, key=lambda s: s["id"]):
        people = loads[shelter["id"]]
        total = int(shelter["capacity"]["total_people"])
        over = max(0, people - total)
        people_over += over
        overcrowded += people > total
        if shelter["status"] == "open" and total > 0:
            idle += people == 0
            utilizations.append(people / total)
        shelter_rows.append(
            {
                "shelter_id": shelter["id"],
                "name": shelter["name"],
                "people": people,
                "total_people": total,
                "utilization": round(people / total, 3) if total > 0 else None,
                "people_over_capacity": over,
                "unmet_households": shelter_unmet[shelter["id"]],
            }
        )
    trips = distribution(km_all)
    no_car = distribution(km_no_car)
    metrics = {
        "households": len(families),
        "people": sum(household_size(f) for f in families),
        "unassigned_households": unassigned,
        "households_with_needs": households_with_needs,
        "unmet_households": unmet_households,
        "needs": [
            {
                "requirement": requirement,
                "households": needed[requirement],
                "unmet_households": unmet_by_need[requirement],
            }
            for requirement in REQUIREMENTS
        ],
        "people_over_capacity": people_over,
        "overcrowded_shelters": overcrowded,
        "idle_shelters": idle,
        "max_utilization": round(max(utilizations), 3) if utilizations else None,
        "min_utilization": round(min(utilizations), 3) if utilizations else None,
        "travel": {
            "mean_km": trips["mean_km"],
            "p95_km": trips["p95_km"],
            "max_km": trips["max_km"],
            "total_km": trips["total_km"],
            "no_car_mean_km": no_car["mean_km"],
        },
        "shelters": shelter_rows,
    }
    return cast(EvacuationMetrics, metrics)


def _destination(family: dict[str, Any], shelter: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "shelter_id": shelter["id"] if shelter else None,
        "distance_km": round(distance(family, shelter), 3) if shelter else None,
        "unmet": unmet_requirements(family, shelter),
    }


def build_preview(
    families: list[dict[str, Any]],
    shelters: list[dict[str, Any]],
    personalized_assigned: dict[str, dict[str, Any] | None],
) -> dict[str, Any]:
    """Per-household destinations and metrics for both strategies (no disaster id/timestamp)."""
    naive_assigned = allocate_nearest(families, shelters)
    return {
        "households": [
            {
                "family_id": family["id"],
                "location": {
                    "latitude": family["location"]["latitude"],
                    "longitude": family["location"]["longitude"],
                },
                "people": household_size(family),
                "has_car": bool(family["resources"].get("has_car")),
                "requirements": household_requirements(family),
                "naive": _destination(family, naive_assigned.get(family["id"])),
                "personalized": _destination(family, personalized_assigned.get(family["id"])),
            }
            for family in families
        ],
        "naive": summarize(families, shelters, naive_assigned),
        "personalized": summarize(families, shelters, personalized_assigned),
    }


def _fmt_km(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.2f}"


def _fmt_pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.0f}%"


def _utilization_range(metrics: EvacuationMetrics) -> str:
    low, high = metrics["min_utilization"], metrics["max_utilization"]
    return f"{_fmt_pct(low)} - {_fmt_pct(high)}"


def render_table(preview: dict[str, Any]) -> str:
    naive, personalized = preview["naive"], preview["personalized"]
    rows: list[tuple[str, str, str]] = [
        (
            "Households with unmet needs",
            f"{naive['unmet_households']}/{naive['households']}",
            f"{personalized['unmet_households']}/{personalized['households']}",
        )
    ]
    for old, new in zip(naive["needs"], personalized["needs"], strict=True):
        if old["households"] > 0:
            rows.append(
                (
                    f"  {old['requirement']}",
                    f"{old['unmet_households']}/{old['households']}",
                    f"{new['unmet_households']}/{new['households']}",
                )
            )
    rows += [
        (
            "Unassigned households",
            str(naive["unassigned_households"]),
            str(personalized["unassigned_households"]),
        ),
        (
            "People over capacity",
            str(naive["people_over_capacity"]),
            str(personalized["people_over_capacity"]),
        ),
        (
            "Overcrowded shelters",
            str(naive["overcrowded_shelters"]),
            str(personalized["overcrowded_shelters"]),
        ),
        ("Idle shelters", str(naive["idle_shelters"]), str(personalized["idle_shelters"])),
        ("Utilization range", _utilization_range(naive), _utilization_range(personalized)),
        (
            "Mean travel (km)",
            _fmt_km(naive["travel"]["mean_km"]),
            _fmt_km(personalized["travel"]["mean_km"]),
        ),
        (
            "No-car mean travel (km)",
            _fmt_km(naive["travel"]["no_car_mean_km"]),
            _fmt_km(personalized["travel"]["no_car_mean_km"]),
        ),
    ]
    width = max(len(label) for label, _, _ in rows)
    left = max(len("Nearest shelter"), *(len(a) for _, a, _ in rows))
    right = max(len("Haven personalized"), *(len(b) for _, _, b in rows))
    lines = [
        f"{preview['households_count']} households, {naive['people']} people",
        "",
        f"{'':<{width}}  {'Nearest shelter':>{left}}  {'Haven personalized':>{right}}",
    ]
    lines += [f"{label:<{width}}  {a:>{left}}  {b:>{right}}" for label, a, b in rows]

    names = {row["shelter_id"]: row["name"] for row in naive["shelters"]}
    name_width = max((len(name) for name in names.values()), default=7)
    lines += [
        "",
        "Per-shelter load (people / total, unmet households)",
        f"{'Shelter':<{name_width}}  {'Nearest shelter':>22}  {'Haven personalized':>22}",
    ]
    for old, new in zip(naive["shelters"], personalized["shelters"], strict=True):

        def cell(row: dict[str, Any]) -> str:
            return f"{row['people']}/{row['total_people']}, {row['unmet_households']} unmet"

        lines.append(f"{old['name']:<{name_width}}  {cell(old):>22}  {cell(new):>22}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Nearest shelter (old) vs Haven personalized.")
    parser.add_argument("--database", type=Path, help="Existing SQLite database, opened read-only")
    parser.add_argument("--disaster-id", default=DEMO_DISASTER_ID)
    parser.add_argument("--seed", type=int, default=42, help="Synthetic household seed")
    parser.add_argument(
        "--seconds", type=float, default=DEFAULT_SOLVE_SECONDS, help="Solver search seconds"
    )
    parser.add_argument("--json", type=Path, help="Also write the full comparison as JSON")
    args = parser.parse_args(argv)
    if not math.isfinite(args.seconds) or args.seconds < 0:
        parser.error("--seconds must be finite and nonnegative")

    if args.database:
        families, shelters, previous = database_inputs(args.database, args.disaster_id)
        by_id = {shelter["id"]: shelter for shelter in shelters}
        personalized = {f["id"]: by_id.get(previous.get(f["id"])) for f in families}
        source = f"stored assignments in {args.database}"
    else:
        families, shelters = demo_inputs(args.seed)
        personalized, _ = allocate_disaster(families, shelters, {}, max_solve_seconds=args.seconds)
        source = f"synthetic fixture (seed {args.seed}), fresh solve"
    if not families:
        print("No households found; nothing to compare.", file=sys.stderr)
        return 1

    preview = build_preview(families, shelters, personalized)
    print(f"Source: {source}")
    print(render_table({**preview, "households_count": len(families)}))
    if args.json:
        args.json.write_text(json.dumps(preview, indent=2) + "\n")
        print(f"\nFull comparison written to {args.json.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
