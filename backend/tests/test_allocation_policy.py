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


def test_allocator_policy_preserves_reservations_without_mutating_inputs():
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
