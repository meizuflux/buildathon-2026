"""Family accounts and opaque, revocable bearer sessions."""

import asyncio
import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import apsw
import msgspec
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError
from litestar import Request, get, post
from litestar.exceptions import HTTPException
from litestar.params import JSONBody

from haven.db import connect

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


async def user_info(connection: apsw.AsyncConnection, user: tuple) -> dict:
    family = await (await connection.execute("SELECT id FROM families WHERE owner_user_id = ?", (user[0],))).fetchone()
    hub = await (await connection.execute("SELECT hub_id FROM hub_staff WHERE user_id = ?", (user[0],))).fetchone()
    return {"id": user[0], "role": user[1], "family_id": family[0] if family else None, "hub_id": hub[0] if hub else None}


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def authenticate(authorization: str, connection: apsw.AsyncConnection) -> tuple[tuple, str]:
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or len(parts[1]) > 256:
        raise HTTPException(status_code=401, detail="Authentication required.", extra={"code": "unauthorized"})
    digest = token_hash(parts[1])
    user = await (await connection.execute(
        "SELECT u.id, u.role FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?",
        (digest, timestamp(now())),
    )).fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required.", extra={"code": "unauthorized"})
    return user, digest


async def check_login_limit(connection: apsw.AsyncConnection, email: str, client: str) -> None:
    """Count attempts atomically across workers, by account and client address."""
    current = now()
    keys = ["email:" + token_hash(email), "ip:" + token_hash(client)]
    await connection.execute("BEGIN IMMEDIATE")
    try:
        await connection.execute("DELETE FROM login_attempts WHERE window_start <= ?", (timestamp(current - LOGIN_WINDOW),))
        rows = [await (await connection.execute("SELECT attempts FROM login_attempts WHERE key = ?", (key,))).fetchone() for key in keys]
        if any(row and row[0] >= limit for row, limit in zip(rows, (LOGIN_ACCOUNT_LIMIT, LOGIN_IP_LIMIT))):
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.", extra={"code": "rate_limited"})
        for key in keys:
            await connection.execute(
                "INSERT INTO login_attempts (key, window_start, attempts) VALUES (?, ?, 1) "
                "ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1", (key, timestamp(current)),
            )
        await connection.execute("COMMIT")
    except BaseException:
        await connection.execute("ROLLBACK")
        raise


@post("/api/auth/register")
async def register(data: JSONBody[Credentials]) -> dict:
    email = normalize_email(data.email)
    require_password(data.password, registration=True)
    user_id = "user_" + uuid4().hex
    password_hash = await asyncio.to_thread(hash_password, data.password)
    try:
        async with connect() as connection:
            await connection.execute("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, 'family', ?)",
                                     (user_id, email, password_hash, timestamp(now())))
    except apsw.ConstraintError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.", extra={"code": "email_in_use"})
    return {"user_id": user_id, "role": "family"}


@post("/api/auth/login", status_code=200)
async def login(data: JSONBody[Credentials], request: Request) -> dict:
    email = normalize_email(data.email)
    require_password(data.password)
    client = request.client.host if request.client else "unknown"
    async with connect() as connection:
        await check_login_limit(connection, email, client)
        user = await (await connection.execute("SELECT id, role, password_hash FROM users WHERE email = ?", (email,))).fetchone()
        valid = await asyncio.to_thread(verify_password, data.password, user[2] if user else _DUMMY_HASH)
        if not user or not valid:
            raise HTTPException(status_code=401, detail="Invalid email or password.", extra={"code": "invalid_credentials"})
        token = secrets.token_urlsafe(32)
        expires = timestamp(now() + SESSION_LIFETIME)
        async with connection:
            await connection.execute("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
                                     ("session_" + uuid4().hex, user[0], token_hash(token), expires))
            await connection.execute("DELETE FROM login_attempts WHERE key = ?", ("email:" + token_hash(email),))
            info = await user_info(connection, user)
        return {"access_token": token, "token_type": "Bearer", "expires_at": expires, "user": info}


@get("/api/me")
async def me(request: Request) -> dict:
    async with connect() as connection:
        user, _ = await authenticate(request.headers.get("authorization", ""), connection)
        return await user_info(connection, user)


@post("/api/auth/logout", status_code=204)
async def logout(request: Request) -> None:
    async with connect() as connection:
        async with connection:
            _, digest = await authenticate(request.headers.get("authorization", ""), connection)
            await connection.execute("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", (timestamp(now()), digest))
