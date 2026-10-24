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
from app.models.cv import CVProcessingJob, CVVersion, CVVersionStatus, ProcessingJobStatus
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
            else:
                storage.delete_object(Bucket=settings.OBJECT_STORAGE_BUCKET_QUARANTINE, Key=version.object_key)
                version.status = CVVersionStatus.REJECTED
                version.failure_code = "malware_detected" if "FOUND" in scan_result else "integrity_check_failed"
                version.failure_detail = None
                job.status = ProcessingJobStatus.FAILED
                job.error_code = version.failure_code
            job.completed_at = now
            db.commit()
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
