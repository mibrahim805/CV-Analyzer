"""Store validated, versioned CV professional profiles for job intelligence."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20261026_0006"
down_revision: str | None = "20261026_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    profile_status = postgresql.ENUM(
        "awaiting_model", "processing", "ready", "needs_review", "failed", "stale", name="cv_profile_status", create_type=False
    )
    profile_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "cv_professional_profiles",
        sa.Column("version_id", sa.Uuid(), sa.ForeignKey("cv_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", profile_status, nullable=False, server_default="awaiting_model"),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("profile", postgresql.JSONB()),
        sa.Column("provider", sa.String(length=64)),
        sa.Column("model_name", sa.String(length=120)),
        sa.Column("prompt_version", sa.String(length=64)),
        sa.Column("source_text_sha256", sa.String(length=64)),
        sa.Column("failure_code", sa.String(length=64)),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("version_id", name="uq_cv_professional_profiles_version"),
    )
    op.create_index("ix_cv_profiles_status_updated", "cv_professional_profiles", ["status", "updated_at"])
    op.add_column("job_search_queries", sa.Column("cv_profile_id", sa.Uuid(), nullable=True))
    op.add_column("job_search_queries", sa.Column("cv_profile_revision", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_job_search_queries_cv_profile",
        "job_search_queries",
        "cv_professional_profiles",
        ["cv_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_job_search_queries_cv_profile", "job_search_queries", ["cv_profile_id"])


def downgrade() -> None:
    op.drop_index("ix_job_search_queries_cv_profile", table_name="job_search_queries")
    op.drop_constraint("fk_job_search_queries_cv_profile", "job_search_queries", type_="foreignkey")
    op.drop_column("job_search_queries", "cv_profile_revision")
    op.drop_column("job_search_queries", "cv_profile_id")
    op.drop_index("ix_cv_profiles_status_updated", table_name="cv_professional_profiles")
    op.drop_table("cv_professional_profiles")
    sa.Enum(name="cv_profile_status").drop(op.get_bind(), checkfirst=True)
