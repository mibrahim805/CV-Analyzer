import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class JobSourceStatus(str, enum.Enum):
    ACTIVE = "active"
    DEGRADED = "degraded"
    DISABLED = "disabled"


class JobListingStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    REMOVED = "removed"


class JobSearchStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    PARTIAL = "partial"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobSource(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "job_sources"
    __table_args__ = (Index("ix_job_sources_enabled_status", "enabled", "status"),)

    provider_key: Mapped[str] = mapped_column(String(64), unique=True)
    display_name: Mapped[str] = mapped_column(String(120))
    terms_url: Mapped[str] = mapped_column(String(512))
    status: Mapped[JobSourceStatus] = mapped_column(
        Enum(
            JobSourceStatus,
            name="job_source_status",
            values_callable=lambda values: [item.value for item in values],
        ),
        default=JobSourceStatus.ACTIVE,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_health_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error_code: Mapped[str | None] = mapped_column(String(64))

    listings: Mapped[list["JobListing"]] = relationship(back_populates="source")


class JobListing(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "job_listings"
    __table_args__ = (
        UniqueConstraint("source_id", "external_id", name="uq_job_listings_source_external"),
        Index("ix_job_listings_status_verified", "status", "last_verified_at"),
        Index("ix_job_listings_fingerprint", "fingerprint"),
    )

    source_id: Mapped[UUID] = mapped_column(ForeignKey("job_sources.id", ondelete="CASCADE"))
    external_id: Mapped[str] = mapped_column(String(255))
    canonical_url: Mapped[str] = mapped_column(String(1024))
    title: Mapped[str] = mapped_column(String(255))
    company_name: Mapped[str] = mapped_column(String(255))
    location: Mapped[str | None] = mapped_column(String(255))
    work_arrangement: Mapped[str | None] = mapped_column(String(32))
    experience_level: Mapped[str | None] = mapped_column(String(32))
    description: Mapped[str] = mapped_column(Text)
    required_skills: Mapped[list[str]] = mapped_column(ARRAY(String(80)), default=list)
    optional_skills: Mapped[list[str]] = mapped_column(ARRAY(String(80)), default=list)
    salary_min_minor: Mapped[int | None] = mapped_column(BigInteger)
    salary_max_minor: Mapped[int | None] = mapped_column(BigInteger)
    salary_currency: Mapped[str | None] = mapped_column(String(3))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    fingerprint: Mapped[str] = mapped_column(String(64))
    status: Mapped[JobListingStatus] = mapped_column(
        Enum(
            JobListingStatus,
            name="job_listing_status",
            values_callable=lambda values: [item.value for item in values],
        ),
        default=JobListingStatus.ACTIVE,
    )
    source_payload: Mapped[dict[str, object] | None] = mapped_column(JSONB)

    source: Mapped[JobSource] = relationship(back_populates="listings")


class JobSearchQuery(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "job_search_queries"
    __table_args__ = (
        Index("ix_job_search_queries_user_created", "user_id", "created_at"),
        Index("ix_job_search_queries_status_created", "status", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    cv_version_id: Mapped[UUID | None] = mapped_column(ForeignKey("cv_versions.id", ondelete="SET NULL"))
    cv_profile_id: Mapped[UUID | None] = mapped_column(ForeignKey("cv_professional_profiles.id", ondelete="SET NULL"))
    cv_profile_revision: Mapped[int | None] = mapped_column(Integer)
    target_roles: Mapped[list[str]] = mapped_column(ARRAY(String(120)), default=list)
    locations: Mapped[list[str]] = mapped_column(ARRAY(String(120)), default=list)
    work_arrangements: Mapped[list[str]] = mapped_column(ARRAY(String(32)), default=list)
    experience_levels: Mapped[list[str]] = mapped_column(ARRAY(String(32)), default=list)
    salary_min_minor: Mapped[int | None] = mapped_column(BigInteger)
    salary_max_minor: Mapped[int | None] = mapped_column(BigInteger)
    salary_currency: Mapped[str | None] = mapped_column(String(3))
    include_salary_unknown: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[JobSearchStatus] = mapped_column(
        Enum(
            JobSearchStatus,
            name="job_search_status",
            values_callable=lambda values: [item.value for item in values],
        ),
        default=JobSearchStatus.QUEUED,
    )
    provider_status: Mapped[str] = mapped_column(String(32), default="queued")
    result_count: Mapped[int] = mapped_column(Integer, default=0)
    provider_count: Mapped[int] = mapped_column(Integer, default=0)
    failure_code: Mapped[str | None] = mapped_column(String(64))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    matches: Mapped[list["JobMatch"]] = relationship(back_populates="search", cascade="all, delete-orphan")


class JobMatch(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "job_matches"
    __table_args__ = (
        UniqueConstraint("search_id", "listing_id", name="uq_job_matches_search_listing"),
        Index("ix_job_matches_search_score", "search_id", "score"),
    )

    search_id: Mapped[UUID] = mapped_column(ForeignKey("job_search_queries.id", ondelete="CASCADE"))
    listing_id: Mapped[UUID] = mapped_column(ForeignKey("job_listings.id", ondelete="CASCADE"))
    score: Mapped[int] = mapped_column(Integer)
    rank: Mapped[int] = mapped_column(Integer)
    matched_skills: Mapped[list[str]] = mapped_column(ARRAY(String(80)), default=list)
    missing_required_skills: Mapped[list[str]] = mapped_column(ARRAY(String(80)), default=list)
    evidence: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)

    search: Mapped[JobSearchQuery] = relationship(back_populates="matches")
    listing: Mapped[JobListing] = relationship()


class SavedJob(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "saved_jobs"
    __table_args__ = (
        UniqueConstraint("user_id", "listing_id", name="uq_saved_jobs_user_listing"),
        Index("ix_saved_jobs_user_created", "user_id", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    listing_id: Mapped[UUID] = mapped_column(ForeignKey("job_listings.id", ondelete="CASCADE"))

    listing: Mapped[JobListing] = relationship()
