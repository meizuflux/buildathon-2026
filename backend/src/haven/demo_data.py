"""Create demo accounts for functionality currently available in the API."""

import asyncio
import secrets
from uuid import uuid4

from haven.auth import hash_password, now, timestamp
from haven.db import connect, initialize_database

DEMO_ACCOUNTS = (
    ("family@demo.example", "family"),
    ("government@demo.example", "operator"),
)


async def seed_demo_data() -> dict[str, str | None]:
    """Create missing accounts and return generated passwords only for new accounts."""
    await initialize_database()
    created = {}
    pending = []
    async with connect() as connection:
        for email, role in DEMO_ACCOUNTS:
            if await (await connection.execute("SELECT 1 FROM users WHERE email = ?", (email,))).fetchone():
                created[email] = None
                continue
            password = secrets.token_urlsafe(18)
            password_hash = await asyncio.to_thread(hash_password, password)
            pending.append((email, role, password, password_hash))
        async with connection:
            for email, role, password, password_hash in pending:
                await connection.execute(
                    "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?) "
                    "ON CONFLICT(email) DO NOTHING",
                    ("user_" + uuid4().hex, email, password_hash, role, timestamp(now())),
                )
                created[email] = password if await connection.changes() else None
    return created


async def main() -> None:
    for email, password in (await seed_demo_data()).items():
        if password is None:
            print(f"{email}: already exists; left unchanged")
        else:
            print(f"{email}: created; password: {password}")
    print("Passwords are shown only when accounts are created.")


if __name__ == "__main__":
    asyncio.run(main())
