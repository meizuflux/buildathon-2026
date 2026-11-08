import asyncio
import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta

import pytest
from litestar.testing import TestClient

from haven.app import app
from haven.db import database_path


def connect():
    connection = sqlite3.connect(database_path())
    connection.row_factory = sqlite3.Row
    return connection


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "auth.sqlite3"))
    with TestClient(app=app) as client:
        yield client


def register(client, **overrides):
    data = {"email": "Family@Example.com", "password": "correct-password"} | overrides
    return client.post("/api/auth/register", json=data)


def login(client, **overrides):
    data = {"email": "family@example.com", "password": "correct-password"} | overrides
    return client.post("/api/auth/login", json=data)


def test_registration_login_and_logout(client):
    response = register(client)
    assert response.status_code == 201
    assert response.json()["role"] == "family"
    user_id = response.json()["user_id"]
    assert register(client).status_code == 409
    result = login(client)
    assert result.status_code == 200
    body = result.json()
    assert body["user"] == {"id": user_id, "role": "family", "family_id": None}
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    assert client.get("/api/me", headers=headers).json() == body["user"]
    with closing(connect()) as connection:
        user = connection.execute("SELECT * FROM users").fetchone()
        session = connection.execute("SELECT * FROM sessions").fetchone()
        assert user["password_hash"].startswith("$argon2id$")
        assert user["password_hash"] != "correct-password"
        assert session["token_hash"] != body["access_token"]
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/me", headers=headers).status_code == 401
    assert client.post("/api/auth/logout", headers=headers).status_code == 401


def test_invalid_and_expired_credentials(client):
    assert register(client, role="operator").status_code == 400
    assert register(client, password="short").status_code == 400
    assert register(client).status_code == 201
    assert login(client, password="wrong-password").status_code == 401
    assert login(client, email="missing@example.com").status_code == 401
    assert client.get("/api/me").status_code == 401
    token = login(client).json()["access_token"]
    with closing(connect()) as connection, connection:
        connection.execute(
            "UPDATE sessions SET expires_at = ?",
            ((datetime.now(UTC) - timedelta(seconds=1)).isoformat(),),
        )
    assert client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_rate_limit_persists_in_database(client):
    assert register(client).status_code == 201
    for _ in range(5):
        assert login(client, password="wrong-password").status_code == 401
    response = login(client)
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"


def test_operator_is_created_only_from_local_command(client, monkeypatch):
    from haven import create_operator

    monkeypatch.setattr("builtins.input", lambda _: "operator@example.com")
    monkeypatch.setattr(create_operator, "getpass", lambda _: "operator-password")
    asyncio.run(create_operator.main())
    response = login(client, email="operator@example.com", password="operator-password")
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "operator"


def test_only_current_session_is_revoked(client):
    register(client)
    first = login(client).json()["access_token"]
    second = login(client).json()["access_token"]
    assert (
        client.post("/api/auth/logout", headers={"Authorization": f"Bearer {first}"}).status_code
        == 204
    )
    assert client.get("/api/me", headers={"Authorization": f"Bearer {second}"}).status_code == 200
