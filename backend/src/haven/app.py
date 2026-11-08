"""Litestar application entry point."""

import os

from litestar import Litestar, Request, Router, get
from litestar.config.cors import CORSConfig
from litestar.exceptions import HTTPException
from litestar.middleware import DefineMiddleware
from litestar.openapi import OpenAPIConfig
from litestar.openapi.plugins import SwaggerRenderPlugin
from litestar.openapi.spec import Components, SecurityScheme
from litestar.response import Response

from haven.auth import DatabaseTokenAuthMiddleware
from haven.db import connect
from haven.openapi import errors
from haven.routers.accounts import router as accounts_router
from haven.routers.activity import router as activity_router
from haven.routers.alerts import router as alerts_router
from haven.routers.coordination import router as coordination_router
from haven.routers.families import router as families_router
from haven.routers.hurricane import router as hurricane_router
from haven.routers.relief import router as relief_router
from haven.startup import initialize_database


@get("/health", responses=errors(500))
async def health() -> dict[str, str]:
    """Report whether the API can reach its database."""
    async with connect() as connection:
        await (await connection.execute("SELECT 1")).fetchone()
    return {"status": "ok"}


def http_error(request: Request, exc: HTTPException) -> Response:
    code = exc.extra.get("code") if isinstance(exc.extra, dict) else None
    defaults = {
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
    }
    return Response(
        {
            "error": {
                "code": code or defaults.get(exc.status_code, "invalid_request"),
                "message": exc.detail,
            }
        },
        status_code=exc.status_code,
    )


def server_error(request: Request, exc: Exception) -> Response:
    return Response(
        {"error": {"code": "server_error", "message": "Internal server error."}}, status_code=500
    )


app = Litestar(
    route_handlers=[
        health,
        Router(
            path="/api",
            route_handlers=[
                accounts_router,
                families_router,
                relief_router,
                coordination_router,
                alerts_router,
                activity_router,
                hurricane_router,
            ],
        ),
    ],
    on_startup=[initialize_database],
    # Web dashboard and Expo dev servers run on other origins; restrict with CORS_ORIGINS.
    cors_config=CORSConfig(allow_origins=os.environ.get("CORS_ORIGINS", "*").split(",")),
    middleware=[DefineMiddleware(DatabaseTokenAuthMiddleware)],
    exception_handlers={HTTPException: http_error, Exception: server_error},
    openapi_config=OpenAPIConfig(
        title="Haven API",
        version="0.1.0",
        components=Components(
            security_schemes={
                "BearerAuth": SecurityScheme(
                    type="http",
                    scheme="bearer",
                    description="Opaque session token returned by login.",
                )
            }
        ),
        render_plugins=[SwaggerRenderPlugin()],
    ),
)
