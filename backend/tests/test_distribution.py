"""Hub staff access, citizen supply requests, and drop-off pledges."""

import pytest

from conftest import CENTER, headers_for


@pytest.fixture
def client(hub_client):
    return hub_client


@pytest.fixture
def h(client):
    """Auth headers for each role."""
    return {
        name: headers_for(client, email)
        for name, email in [("op", "op@example.com"), ("op2", "op2@example.com"), ("family", "family@example.com"),
                            ("family2", "family2@example.com"), ("staff", "staff@example.com")]
    }


def hub(client, hub_id):
    return client.get(f"/api/hubs/{hub_id}").json()


def supply(hub_body, category):
    return next(s for s in hub_body["supplies"] if s["category"] == category)


def stock_hub(client, headers, hub_id, capacity=50, **supplies):
    body = {"capacity_pct": capacity, "supplies": [
        {"category": c, "quantity": q, "target": t} for c, (q, t) in supplies.items()
    ]}
    response = client.put(f"/api/hubs/{hub_id}/inventory", json=body, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def new_request(client, headers, **items):
    body = {"items": [{"category": c, "quantity": q} for c, q in items.items()],
            "latitude": CENTER[0], "longitude": CENTER[1], "address": "12 Elm St"}
    return client.post("/api/requests", json=body, headers=headers)


# Hub staff -------------------------------------------------------------------

def test_staff_login_reports_hub_and_manages_only_their_hub(client, h):
    assert client.get("/api/me", headers=h["staff"]).json()["hub_id"] == "hub_near"
    stock_hub(client, h["staff"], "hub_near", capacity=60, water=(5, 10))
    denied = client.put("/api/hubs/hub_mid/inventory", json={"capacity_pct": 1}, headers=h["staff"])
    assert denied.status_code == 403
    assert client.post("/api/hubs/hub_near/pickups", headers=h["staff"]).status_code == 403
    assert client.get("/api/hubs/hub_near/pledges", headers=h["staff"]).status_code == 200
    assert client.get("/api/hubs/hub_mid/pledges", headers=h["staff"]).status_code == 403


def test_get_hub_by_id(client):
    assert hub(client, "hub_mid")["name"] == "Mid Fire Station"
    assert client.get("/api/hubs/missing").status_code == 404


def test_nearby_filters_by_need_and_availability(client, h):
    stock_hub(client, h["op"], "hub_mid", water=(100, 10), diapers=(0, 50))
    params = {"lat": CENTER[0], "lng": CENTER[1]}
    assert [x["id"] for x in client.get("/api/hubs/nearby", params=params | {"has": "water"}).json()] == ["hub_near", "hub_mid"]
    assert [x["id"] for x in client.get("/api/hubs/nearby", params=params | {"needs": "diapers"}).json()] == ["hub_mid"]
    assert [x["id"] for x in client.get("/api/hubs/nearby", params=params | {"needs": "water"}).json()] == ["hub_near"]
    assert client.get("/api/hubs/nearby", params=params | {"has": "gold"}).status_code == 400


# Supply requests -------------------------------------------------------------

def test_request_lifecycle_claim_fulfill_deducts_stock(client, h):
    stock_hub(client, h["op"], "hub_mid", formula=(10, 10), water=(3, 0))
    created = new_request(client, h["family"], formula=4, water=2)
    assert created.status_code == 201
    request_id = created.json()["id"]
    assert created.json()["status"] == "open"
    assert new_request(client, h["op"], water=1).status_code == 403

    queue = client.get("/api/requests", params={"status": "open"}, headers=h["op"]).json()
    assert [r["id"] for r in queue] == [request_id]
    assert [s["id"] for s in queue[0]["suggested_hubs"]] == ["hub_mid"]  # only hub with enough formula
    assert client.get("/api/requests", headers=h["family"]).status_code == 403

    claim = client.post(f"/api/requests/{request_id}/claim", json={"hub_id": "hub_mid", "method": "delivery"},
                        headers=h["op"])
    assert claim.status_code == 200
    assert claim.json()["status"] == "assigned"
    assert claim.json()["hub"]["name"] == "Mid Fire Station"
    assert claim.json()["assigned_to_email"] == "op@example.com"
    assert supply(hub(client, "hub_mid"), "formula")["reserved"] == 4
    assert supply(hub(client, "hub_mid"), "formula")["available"] == 6

    again = client.post(f"/api/requests/{request_id}/claim", json={"hub_id": "hub_mid", "method": "pickup"},
                        headers=h["op2"])
    assert again.status_code == 409
    assert client.post(f"/api/requests/{request_id}/fulfill", headers=h["op2"]).status_code == 403
    mine = client.get("/api/requests", params={"assigned_to_me": True}, headers=h["op"]).json()
    assert [r["id"] for r in mine] == [request_id]

    done = client.post(f"/api/requests/{request_id}/fulfill", headers=h["op"])
    assert done.status_code == 200
    assert done.json()["status"] == "fulfilled"
    after = hub(client, "hub_mid")
    assert (supply(after, "formula")["quantity"], supply(after, "formula")["reserved"]) == (6, 0)
    assert supply(after, "water")["quantity"] == 1
    assert client.get("/api/requests/mine", headers=h["family"]).json()[0]["status"] == "fulfilled"
    assert client.get("/api/requests/mine", headers=h["family2"]).json() == []


def test_claim_respects_reservations_and_release(client, h):
    stock_hub(client, h["op"], "hub_mid", blankets=(5, 0))
    first = new_request(client, h["family"], blankets=4).json()["id"]
    second = new_request(client, h["family2"], blankets=4).json()["id"]
    claim = {"hub_id": "hub_mid", "method": "pickup"}
    assert client.post(f"/api/requests/{first}/claim", json=claim, headers=h["op"]).status_code == 200
    short = client.post(f"/api/requests/{second}/claim", json=claim, headers=h["op"])
    assert short.status_code == 409
    assert short.json()["error"]["code"] == "insufficient_stock"
    assert client.get("/api/requests", params={"status": "open"}, headers=h["op"]).json()[0]["suggested_hubs"] == []

    assert client.post(f"/api/requests/{first}/release", headers=h["op2"]).status_code == 403
    released = client.post(f"/api/requests/{first}/release", headers=h["op"])
    assert released.json()["status"] == "open"
    assert released.json()["hub"] is None
    assert client.post(f"/api/requests/{second}/claim", json=claim, headers=h["op"]).status_code == 200


def test_citizen_cancels_own_request(client, h):
    request_id = new_request(client, h["family"], water=1).json()["id"]
    assert client.post(f"/api/requests/{request_id}/cancel", headers=h["family2"]).status_code == 404
    assert client.post(f"/api/requests/{request_id}/cancel", headers=h["family"]).json()["status"] == "cancelled"
    assert client.post(f"/api/requests/{request_id}/cancel", headers=h["family"]).status_code == 409
    claim = {"hub_id": "hub_near", "method": "pickup"}
    assert client.post(f"/api/requests/{request_id}/claim", json=claim, headers=h["op"]).status_code == 409


def test_request_validation(client, h):
    assert new_request(client, h["family"]).status_code == 400  # no items
    assert new_request(client, h["family"], water=0).status_code == 400
    body = {"items": [{"category": "water", "quantity": 1}] * 2, "latitude": 0, "longitude": 0}
    assert client.post("/api/requests", json=body, headers=h["family"]).status_code == 400


# Pledges ---------------------------------------------------------------------

def test_pledge_received_adds_stock_and_reduces_need(client, h):
    stock_hub(client, h["op"], "hub_mid", diapers=(10, 50))
    pledge = client.post("/api/hubs/hub_mid/pledges", json={"items": [
        {"category": "diapers", "quantity": 15}, {"category": "formula", "quantity": 3},
    ]}, headers=h["family"])
    assert pledge.status_code == 201
    pledge_id = pledge.json()["id"]
    pending = supply(hub(client, "hub_mid"), "diapers")
    assert (pending["pledged"], pending["need"]) == (15, 25)

    assert client.post(f"/api/pledges/{pledge_id}/receive", headers=h["staff"]).status_code == 403  # other hub
    listed = client.get("/api/hubs/hub_mid/pledges", headers=h["op"]).json()
    assert [(p["id"], p["donor_email"]) for p in listed] == [(pledge_id, "family@example.com")]

    received = client.post(f"/api/pledges/{pledge_id}/receive", headers=h["op"])
    assert received.json()["status"] == "received"
    after = hub(client, "hub_mid")
    assert (supply(after, "diapers")["quantity"], supply(after, "diapers")["pledged"]) == (25, 0)
    assert supply(after, "formula")["quantity"] == 3
    assert client.post(f"/api/pledges/{pledge_id}/receive", headers=h["op"]).status_code == 409
    assert client.get("/api/hubs/hub_mid/pledges", headers=h["op"]).json() == []


def test_full_hub_rejects_pledges_and_staff_no_show(client, h):
    full = client.post("/api/hubs/hub_near/pledges", json={"items": [{"category": "water", "quantity": 1}]},
                       headers=h["family"])
    assert full.status_code == 409
    assert full.json()["error"]["code"] == "hub_full"

    stock_hub(client, h["staff"], "hub_near", capacity=50)
    pledge_id = client.post("/api/hubs/hub_near/pledges", json={"items": [{"category": "water", "quantity": 2}]},
                            headers=h["family"]).json()["id"]
    assert client.post(f"/api/pledges/{pledge_id}/no-show", headers=h["staff"]).json()["status"] == "no_show"
    assert supply(hub(client, "hub_near"), "water")["quantity"] == 10


def test_citizen_cancels_pledge(client, h):
    pledge_id = client.post("/api/hubs/hub_mid/pledges", json={"items": [{"category": "water", "quantity": 2}]},
                            headers=h["family"]).json()["id"]
    assert client.post(f"/api/pledges/{pledge_id}/cancel", headers=h["family2"]).status_code == 404
    assert client.post(f"/api/pledges/{pledge_id}/cancel", headers=h["family"]).json()["status"] == "cancelled"
    assert [p["status"] for p in client.get("/api/pledges/mine", headers=h["family"]).json()] == ["cancelled"]


# Demand-adjusted request cap -------------------------------------------------

def test_cap_loosens_when_supply_is_plentiful(client, h):
    stock_hub(client, h["op"], "hub_mid", water=(100, 0))
    for _ in range(4):
        assert new_request(client, h["family"], water=1).status_code == 201
    limit = new_request(client, h["family"], water=1)
    assert limit.status_code == 409
    assert limit.json()["error"]["code"] == "request_limit"
    body = client.get("/api/requests/limits", headers=h["family"]).json()
    assert body["active"] == 4
    assert body["categories"]["water"]["level"] == "low"


def test_cap_tightens_for_scarce_items_only(client, h):
    stock_hub(client, h["op"], "hub_mid", formula=(4, 0), water=(100, 0))
    assert new_request(client, h["family2"], formula=4).status_code == 201  # formula demand now equals supply
    assert new_request(client, h["family"], formula=1).status_code == 201
    blocked = new_request(client, h["family"], formula=1)
    assert blocked.status_code == 409
    assert "formula" in blocked.json()["error"]["message"]
    assert new_request(client, h["family"], water=2).status_code == 201  # water is still plentiful
    limits = client.get("/api/requests/limits", headers=h["family"]).json()
    assert limits["categories"]["formula"] == {"cap": 1, "level": "critical", "pressure": 1.25}
    assert limits["categories"]["blankets"]["pressure"] is None  # no stock anywhere


def test_cancelled_and_fulfilled_requests_free_a_slot(client, h):
    stock_hub(client, h["op"], "hub_mid", formula=(2, 0))
    first = new_request(client, h["family"], formula=2).json()["id"]  # pressure now 1.0 -> cap 1
    assert new_request(client, h["family"], formula=1).status_code == 409
    client.post(f"/api/requests/{first}/cancel", headers=h["family"])
    assert new_request(client, h["family"], formula=1).status_code == 201
