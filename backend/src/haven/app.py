"""Litestar application entry point."""

from contextlib import closing

from litestar import Litestar, Request, get
from litestar.exceptions import HTTPException
from litestar.openapi import OpenAPIConfig
from litestar.openapi.plugins import SwaggerRenderPlugin
from litestar.response import Response

from haven.auth import login, logout, me, register
from haven.db import connect, initialize_database


@get("/health", sync_to_thread=True)
def health() -> dict[str, str]:
    """Report whether the API can reach its database."""
    with closing(connect()) as connection:
        connection.execute("SELECT 1").fetchone()
    return {"status": "ok"}


def http_error(request: Request, exc: HTTPException) -> Response:
    code = exc.extra.get("code") if isinstance(exc.extra, dict) else None
    return Response({"error": {"code": code or "invalid_request", "message": exc.detail}}, status_code=exc.status_code)


app = Litestar(
    route_handlers=[health, register, login, logout, me],
    on_startup=[initialize_database],
    exception_handlers={HTTPException: http_error},
    openapi_config=OpenAPIConfig(
        title="Haven API",
        version="0.1.0",
        render_plugins=[SwaggerRenderPlugin()],
    ),
)
