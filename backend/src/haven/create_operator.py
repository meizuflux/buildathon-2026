"""Create an operator locally; never put credentials in command-line arguments."""

import asyncio
from getpass import getpass
from uuid import uuid4

import apsw

from haven.auth import hash_password, normalize_email, require_password, timestamp, now
from haven.db import run_db, initialize_database


async def main() -> None:
    email = normalize_email(await asyncio.to_thread(input, "Operator email: "))
    password = await asyncio.to_thread(getpass, "Password: ")
    if password != await asyncio.to_thread(getpass, "Confirm password: "):
        raise SystemExit("Passwords do not match.")
    require_password(password, registration=True)
    await initialize_database()
    password_hash = await asyncio.to_thread(hash_password, password)
    def insert(connection: apsw.Connection) -> None:
        with connection:
            connection.execute(
                "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, 'operator', ?)",
                ("user_" + uuid4().hex, email, password_hash, timestamp(now())),
            )
    await run_db(insert)
    print("Operator created.")


if __name__ == "__main__":
    asyncio.run(main())
