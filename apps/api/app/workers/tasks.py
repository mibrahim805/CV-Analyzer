import hashlib
import socket
import struct
import tempfile
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import boto3
from botocore.config import Config
from celery import Task
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.cv import CVExtraction, CVProcessingJob, CVVersion, CVVersionStatus, ProcessingJobStatus
from app.services.document_extraction import ExtractionError, extract_document
from app.workers.celery_app import celery_app


def _storage() -> Any:
    return boto3.client(
        "s3",
        endpoint_url=settings.OBJECT_STORAGE_ENDPOINT,
        aws_access_key_id=settings.OBJECT_STORAGE_ACCESS_KEY,
        aws_secret_access_key=settings.OBJECT_STORAGE_SECRET_KEY,
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def _clamav_scan(stream: Any) -> str:
    with socket.create_connection((settings.CLAMAV_HOST, settings.CLAMAV_PORT), timeout=20) as sock:
        sock.sendall(b"zINSTREAM\0")
        while chunk := stream.read(64 * 1024):
            sock.sendall(struct.pack("!I", len(chunk)) + chunk)
        sock.sendall(struct.pack("!I", 0))
        response = sock.recv(4096).decode("utf-8", errors="replace").strip("\0\n")
    return response


@celery_app.task(  # type: ignore[untyped-decorator]
    bind=True,
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def scan_cv_document(_self: Task, version_id: str, job_id: str) -> None:
    engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)
    with Session(engine) as db:
        version = db.scalar(select(CVVersion).where(CVVersion.id == UUID(version_id)).with_for_update())
        job = db.scalar(select(CVProcessingJob).where(CVProcessingJob.id == UUID(job_id)).with_for_update())
        if version is None or job is None or job.status == ProcessingJobStatus.SUCCEEDED:
            return
        if version.status not in {CVVersionStatus.QUARANTINED, CVVersionStatus.SCANNING, CVVersionStatus.SCAN_FAILED}:
            return
        version.status = CVVersionStatus.SCANNING
        job.status = ProcessingJobStatus.RUNNING
        job.attempt += 1
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        object_key = version.object_key
        expected_sha256 = version.sha256

    storage = _storage()
    try:
        with tempfile.SpooledTemporaryFile(max_size=1024 * 1024, mode="w+b") as file:
            storage.download_fileobj(settings.OBJECT_STORAGE_BUCKET_QUARANTINE, object_key, file)
            file.seek(0)
            digest = hashlib.sha256(file.read()).hexdigest()
            if digest != expected_sha256:
                scan_result = "CHECKSUM_MISMATCH"
            else:
                file.seek(0)
                scan_result = _clamav_scan(file)

        extraction_job_id: UUID | None = None
        with Session(engine) as db:
            version = db.scalar(select(CVVersion).where(CVVersion.id == UUID(version_id)).with_for_update())
            job = db.scalar(select(CVProcessingJob).where(CVProcessingJob.id == UUID(job_id)).with_for_update())
            if version is None or job is None:
                return
            now = datetime.now(timezone.utc)
            if scan_result.endswith("OK"):
                storage.copy_object(
                    Bucket=settings.OBJECT_STORAGE_BUCKET_DOCUMENTS,
                    Key=version.object_key,
                    CopySource={"Bucket": settings.OBJECT_STORAGE_BUCKET_QUARANTINE, "Key": version.object_key},
                    MetadataDirective="COPY",
                )
                storage.delete_object(Bucket=settings.OBJECT_STORAGE_BUCKET_QUARANTINE, Key=version.object_key)
                version.status = CVVersionStatus.CLEAN
                version.scanned_at = now
                job.status = ProcessingJobStatus.SUCCEEDED
                extraction_job = CVProcessingJob(
                    version_id=version.id,
                    kind="text_extraction",
                    processor_version="deterministic-v1",
                    status=ProcessingJobStatus.QUEUED,
                    attempt=0,
                    available_at=now,
                    idempotency_key=f"{version.id}:text_extraction:deterministic-v1",
                )
                db.add(extraction_job)
                db.flush()
                extraction_job_id = extraction_job.id
            else:
                storage.delete_object(Bucket=settings.OBJECT_STORAGE_BUCKET_QUARANTINE, Key=version.object_key)
                version.status = CVVersionStatus.REJECTED
                version.failure_code = "malware_detected" if "FOUND" in scan_result else "integrity_check_failed"
                version.failure_detail = None
                job.status = ProcessingJobStatus.FAILED
                job.error_code = version.failure_code
            job.completed_at = now
            db.commit()
        if extraction_job_id is not None:
            try:
                extract_cv_document.delay(str(version_id), str(extraction_job_id))
            except Exception:
                # The queued job remains durable and can be dispatched by a retry/reconciler.
                pass
    except Exception:
        with Session(engine) as db:
            version = db.get(CVVersion, UUID(version_id))
            job = db.get(CVProcessingJob, UUID(job_id))
            if version and job:
                version.status = CVVersionStatus.SCAN_FAILED
                version.failure_code = "scanner_unavailable"
                job.status = ProcessingJobStatus.FAILED
                job.error_code = "scanner_unavailable"
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
        raise
    finally:
        engine.dispose()


@celery_app.task(  # type: ignore[untyped-decorator]
    bind=True,
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def extract_cv_document(_self: Task, version_id: str, job_id: str) -> None:
    engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)
    version_uuid, job_uuid = UUID(version_id), UUID(job_id)
    with Session(engine) as db:
        version = db.scalar(select(CVVersion).where(CVVersion.id == version_uuid).with_for_update())
        job = db.scalar(select(CVProcessingJob).where(CVProcessingJob.id == job_uuid).with_for_update())
        if version is None or job is None or job.status == ProcessingJobStatus.SUCCEEDED:
            engine.dispose()
            return
        if version.status not in {CVVersionStatus.CLEAN, CVVersionStatus.EXTRACTING, CVVersionStatus.EXTRACTION_FAILED}:
            engine.dispose()
            return
        version.status = CVVersionStatus.EXTRACTING
        job.status = ProcessingJobStatus.RUNNING
        job.attempt += 1
        job.started_at = datetime.now(timezone.utc)
        db.commit()
        media_type, object_key = version.media_type, version.object_key

    storage = _storage()
    try:
        with tempfile.SpooledTemporaryFile(max_size=2 * 1024 * 1024, mode="w+b") as file:
            storage.download_fileobj(settings.OBJECT_STORAGE_BUCKET_DOCUMENTS, object_key, file)
            file.seek(0)
            result = extract_document(file.read(), media_type)

        with Session(engine) as db:
            version = db.scalar(select(CVVersion).where(CVVersion.id == version_uuid).with_for_update())
            job = db.scalar(select(CVProcessingJob).where(CVProcessingJob.id == job_uuid).with_for_update())
            if version is None or job is None:
                return
            now = datetime.now(timezone.utc)
            if result.needs_ocr:
                version.status = CVVersionStatus.NEEDS_OCR
                version.failure_code = "ocr_required"
                job.status = ProcessingJobStatus.SUCCEEDED
                job.error_code = "ocr_required"
                job.completed_at = now
                db.commit()
                return

            text_digest = hashlib.sha256(result.text.encode("utf-8")).hexdigest()
            text_key = f"{object_key}/extracted.txt"
            storage.put_object(
                Bucket=settings.OBJECT_STORAGE_BUCKET_DOCUMENTS,
                Key=text_key,
                Body=result.text.encode("utf-8"),
                ContentType="text/plain; charset=utf-8",
                Metadata={"sha256": text_digest, "method": result.method},
            )
            db.add(
                CVExtraction(
                    version_id=version.id,
                    method=result.method,
                    text_object_key=text_key,
                    text_sha256=text_digest,
                    page_count=result.page_count,
                    character_count=len(result.text),
                )
            )
            version.status = CVVersionStatus.READY
            version.failure_code = None
            version.failure_detail = None
            job.status = ProcessingJobStatus.SUCCEEDED
            job.completed_at = now
            db.commit()
    except ExtractionError as exc:
        with Session(engine) as db:
            version = db.get(CVVersion, version_uuid)
            job = db.get(CVProcessingJob, job_uuid)
            if version and job:
                version.status = CVVersionStatus.EXTRACTION_FAILED
                version.failure_code = exc.code
                version.failure_detail = exc.detail
                job.status = ProcessingJobStatus.FAILED
                job.error_code = exc.code
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
    except Exception:
        with Session(engine) as db:
            version = db.get(CVVersion, version_uuid)
            job = db.get(CVProcessingJob, job_uuid)
            if version and job:
                version.status = CVVersionStatus.EXTRACTION_FAILED
                version.failure_code = "extractor_unavailable"
                job.status = ProcessingJobStatus.FAILED
                job.error_code = "extractor_unavailable"
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
        raise
    finally:
        engine.dispose()
