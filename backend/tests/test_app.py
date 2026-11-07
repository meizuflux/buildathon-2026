import sqlite3

from litestar.testing import TestClient

from disaster_response_api.app import app


def test_startup_creates_schema_and_health_endpoint(tmp_path, monkeypatch):
    database = tmp_path / "test.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(database))
    with TestClient(app=app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
    with sqlite3.connect(database) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"users", "sessions", "disasters", "families", "shelters", "plans", "disaster_updates", "reports"} <= tables
