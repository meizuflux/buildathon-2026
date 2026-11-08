import json
import sqlite3
from copy import deepcopy

import pytest

from haven.allocation_analysis import (
    analyze,
    database_inputs,
    distribution,
    main,
    scenario_shelters,
)
from haven.allocation_policy import AllocationDiagnostics, allocate_disaster
from haven.demo_data import DEMO_DISASTER_ID, DEMO_LOCATIONS


def household():
    return {
        "id": "family",
        "adults": 2,
        "children": 0,
        "created_at": "now",
        "needs": {"pets": True},
        "resources": {"has_car": False},
        "location": {"latitude": 0, "longitude": 0},
    }


def site(identity="site", pets=True):
    return {
        "id": identity,
        "name": identity,
        "status": "open",
        "allocation_budget": 1,
        "capacity": {"total_people": 1},
        "capabilities": {"pets_allowed": pets},
        "resources": {"food": "available", "water": "available", "clothes": "limited"},
        "location": {"latitude": 0, "longitude": 0},
    }


def test_outcome_accounting_detects_avoidable_and_unavoidable_need_mismatches():
    person, general, pets = household(), site("general", False), site("pets")
    metrics, rows = analyze([person], [general, pets], {"family": general})
    assert metrics["unmet_households"] == 1
    assert metrics["unavoidable_unmet_households"] == 0
    assert metrics["unsupported_despite_compatible_shelter"] == 1
    assert metrics["physical_overflow_people"] == 1
    assert metrics["budget_overflow_people"] == 1
    assert metrics["travel"]["no_car"]["count"] == 1
    assert rows[0]["unmet_requirements"] == "pets"
    metrics, _ = analyze([person], [general], {"family": general})
    assert metrics["unavoidable_unmet_households"] == 1
    assert metrics["unsupported_despite_compatible_shelter"] == 0


def test_zero_capacity_and_no_destination_do_not_look_successful():
    person, full = household(), site()
    full["status"] = "full"
    metrics, _ = analyze([person], [full], {"family": full})
    assert metrics["budget_overflow_people"] == 2
    assert metrics["shelters"][0]["utilization"] is None
    metrics, _ = analyze([person], [], {"family": None})
    assert metrics["unassigned_households"] == 1
    assert metrics["travel"]["no_car"]["mean_km"] is None


def test_stress_scenarios_do_not_modify_inputs():
    shelters = [site()]
    original = deepcopy(shelters)
    assert (
        scenario_shelters(shelters, "medical_outage")[0]["resources"]["medication"] == "unavailable"
    )
    assert scenario_shelters(shelters, "shelter_closed")[0]["status"] == "closed"
    assert scenario_shelters([], "shelter_closed") == []
    assert shelters == original
    assert distribution([])["p95_km"] is None
    assert distribution([1, 2, 3])["p50_km"] == 2


def test_read_only_input_never_creates_missing_database(tmp_path):
    missing = tmp_path / "missing.sqlite3"
    with pytest.raises(sqlite3.OperationalError):
        database_inputs(missing, DEMO_DISASTER_ID)
    assert not missing.exists()


def test_search_diagnostics_distinguish_timeout_from_optimum():
    evidence = AllocationDiagnostics()
    assigned, _ = allocate_disaster(
        [household()], [site("a"), site("b")], {}, max_solve_seconds=0, diagnostics=evidence
    )
    assert assigned["family"] is not None
    assert evidence.status == "TIME_LIMIT"
    assert evidence.initial_score == evidence.final_score
    assert evidence.elapsed_seconds >= 0


def test_cli_writes_analyzable_reports_without_seeding_database(tmp_path, monkeypatch):
    import haven.allocation_analysis as analysis

    monkeypatch.setattr(analysis, "demo_inputs", lambda seed: ([household()], [site()]))
    output = tmp_path / "results"
    assert (
        main(
            [
                "--seeds",
                "42",
                "--profiles",
                "balanced",
                "--scenarios",
                "base,no_open",
                "--seconds",
                "0",
                "--output",
                str(output),
            ]
        )
        == 0
    )
    report = json.loads((output / "report.json").read_text())
    assert report["cases"][0]["metrics"]["unassigned_households"] == 0
    assert report["cases"][1]["metrics"]["unassigned_households"] == 1
    assert report["cases"][0]["input_sha256"] != report["cases"][1]["input_sha256"]
    assert "balanced" in (output / "report.md").read_text()
    assert "family" in (output / "assignments.csv").read_text()


def test_geography_has_distinct_hubs_and_stable_merge_targets():
    from haven.allocation_policy import distance

    sites = json.loads(DEMO_LOCATIONS.read_text())["shelters"]
    ids = {s["id"] for s in sites}
    merged = {old for s in sites for old in s["replaces"]}
    assert len(ids) == 9
    assert not ids.intersection(merged)
    assert {"demo_shelter_02", "demo_shelter_03", "demo_shelter_07"} <= merged
    snapshots = [
        {"location": {"latitude": s["latitude"], "longitude": s["longitude"]}} for s in sites
    ]
    assert min(distance(a, b) for i, a in enumerate(snapshots) for b in snapshots[i + 1 :]) > 1


def test_shelter_refresh_merges_legacy_sites_without_recreating_households(tmp_path, monkeypatch):
    import asyncio

    from haven.db import SCHEMA, connect
    from haven.refresh_demo_shelters import replace_demo_shelters

    database = tmp_path / "existing.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(database))
    with sqlite3.connect(database) as db:
        db.executescript(SCHEMA.read_text())
        db.execute(
            "INSERT INTO disasters VALUES (?,?,?,?,?,?)",
            (DEMO_DISASTER_ID, "hurricane", "Demo existing", "active", "area", "now"),
        )
        db.execute("INSERT INTO users VALUES ('u','u@example.test','preserved','family','now')")
        db.execute(
            "INSERT INTO families VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                "f",
                "u",
                DEMO_DISASTER_ID,
                2,
                0,
                26.26,
                -81.52,
                "{}",
                '{"has_car":true}',
                "now",
                "now",
            ),
        )
        db.execute(
            "INSERT INTO shelters VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                "demo_shelter_03",
                DEMO_DISASTER_ID,
                "Legacy adjacent site",
                "Address",
                26.26,
                -81.52,
                "open",
                '{"total_people":600,"available_people":598}',
                "{}",
                "{}",
                "now",
            ),
        )
        db.execute(
            "INSERT INTO current_assignments VALUES (?,?,?,?,?)",
            ("f", DEMO_DISASTER_ID, "demo_shelter_03", 2, "now"),
        )
        db.execute(
            "INSERT INTO reports VALUES ('r','f','other','preserve me',NULL,NULL,'key','new','now')"
        )

    async def update():
        async with connect() as connection:
            await connection.execute("BEGIN IMMEDIATE")
            result = await replace_demo_shelters(connection)
            await connection.execute("COMMIT")
            return result

    result = asyncio.run(update())
    assert result == {"curated_shelters": 9, "households_reallocated": 1}
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT COUNT(*) FROM shelters").fetchone()[0] == 9
        assert (
            db.execute("SELECT COUNT(*) FROM shelters WHERE id='demo_shelter_03'").fetchone()[0]
            == 0
        )
        assert (
            db.execute("SELECT password_hash FROM users WHERE id='u'").fetchone()[0] == "preserved"
        )
        assert db.execute("SELECT message FROM reports WHERE id='r'").fetchone()[0] == "preserve me"
        assert db.execute("SELECT COUNT(*) FROM families").fetchone()[0] == 1
        assert db.execute(
            "SELECT shelter_id FROM current_assignments WHERE family_id='f'"
        ).fetchone()[0]
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
