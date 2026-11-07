"""Hub staff access, citizen supply requests, and drop-off pledges."""

import sqlite3
from contextlib import closing

import pytest
from conftest import CENTER, headers_for

from haven.db import database_path


@pytest.fixture
def client(hub_client):
    return hub_client


@pytest.fixture
def h(client):
    """Auth headers for each role."""
    return {
        name: headers_for(client, email)
        for name, email in [
            ("op", "op@example.com"),
            ("op2", "op2@example.com"),
            ("family", "family@example.com"),
            ("family2", "family2@example.com"),
            ("staff", "staff@example.com"),
        ]
    }


def hub(client, hub_id):
    return client.get(f"/api/hubs/{hub_id}").json()


def supply(hub_body, category):
    return next(s for s in hub_body["supplies"] if s["resource_type_id"] == category)


def stock_hub(client, headers, hub_id, capacity=50, **supplies):
    """Test setup: set on-hand quantities (and a manual % full) directly in the database.

    Values may be a quantity or a (quantity, ignored) tuple. Hub targets come from demand.
    """
    with closing(sqlite3.connect(database_path())) as connection, connection:
        for resource_type_id, value in supplies.items():
            quantity = value[0] if isinstance(value, tuple) else value
            connection.execute(
                "INSERT INTO inventory (organization_id, resource_type_id, quantity, updated_at) "
                "VALUES (?, ?, ?, '2026-01-01T00:00:00Z') "
                "ON CONFLICT(organization_id, resource_type_id) DO UPDATE SET "
                "quantity = excluded.quantity",
                (hub_id, resource_type_id, quantity),
            )
        connection.execute(
            "UPDATE organizations SET capacity_pct = ? WHERE id = ?", (capacity, hub_id)
        )
    return hub(client, hub_id)


def walk_in(client, headers, hub_id, **items):
    body = {"items": [{"resource_type_id": k, "quantity": v} for k, v in items.items()]}
    return client.post(f"/api/hubs/{hub_id}/walk-ins", json=body, headers=headers)


def new_request(client, headers, **items):
    body = {
        "items": [{"resource_type_id": c, "quantity": q} for c, q in items.items()],
        "latitude": CENTER[0],
        "longitude": CENTER[1],
        "address": "12 Elm St",
    }
    return client.post("/api/requests", json=body, headers=headers)


# Hub staff -------------------------------------------------------------------


def test_staff_login_reports_hub_and_manages_only_their_hub(client, h):
    assert client.get("/api/me", headers=h["staff"]).json()["hub_id"] == "hub_near"
    logged = walk_in(client, h["staff"], "hub_near", blankets=5)
    assert logged.status_code == 200
    assert supply(logged.json(), "blankets")["quantity"] == 5
    assert walk_in(client, h["staff"], "hub_mid", blankets=1).status_code == 403
    assert walk_in(client, h["family"], "hub_near", blankets=1).status_code == 403
    assert client.post("/api/hubs/hub_near/pickups", headers=h["staff"]).status_code == 403
    assert client.get("/api/hubs/hub_near/pledges", headers=h["staff"]).status_code == 200
    assert client.get("/api/hubs/hub_mid/pledges", headers=h["staff"]).status_code == 403


def test_get_hub_by_id(client):
    assert hub(client, "hub_mid")["name"] == "Mid Fire Station"
    assert client.get("/api/hubs/missing").status_code == 404


def test_nearby_filters_by_need_and_availability(client, h):
    stock_hub(client, h["op"], "hub_mid", water_bottled=100)
    params = {"lat": CENTER[0], "lng": CENTER[1]}

    def ids(**filters):
        return [x["id"] for x in client.get("/api/hubs/nearby", params=params | filters).json()]

    assert ids(has="water_bottled") == ["hub_near", "hub_mid"]
    # Baseline targets: every hub wants 10 diapers and 20 bottled water before any demand.
    assert ids(needs="diapers") == ["hub_near", "hub_mid"]
    assert ids(needs="water_bottled") == ["hub_near"]  # 10 < 20; hub_mid has 100
    assert ids(has="gold") == []


# Supply requests -------------------------------------------------------------


def test_request_is_matched_at_once_and_reserves_stock(client, h):
    stock_hub(client, h["op"], "hub_mid", baby_formula=(10, 10), water_bottled=(3, 0))
    created = new_request(client, h["family"], baby_formula=4, water_bottled=2)
    assert created.status_code == 201
    body = created.json()
    assert body["status"] == "matched"
    assert body["hub"]["name"] == "Mid Fire Station"  # the only hub with enough formula
    assert body["match"]["reasons"][0].endswith("km away")
    formula = supply(hub(client, "hub_mid"), "baby_formula")
    assert (formula["quantity"], formula["reserved"], formula["available"]) == (10, 4, 6)
    assert new_request(client, h["op"], water_bottled=1).status_code == 403


def test_worker_claims_matched_request_and_fulfils_it(client, h):
    stock_hub(client, h["op"], "hub_mid", baby_formula=(10, 10))
    request_id = new_request(client, h["family"], baby_formula=4).json()["id"]
    queue = client.get("/api/requests", params={"status": "matched"}, headers=h["op"]).json()
    assert [r["id"] for r in queue] == [request_id]
    assert client.get("/api/requests", headers=h["family"]).status_code == 403

    claim = client.post(
        f"/api/requests/{request_id}/claim", json={"method": "delivery"}, headers=h["op"]
    )
    assert claim.status_code == 200
    assert (claim.json()["status"], claim.json()["method"]) == ("assigned", "delivery")
    assert claim.json()["assigned_to_email"] == "op@example.com"
    again = client.post(
        f"/api/requests/{request_id}/claim", json={"method": "pickup"}, headers=h["op2"]
    )
    assert again.status_code == 409
    assert client.post(f"/api/requests/{request_id}/fulfill", headers=h["op2"]).status_code == 403
    mine = client.get("/api/requests", params={"assigned_to_me": True}, headers=h["op"]).json()
    assert [r["id"] for r in mine] == [request_id]

    released = client.post(f"/api/requests/{request_id}/release", headers=h["op"]).json()
    assert (released["status"], released["hub"]["id"]) == ("matched", "hub_mid")
    assert supply(hub(client, "hub_mid"), "baby_formula")["reserved"] == 4
    client.post(f"/api/requests/{request_id}/claim", json={"method": "pickup"}, headers=h["op"])

    done = client.post(f"/api/requests/{request_id}/fulfill", headers=h["op"])
    assert done.json()["status"] == "fulfilled"
    formula = supply(hub(client, "hub_mid"), "baby_formula")
    assert (formula["quantity"], formula["reserved"]) == (6, 0)
    assert client.get("/api/requests/mine", headers=h["family"]).json()[0]["status"] == "fulfilled"
    assert client.get("/api/requests/mine", headers=h["family2"]).json() == []


def test_request_waits_then_matches_when_stock_arrives(client, h):
    waiting = new_request(client, h["family"], blankets=4).json()
    assert (waiting["status"], waiting["hub"]) == ("open", None)
    claim = client.post(
        f"/api/requests/{waiting['id']}/claim", json={"method": "pickup"}, headers=h["op"]
    )
    assert claim.json()["error"]["code"] == "request_not_matched"
    # Hub staff log a walk-in donation of blankets: the waiting request is matched at once.
    walk_in(client, h["staff"], "hub_near", blankets=5)
    mine = client.get("/api/requests/mine", headers=h["family"]).json()[0]
    assert (mine["status"], mine["hub"]["id"]) == ("matched", "hub_near")
    assert supply(hub(client, "hub_near"), "blankets")["reserved"] == 4


def test_scarce_stock_goes_to_the_earliest_request(client, h):
    stock_hub(client, h["op"], "hub_mid", blankets=(5, 0))
    first = new_request(client, h["family"], blankets=4).json()
    second = new_request(client, h["family2"], blankets=4).json()
    assert (first["status"], second["status"]) == ("matched", "open")
    # Cancelling the first returns its blankets, so the second is matched.
    client.post(f"/api/requests/{first['id']}/cancel", headers=h["family"])
    assert client.get("/api/requests/mine", headers=h["family2"]).json()[0]["status"] == "matched"


def test_citizen_cancels_own_request(client, h):
    stock_hub(client, h["op"], "hub_mid", water_bottled=(5, 0))
    request_id = new_request(client, h["family"], water_bottled=1).json()["id"]
    assert (
        client.post(f"/api/requests/{request_id}/cancel", headers=h["family2"]).status_code == 404
    )
    cancelled = client.post(f"/api/requests/{request_id}/cancel", headers=h["family"]).json()
    assert cancelled["status"] == "cancelled"
    assert supply(hub(client, "hub_mid"), "water_bottled")["reserved"] == 0
    assert client.post(f"/api/requests/{request_id}/cancel", headers=h["family"]).status_code == 409


def test_request_validation(client, h):
    assert new_request(client, h["family"]).status_code == 400  # no items
    assert new_request(client, h["family"], water_bottled=0).status_code == 400
    body = {
        "items": [{"resource_type_id": "water_bottled", "quantity": 1}] * 2,
        "latitude": 0,
        "longitude": 0,
    }
    assert client.post("/api/requests", json=body, headers=h["family"]).status_code == 400


# Pledges ---------------------------------------------------------------------


def test_pledge_received_adds_stock_and_reduces_need(client, h):
    # hub_mid holds no diapers, so it needs its baseline of 10.
    assert supply(hub(client, "hub_mid"), "diapers")["need"] == 10
    pledge = client.post(
        "/api/hubs/hub_mid/pledges",
        json={
            "items": [
                {"resource_type_id": "diapers", "quantity": 6},
                {"resource_type_id": "baby_formula", "quantity": 3},
            ]
        },
        headers=h["family"],
    )
    assert pledge.status_code == 201
    pledge_id = pledge.json()["id"]
    pending = supply(hub(client, "hub_mid"), "diapers")
    assert (pending["pledged"], pending["need"]) == (6, 4)

    assert client.post(f"/api/pledges/{pledge_id}/receive", headers=h["staff"]).status_code == 403
    listed = client.get("/api/hubs/hub_mid/pledges", headers=h["op"]).json()
    assert [(p["id"], p["donor_email"]) for p in listed] == [(pledge_id, "family@example.com")]

    received = client.post(f"/api/pledges/{pledge_id}/receive", headers=h["op"])
    assert received.json()["status"] == "received"
    after = hub(client, "hub_mid")
    diapers = supply(after, "diapers")
    assert (diapers["quantity"], diapers["pledged"], diapers["need"]) == (6, 0, 4)
    assert supply(after, "baby_formula")["quantity"] == 3
    assert client.post(f"/api/pledges/{pledge_id}/receive", headers=h["op"]).status_code == 409
    assert client.get("/api/hubs/hub_mid/pledges", headers=h["op"]).json() == []


def test_full_hub_rejects_pledges_and_staff_no_show(client, h):
    full = client.post(
        "/api/hubs/hub_near/pledges",
        json={"items": [{"resource_type_id": "water_bottled", "quantity": 1}]},
        headers=h["family"],
    )
    assert full.status_code == 409
    assert full.json()["error"]["code"] == "hub_full"

    stock_hub(client, h["staff"], "hub_near", capacity=50)
    pledge_id = client.post(
        "/api/hubs/hub_near/pledges",
        json={"items": [{"resource_type_id": "water_bottled", "quantity": 2}]},
        headers=h["family"],
    ).json()["id"]
    assert (
        client.post(f"/api/pledges/{pledge_id}/no-show", headers=h["staff"]).json()["status"]
        == "no_show"
    )
    assert supply(hub(client, "hub_near"), "water_bottled")["quantity"] == 10


def test_citizen_cancels_pledge(client, h):
    pledge_id = client.post(
        "/api/hubs/hub_mid/pledges",
        json={"items": [{"resource_type_id": "water_bottled", "quantity": 2}]},
        headers=h["family"],
    ).json()["id"]
    assert client.post(f"/api/pledges/{pledge_id}/cancel", headers=h["family2"]).status_code == 404
    assert (
        client.post(f"/api/pledges/{pledge_id}/cancel", headers=h["family"]).json()["status"]
        == "cancelled"
    )
    assert [p["status"] for p in client.get("/api/pledges/mine", headers=h["family"]).json()] == [
        "cancelled"
    ]


# Demand-adjusted request cap -------------------------------------------------


def test_cap_loosens_when_supply_is_plentiful(client, h):
    stock_hub(client, h["op"], "hub_mid", water_bottled=(100, 0))
    for _ in range(4):
        assert new_request(client, h["family"], water_bottled=1).status_code == 201
    limit = new_request(client, h["family"], water_bottled=1)
    assert limit.status_code == 409
    assert limit.json()["error"]["code"] == "request_limit"
    body = client.get("/api/requests/limits", headers=h["family"]).json()
    assert body["active"] == 4
    assert body["resource_types"]["water_bottled"]["level"] == "low"


def test_cap_tightens_for_scarce_items_only(client, h):
    stock_hub(client, h["op"], "hub_mid", baby_formula=(4, 0), water_bottled=(100, 0))
    assert new_request(client, h["family2"], baby_formula=4).json()["status"] == "matched"
    # No free formula is left, so formula requests are capped at one per person.
    assert new_request(client, h["family"], baby_formula=1).json()["status"] == "open"
    blocked = new_request(client, h["family"], baby_formula=1)
    assert blocked.status_code == 409
    assert "baby formula" in blocked.json()["error"]["message"]
    assert new_request(client, h["family"], water_bottled=2).status_code == 201  # still plentiful
    limits = client.get("/api/requests/limits", headers=h["family"]).json()
    assert limits["resource_types"]["baby_formula"] == {
        "cap": 1,
        "level": "critical",
        "pressure": None,
    }


def test_cancelled_requests_free_a_slot(client, h):
    stock_hub(client, h["op"], "hub_mid", baby_formula=(2, 0))
    first = new_request(client, h["family"], baby_formula=2).json()["id"]  # uses all formula
    assert new_request(client, h["family"], baby_formula=1).status_code == 409
    client.post(f"/api/requests/{first}/cancel", headers=h["family"])
    assert new_request(client, h["family"], baby_formula=1).status_code == 201


# Donations matched to a drop-off hub -----------------------------------------


def donate(client, headers, lat=None, **items):
    body = {
        "items": [{"resource_type_id": k, "quantity": v} for k, v in items.items()],
        "latitude": CENTER[0] if lat is None else lat,
        "longitude": CENTER[1],
    }
    return client.post("/api/pledges", json=body, headers=headers)


def test_donation_goes_to_the_hub_that_needs_it(client, h):
    # hub_near (closest) is 95% full, so it is never chosen. hub_mid needs diapers.
    stock_hub(client, h["op"], "hub_mid", diapers=(0, 40))
    pledge = donate(client, h["family"], diapers=10)
    assert pledge.status_code == 201
    body = pledge.json()
    assert (body["hub"]["id"], body["status"]) == ("hub_mid", "pending")
    assert "needs everything you're bringing" in body["match"]["reasons"]
    assert supply(hub(client, "hub_mid"), "diapers")["pledged"] == 10


def test_unneeded_donation_goes_to_nearest_hub_with_space(client, h):
    pledge = donate(client, h["family"], cots=2).json()
    assert pledge["hub"]["id"] == "hub_mid"  # nearest hub that isn't full
    assert "has room for it" in pledge["match"]["reasons"]


def test_donation_without_any_hub_in_range(client, h):
    far_away = donate(client, h["family"], lat=-45.0, cots=1)
    assert far_away.status_code == 409
    assert far_away.json()["error"]["code"] == "no_hub_available"
    clinical = donate(client, h["family"], insulin=1)
    assert clinical.json()["error"]["code"] == "not_citizen_requestable"


def test_received_donation_matches_a_waiting_request(client, h):
    waiting = new_request(client, h["family2"], diapers=5).json()
    assert waiting["status"] == "open"
    stock_hub(client, h["op"], "hub_mid", diapers=(0, 40))
    pledge_id = donate(client, h["family"], diapers=10).json()["id"]
    client.post(f"/api/pledges/{pledge_id}/receive", headers=h["op"])
    mine = client.get("/api/requests/mine", headers=h["family2"]).json()[0]
    assert (mine["status"], mine["hub"]["id"]) == ("matched", "hub_mid")


def test_items_no_hub_stocks_keep_the_normal_cap(client, h):
    # Nobody has generators, so asking for one isn't competing with anyone: normal cap of 3.
    assert new_request(client, h["family"], water_bottled=1).json()["status"] == "matched"
    waiting = new_request(client, h["family"], generator=1)
    assert (waiting.status_code, waiting.json()["status"]) == (201, "open")
    limits = client.get("/api/requests/limits", headers=h["family"]).json()
    assert limits["resource_types"]["generator"] == {
        "cap": 3,
        "level": "unavailable",
        "pressure": None,
    }
    assert new_request(client, h["family"], generator=1).status_code == 201
    assert new_request(client, h["family"], generator=1).status_code == 409  # 3 active now


# Automatic stock levels ----------------------------------------------------


def test_targets_follow_demand_near_the_hub(client, h):
    assert supply(hub(client, "hub_near"), "blankets")["target"] == 10  # baseline only
    # A request from near hub_near for 8 blankets nobody has: target = ceil(1.5 * 8) + 10.
    new_request(client, h["family"], blankets=8)
    blankets = supply(hub(client, "hub_near"), "blankets")
    assert (blankets["target"], blankets["need"]) == (22, 22)
    assert supply(hub(client, "hub_mid"), "blankets")["target"] == 10  # demand is local
    assert all(s["resource_type_id"] != "cots" for s in hub(client, "hub_near")["supplies"])


def test_percent_full_follows_stock_when_storage_is_set(client, h):
    client.patch("/api/organizations/hub_mid", json={"storage_units": 200}, headers=h["op"])
    assert hub(client, "hub_mid")["capacity_pct"] == 0
    walk_in(client, h["op"], "hub_mid", water_bottled=60, blankets=40)
    assert hub(client, "hub_mid")["capacity_pct"] == 50
    request_id = new_request(client, h["family"], blankets=40).json()["id"]
    client.post(f"/api/requests/{request_id}/claim", json={"method": "pickup"}, headers=h["op"])
    assert hub(client, "hub_mid")["capacity_pct"] == 50  # reserved items are still on the shelf
    client.post(f"/api/requests/{request_id}/fulfill", headers=h["op"])
    assert hub(client, "hub_mid")["capacity_pct"] == 30


def test_walk_in_validation(client, h):
    assert walk_in(client, h["op"], "hub_mid").status_code == 400  # no items
    assert walk_in(client, h["op"], "hub_mid", gold=1).status_code == 400
    assert walk_in(client, h["op"], "missing", blankets=1).status_code == 404
