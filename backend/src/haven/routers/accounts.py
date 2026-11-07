"""Account and session routes."""

from litestar import Router

from haven.auth import login, logout, me, register

router = Router(
    path="/",
    route_handlers=[Router(path="/auth", route_handlers=[register, login, logout]), me],
    tags=["Accounts"],
)
