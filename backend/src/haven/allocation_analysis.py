"""Repeatable, read-only experiments for shelter allocation priorities.

Run with ``python -m haven.allocation_analysis --help``. The default inputs are
fictional demo snapshots. Database mode opens SQLite read-only and never seeds,
updates, or reallocates the application's stored plans.
"""

import argparse
import csv
import hashlib
import json
import math
import sqlite3
import sys
import time
from collections import Counter
from copy import deepcopy
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import ortools

from haven.allocation_policy import (
    DEFAULT_SOLVE_SECONDS,
    PRIORITY_PROFILES,
    AllocationDiagnostics,
    allocate_disaster,
    compatibility_mismatches,
    distance,
    household_size,
)
from haven.demo_data import DEMO_DISASTER_ID, DEMO_LOCATIONS, demo_shelter_snapshots
from haven.demo_households import generate_households
from haven.rows import (
    ALLOCATION_FAMILY_COLUMNS,
    ALLOCATION_SHELTER_COLUMNS,
    allocation_family_from_row,
    allocation_shelter_from_row,
    projection,
)

SCENARIOS = ("base", "capacity_shortage", "medical_outage", "shelter_closed", "no_open")


def demo_inputs(seed: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    locations = json.loads(DEMO_LOCATIONS.read_text())
    profiles = generate_households(len(locations["households"]), seed=seed)
    families = [
        {
            **profile,
            "id": f"family_{i + 1:04d}",
            "created_at": "2026-11-07T00:00:00Z",
            "location": {"latitude": home["latitude"], "longitude": home["longitude"]},
        }
        for i, (home, profile) in enumerate(zip(locations["households"], profiles, strict=True))
    ]
    return families, demo_shelter_snapshots(locations)


def database_inputs(path: Path, disaster_id: str):
    """Read allocation budgets, not derived free-space counts, from an existing DB."""
    with sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True) as db:
        families = [
            allocation_family_from_row(row)
            for row in db.execute(
                f"SELECT {projection(ALLOCATION_FAMILY_COLUMNS)} FROM families WHERE disaster_id=?",
                (disaster_id,),
            )
        ]
        budgets = dict(
            db.execute("SELECT shelter_id, allocation_budget FROM shelter_capacity_budgets")
        )
        shelters = []
        for row in db.execute(
            f"SELECT {projection(ALLOCATION_SHELTER_COLUMNS)} FROM shelters WHERE disaster_id=?",
            (disaster_id,),
        ):
            # Legacy DBs without a budget row reconstruct it from active reservations.
            if row[0] not in budgets:
                reserved = db.execute(
                    "SELECT COALESCE(SUM(people),0) FROM current_assignments WHERE shelter_id=?",
                    (row[0],),
                ).fetchone()[0]
                budgets[row[0]] = json.loads(row[7])["available_people"] + reserved
            shelters.append(allocation_shelter_from_row(row, budgets[row[0]]))
        previous = dict(
            db.execute(
                "SELECT family_id, shelter_id FROM current_assignments WHERE disaster_id=?",
                (disaster_id,),
            )
        )
    return families, shelters, previous


def scenario_shelters(shelters: list[dict[str, Any]], scenario: str):
    result = deepcopy(shelters)
    if scenario == "capacity_shortage":
        for site in result:
            site["allocation_budget"] = int(site["allocation_budget"] * 0.4)
            site["capacity"]["total_people"] = int(site["capacity"]["total_people"] * 0.4)
    elif scenario == "medical_outage":
        for site in result:
            site["capabilities"]["medical_staff"] = []
            site["resources"]["medication"] = "unavailable"
    elif scenario == "shelter_closed":
        if not result:
            return result
        # Close the largest medical-capable site, not an arbitrary list index.
        capable = [site for site in result if site["capabilities"].get("medical_staff")]
        max(capable or result, key=lambda site: site["allocation_budget"])["status"] = "closed"
    elif scenario == "no_open":
        for site in result:
            site["status"] = "closed"
    elif scenario != "base":
        raise ValueError(f"Unknown scenario: {scenario}")
    return result


def distribution(values: list[float]) -> dict[str, float | int | None]:
    ordered = sorted(values)

    def percentile(fraction: float):
        if not ordered:
            return None
        index = (len(ordered) - 1) * fraction
        lower, upper = math.floor(index), math.ceil(index)
        return round(ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower), 3)

    return {
        "count": len(values),
        "mean_km": round(sum(values) / len(values), 3) if values else None,
        "p50_km": percentile(0.5),
        "p95_km": percentile(0.95),
        "max_km": round(max(values), 3) if values else None,
        "total_km": round(sum(values), 3),
    }


def analyze(families, shelters, assigned, previous=None):
    """Independent outcome accounting; does not trust solver scores or remaining."""
    previous = previous or {}
    unmet: Counter[str] = Counter()
    loads: Counter[str] = Counter()
    rows = []
    trips: dict[str, list[float]] = {
        key: [] for key in ("all", "car", "no_car", "clinical", "pets")
    }
    unassigned, unmet_households, moved, unsupported_despite_match = 0, 0, 0, 0
    invalid_destinations, unavoidable_unmet = 0, 0
    essential_exposure, limited_clothes_people = 0, 0
    for family in families:
        selected = assigned.get(family["id"])
        size = household_size(family)
        candidates = [site for site in shelters if site["status"] in {"open", "full"}]
        mismatches = compatibility_mismatches(family, selected) if selected else []
        km = distance(family, selected) if selected else None
        unavoidable_unmet += bool(candidates) and not any(
            not compatibility_mismatches(family, site) for site in candidates
        )
        if selected is not None:
            invalid_destinations += selected["status"] not in {"open", "full"}
        if selected is None:
            unassigned += 1
        else:
            assert km is not None
            loads[selected["id"]] += size
            unmet.update(mismatches)
            unmet_households += bool(mismatches)
            unsupported_despite_match += bool(mismatches) and any(
                not compatibility_mismatches(family, site) for site in candidates
            )
            moved += (
                previous.get(family["id"]) is not None and previous[family["id"]] != selected["id"]
            )
            trips["all"].append(km)
            trips["car" if family["resources"].get("has_car") else "no_car"].append(km)
            if any(
                family["needs"].get(key)
                for key in (
                    "medical_notes",
                    "immediate_medication",
                    "accessibility_notes",
                    "other_special_care",
                )
            ):
                trips["clinical"].append(km)
            if family["needs"].get("pets"):
                trips["pets"].append(km)
            essential = ["food", "water"] + (
                ["medication"] if family["needs"].get("immediate_medication") else []
            )
            essential_exposure += size * sum(
                selected["resources"].get(key, "unknown") in {"unknown", "unavailable"}
                for key in essential
            )
            limited_clothes_people += size * (selected["resources"].get("clothes") == "limited")
        rows.append(
            {
                "family_id": family["id"],
                "people": size,
                "has_car": bool(family["resources"].get("has_car")),
                "shelter_id": selected["id"] if selected else "",
                "distance_km": round(km, 4) if km is not None else "",
                "unmet_requirements": ",".join(mismatches),
                "unassigned": selected is None,
            }
        )
    shelter_rows: list[dict[str, Any]] = []
    for site in shelters:
        total = site["capacity"]["total_people"]
        effective = max(0, min(total, site["allocation_budget"])) if site["status"] == "open" else 0
        load = loads[site["id"]]
        shelter_rows.append(
            {
                "id": site["id"],
                "name": site["name"],
                "status": site["status"],
                "people": load,
                "total_people": total,
                "usable_capacity": effective,
                "utilization": round(load / effective, 4) if effective else None,
                "physical_overflow": max(0, load - total),
                "budget_overflow": max(
                    0, load - (site["allocation_budget"] if site["status"] == "open" else 0)
                ),
            }
        )
    open_rows = [
        row for row in shelter_rows if row["status"] == "open" and row["usable_capacity"] > 0
    ]
    metrics = {
        "households": len(families),
        "people": sum(household_size(f) for f in families),
        "unassigned_households": unassigned,
        "unmet_households": unmet_households,
        "unavoidable_unmet_households": unavoidable_unmet,
        "invalid_destination_households": invalid_destinations,
        "unmet_requirements": dict(sorted(unmet.items())),
        "unsupported_despite_compatible_shelter": unsupported_despite_match,
        "physical_overflow_people": sum(row["physical_overflow"] for row in shelter_rows),
        "budget_overflow_people": sum(row["budget_overflow"] for row in shelter_rows),
        "empty_open_shelters": sum(row["people"] == 0 for row in open_rows),
        "full_open_shelters": sum(row["people"] >= row["usable_capacity"] for row in open_rows),
        "max_utilization": max((row["utilization"] for row in open_rows), default=None),
        "min_utilization": min((row["utilization"] for row in open_rows), default=None),
        "essential_supply_shortfall_person_labels": essential_exposure,
        "people_with_limited_clothes_label": limited_clothes_people,
        "moved_households": moved,
        "travel": {key: distribution(values) for key, values in trips.items()},
        "shelters": shelter_rows,
    }
    return metrics, rows


def run_case(families, shelters, previous, profile, seconds, *, repeat=False):
    diagnostics = AllocationDiagnostics()
    assigned, _ = allocate_disaster(
        families,
        shelters,
        previous,
        priority_profile=profile,
        max_solve_seconds=seconds,
        diagnostics=diagnostics,
    )
    metrics, rows = analyze(families, shelters, assigned, previous)
    evidence = {"metrics": metrics, "search": asdict(diagnostics)}
    if repeat:
        prior = {key: value["id"] if value else None for key, value in assigned.items()}
        again, _ = allocate_disaster(
            families, shelters, prior, priority_profile=profile, max_solve_seconds=seconds
        )
        evidence["repeat_moved_households"] = sum(
            prior[key] != (value["id"] if value else None) for key, value in again.items()
        )
    return evidence, rows


def recommend(cases):
    """Choose among measured profiles only when the base acceptance gates pass."""
    acceptable = []
    for profile in PRIORITY_PROFILES:
        base = [case for case in cases if case["profile"] == profile and case["scenario"] == "base"]
        if not base:
            continue
        if all(
            not any(
                case["metrics"][key]
                for key in (
                    "unassigned_households",
                    "unmet_households",
                    "physical_overflow_people",
                    "budget_overflow_people",
                    "empty_open_shelters",
                    "full_open_shelters",
                )
            )
            for case in base
        ):
            acceptable.append(
                (
                    sum(case["metrics"]["travel"]["no_car"]["mean_km"] or 0 for case in base),
                    sum(case["metrics"]["travel"]["all"]["mean_km"] or 0 for case in base),
                    profile,
                )
            )
    return {
        "profile": min(acceptable)[2] if acceptable else None,
        "scope": "Measured base scenarios only; not a universal optimum or clinical validation.",
        "criteria": "All households assigned, no unmet listed needs/overflow/empty or full open sites; then lower no-car mean travel and all-household mean travel.",
        "eligible_profiles": sorted(item[2] for item in acceptable),
    }


def render_report(report):
    lines = [
        "# Allocation experiments",
        "",
        f"Input: {report['input']}",
        "",
        "All profiles protect required needs before capacity, utilization, supplies, and travel.",
        "Search status OPTIMAL proves that profile's objective; FEASIBLE/TIME_LIMIT/UNKNOWN does not.",
        "",
        "| Scenario | Seed | Profile | Unassigned | Unmet | Overflow | Empty/full sites | Utilization range | No-car mean/p95 km | All mean km | Search |",
        "| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | ---: | --- |",
    ]
    for case in report["cases"]:
        m = case["metrics"]
        no_car, all_trip = m["travel"]["no_car"], m["travel"]["all"]
        utilization = (
            "—"
            if m["min_utilization"] is None
            else f"{m['min_utilization']:.0%}–{m['max_utilization']:.0%}"
        )
        lines.append(
            f"| {case['scenario']} | {case['seed']} | {case['profile']} | "
            f"{m['unassigned_households']} | {m['unmet_households']} | {m['physical_overflow_people']} | "
            f"{m['empty_open_shelters']}/{m['full_open_shelters']} | {utilization} | "
            f"{no_car['mean_km']}/{no_car['p95_km']} | {all_trip['mean_km']} | {case['search']['status']} |"
        )
    recommendation = report.get("recommendation", {})
    lines += [
        "",
        f"Suggested profile: **{recommendation.get('profile') or 'none passes every base gate'}**.",
        recommendation.get("scope", ""),
        "",
        "## Per-site base results",
        "",
    ]
    base_cases = [case for case in report["cases"] if case["scenario"] == "base"]
    if base_cases:
        first_seed = base_cases[0]["seed"]
        for case in (case for case in base_cases if case["seed"] == first_seed):
            lines += [
                f"### {case['profile']} (seed {first_seed})",
                "",
                "| Shelter | Assigned people | Usable capacity | Utilization |",
                "| --- | ---: | ---: | ---: |",
            ]
            for site in case["metrics"]["shelters"]:
                ratio = "—" if site["utilization"] is None else f"{site['utilization']:.1%}"
                lines.append(
                    f"| {site['name']} | {site['people']} | {site['usable_capacity']} | {ratio} |"
                )
            lines.append("")
    lines += [
        "",
        "## Interpretation",
        "",
        "- Zero unmet needs means every assigned household matches the current broad capability flags; specific treatments and inventory are not verified.",
        "- Missing medical support and closed-site scenarios expose infrastructure gaps. Priority changes cannot create missing capabilities or destinations.",
        "- Travel is straight-line distance. Balance can increase travel and exposure to limited supply labels; compare those columns before choosing a profile.",
        "- assignments.csv contains every per-household result; report.json includes per-site loads, unmet requirements, repeat moves, and solver bounds.",
        "",
    ]
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, help="Existing SQLite database, opened read-only")
    parser.add_argument("--disaster-id", default=DEMO_DISASTER_ID)
    parser.add_argument(
        "--seeds", default="42,7,97", help="Comma-separated synthetic household seeds"
    )
    parser.add_argument("--profiles", default=",".join(PRIORITY_PROFILES))
    parser.add_argument(
        "--scenarios", default="base,capacity_shortage,medical_outage,shelter_closed"
    )
    parser.add_argument(
        "--seconds", type=float, default=DEFAULT_SOLVE_SECONDS, help="Search seconds per case"
    )
    parser.add_argument(
        "--repeat",
        action="store_true",
        help="Measure repeat-run assignment changes in the base scenario",
    )
    parser.add_argument("--output", type=Path, default=Path(".runtime/allocation-analysis/latest"))
    args = parser.parse_args(argv)
    profiles, scenarios = args.profiles.split(","), args.scenarios.split(",")
    if any(profile not in PRIORITY_PROFILES for profile in profiles):
        parser.error(f"Profiles must be chosen from {', '.join(PRIORITY_PROFILES)}")
    if any(scenario not in SCENARIOS for scenario in scenarios):
        parser.error(f"Scenarios must be chosen from {', '.join(SCENARIOS)}")
    if not math.isfinite(args.seconds) or args.seconds < 0:
        parser.error("--seconds must be finite and nonnegative")
    try:
        seeds = [int(value) for value in args.seeds.split(",")]
    except ValueError:
        parser.error("--seeds must contain integers")
    inputs = (
        [("database", *database_inputs(args.database, args.disaster_id))]
        if args.database
        else [(seed, *demo_inputs(seed), {}) for seed in seeds]
    )
    report = {
        "input": str(args.database.resolve()) if args.database else "synthetic demo fixture",
        "created_at": datetime.now(UTC).isoformat(),
        "seconds_per_case": args.seconds,
        "allocator_sha256": hashlib.sha256(
            Path(__file__).with_name("allocation_policy.py").read_bytes()
        ).hexdigest(),
        "ortools_version": ortools.__version__,
        "python_version": sys.version.split()[0],
        "priorities": PRIORITY_PROFILES,
        "cases": [],
    }
    all_rows = []
    for seed, families, shelters, previous in inputs:
        if not families:
            parser.error("No households were found; refusing to report an empty run as success")
        if args.database:
            by_id = {site["id"]: site for site in shelters}
            stored = {family["id"]: by_id.get(previous.get(family["id"])) for family in families}
            metrics, rows = analyze(families, shelters, stored, previous)
            report["cases"].append(
                {
                    "seed": seed,
                    "scenario": "stored",
                    "profile": "stored",
                    "metrics": metrics,
                    "search": {"status": "STORED"},
                }
            )
            all_rows.extend(
                {"seed": seed, "scenario": "stored", "profile": "stored", **row} for row in rows
            )
        for scenario in scenarios:
            for profile in profiles:
                start = time.monotonic()
                evidence, rows = run_case(
                    families,
                    scenario_shelters(shelters, scenario),
                    previous,
                    profile,
                    args.seconds,
                    repeat=args.repeat and scenario == "base",
                )
                case = {
                    "seed": seed,
                    "scenario": scenario,
                    "profile": profile,
                    **evidence,
                    "input_sha256": hashlib.sha256(
                        json.dumps(
                            {
                                "families": families,
                                "shelters": scenario_shelters(shelters, scenario),
                                "previous": previous,
                            },
                            sort_keys=True,
                        ).encode()
                    ).hexdigest(),
                }
                report["cases"].append(case)
                all_rows.extend(
                    {"seed": seed, "scenario": scenario, "profile": profile, **row} for row in rows
                )
                m = evidence["metrics"]
                print(
                    f"{seed}/{scenario}/{profile}: unassigned={m['unassigned_households']} "
                    f"unmet={m['unmet_households']} overflow={m['physical_overflow_people']} "
                    f"empty/full={m['empty_open_shelters']}/{m['full_open_shelters']} "
                    f"status={evidence['search']['status']} seconds={time.monotonic() - start:.2f}",
                    flush=True,
                )
    report["recommendation"] = recommend(report["cases"])
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    (args.output / "report.md").write_text(render_report(report))
    with (args.output / "assignments.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(all_rows[0]))
        writer.writeheader()
        writer.writerows(all_rows)
    print(f"Reports saved to {args.output.resolve()}")
    failed = any(
        case["metrics"]["unsupported_despite_compatible_shelter"]
        or case["metrics"]["invalid_destination_households"]
        or (
            case["metrics"]["unassigned_households"]
            and any(site["status"] in {"open", "full"} for site in case["metrics"]["shelters"])
        )
        for case in report["cases"]
        if case["profile"] != "stored"
    )
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
