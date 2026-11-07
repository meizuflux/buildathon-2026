"""Family accounts and opaque, revocable bearer sessions."""

import asyncio
import hashlib
import re
import secrets
import apsw
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import msgspec
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError
from litestar import Request, get, post
from litestar.exceptions import HTTPException
from litestar.params import JSONBody

from haven.db import run_db

SESSION_LIFETIME = timedelta(hours=24)
LOGIN_WINDOW = timedelta(minutes=15)
LOGIN_ACCOUNT_LIMIT = 5
LOGIN_IP_LIMIT = 50
_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class Credentials(msgspec.Struct, forbid_unknown_fields=True):
    email: str
    password: str


def now() -> datetime:
    return datetime.now(UTC)


def timestamp(value: datetime) -> str:
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


def normalize_email(email: str) -> str:
    email = email.strip().lower()
    if len(email) > 254 or not _EMAIL.fullmatch(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.", extra={"code": "invalid_request"})
    return email


_PASSWORD_HASHER = PasswordHasher(type=Type.ID)


def hash_password(password: str) -> str:
    return _PASSWORD_HASHER.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    if not encoded.startswith("$argon2id$"):
        return False
    try:
        return _PASSWORD_HASHER.verify(encoded, password)
    except (InvalidHashError, VerificationError):
        return False


# Equalize the expensive password verification path for unknown accounts.
_DUMMY_HASH = hash_password("not-a-real-password")


def require_password(password: str, *, registration: bool = False) -> None:
    if len(password.encode("utf-8")) > 1024 or (registration and len(password) < 8):
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters and at most 1024 bytes.", extra={"code": "invalid_request"})


def user_info(connection: apsw.Connection, user: dict) -> dict:
    family = connection.execute("SELECT id FROM families WHERE owner_user_id = ?", (user["id"],)).fetchone()
    return {"id": user["id"], "role": user["role"], "family_id": family["id"] if family else None}


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def authenticate(authorization: str, connection: apsw.Connection) -> tuple[dict, str]:
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or len(parts[1]) > 256:
        raise HTTPException(status_code=401, detail="Authentication required.", extra={"code": "unauthorized"})
    digest = token_hash(parts[1])
    user = connection.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?",
        (digest, timestamp(now())),
    ).fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required.", extra={"code": "unauthorized"})
    return user, digest


def check_login_limit(connection: apsw.Connection, email: str, client: str) -> None:
    """Count attempts atomically across workers, by account and client address."""
    current = now()
    keys = ["email:" + token_hash(email), "ip:" + token_hash(client)]
    connection.execute("BEGIN IMMEDIATE")
    try:
        connection.execute("DELETE FROM login_attempts WHERE window_start <= ?", (timestamp(current - LOGIN_WINDOW),))
        rows = [connection.execute("SELECT attempts FROM login_attempts WHERE key = ?", (key,)).fetchone() for key in keys]
        if any(row and row["attempts"] >= limit for row, limit in zip(rows, (LOGIN_ACCOUNT_LIMIT, LOGIN_IP_LIMIT))):
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.", extra={"code": "rate_limited"})
        for key in keys:
            connection.execute(
                "INSERT INTO login_attempts (key, window_start, attempts) VALUES (?, ?, 1) "
                "ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1", (key, timestamp(current)),
            )
        connection.execute("COMMIT")
    except BaseException:
        connection.execute("ROLLBACK")
        raise


@post("/api/auth/register")
async def register(data: JSONBody[Credentials]) -> dict:
    email = normalize_email(data.email)
    require_password(data.password, registration=True)
    user_id = "user_" + uuid4().hex
    password_hash = await asyncio.to_thread(hash_password, data.password)

    def insert(connection: apsw.Connection) -> None:
        with connection:
            connection.execute("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, 'family', ?)",
                               (user_id, email, password_hash, timestamp(now())))
    try:
        await run_db(insert)
    except apsw.ConstraintError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.", extra={"code": "email_in_use"})
    return {"user_id": user_id, "role": "family"}


@post("/api/auth/login", status_code=200)
async def login(data: JSONBody[Credentials], request: Request) -> dict:
    email = normalize_email(data.email)
    require_password(data.password)
    client = request.client.host if request.client else "unknown"

    def get_user(connection: apsw.Connection) -> dict | None:
        check_login_limit(connection, email, client)
        return connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    user = await run_db(get_user)
    valid = await asyncio.to_thread(verify_password, data.password, user["password_hash"] if user else _DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(status_code=401, detail="Invalid email or password.", extra={"code": "invalid_credentials"})
    token = secrets.token_urlsafe(32)
    expires = timestamp(now() + SESSION_LIFETIME)

    def create_session(connection: apsw.Connection) -> dict:
        with connection:
            connection.execute("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
                               ("session_" + uuid4().hex, user["id"], token_hash(token), expires))
            connection.execute("DELETE FROM login_attempts WHERE key = ?", ("email:" + token_hash(email),))
            return user_info(connection, user)

    info = await run_db(create_session)
    return {"access_token": token, "token_type": "Bearer", "expires_at": expires, "user": info}


@get("/api/me")
async def me(request: Request) -> dict:
    authorization = request.headers.get("authorization", "")
    def get_info(connection: apsw.Connection) -> dict:
        user, _ = authenticate(authorization, connection)
        return user_info(connection, user)
    return await run_db(get_info)


@post("/api/auth/logout", status_code=204)
async def logout(request: Request) -> None:
    authorization = request.headers.get("authorization", "")
    def revoke(connection: apsw.Connection) -> None:
        with connection:
            _, digest = authenticate(authorization, connection)
            connection.execute("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", (timestamp(now()), digest))
    await run_db(revoke)
