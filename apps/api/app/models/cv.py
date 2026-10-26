import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class CVVersionStatus(str, enum.Enum):
    AWAITING_UPLOAD = "awaiting_upload"
    QUARANTINED = "quarantined"
    SCANNING = "scanning"
    SCAN_FAILED = "scan_failed"
    REJECTED = "rejected"
    CLEAN = "clean"
    EXTRACTING = "extracting"
    NEEDS_OCR = "needs_ocr"
    READY = "ready"
    EXTRACTION_FAILED = "extraction_failed"
    DELETED = "deleted"


class ProcessingJobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class CVDocument(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cv_documents"
    __table_args__ = (Index("ix_cv_documents_user_created", "user_id", "created_at"),)

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(120))
    active_version_id: Mapped[UUID | None]
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    versions: Mapped[list["CVVersion"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class CVVersion(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cv_versions"
    __table_args__ = (
        UniqueConstraint("document_id", "version_no", name="uq_cv_versions_document_version"),
        Index("ix_cv_versions_status_updated", "status", "updated_at"),
    )

    document_id: Mapped[UUID] = mapped_column(ForeignKey("cv_documents.id", ondelete="CASCADE"))
    version_no: Mapped[int] = mapped_column(Integer)
    original_name: Mapped[str] = mapped_column(String(255))
    media_type: Mapped[str] = mapped_column(String(100))
    byte_size: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))
    object_key: Mapped[str] = mapped_column(String(512), unique=True)
    status: Mapped[CVVersionStatus] = mapped_column(
        Enum(CVVersionStatus, name="cv_version_status"), default=CVVersionStatus.AWAITING_UPLOAD
    )
    failure_code: Mapped[str | None] = mapped_column(String(64))
    failure_detail: Mapped[str | None] = mapped_column(Text)
    scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    document: Mapped[CVDocument] = relationship(back_populates="versions")
    extraction: Mapped["CVExtraction | None"] = relationship(
        back_populates="version", cascade="all, delete-orphan", uselist=False
    )


class CVExtraction(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cv_extractions"
    __table_args__ = (
        UniqueConstraint("version_id", name="uq_cv_extractions_version"),
        Index("ix_cv_extractions_method_created", "method", "created_at"),
    )

    version_id: Mapped[UUID] = mapped_column(ForeignKey("cv_versions.id", ondelete="CASCADE"))
    method: Mapped[str] = mapped_column(String(32))
    text_object_key: Mapped[str] = mapped_column(String(512), unique=True)
    text_sha256: Mapped[str] = mapped_column(String(64))
    page_count: Mapped[int | None] = mapped_column(Integer)
    character_count: Mapped[int] = mapped_column(Integer)
    language: Mapped[str | None] = mapped_column(String(16))

    version: Mapped[CVVersion] = relationship(back_populates="extraction")


class CVProcessingJob(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cv_processing_jobs"
    __table_args__ = (
        Index("ix_processing_jobs_claim", "status", "available_at"),
    )

    version_id: Mapped[UUID] = mapped_column(ForeignKey("cv_versions.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32))
    processor_version: Mapped[str] = mapped_column(String(32))
    status: Mapped[ProcessingJobStatus] = mapped_column(
        Enum(ProcessingJobStatus, name="processing_job_status"), default=ProcessingJobStatus.QUEUED
    )
    attempt: Mapped[int] = mapped_column(Integer, default=0)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(64))
