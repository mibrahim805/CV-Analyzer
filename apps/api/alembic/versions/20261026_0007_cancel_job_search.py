"""Allow users to stop an in-flight job search."""

from collections.abc import Sequence

from alembic import op

revision: str = "20261026_0007"
down_revision: str | None = "20261026_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE job_search_status ADD VALUE IF NOT EXISTS 'cancelled'")


def downgrade() -> None:
    # PostgreSQL does not support removing an enum value in place. Existing
    # rows are never rewritten by this migration, so the value is retained.
    pass
