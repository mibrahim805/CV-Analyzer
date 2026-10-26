"""Add durable text interview sessions, responses, and rubric evaluations."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20261026_0004"
down_revision: str | None = "20261026_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    interview_mode = postgresql.ENUM(
        "general", "technical", "behavioral", "project", "job_specific", "hr", name="interview_mode"
    )
    interview_difficulty = postgresql.ENUM("easy", "medium", "hard", name="interview_difficulty")
    interview_session_status = postgresql.ENUM(
        "active", "paused", "completed", "abandoned", name="interview_session_status"
    )
    interview_question_status = postgresql.ENUM("asked", "answered", "skipped", name="interview_question_status")

    op.create_table(
        "interview_sessions",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cv_version_id", sa.Uuid(), sa.ForeignKey("cv_versions.id", ondelete="SET NULL")),
        sa.Column("listing_id", sa.Uuid(), sa.ForeignKey("job_listings.id", ondelete="SET NULL")),
        sa.Column("mode", interview_mode, nullable=False),
        sa.Column("difficulty", interview_difficulty, nullable=False, server_default="medium"),
        sa.Column("status", interview_session_status, nullable=False, server_default="active"),
        sa.Column("max_questions", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("current_sequence", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("context_snapshot", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_interview_sessions_user_created", "interview_sessions", ["user_id", "created_at"])

    op.create_table(
        "interview_questions",
        sa.Column(
            "session_id", sa.Uuid(), sa.ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("topic", sa.String(length=80), nullable=False),
        sa.Column("intent", sa.String(length=120), nullable=False),
        sa.Column("source_evidence", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("status", interview_question_status, nullable=False, server_default="asked"),
        sa.Column("asked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True)),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("session_id", "sequence", name="uq_interview_questions_session_sequence"),
    )
    op.create_index("ix_interview_questions_session_status", "interview_questions", ["session_id", "status"])

    op.create_table(
        "interview_responses",
        sa.Column(
            "question_id", sa.Uuid(), sa.ForeignKey("interview_questions.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("answer_text", sa.Text(), nullable=False),
        sa.Column("skipped", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("question_id", name="uq_interview_responses_question"),
    )

    op.create_table(
        "interview_evaluations",
        sa.Column(
            "session_id", sa.Uuid(), sa.ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("question_id", sa.Uuid(), sa.ForeignKey("interview_questions.id", ondelete="CASCADE")),
        sa.Column("rubric_version", sa.String(length=32), nullable=False, server_default="deterministic_v1"),
        sa.Column("dimensions", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("strengths", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("improvements", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("example_structure", sa.Text(), nullable=False),
        sa.Column("evidence", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("session_id", "question_id", name="uq_interview_evaluations_scope"),
    )
    op.create_index("ix_interview_evaluations_session_created", "interview_evaluations", ["session_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_interview_evaluations_session_created", table_name="interview_evaluations")
    op.drop_table("interview_evaluations")
    op.drop_table("interview_responses")
    op.drop_index("ix_interview_questions_session_status", table_name="interview_questions")
    op.drop_table("interview_questions")
    op.drop_index("ix_interview_sessions_user_created", table_name="interview_sessions")
    op.drop_table("interview_sessions")
    bind = op.get_bind()
    for enum_name in (
        "interview_question_status",
        "interview_session_status",
        "interview_difficulty",
        "interview_mode",
    ):
        sa.Enum(name=enum_name).drop(bind, checkfirst=True)
