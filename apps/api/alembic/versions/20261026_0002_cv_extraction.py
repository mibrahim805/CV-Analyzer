"""Add durable CV text-extraction metadata."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261026_0002"
down_revision: str | None = "20261024_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cv_extractions",
        sa.Column("version_id", sa.Uuid(), sa.ForeignKey("cv_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=False),
        sa.Column("text_object_key", sa.String(length=512), nullable=False),
        sa.Column("text_sha256", sa.String(length=64), nullable=False),
        sa.Column("page_count", sa.Integer()),
        sa.Column("character_count", sa.Integer(), nullable=False),
        sa.Column("language", sa.String(length=16)),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("version_id", name="uq_cv_extractions_version"),
        sa.UniqueConstraint("text_object_key"),
    )
    op.create_index("ix_cv_extractions_method_created", "cv_extractions", ["method", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_cv_extractions_method_created", table_name="cv_extractions")
    op.drop_table("cv_extractions")
