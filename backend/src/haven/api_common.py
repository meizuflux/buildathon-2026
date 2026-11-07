"""Authorization and errors shared by the API routers."""

from typing import NoReturn

import apsw
from litestar.exceptions import HTTPException

from haven.auth import AuthenticatedUser


def error(status: int, code: str, message: str) -> NoReturn:
    raise HTTPException(status_code=status, detail=message, extra={"code": code})


async def require_disaster(connection: apsw.AsyncConnection, disaster_id: str) -> None:
    row = await (await connection.execute("SELECT 1 FROM disasters WHERE id = ?", (disaster_id,))).fetchone()
    if row is None:
        error(404, "disaster_not_found", "Disaster not found.")


async def require_family(connection: apsw.AsyncConnection, family_id: str, user: AuthenticatedUser) -> dict:
    from haven.routers.families import family_from_row

    row = await (await connection.execute("SELECT * FROM families WHERE id = ?", (family_id,))).fetchone()
    if row is None:
        error(404, "family_not_found", "Family not found.")
    if user.role != "operator" and row[1] != user.id:
        error(403, "forbidden", "This family belongs to another account.")
    return family_from_row(row)
