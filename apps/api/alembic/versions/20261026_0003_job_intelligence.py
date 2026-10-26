"""Add normalized job discovery, matching, and saved-job records."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20261026_0003"
down_revision: str | None = "20261026_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    job_source_status = postgresql.ENUM("active", "degraded", "disabled", name="job_source_status")
    job_listing_status = postgresql.ENUM("active", "expired", "removed", name="job_listing_status")
    job_search_status = postgresql.ENUM("queued", "running", "succeeded", "partial", "failed", name="job_search_status")
    op.create_table(
        "job_sources",
        sa.Column("provider_key", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("terms_url", sa.String(length=512), nullable=False),
        sa.Column("status", job_source_status, nullable=False, server_default="active"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_health_at", sa.DateTime(timezone=True)),
        sa.Column("last_error_code", sa.String(length=64)),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("provider_key"),
    )
    op.create_index("ix_job_sources_enabled_status", "job_sources", ["enabled", "status"])

    op.create_table(
        "job_listings",
        sa.Column("source_id", sa.Uuid(), sa.ForeignKey("job_sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=False),
        sa.Column("canonical_url", sa.String(length=1024), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("company_name", sa.String(length=255), nullable=False),
        sa.Column("location", sa.String(length=255)),
        sa.Column("work_arrangement", sa.String(length=32)),
        sa.Column("experience_level", sa.String(length=32)),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("required_skills", postgresql.ARRAY(sa.String(length=80)), nullable=False, server_default="{}"),
        sa.Column("optional_skills", postgresql.ARRAY(sa.String(length=80)), nullable=False, server_default="{}"),
        sa.Column("salary_min_minor", sa.BigInteger()),
        sa.Column("salary_max_minor", sa.BigInteger()),
        sa.Column("salary_currency", sa.String(length=3)),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("status", job_listing_status, nullable=False, server_default="active"),
        sa.Column("source_payload", postgresql.JSONB()),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("source_id", "external_id", name="uq_job_listings_source_external"),
    )
    op.create_index("ix_job_listings_status_verified", "job_listings", ["status", "last_verified_at"])
    op.create_index("ix_job_listings_fingerprint", "job_listings", ["fingerprint"])

    op.create_table(
        "job_search_queries",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_roles", postgresql.ARRAY(sa.String(length=120)), nullable=False, server_default="{}"),
        sa.Column("locations", postgresql.ARRAY(sa.String(length=120)), nullable=False, server_default="{}"),
        sa.Column("work_arrangements", postgresql.ARRAY(sa.String(length=32)), nullable=False, server_default="{}"),
        sa.Column("experience_levels", postgresql.ARRAY(sa.String(length=32)), nullable=False, server_default="{}"),
        sa.Column("salary_min_minor", sa.BigInteger()),
        sa.Column("salary_max_minor", sa.BigInteger()),
        sa.Column("salary_currency", sa.String(length=3)),
        sa.Column("include_salary_unknown", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("status", job_search_status, nullable=False, server_default="queued"),
        sa.Column("provider_status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("result_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("provider_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failure_code", sa.String(length=64)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_job_search_queries_user_created", "job_search_queries", ["user_id", "created_at"])
    op.create_index("ix_job_search_queries_status_created", "job_search_queries", ["status", "created_at"])

    op.create_table(
        "job_matches",
        sa.Column("search_id", sa.Uuid(), sa.ForeignKey("job_search_queries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("listing_id", sa.Uuid(), sa.ForeignKey("job_listings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("matched_skills", postgresql.ARRAY(sa.String(length=80)), nullable=False, server_default="{}"),
        sa.Column("missing_required_skills", postgresql.ARRAY(sa.String(length=80)), nullable=False, server_default="{}"),
        sa.Column("evidence", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("search_id", "listing_id", name="uq_job_matches_search_listing"),
    )
    op.create_index("ix_job_matches_search_score", "job_matches", ["search_id", "score"])

    op.create_table(
        "saved_jobs",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("listing_id", sa.Uuid(), sa.ForeignKey("job_listings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "listing_id", name="uq_saved_jobs_user_listing"),
    )
    op.create_index("ix_saved_jobs_user_created", "saved_jobs", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_saved_jobs_user_created", table_name="saved_jobs")
    op.drop_table("saved_jobs")
    op.drop_index("ix_job_matches_search_score", table_name="job_matches")
    op.drop_table("job_matches")
    op.drop_index("ix_job_search_queries_status_created", table_name="job_search_queries")
    op.drop_index("ix_job_search_queries_user_created", table_name="job_search_queries")
    op.drop_table("job_search_queries")
    op.drop_index("ix_job_listings_fingerprint", table_name="job_listings")
    op.drop_index("ix_job_listings_status_verified", table_name="job_listings")
    op.drop_table("job_listings")
    op.drop_index("ix_job_sources_enabled_status", table_name="job_sources")
    op.drop_table("job_sources")
    bind = op.get_bind()
    for enum_name in ("job_search_status", "job_listing_status", "job_source_status"):
        sa.Enum(name=enum_name).drop(bind, checkfirst=True)
