"""Associate job searches with the processed CV version used for matching."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261026_0005"
down_revision: str | None = "20261026_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "job_search_queries",
        sa.Column("cv_version_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_job_search_queries_cv_version",
        "job_search_queries",
        "cv_versions",
        ["cv_version_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_job_search_queries_cv_version", "job_search_queries", ["cv_version_id"])


def downgrade() -> None:
    op.drop_index("ix_job_search_queries_cv_version", table_name="job_search_queries")
    op.drop_constraint("fk_job_search_queries_cv_version", "job_search_queries", type_="foreignkey")
    op.drop_column("job_search_queries", "cv_version_id")
