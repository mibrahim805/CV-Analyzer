import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class InterviewMode(str, enum.Enum):
    GENERAL = "general"
    TECHNICAL = "technical"
    BEHAVIORAL = "behavioral"
    PROJECT = "project"
    JOB_SPECIFIC = "job_specific"
    HR = "hr"


class InterviewDifficulty(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class InterviewSessionStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class InterviewQuestionStatus(str, enum.Enum):
    ASKED = "asked"
    ANSWERED = "answered"
    SKIPPED = "skipped"


class InterviewSession(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "interview_sessions"
    __table_args__ = (Index("ix_interview_sessions_user_created", "user_id", "created_at"),)

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    cv_version_id: Mapped[UUID | None] = mapped_column(ForeignKey("cv_versions.id", ondelete="SET NULL"))
    listing_id: Mapped[UUID | None] = mapped_column(ForeignKey("job_listings.id", ondelete="SET NULL"))
    mode: Mapped[InterviewMode] = mapped_column(
        Enum(InterviewMode, name="interview_mode", values_callable=lambda values: [item.value for item in values])
    )
    difficulty: Mapped[InterviewDifficulty] = mapped_column(
        Enum(
            InterviewDifficulty,
            name="interview_difficulty",
            values_callable=lambda values: [item.value for item in values],
        ),
        default=InterviewDifficulty.MEDIUM,
    )
    status: Mapped[InterviewSessionStatus] = mapped_column(
        Enum(
            InterviewSessionStatus,
            name="interview_session_status",
            values_callable=lambda values: [item.value for item in values],
        ),
        default=InterviewSessionStatus.ACTIVE,
    )
    max_questions: Mapped[int] = mapped_column(Integer, default=6)
    current_sequence: Mapped[int] = mapped_column(Integer, default=1)
    context_snapshot: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    questions: Mapped[list["InterviewQuestion"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="InterviewQuestion.sequence"
    )
    evaluations: Mapped[list["InterviewEvaluation"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class InterviewQuestion(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "interview_questions"
    __table_args__ = (
        UniqueConstraint("session_id", "sequence", name="uq_interview_questions_session_sequence"),
        Index("ix_interview_questions_session_status", "session_id", "status"),
    )

    session_id: Mapped[UUID] = mapped_column(ForeignKey("interview_sessions.id", ondelete="CASCADE"))
    sequence: Mapped[int] = mapped_column(Integer)
    prompt: Mapped[str] = mapped_column(Text)
    topic: Mapped[str] = mapped_column(String(80))
    intent: Mapped[str] = mapped_column(String(120))
    source_evidence: Mapped[list[str]] = mapped_column(JSONB, default=list)
    status: Mapped[InterviewQuestionStatus] = mapped_column(
        Enum(
            InterviewQuestionStatus,
            name="interview_question_status",
            values_callable=lambda values: [item.value for item in values],
        ),
        default=InterviewQuestionStatus.ASKED,
    )
    asked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    session: Mapped[InterviewSession] = relationship(back_populates="questions")
    response: Mapped["InterviewResponse | None"] = relationship(
        back_populates="question", cascade="all, delete-orphan", uselist=False
    )


class InterviewResponse(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "interview_responses"
    __table_args__ = (UniqueConstraint("question_id", name="uq_interview_responses_question"),)

    question_id: Mapped[UUID] = mapped_column(ForeignKey("interview_questions.id", ondelete="CASCADE"))
    answer_text: Mapped[str] = mapped_column(Text)
    skipped: Mapped[bool] = mapped_column(default=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    question: Mapped[InterviewQuestion] = relationship(back_populates="response")


class InterviewEvaluation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "interview_evaluations"
    __table_args__ = (
        UniqueConstraint("session_id", "question_id", name="uq_interview_evaluations_scope"),
        Index("ix_interview_evaluations_session_created", "session_id", "created_at"),
    )

    session_id: Mapped[UUID] = mapped_column(ForeignKey("interview_sessions.id", ondelete="CASCADE"))
    question_id: Mapped[UUID | None] = mapped_column(ForeignKey("interview_questions.id", ondelete="CASCADE"))
    rubric_version: Mapped[str] = mapped_column(String(32), default="deterministic_v1")
    dimensions: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)
    strengths: Mapped[list[str]] = mapped_column(JSONB, default=list)
    improvements: Mapped[list[str]] = mapped_column(JSONB, default=list)
    example_structure: Mapped[str] = mapped_column(Text)
    evidence: Mapped[list[str]] = mapped_column(JSONB, default=list)

    session: Mapped[InterviewSession] = relationship(back_populates="evaluations")
