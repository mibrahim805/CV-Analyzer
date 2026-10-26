import hashlib
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_user
from app.api.problems import AppError
from app.core.config import settings
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_csrf_token,
    new_refresh_token,
    verify_password,
)
from app.db.session import get_db
from app.models.user import AuthSession, CareerPreferences, User, UserProfile
from app.schemas.auth import LoginRequest, RegisterRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["authentication"])


def _client_hash(value: str | None) -> str | None:
    return hashlib.sha256(value.encode()).hexdigest() if value else None


def _set_session_cookies(
    response: Response, user: User, session: AuthSession, refresh_token: str
) -> None:
    access_token, _ = create_access_token(user.id, session.id)
    csrf_token = new_csrf_token()
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_TTL_MINUTES * 60,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        max_age=settings.REFRESH_TOKEN_TTL_DAYS * 86400,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        "csrf_token",
        csrf_token,
        httponly=False,
        max_age=settings.REFRESH_TOKEN_TTL_DAYS * 86400,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def _clear_session_cookies(response: Response) -> None:
    for name in ("access_token", "refresh_token", "csrf_token"):
        response.delete_cookie(name, path="/", secure=settings.COOKIE_SECURE, samesite="lax")


def _require_csrf(request: Request, x_csrf_token: str | None) -> None:
    cookie = request.cookies.get("csrf_token")
    if not cookie or not x_csrf_token or not secrets_compare(cookie, x_csrf_token):
        raise AppError(403, "csrf_failed", "The request could not be verified.", "Forbidden")
    origin = request.headers.get("origin")
    if origin and origin not in settings.CORS_ORIGINS:
        raise AppError(403, "origin_forbidden", "The request origin is not permitted.", "Forbidden")


def secrets_compare(left: str, right: str) -> bool:
    import secrets

    return secrets.compare_digest(left, right)


async def _new_session(
    db: AsyncSession, request: Request, user: User, family_id: UUID | None = None
) -> tuple[AuthSession, str]:
    raw, token_hash = new_refresh_token()
    session = AuthSession(
        user_id=user.id,
        family_id=family_id or uuid4(),
        refresh_token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS),
        ip_hash=_client_hash(request.client.host if request.client else None),
        user_agent_hash=_client_hash(request.headers.get("user-agent")),
    )
    db.add(session)
    await db.flush()
    return session, raw


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> User:
    email = payload.email.lower()
    if await db.scalar(select(User.id).where(User.email == email)):
        raise AppError(409, "account_exists", "An account with this email already exists.", "Conflict")
    try:
        password_hash = hash_password(payload.password)
    except ValueError as exc:
        raise AppError(422, "weak_password", str(exc), "Validation failed") from exc
    user = User(email=email, password_hash=password_hash, terms_version=payload.terms_version)
    user.profile = UserProfile(display_name=payload.display_name)
    user.preferences = CareerPreferences()
    db.add(user)
    await db.flush()
    session, refresh = await _new_session(db, request, user)
    await db.commit()
    await db.refresh(user, ["profile", "preferences"])
    _set_session_cookies(response, user, session, refresh)
    return user


@router.post("/login", response_model=UserResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await db.scalar(
        select(User)
        .options(selectinload(User.profile), selectinload(User.preferences))
        .where(User.email == payload.email.lower())
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise AppError(401, "invalid_credentials", "Email or password is incorrect.", "Unauthenticated")
    user.last_login_at = datetime.now(timezone.utc)
    session, refresh = await _new_session(db, request, user)
    await db.commit()
    _set_session_cookies(response, user, session, refresh)
    return user


@router.post("/refresh", status_code=status.HTTP_204_NO_CONTENT)
async def refresh(
    request: Request,
    response: Response,
    x_csrf_token: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_csrf(request, x_csrf_token)
    raw = request.cookies.get("refresh_token")
    if not raw:
        raise AppError(401, "invalid_session", "The refresh session is missing.", "Unauthenticated")
    old = await db.scalar(select(AuthSession).where(AuthSession.refresh_token_hash == hash_refresh_token(raw)))
    now = datetime.now(timezone.utc)
    if old is None:
        raise AppError(401, "invalid_session", "The refresh session is invalid.", "Unauthenticated")
    if old.revoked_at is not None:
        await db.execute(update(AuthSession).where(AuthSession.family_id == old.family_id).values(revoked_at=now))
        await db.commit()
        _clear_session_cookies(response)
        raise AppError(401, "session_reuse_detected", "The session family was revoked.", "Unauthenticated")
    if old.expires_at <= now:
        raise AppError(401, "session_expired", "The refresh session expired.", "Unauthenticated")
    user = await db.scalar(select(User).options(selectinload(User.profile)).where(User.id == old.user_id))
    if user is None:
        raise AppError(401, "invalid_session", "The account is unavailable.", "Unauthenticated")
    replacement, new_raw = await _new_session(db, request, user, old.family_id)
    old.revoked_at = now
    old.replaced_by_id = replacement.id
    await db.commit()
    _set_session_cookies(response, user, replacement, new_raw)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    x_csrf_token: str | None = Header(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_csrf(request, x_csrf_token)
    access = request.cookies.get("access_token")
    if access:
        from app.core.security import decode_access_token

        _, session_id = decode_access_token(access)
        session = await db.get(AuthSession, session_id)
        if session and session.user_id == user.id:
            session.revoked_at = datetime.now(timezone.utc)
            await db.commit()
    _clear_session_cookies(response)
