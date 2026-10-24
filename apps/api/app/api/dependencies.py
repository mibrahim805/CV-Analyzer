import secrets

import jwt
from fastapi import Cookie, Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.problems import AppError
from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import AuthSession, User, UserStatus


async def get_current_user(
    access_token: str | None = Cookie(default=None), db: AsyncSession = Depends(get_db)
) -> User:
    if not access_token:
        raise AppError(401, "authentication_required", "Authentication is required.", "Unauthenticated")
    try:
        user_id, session_id = decode_access_token(access_token)
    except (jwt.InvalidTokenError, ValueError):
        raise AppError(401, "invalid_session", "The session is invalid or expired.", "Unauthenticated") from None

    session = await db.scalar(select(AuthSession).where(AuthSession.id == session_id))
    if session is None or session.user_id != user_id or session.revoked_at is not None:
        raise AppError(401, "invalid_session", "The session is invalid or expired.", "Unauthenticated")

    user = await db.scalar(
        select(User).options(selectinload(User.profile), selectinload(User.preferences)).where(User.id == user_id)
    )
    if user is None or user.status != UserStatus.ACTIVE:
        raise AppError(401, "invalid_session", "The account is unavailable.", "Unauthenticated")
    return user


CurrentUser = User


def require_csrf(request: Request, x_csrf_token: str | None = Header(default=None)) -> None:
    """Protect cookie-authenticated state changes with token and origin checks."""
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    cookie = request.cookies.get("csrf_token")
    if not cookie or not x_csrf_token or not secrets.compare_digest(cookie, x_csrf_token):
        raise AppError(403, "csrf_failed", "The request could not be verified.", "Forbidden")
    origin = request.headers.get("origin")
    if origin and origin != settings.WEB_ORIGIN:
        raise AppError(403, "origin_forbidden", "The request origin is not permitted.", "Forbidden")
