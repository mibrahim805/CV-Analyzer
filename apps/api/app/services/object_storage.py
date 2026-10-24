from datetime import datetime, timedelta, timezone
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.api.problems import AppError
from app.core.config import settings


def _client(endpoint: str) -> Any:
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.OBJECT_STORAGE_ACCESS_KEY,
        aws_secret_access_key=settings.OBJECT_STORAGE_SECRET_KEY,
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def create_upload_url(
    object_key: str, media_type: str, byte_size: int, sha256: str
) -> tuple[str, dict[str, str], datetime]:
    expires_seconds = 10 * 60
    metadata = {"declared-size": str(byte_size), "sha256": sha256}
    url = _client(settings.OBJECT_STORAGE_PUBLIC_ENDPOINT).generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.OBJECT_STORAGE_BUCKET_QUARANTINE,
            "Key": object_key,
            "ContentType": media_type,
            "Metadata": metadata,
        },
        ExpiresIn=expires_seconds,
    )
    headers = {
        "Content-Type": media_type,
        "x-amz-meta-declared-size": str(byte_size),
        "x-amz-meta-sha256": sha256,
    }
    return url, headers, datetime.now(timezone.utc) + timedelta(seconds=expires_seconds)


def verify_quarantine_object(object_key: str, media_type: str, byte_size: int, sha256: str) -> None:
    try:
        result = _client(settings.OBJECT_STORAGE_ENDPOINT).head_object(
            Bucket=settings.OBJECT_STORAGE_BUCKET_QUARANTINE, Key=object_key
        )
    except ClientError as exc:
        raise AppError(
            409, "upload_missing", "The uploaded object could not be verified.", "Upload incomplete"
        ) from exc
    if result.get("ContentLength") != byte_size or result.get("ContentType") != media_type:
        raise AppError(
            409, "upload_metadata_mismatch", "Uploaded file metadata does not match the request.", "Conflict"
        )
    metadata = result.get("Metadata", {})
    if metadata.get("declared-size") != str(byte_size) or metadata.get("sha256") != sha256:
        raise AppError(409, "upload_metadata_mismatch", "Uploaded file checksum metadata does not match.", "Conflict")


def delete_quarantine_object(object_key: str) -> None:
    _client(settings.OBJECT_STORAGE_ENDPOINT).delete_object(
        Bucket=settings.OBJECT_STORAGE_BUCKET_QUARANTINE, Key=object_key
    )
