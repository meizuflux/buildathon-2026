"""Transactional operational activity entries."""

from uuid import uuid4

import apsw

from haven.auth import AuthenticatedUser, now, timestamp


async def record_activity(
    connection: apsw.AsyncConnection,
    *,
    disaster_id: str,
    event_type: str,
    summary: str,
    ref_kind: str,
    ref_id: str,
    user: AuthenticatedUser,
) -> None:
    """Append an event using the caller's transaction and authenticated identity."""
    row = await (
        await connection.execute(
            "SELECT u.email, f.id FROM users u LEFT JOIN families f ON f.owner_user_id = u.id "
            "WHERE u.id = ?",
            (user.id,),
        )
    ).fetchone()
    actor_id = row[1] if user.role == "family" and row and row[1] else user.id
    actor_name = "Household" if user.role == "family" else (row[0] if row else user.id)
    await connection.execute(
        "INSERT INTO activity (id, disaster_id, type, summary, ref_kind, ref_id, "
        "actor_kind, actor_id, actor_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            "act_" + uuid4().hex,
            disaster_id,
            event_type,
            summary,
            ref_kind,
            ref_id,
            user.role,
            actor_id,
            actor_name,
            timestamp(now()),
        ),
    )
