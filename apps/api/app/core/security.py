import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import settings

_password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
_PASSWORD_PATTERN = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,128}$")


def validate_password(password: str) -> None:
    if not _PASSWORD_PATTERN.match(password):
        raise ValueError("Password must be 12-128 characters with upper, lower, and numeric text")


def hash_password(password: str) -> str:
    validate_password(password)
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_access_token(user_id: UUID, session_id: UUID) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.ACCESS_TOKEN_TTL_MINUTES)
    token = jwt.encode(
        {"sub": str(user_id), "sid": str(session_id), "iat": now, "exp": expires_at, "typ": "access"},
        settings.APP_SECRET_KEY,
        algorithm="HS256",
    )
    return token, expires_at


def decode_access_token(token: str) -> tuple[UUID, UUID]:
    payload = jwt.decode(token, settings.APP_SECRET_KEY, algorithms=["HS256"])
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("Unexpected token type")
    return UUID(payload["sub"]), UUID(payload["sid"])


def new_refresh_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(48)
    return token, hash_refresh_token(token)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)
