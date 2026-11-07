"""Custom donations and requests reviewed by government workers."""

import pytest
from conftest import CENTER, headers_for


@pytest.fixture
def client(hub_client):
    return hub_client


@pytest.fixture
def h(client):
    return {
        name: headers_for(client, email)
        for name, email in [
            ("op", "op@example.com"),
            ("family", "family@example.com"),
            ("family2", "family2@example.com"),
        ]
    }


def submit(client, headers, kind="request", description="Wheelchair", **extra):
    body = {
        "kind": kind,
        "description": description,
        "latitude": CENTER[0],
        "longitude": CENTER[1],
    } | extra
    return client.post("/api/custom-submissions", json=body, headers=headers)


def test_custom_request_approved_with_hub_and_completed(client, h):
    created = submit(client, h["family"], quantity=1, notes="Grandmother can't walk far.")
    assert created.status_code == 201
    item = created.json()
    assert (item["status"], item["kind"], item["hub"]) == ("pending", "request", None)
    assert submit(client, h["op"]).status_code == 403

    queue = client.get(
        "/api/custom-submissions", params={"status": "pending"}, headers=h["op"]
    ).json()
    assert [q["id"] for q in queue] == [item["id"]]
    assert queue[0]["citizen_email"] == "family@example.com"
    assert queue[0]["nearby_hubs"][0]["id"] == "hub_near"
    assert client.get("/api/custom-submissions", headers=h["family"]).status_code == 403

    approved = client.post(
        f"/api/custom-submissions/{item['id']}/approve",
        json={"hub_id": "hub_mid", "message": "Pick it up at the side door after 3pm."},
        headers=h["op"],
    )
    assert approved.status_code == 200
    body = approved.json()
    assert (body["status"], body["hub"]["name"]) == ("approved", "Mid Fire Station")
    assert body["response"] == "Pick it up at the side door after 3pm."
    assert body["reviewed_by_email"] == "op@example.com"
    again = client.post(
        f"/api/custom-submissions/{item['id']}/decline", json={"message": "x"}, headers=h["op"]
    )
    assert again.status_code == 409

    done = client.post(f"/api/custom-submissions/{item['id']}/complete", headers=h["op"])
    assert done.json()["status"] == "completed"
    mine = client.get("/api/custom-submissions/mine", headers=h["family"]).json()
    assert [(m["status"], m["hub"]["id"]) for m in mine] == [("completed", "hub_mid")]


def test_one_pending_custom_per_citizen(client, h):
    first = submit(client, h["family"], kind="donation", description="Crib").json()
    second = submit(client, h["family"], description="Phone chargers")
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "custom_pending"
    assert submit(client, h["family2"]).status_code == 201  # other citizens unaffected

    declined = client.post(
        f"/api/custom-submissions/{first['id']}/decline",
        json={"message": "We can't store furniture right now."},
        headers=h["op"],
    ).json()
    assert (declined["status"], declined["response"]) == (
        "declined",
        "We can't store furniture right now.",
    )
    assert submit(client, h["family"], description="Phone chargers").status_code == 201


def test_custom_cancel_and_validation(client, h):
    item = submit(client, h["family"]).json()
    other = client.post(f"/api/custom-submissions/{item['id']}/cancel", headers=h["family2"])
    assert other.status_code == 404
    cancelled = client.post(f"/api/custom-submissions/{item['id']}/cancel", headers=h["family"])
    assert cancelled.json()["status"] == "cancelled"
    approve = client.post(
        f"/api/custom-submissions/{item['id']}/approve",
        json={"hub_id": "hub_mid", "message": "ok"},
        headers=h["op"],
    )
    assert approve.status_code == 409
    assert submit(client, h["family"], description="").status_code == 400
    assert submit(client, h["family"], kind="swap").status_code == 400
    fresh = submit(client, h["family"]).json()
    no_hub = client.post(
        f"/api/custom-submissions/{fresh['id']}/approve",
        json={"hub_id": "missing", "message": "ok"},
        headers=h["op"],
    )
    assert no_hub.status_code == 404
    complete_pending = client.post(
        f"/api/custom-submissions/{fresh['id']}/complete", headers=h["op"]
    )
    assert complete_pending.status_code == 409
