"""Shared fixtures: three hubs around CENTER and one account per role."""

import sqlite3
from contextlib import closing

import pytest
from litestar.testing import TestClient

from haven.app import app
from haven.auth import hash_password
from haven.db import database_path

CENTER = (29.7604, -95.3698)
HUBS = [
    ("hub_near", "Near Church", "church", 29.7610, -95.3700, 95),
    ("hub_mid", "Mid Fire Station", "fire_station", 29.8000, -95.4000, 40),
    ("hub_far", "Far School", "school", 30.5000, -96.5000, 10),
]


_HASH = hash_password("correct-password")


def insert_user(email: str, role: str, hub_id: str | None = None) -> None:
    user_id = "user_" + email.split("@")[0]
    with closing(sqlite3.connect(database_path())) as connection, connection:
        connection.execute(
            "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, '2026-01-01T00:00:00Z')",
            (user_id, email, _HASH, role),
        )
        if hub_id:
            connection.execute(
                "INSERT INTO hub_staff (user_id, hub_id) VALUES (?, ?)", (user_id, hub_id)
            )


def headers_for(client, email: str) -> dict:
    token = client.post(
        "/api/auth/login", json={"email": email, "password": "correct-password"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def hub_client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "donations.sqlite3"))
    with TestClient(app=app) as client:
        with closing(sqlite3.connect(database_path())) as connection, connection:
            connection.executemany(
                "INSERT INTO hubs (id, name, type, address, latitude, longitude, capacity_pct, updated_at) "
                "VALUES (?, ?, ?, '1 Main St', ?, ?, ?, '2026-01-01T00:00:00Z')",
                HUBS,
            )
            connection.execute("INSERT INTO hub_supplies VALUES ('hub_near', 'water', 10, 50)")
        insert_user("op@example.com", "operator")
        insert_user("op2@example.com", "operator")
        insert_user("family@example.com", "family")
        insert_user("family2@example.com", "family")
        insert_user("staff@example.com", "hub_staff", "hub_near")
        yield client
