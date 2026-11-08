from copy import deepcopy

from haven.allocation_policy import allocate_disaster


def family(identity, size, latitude):
    return {
        "id": identity,
        "adults": size,
        "children": 0,
        "location": {"latitude": latitude, "longitude": 0},
        "needs": {},
        "resources": {"has_car": True},
        "created_at": identity,
    }


def shelter(identity, latitude, budget):
    return {
        "id": identity,
        "name": identity,
        "address": "",
        "status": "open",
        "location": {"latitude": latitude, "longitude": 0},
        "allocation_budget": budget,
        "capacity": {"total_people": budget},
        "capabilities": {},
        "resources": {},
    }


def test_allocator_policy_avoids_unhelpful_moves_without_mutating_inputs():
    incumbent = family("incumbent", 3, 0)
    arriving = family("arriving", 2, 20)
    near = shelter("near", 0, 2)
    far = shelter("far", 20, 2)
    inputs = deepcopy(([incumbent, arriving], [near, far]))

    assigned, remaining = allocate_disaster(
        [incumbent, arriving], [near, far], {"incumbent": "near"}
    )

    assert {family_id: selected["id"] for family_id, selected in assigned.items()} == {
        "incumbent": "near",
        "arriving": "far",
    }
    assert remaining == {"near": -1, "far": 0}
    assert ([incumbent, arriving], [near, far]) == inputs


def choices(families, shelters, previous=None, **kwargs):
    assigned, remaining = allocate_disaster(families, shelters, previous or {}, **kwargs)
    return {key: value["id"] if value else None for key, value in assigned.items()}, remaining


def test_reassigns_incumbent_to_use_space_instead_of_overflow():
    incumbent, arriving = family("old", 3, 0), family("new", 2, 0)
    near, far = shelter("near", 0, 3), shelter("far", 1, 3)
    assigned, remaining = choices([incumbent, arriving], [near, far], {"old": "near"})
    assert all(value is not None for value in assigned.values())
    assert min(remaining.values()) >= 0
    assert assigned["old"] != assigned["new"]


def test_existing_assignment_is_only_a_tiebreaker():
    person = family("f", 1, 0)
    a, b = shelter("a", 0, 2), shelter("b", 0, 2)
    assert choices([person], [a, b], {"f": "b"})[0] == {"f": "b"}
    b["location"]["latitude"] = 1
    assert choices([person], [a, b], {"f": "b"})[0] == {"f": "a"}


def test_no_car_distance_outranks_smaller_total_distance():
    driver, walker = family("driver", 1, 0), family("walker", 1, 0.04)
    walker["resources"]["has_car"] = False
    assigned, _ = choices([driver, walker], [shelter("near", 0, 1), shelter("far", 0.1, 1)])
    assert assigned == {"driver": "far", "walker": "near"}


def test_required_care_outranks_pet_child_needs_and_capacity():
    person = family("f", 3, 0)
    person.update(children=1, needs={"medical_notes": "Care", "pets": True})
    general, medical = shelter("general", 0, 100), shelter("medical", 1, 1)
    general["capabilities"] = {"pets_allowed": True, "child_friendly": True}
    medical["capabilities"] = {"medical_staff": ["nurse"]}
    assigned, remaining = choices([person], [general, medical], {"f": "general"})
    assert assigned == {"f": "medical"}
    assert remaining["medical"] == -3


def test_preserves_pet_support_even_when_only_supported_shelter_is_full():
    person = family("f", 2, 0)
    person["needs"] = {"pets": True}
    general, pets = shelter("general", 0, 100), shelter("pets", 1, 0)
    pets["status"] = "full"
    pets["capabilities"]["pets_allowed"] = True
    assert choices([person], [general, pets])[0] == {"f": "pets"}


def test_medication_requires_staff_and_supply_label():
    person = family("f", 1, 0)
    person["needs"] = {"immediate_medication": True}
    empty, supported = shelter("empty", 0, 10), shelter("supported", 1, 0)
    for site in [empty, supported]:
        site["capabilities"]["medical_staff"] = ["nurse"]
    empty["resources"]["medication"] = "unavailable"
    supported["resources"]["medication"] = "limited"
    assert choices([person], [empty, supported])[0] == {"f": "supported"}


def test_resource_labels_outrank_travel_but_not_capacity():
    person = family("f", 1, 0)
    near, far = shelter("near", 0, 1), shelter("far", 1, 1)
    near["resources"]["water"] = "unavailable"
    far["resources"]["water"] = "available"
    assert choices([person], [near, far])[0] == {"f": "far"}
    far["allocation_budget"] = 0
    assert choices([person], [near, far])[0] == {"f": "near"}


def test_capacity_uses_bigger_shelter_instead_of_nearest():
    families = [family(str(i), 2, 0) for i in range(5)]
    assigned, remaining = choices(families, [shelter("near", 0, 2), shelter("large", 1, 8)])
    assert list(assigned.values()).count("near") == 1
    assert remaining == {"near": 0, "large": 0}


def test_overflow_is_shared_in_proportion_to_shelter_size():
    families = [family(str(i), 1, 0) for i in range(12)]
    _, remaining = choices(families, [shelter("small", 0, 2), shelter("large", 1, 6)])
    assert remaining == {"small": -1, "large": -3}


def test_capacity_budget_above_physical_total_does_not_hide_overflow():
    near, far = shelter("near", 0, 100), shelter("far", 1, 3)
    near["capacity"]["total_people"] = 1
    assert choices([family("f", 3, 0)], [near, far])[0] == {"f": "far"}


def test_full_shelter_not_preferred_to_open_space():
    full, open_site = shelter("full", 0, 10), shelter("open", 1, 1)
    full["status"] = "full"
    assert choices([family("f", 1, 0)], [full, open_site])[0] == {"f": "open"}


def test_closed_and_absent_shelters_are_excluded():
    closed = shelter("closed", 0, 10)
    closed["status"] = "closed"
    families = [family("f", 1, 0)]
    assert choices(families, [closed]) == ({"f": None}, {"closed": 10})
    assert choices(families, []) == ({"f": None}, {})
    assert choices([], [closed]) == ({}, {"closed": 10})


def test_zero_search_budget_keeps_every_household_and_supported_needs():
    families = [family(str(i), 3, 0) for i in range(70)]
    for person in families:
        person["needs"]["pets"] = True
    general, pets = shelter("general", 0, 1000), shelter("pets", 1, 0)
    pets["capabilities"]["pets_allowed"] = True
    assigned, remaining = choices(families, [general, pets], max_solve_seconds=0)
    assert set(assigned.values()) == {"pets"}
    assert remaining == {"general": 1000, "pets": -210}


def test_unknown_solver_status_keeps_complete_seed(monkeypatch):
    from ortools.sat.python import cp_model

    monkeypatch.setattr(cp_model.CpSolver, "solve", lambda *_: cp_model.UNKNOWN)
    families = [family("f", 2, 0)]
    assert choices(families, [shelter("only", 1, 1)]) == ({"f": "only"}, {"only": -1})


def test_input_order_does_not_change_allocations():
    families = [family("driver", 1, 0), family("walker", 1, 0)]
    families[1]["resources"]["has_car"] = False
    shelters = [shelter("near", 0, 1), shelter("far", 1, 1)]
    assert choices(families, shelters) == choices(families[::-1], shelters[::-1])


def test_solver_matches_exhaustive_optimum_on_small_mixed_pools():
    """Enumeration checks the ordered policy, not a particular layout."""
    from itertools import product
    from random import Random

    from haven.allocation_policy import compatibility_mismatches, distance

    rng = Random(42)
    for _ in range(20):
        families = [family(str(i), rng.randint(1, 4), rng.random() / 10) for i in range(4)]
        shelters = [shelter(str(j), rng.random() / 10, rng.randint(0, 5)) for j in range(3)]
        for person in families:
            person["needs"] = {
                "pets": rng.choice([True, False]),
                "medical_notes": rng.choice(["care", None]),
            }
            person["resources"]["has_car"] = rng.choice([True, False])
        for site in shelters:
            site["capacity"]["total_people"] = rng.randint(0, 6)
            site["status"] = rng.choice(["open", "open", "full"])
            site["capabilities"] = {
                "pets_allowed": rng.choice([True, False]),
                "medical_staff": rng.choice([[], ["nurse"]]),
            }
            site["resources"] = {
                "food": rng.choice(["available", "limited", "unavailable"]),
                "water": "available",
                "clothes": "available",
            }
        previous = {person["id"]: rng.choice(shelters)["id"] for person in families}

        def policy_score(selection):
            clinical, other, supply, no_car_trip, all_trip, moves = 0, 0, 0, 0, 0, 0
            loads = {site["id"]: 0 for site in shelters}
            for person, site in zip(families, selection, strict=True):
                unmet = compatibility_mismatches(person, site)
                clinical += unmet.count("medical_staff")
                other += unmet.count("pets")
                loads[site["id"]] += person["adults"]
                supply += (
                    person["adults"]
                    * {"available": 0, "limited": 1, "unavailable": 3}[site["resources"]["food"]]
                )
                trip = round(distance(person, site) * 1000)
                all_trip += trip
                if not person["resources"]["has_car"]:
                    no_car_trip += trip
                moves += previous[person["id"]] != site["id"]
            physical, budget, peak = 0, 0, 0
            for site in shelters:
                total = site["capacity"]["total_people"]
                over = max(0, loads[site["id"]] - total)
                physical += over
                budget += max(
                    0,
                    loads[site["id"]]
                    - (site["allocation_budget"] if site["status"] == "open" else 0),
                )
                peak = max(peak, (over * 1000 + max(1, total) - 1) // max(1, total))
            return clinical, other, physical, budget, peak, supply, no_car_trip, all_trip, moves

        assigned, remaining = allocate_disaster(families, shelters, previous)
        actual = policy_score([assigned[person["id"]] for person in families])
        optimum = min(policy_score(selection) for selection in product(shelters, repeat=4))
        assert actual == optimum
        assert sum(remaining.values()) == (
            sum(site["allocation_budget"] for site in shelters)
            - sum(person["adults"] for person in families)
        )
