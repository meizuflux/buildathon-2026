from haven.donations.planner import HubState, OpenRequest, plan

# About 1.1 km per 0.01 degrees of latitude.
HOME = (29.70, -95.40)


def hub(hub_id, lat_offset, capacity=50, **stock):
    """stock: category=(available, target)."""
    return HubState(
        id=hub_id, name=hub_id, latitude=HOME[0] + lat_offset, longitude=HOME[1], capacity_pct=capacity,
        available={c: a for c, (a, _) in stock.items()}, target={c: t for c, (_, t) in stock.items()},
    )


def req(request_id, **items):
    return OpenRequest(request_id, *HOME, [{"category": c, "quantity": q} for c, q in items.items()])


def ids(options):
    return [o["id"] for o in options]


def test_nearest_hub_wins_when_otherwise_equal():
    result = plan([req("r", water=5)], [hub("far", 0.05, water=(100, 0)), hub("near", 0.01, water=(100, 0))])
    assert ids(result["r"]) == ["near", "far"]
    assert result["r"][0]["reasons"][1] == "gives from surplus"


def test_prefers_surplus_over_a_closer_hub_that_would_go_below_target():
    # "near" has exactly its target; "surplus" is ~3 km farther but has plenty to spare.
    result = plan([req("r", formula=4)], [hub("near", 0.01, formula=(10, 10)), hub("surplus", 0.04, formula=(50, 10))])
    assert ids(result["r"]) == ["surplus", "near"]
    assert "dips below its target" in result["r"][1]["reasons"]


def test_prefers_full_hub_to_free_space():
    result = plan([req("r", water=5)], [hub("near", 0.01, water=(100, 0)), hub("full", 0.04, capacity=95, water=(100, 0))])
    assert ids(result["r"])[0] == "full"
    assert any("frees space" in reason for reason in result["r"][0]["reasons"])


def test_pending_pledges_count_toward_surplus():
    near = hub("near", 0.01, diapers=(20, 20))
    near.pledged = {"diapers": 10}
    result = plan([req("r", diapers=5)], [near, hub("far", 0.05, diapers=(50, 0))])
    assert ids(result["r"])[0] == "near"


def test_infeasible_hubs_excluded_and_unservable_request_empty():
    result = plan([req("ok", water=5), req("none", blankets=1)], [hub("a", 0.01, water=(6, 0))])
    assert ids(result["ok"]) == ["a"]
    assert result["none"] == []


def test_joint_plan_never_double_books_and_uses_regret():
    # "near" has 4 blankets; "far" has 4. Request A can only be served by "near" (it also needs formula there).
    # Nearest-first would hand "near" to whichever came first; regret serves A at "near" and B at "far".
    near = hub("near", 0.01, blankets=(4, 0), formula=(5, 0))
    far = hub("far", 0.06, blankets=(4, 0))
    result = plan([req("B", blankets=4), req("A", blankets=4, formula=1)], [near, far])
    assert ids(result["A"]) == ["near"]
    assert ids(result["B"])[0] == "far"


def test_scarce_stock_goes_to_oldest_when_regret_ties():
    result = plan([req("old", water=5), req("new", water=5)], [hub("only", 0.01, water=(5, 0))])
    assert ids(result["old"]) == ["only"]
    assert result["new"] == []
