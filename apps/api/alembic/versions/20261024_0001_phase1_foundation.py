"""Phase 1 identity, preferences, CV lifecycle, and audit tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20261024_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

user_status = sa.Enum("ACTIVE", "SUSPENDED", "PENDING_DELETION", name="user_status")
cv_status = sa.Enum(
    "AWAITING_UPLOAD", "QUARANTINED", "SCANNING", "SCAN_FAILED", "REJECTED", "CLEAN",
    "EXTRACTING", "NEEDS_OCR", "READY", "EXTRACTION_FAILED", "DELETED", name="cv_version_status"
)
job_status = sa.Enum("QUEUED", "RUNNING", "SUCCEEDED", "FAILED", name="processing_job_status")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("email", sa.String(320), nullable=False), sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("status", user_status, nullable=False), sa.Column("email_verified_at", sa.DateTime(timezone=True)),
        sa.Column("last_login_at", sa.DateTime(timezone=True)), sa.Column("terms_version", sa.String(32), nullable=False),
        sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("email")
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_table(
        "user_profiles", sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=False), sa.Column("headline", sa.String(180)),
        sa.Column("country_code", sa.String(2)), sa.Column("locale", sa.String(16), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False), sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id")
    )
    op.create_table(
        "career_preferences", sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_roles", postgresql.ARRAY(sa.String(120)), nullable=False),
        sa.Column("locations", postgresql.ARRAY(sa.String(120)), nullable=False),
        sa.Column("work_arrangements", postgresql.ARRAY(sa.String(16)), nullable=False),
        sa.Column("experience_levels", postgresql.ARRAY(sa.String(24)), nullable=False),
        sa.Column("salary_min_minor", sa.Integer()), sa.Column("salary_max_minor", sa.Integer()),
        sa.Column("salary_currency", sa.String(3)), sa.Column("include_salary_unknown", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("user_id"),
        sa.CheckConstraint("salary_min_minor IS NULL OR salary_min_minor >= 0", name="salary_min_nonnegative"),
        sa.CheckConstraint("salary_max_minor IS NULL OR salary_max_minor >= salary_min_minor", name="salary_range_valid")
    )
    op.create_table(
        "auth_sessions", sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False), sa.Column("refresh_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("replaced_by_id", sa.Uuid(), sa.ForeignKey("auth_sessions.id", ondelete="SET NULL")),
        sa.Column("ip_hash", sa.String(64)), sa.Column("user_agent_hash", sa.String(64)),
        sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False)
    )
    op.create_index("ix_auth_sessions_user_revoked", "auth_sessions", ["user_id", "revoked_at"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])
    op.create_table(
        "cv_documents", sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(120), nullable=False), sa.Column("active_version_id", sa.Uuid()),
        sa.Column("deleted_at", sa.DateTime(timezone=True)), sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False)
    )
    op.create_index("ix_cv_documents_user_created", "cv_documents", ["user_id", "created_at"])
    op.create_table(
        "cv_versions", sa.Column("document_id", sa.Uuid(), sa.ForeignKey("cv_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False), sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("media_type", sa.String(100), nullable=False), sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False), sa.Column("object_key", sa.String(512), nullable=False, unique=True),
        sa.Column("status", cv_status, nullable=False), sa.Column("failure_code", sa.String(64)), sa.Column("failure_detail", sa.Text()),
        sa.Column("scanned_at", sa.DateTime(timezone=True)), sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("document_id", "version_no", name="uq_cv_versions_document_version")
    )
    op.create_index("ix_cv_versions_status_updated", "cv_versions", ["status", "updated_at"])
    op.create_table(
        "cv_processing_jobs", sa.Column("version_id", sa.Uuid(), sa.ForeignKey("cv_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False), sa.Column("processor_version", sa.String(32), nullable=False),
        sa.Column("status", job_status, nullable=False), sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(255), nullable=False, unique=True),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False), sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)), sa.Column("error_code", sa.String(64)),
        sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False)
    )
    op.create_index("ix_processing_jobs_claim", "cv_processing_jobs", ["status", "available_at"])
    op.create_table(
        "audit_events", sa.Column("actor_user_id", sa.Uuid()), sa.Column("subject_user_id", sa.Uuid()),
        sa.Column("action", sa.String(100), nullable=False), sa.Column("target_type", sa.String(64), nullable=False),
        sa.Column("target_id", sa.Uuid()), sa.Column("outcome", sa.String(32), nullable=False),
        sa.Column("request_id", sa.String(64)), sa.Column("ip_hash", sa.String(64)),
        sa.Column("metadata_safe", postgresql.JSONB(), nullable=False), sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), primary_key=True)
    )
    op.create_index("ix_audit_subject_time", "audit_events", ["subject_user_id", "occurred_at"])
    op.create_index("ix_audit_target", "audit_events", ["target_type", "target_id"])


def downgrade() -> None:
    for table in ("audit_events", "cv_processing_jobs", "cv_versions", "cv_documents", "auth_sessions", "career_preferences", "user_profiles", "users"):
        op.drop_table(table)
    job_status.drop(op.get_bind(), checkfirst=True)
    cv_status.drop(op.get_bind(), checkfirst=True)
    user_status.drop(op.get_bind(), checkfirst=True)
