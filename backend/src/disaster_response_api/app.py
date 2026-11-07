"""Litestar application entry point."""

from contextlib import closing

from litestar import Litestar, get

from disaster_response_api.db import connect, initialize_database


@get("/health", sync_to_thread=True)
def health() -> dict[str, str]:
    """Report whether the API can reach its database."""
    with closing(connect()) as connection:
        connection.execute("SELECT 1").fetchone()
    return {"status": "ok"}


app = Litestar(route_handlers=[health], on_startup=[initialize_database])
