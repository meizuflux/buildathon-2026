"""Unit tests for the nearest-shelter baseline and the comparison metrics."""

import json

import pytest

from haven.allocation_policy import compatibility_mismatches, distance
from haven.evacuation_comparison import (
    REQUIREMENTS,
    build_preview,
    household_requirements,
    main,
    summarize,
)
from haven.naive_allocation import allocate_nearest


def shelter(identifier, longitude, total, *, capable=True, status="open"):
    return {
        "id": identifier,
        "name": identifier.upper(),
        "status": status,
        "location": {"latitude": 0.0, "longitude": longitude},
        "capacity": {"total_people": total, "available_people": total},
        "allocation_budget": total,
        "capabilities": {
            "pets_allowed": capable,
            "child_friendly": capable,
            "wheelchair_accessible": True,
            "medical_staff": ["nurse"] if capable else [],
            "special_care_notes": "care" if capable else None,
        },
        "resources": {
            "food": "available",
            "water": "available",
            "medication": "available" if capable else "unavailable",
            "clothes": "available",
        },
    }


def family(identifier, adults, children, *, has_car=True, **needs):
    return {
        "id": identifier,
        "created_at": "2026-11-07T00:00:00Z",
        "adults": adults,
        "children": children,
        "location": {"latitude": 0.0, "longitude": 0.01},
        "needs": {
            "pets": False,
            "immediate_medication": False,
            "medical_notes": None,
            "accessibility_notes": None,
            "other_special_care": None,
        }
        | needs,
        "resources": {"has_car": has_car},
    }


@pytest.fixture
def fixture():
    shelters = [
        shelter("s1", 0.0, 4, capable=False),
        shelter("s2", 1.0, 10),
        shelter("s3", 2.0, 10),
        # Closest of all but closed, so the baseline must skip it.
        shelter("s0", 0.0001, 50, status="closed"),
    ]
    families = [
        family("f1", 2, 1, has_car=False, pets=True, immediate_medication=True),
        family("f2", 2, 0),
    ]
    return families, shelters


def test_nearest_picks_closest_open_or_full_shelter_and_breaks_ties_by_id():
    shelters = [shelter("b", 0.0, 1), shelter("a", 0.0, 1), shelter("c", 0.5, 1, status="full")]
    shelters.append(shelter("z", 0.0, 1, status="closed"))
    near = family("f", 1, 0)
    near["location"]["longitude"] = 0.4
    chosen = allocate_nearest([family("f", 1, 0), near | {"id": "g"}], shelters)
    assert chosen["f"] is not None and chosen["f"]["id"] == "a"
    assert chosen["g"] is not None and chosen["g"]["id"] == "c"
    assert allocate_nearest([family("f", 1, 0)], [shelter("x", 0.0, 1, status="closed")]) == {
        "f": None
    }


def test_household_requirements_follow_allocator_rules_in_contract_order():
    assert REQUIREMENTS == (
        "medication",
        "medical_staff",
        "wheelchair_accessible",
        "pets",
        "child_friendly",
        "special_care",
    )
    everything = family(
        "f",
        1,
        1,
        pets=True,
        immediate_medication=True,
        accessibility_notes="x",
        other_special_care="y",
    )
    assert household_requirements(everything) == list(REQUIREMENTS)
    assert household_requirements(family("f", 2, 0)) == []
    # Medical notes alone need staff but not the medication label.
    assert household_requirements(family("f", 1, 0, medical_notes="insulin")) == ["medical_staff"]
    needy = family("f", 1, 1, pets=True, immediate_medication=True)
    capable = shelter("ok", 0.0, 5)
    assert compatibility_mismatches(needy, capable) == []


def test_summarize_counts_overflow_idle_unmet_and_utilization(fixture):
    families, shelters = fixture
    by_id = {s["id"]: s for s in shelters}
    naive = summarize(families, shelters, allocate_nearest(families, shelters))
    assert naive["households"] == 2 and naive["people"] == 5
    assert naive["unassigned_households"] == 0
    assert naive["households_with_needs"] == 1
    assert naive["unmet_households"] == 1
    needs = {row["requirement"]: row for row in naive["needs"]}
    assert [row["requirement"] for row in naive["needs"]] == list(REQUIREMENTS)
    assert needs["medication"] == {
        "requirement": "medication",
        "households": 1,
        "unmet_households": 1,
    }
    assert needs["medical_staff"]["unmet_households"] == 1
    assert needs["pets"]["unmet_households"] == 1
    assert needs["child_friendly"]["unmet_households"] == 1
    assert needs["wheelchair_accessible"] == {
        "requirement": "wheelchair_accessible",
        "households": 0,
        "unmet_households": 0,
    }
    assert naive["people_over_capacity"] == 1
    assert naive["overcrowded_shelters"] == 1
    assert naive["idle_shelters"] == 2  # s2 and s3; closed s0 never counts
    assert naive["max_utilization"] == 1.25 and naive["min_utilization"] == 0.0
    loads = {row["shelter_id"]: row for row in naive["shelters"]}
    assert loads["s1"]["people"] == 5 and loads["s1"]["people_over_capacity"] == 1
    assert loads["s1"]["unmet_households"] == 1 and loads["s1"]["utilization"] == 1.25
    assert loads["s0"]["total_people"] == 50 and loads["s0"]["people"] == 0
    expected = [distance(f, by_id["s1"]) for f in families]
    assert naive["travel"]["total_km"] == pytest.approx(sum(expected), abs=1e-3)
    assert naive["travel"]["mean_km"] == pytest.approx(sum(expected) / 2, abs=1e-3)
    assert naive["travel"]["max_km"] == pytest.approx(max(expected), abs=1e-3)
    assert naive["travel"]["no_car_mean_km"] == pytest.approx(expected[0], abs=1e-3)

    personalized = summarize(families, shelters, {"f1": by_id["s2"], "f2": by_id["s1"]})
    assert personalized["unmet_households"] == 0
    assert personalized["people_over_capacity"] == 0
    assert personalized["overcrowded_shelters"] == 0
    assert personalized["idle_shelters"] == 1
    assert personalized["max_utilization"] == 0.5 and personalized["min_utilization"] == 0.0


def test_summarize_handles_unassigned_and_no_households(fixture):
    families, shelters = fixture
    metrics = summarize(families, shelters, {"f1": None, "f2": None})
    assert metrics["unassigned_households"] == 2 and metrics["unmet_households"] == 0
    assert metrics["travel"] == {
        "mean_km": None,
        "p95_km": None,
        "max_km": None,
        "total_km": 0.0,
        "no_car_mean_km": None,
    }
    assert summarize([], [], {})["max_utilization"] is None


def test_build_preview_shape_and_rounding(fixture):
    families, shelters = fixture
    by_id = {s["id"]: s for s in shelters}
    preview = build_preview(families, shelters, {"f1": by_id["s2"], "f2": None})
    first, second = preview["households"]
    assert first["family_id"] == "f1" and first["people"] == 3 and first["has_car"] is False
    assert first["requirements"] == ["medication", "medical_staff", "pets", "child_friendly"]
    assert first["naive"]["shelter_id"] == "s1"
    assert first["naive"]["unmet"] == ["medication", "medical_staff", "pets", "child_friendly"]
    assert first["personalized"] == {
        "shelter_id": "s2",
        "distance_km": round(distance(families[0], by_id["s2"]), 3),
        "unmet": [],
    }
    assert second["personalized"] == {"shelter_id": None, "distance_km": None, "unmet": []}
    assert preview["naive"]["households"] == preview["personalized"]["households"] == 2


def test_cli_prints_table_and_writes_json(tmp_path, capsys, monkeypatch, fixture):
    families, shelters = fixture
    monkeypatch.setattr(
        "haven.evacuation_comparison.demo_inputs", lambda seed: (families, shelters)
    )
    output = tmp_path / "comparison.json"
    assert main(["--seconds", "1", "--json", str(output)]) == 0
    printed = capsys.readouterr().out
    assert "Nearest shelter" in printed and "Haven personalized" in printed
    assert "medication" in printed and "wheelchair_accessible" not in printed
    written = json.loads(output.read_text())
    assert set(written) == {"households", "naive", "personalized"}
    assert written["personalized"]["unmet_households"] == 0
    assert written["naive"]["unmet_households"] == 1


def test_cli_fails_without_households(monkeypatch, capsys):
    monkeypatch.setattr("haven.evacuation_comparison.demo_inputs", lambda seed: ([], []))
    assert main([]) == 1
    assert "No households" in capsys.readouterr().err
