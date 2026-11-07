import sqlite3

from litestar.testing import TestClient

from haven.app import app


def test_startup_creates_schema_and_health_endpoint(tmp_path, monkeypatch):
    database = tmp_path / "test.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(database))
    with TestClient(app=app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
    with sqlite3.connect(database) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"users", "sessions", "disasters", "families", "shelters", "plans", "disaster_updates", "reports", "hubs", "hub_supplies", "pickup_requests"} <= tables


def test_openapi_docs_and_schema(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "schema.sqlite3"))
    with TestClient(app=app) as client:
        docs = client.get("/schema")
        assert docs.status_code == 200
        assert "SwaggerUIBundle" in docs.text
        assert "redoc.standalone.js" not in docs.text
        schema = client.get("/schema/openapi.json")
        assert schema.status_code == 200
        assert schema.json()["info"]["title"] == "Haven API"
        assert {"/api/auth/login", "/api/me"} <= schema.json()["paths"].keys()
