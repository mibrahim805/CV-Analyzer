import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING_DELETION = "pending_deletion"


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus, name="user_status"), default=UserStatus.ACTIVE)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terms_version: Mapped[str] = mapped_column(String(32))

    profile: Mapped["UserProfile"] = relationship(back_populates="user", cascade="all, delete-orphan")
    preferences: Mapped["CareerPreferences"] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserProfile(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    display_name: Mapped[str] = mapped_column(String(120))
    headline: Mapped[str | None] = mapped_column(String(180))
    country_code: Mapped[str | None] = mapped_column(String(2))
    locale: Mapped[str] = mapped_column(String(16), default="en")
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")

    user: Mapped[User] = relationship(back_populates="profile")


class CareerPreferences(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "career_preferences"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    target_roles: Mapped[list[str]] = mapped_column(ARRAY(String(120)), default=list)
    locations: Mapped[list[str]] = mapped_column(ARRAY(String(120)), default=list)
    work_arrangements: Mapped[list[str]] = mapped_column(ARRAY(String(16)), default=list)
    experience_levels: Mapped[list[str]] = mapped_column(ARRAY(String(24)), default=list)
    salary_min_minor: Mapped[int | None]
    salary_max_minor: Mapped[int | None]
    salary_currency: Mapped[str | None] = mapped_column(String(3))
    include_salary_unknown: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped[User] = relationship(back_populates="preferences")


class AuthSession(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        Index("ix_auth_sessions_user_revoked", "user_id", "revoked_at"),
        Index("ix_auth_sessions_expires_at", "expires_at"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    family_id: Mapped[UUID]
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("auth_sessions.id", ondelete="SET NULL"))
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    user_agent_hash: Mapped[str | None] = mapped_column(String(64))
