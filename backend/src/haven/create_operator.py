"""Create an operator locally; never put credentials in command-line arguments."""

from contextlib import closing
from getpass import getpass
from uuid import uuid4

from haven.auth import hash_password, normalize_email, require_password, timestamp, now
from haven.db import connect, initialize_database


def main() -> None:
    email = normalize_email(input("Operator email: "))
    password = getpass("Password: ")
    if password != getpass("Confirm password: "):
        raise SystemExit("Passwords do not match.")
    require_password(password, registration=True)
    initialize_database()
    with closing(connect()) as connection, connection:
        connection.execute(
            "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, 'operator', ?)",
            ("user_" + uuid4().hex, email, hash_password(password), timestamp(now())),
        )
    print("Operator created.")


if __name__ == "__main__":
    main()
