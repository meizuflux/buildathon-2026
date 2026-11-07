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
    assert {"users", "sessions", "disasters", "families", "shelters", "plans", "disaster_updates", "reports"} <= tables


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
        paths = schema.json()["paths"]
        assert {
            "/api/disasters", "/api/families", "/api/families/{family_id}",
            "/api/shelters", "/api/shelters/{shelter_id}",
            "/api/families/{family_id}/plan/generate", "/api/families/{family_id}/plan",
            "/api/disasters/{disaster_id}/updates", "/api/families/{family_id}/reports",
            "/api/disasters/{disaster_id}/reports",
        } <= paths.keys()


def test_errors_share_contract_shape(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "errors.sqlite3"))
    with TestClient(app=app) as client:
        for response, status, code in (
            (client.get("/api/missing"), 404, "not_found"),
            (client.get("/api/families/missing"), 401, "unauthorized"),
            (client.get("/api/shelters"), 400, "invalid_request"),
            (client.post("/api/families", json={}), 400, "invalid_request"),
        ):
            assert response.status_code == status
            assert set(response.json()) == {"error"}
            assert response.json()["error"]["code"] == code
            assert isinstance(response.json()["error"]["message"], str)

        def unavailable():
            raise RuntimeError("private database detail")

        monkeypatch.setattr("haven.app.connect", unavailable)
        response = client.get("/health")
        assert response.status_code == 500
        assert response.json() == {"error": {"code": "server_error", "message": "Internal server error."}}
