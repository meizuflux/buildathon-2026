"""Create demo accounts for functionality currently available in the API."""

import secrets
from contextlib import closing
from uuid import uuid4

from haven.auth import hash_password, now, timestamp
from haven.db import connect, initialize_database

DEMO_ACCOUNTS = (
    ("family@demo.example", "family"),
    ("government@demo.example", "operator"),
)


def seed_demo_data() -> dict[str, str | None]:
    """Create missing accounts and return generated passwords only for new accounts."""
    initialize_database()
    created = {}
    with closing(connect()) as connection, connection:
        for email, role in DEMO_ACCOUNTS:
            if connection.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
                created[email] = None
                continue
            password = secrets.token_urlsafe(18)
            result = connection.execute(
                "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(email) DO NOTHING",
                ("user_" + uuid4().hex, email, hash_password(password), role, timestamp(now())),
            )
            created[email] = password if result.rowcount else None
    return created


def main() -> None:
    for email, password in seed_demo_data().items():
        if password is None:
            print(f"{email}: already exists; left unchanged")
        else:
            print(f"{email}: created; password: {password}")
    print("Passwords are shown only when accounts are created.")


if __name__ == "__main__":
    main()
