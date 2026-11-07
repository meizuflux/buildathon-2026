"""Litestar application entry point."""

import os

from litestar import Litestar, Request, get
from litestar.config.cors import CORSConfig
from litestar.exceptions import HTTPException
from litestar.openapi import OpenAPIConfig
from litestar.openapi.plugins import SwaggerRenderPlugin
from litestar.response import Response

from haven.auth import login, logout, me, register
from haven.db import connect, initialize_database
from haven.donations import HANDLERS as DONATION_HANDLERS


@get("/health")
async def health() -> dict[str, str]:
    """Report whether the API can reach its database."""
    async with connect() as connection:
        await (await connection.execute("SELECT 1")).fetchone()
    return {"status": "ok"}


def http_error(request: Request, exc: HTTPException) -> Response:
    code = exc.extra.get("code") if isinstance(exc.extra, dict) else None
    return Response({"error": {"code": code or "invalid_request", "message": exc.detail}}, status_code=exc.status_code)


app = Litestar(
    route_handlers=[health, register, login, logout, me, *DONATION_HANDLERS],
    on_startup=[initialize_database],
    # Web dashboard and Expo dev servers run on other origins; restrict with CORS_ORIGINS.
    cors_config=CORSConfig(allow_origins=os.environ.get("CORS_ORIGINS", "*").split(",")),
    exception_handlers={HTTPException: http_error},
    openapi_config=OpenAPIConfig(
        title="Haven API",
        version="0.1.0",
        render_plugins=[SwaggerRenderPlugin()],
    ),
)
