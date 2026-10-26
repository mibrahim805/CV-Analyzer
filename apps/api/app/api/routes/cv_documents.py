from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, require_csrf
from app.api.problems import AppError
from app.core.config import settings
from app.db.session import get_db
from app.models.cv import (
    CVDocument,
    CVExtraction,
    CVProcessingJob,
    CVProfessionalProfile,
    CVProfileStatus,
    CVVersion,
    CVVersionStatus,
    ProcessingJobStatus,
)
from app.models.user import User
from app.schemas.common import Page
from app.schemas.cv import (
    CVAnalysisCheck,
    CVAnalysisResponse,
    CVDocumentResponse,
    CVExtractionStatusResponse,
    CVVersionResponse,
    PresignedUpload,
    UploadCompleteRequest,
    UploadInitiateRequest,
    UploadInitiateResponse,
)
from app.schemas.cv_profile import CVProfessionalProfileResponse, UpdateProfessionalProfileRequest
from app.services.cv_evaluation import evaluate_cv_text
from app.services.object_storage import (
    create_upload_url,
    read_document_text,
    read_original_document,
    verify_quarantine_object,
)

router = APIRouter(prefix="/cv-documents", tags=["CV documents"], dependencies=[Depends(require_csrf)])


async def _owned_document(db: AsyncSession, document_id: UUID, user_id: UUID) -> CVDocument:
    document = await db.scalar(
        select(CVDocument).where(
            CVDocument.id == document_id, CVDocument.user_id == user_id, CVDocument.deleted_at.is_(None)
        )
    )
    if document is None:
        raise AppError(404, "document_not_found", "The CV document was not found.", "Not found")
    return document


@router.post("/uploads", response_model=UploadInitiateResponse, status_code=status.HTTP_201_CREATED)
async def initiate_upload(
    payload: UploadInitiateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadInitiateResponse:
    if payload.byte_size > settings.MAX_CV_BYTES:
        raise AppError(
            413, "file_too_large", f"CV files may not exceed {settings.MAX_CV_BYTES} bytes.", "File too large"
        )
    document_id, version_id = uuid4(), uuid4()
    safe_label = payload.label or Path(payload.filename).stem[:120]
    object_key = f"users/{user.id}/documents/{document_id}/versions/{version_id}/original"
    document = CVDocument(id=document_id, user_id=user.id, label=safe_label, active_version_id=version_id)
    version = CVVersion(
        id=version_id,
        document_id=document_id,
        version_no=1,
        original_name=payload.filename,
        media_type=payload.media_type,
        byte_size=payload.byte_size,
        sha256=payload.sha256,
        object_key=object_key,
    )
    db.add_all([document, version])
    await db.commit()
    url, headers, expires_at = create_upload_url(object_key, payload.media_type, payload.byte_size, payload.sha256)
    return UploadInitiateResponse(
        document=CVDocumentResponse.model_validate(document),
        version=CVVersionResponse.model_validate(version),
        upload=PresignedUpload(url=url, headers=headers, expires_at=expires_at),
    )


@router.post("/{document_id}/versions/{version_id}/complete", response_model=CVVersionResponse, status_code=202)
async def complete_upload(
    document_id: UUID,
    version_id: UUID,
    payload: UploadCompleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CVVersion:
    await _owned_document(db, document_id, user.id)
    version = await db.scalar(select(CVVersion).where(CVVersion.id == version_id, CVVersion.document_id == document_id))
    if version is None:
        raise AppError(404, "version_not_found", "The CV version was not found.", "Not found")
    if version.status == CVVersionStatus.QUARANTINED:
        return version
    if version.status != CVVersionStatus.AWAITING_UPLOAD:
        raise AppError(
            409,
            "invalid_document_state",
            "This version cannot be finalized in its current state.",
            "Conflict",
        )
    if payload.byte_size != version.byte_size or payload.sha256.lower() != version.sha256:
        raise AppError(
            409, "upload_metadata_mismatch", "Completion metadata does not match the upload request.", "Conflict"
        )
    verify_quarantine_object(version.object_key, version.media_type, version.byte_size, version.sha256)
    version.status = CVVersionStatus.QUARANTINED
    job = CVProcessingJob(
        version_id=version.id,
        kind="malware_scan",
        processor_version="clamav-v1",
        status=ProcessingJobStatus.QUEUED,
        attempt=0,
        available_at=datetime.now(timezone.utc),
        idempotency_key=f"{version.id}:malware_scan:clamav-v1",
    )
    db.add(job)
    await db.commit()
    from app.workers.tasks import scan_cv_document

    scan_cv_document.delay(str(version.id), str(job.id))
    return version


@router.get("", response_model=Page[CVDocumentResponse])
async def list_documents(
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[CVDocumentResponse]:
    rows = list(
        (await db.scalars(
            select(CVDocument)
            .where(CVDocument.user_id == user.id, CVDocument.deleted_at.is_(None))
            .order_by(CVDocument.created_at.desc())
            .limit(limit + 1)
        )).all()
    )
    has_more = len(rows) > limit
    return Page(data=[CVDocumentResponse.model_validate(row) for row in rows[:limit]], has_more=has_more)


@router.get("/{document_id}", response_model=CVDocumentResponse)
async def get_document(
    document_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> CVDocument:
    return await _owned_document(db, document_id, user.id)


@router.get("/{document_id}/versions/{version_id}", response_model=CVVersionResponse)
async def get_version(
    document_id: UUID,
    version_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CVVersion:
    await _owned_document(db, document_id, user.id)
    version = await db.scalar(select(CVVersion).where(CVVersion.id == version_id, CVVersion.document_id == document_id))
    if version is None:
        raise AppError(404, "version_not_found", "The CV version was not found.", "Not found")
    return version


@router.get("/{document_id}/versions/{version_id}/extraction", response_model=CVExtractionStatusResponse)
async def get_extraction_status(
    document_id: UUID,
    version_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CVExtractionStatusResponse:
    await _owned_document(db, document_id, user.id)
    version = await db.scalar(select(CVVersion).where(CVVersion.id == version_id, CVVersion.document_id == document_id))
    if version is None:
        raise AppError(404, "version_not_found", "The CV version was not found.", "Not found")
    extraction = await db.scalar(select(CVExtraction).where(CVExtraction.version_id == version.id))
    return CVExtractionStatusResponse(
        version_id=version.id,
        status=version.status.value,
        failure_code=version.failure_code,
        extraction=extraction,
    )


@router.get("/{document_id}/versions/{version_id}/profile", response_model=CVProfessionalProfileResponse)
async def get_professional_profile(
    document_id: UUID,
    version_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CVProfessionalProfile:
    await _owned_document(db, document_id, user.id)
    version = await db.scalar(select(CVVersion).where(CVVersion.id == version_id, CVVersion.document_id == document_id))
    if version is None:
        raise AppError(404, "version_not_found", "The CV version was not found.", "Not found")
    profile = await db.scalar(select(CVProfessionalProfile).where(CVProfessionalProfile.version_id == version.id))
    if profile is None:
        raise AppError(409, "profile_not_ready", "The professional profile is still being prepared.", "Profile not ready")
    return profile


@router.put("/{document_id}/versions/{version_id}/profile", response_model=CVProfessionalProfileResponse)
async def update_professional_profile(
    document_id: UUID,
    version_id: UUID,
    payload: UpdateProfessionalProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CVProfessionalProfile:
    await _owned_document(db, document_id, user.id)
    version = await db.scalar(select(CVVersion).where(CVVersion.id == version_id, CVVersion.document_id == document_id))
    if version is None:
        raise AppError(404, "version_not_found", "The CV version was not found.", "Not found")
    profile = await db.scalar(select(CVProfessionalProfile).where(CVProfessionalProfile.version_id == version.id).with_for_update())
    if profile is None or profile.status not in {CVProfileStatus.READY, CVProfileStatus.NEEDS_REVIEW}:
        raise AppError(409, "profile_not_ready", "The professional profile is not ready to edit.", "Profile not ready")
    profile.profile = payload.profile.model_dump(mode="json")
    profile.revision += 1
    profile.status = CVProfileStatus.NEEDS_REVIEW
    profile.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/{document_id}/versions/{version_id}/profile/refresh", response_model=CVProfessionalProfileResponse, status_code=202)
async def refresh_professional_profile(
    document_id: UUID,
    version_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CVProfessionalProfile:
    await _owned_document(db, document_id, user.id)
    version = await db.scalar(select(CVVersion).where(CVVersion.id == version_id, CVVersion.document_id == document_id))
    if version is None:
        raise AppError(404, "version_not_found", "The CV version was not found.", "Not found")
    if version.status != CVVersionStatus.READY:
        raise AppError(409, "cv_not_ready", "The CV must finish extraction before profile generation.", "CV not ready")
    extraction = await db.scalar(select(CVExtraction).where(CVExtraction.version_id == version.id))
    if extraction is None:
        raise AppError(409, "extraction_not_ready", "The extracted CV text is not available yet.", "Extraction not ready")
    profile = await db.scalar(select(CVProfessionalProfile).where(CVProfessionalProfile.version_id == version.id).with_for_update())
    if profile is None:
        profile = CVProfessionalProfile(version_id=version.id)
        db.add(profile)
        await db.flush()
    profile.status = CVProfileStatus.AWAITING_MODEL
    profile.failure_code = None
    profile.source_text_sha256 = extraction.text_sha256
    await db.commit()
    from app.workers.tasks import build_cv_profile

    build_cv_profile.delay(str(version.id))
    return profile


@router.get("/{document_id}/versions/{version_id}/download")
async def download_original(
    document_id: UUID,
    version_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Return the private original only after ownership and malware processing checks."""
    await _owned_document(db, document_id, user.id)
    version = await db.scalar(select(CVVersion).where(CVVersion.id == version_id, CVVersion.document_id == document_id))
    if version is None:
        raise AppError(404, "version_not_found", "The CV version was not found.", "Not found")
    if version.status not in {
        CVVersionStatus.CLEAN,
        CVVersionStatus.EXTRACTING,
        CVVersionStatus.NEEDS_OCR,
        CVVersionStatus.READY,
        CVVersionStatus.EXTRACTION_FAILED,
    }:
        raise AppError(409, "cv_not_available", "The original CV is not available until security processing succeeds.", "CV not available")

    content = read_original_document(version.object_key)
    safe_name = Path(version.original_name).name.replace('"', "").replace("\r", "").replace("\n", "") or "cv"
    disposition = f"inline; filename=\"{safe_name}\"; filename*=UTF-8''{quote(safe_name)}"
    return Response(
        content=content,
        media_type=version.media_type,
        headers={
            "Content-Disposition": disposition,
            "Content-Length": str(len(content)),
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/{document_id}/versions/{version_id}/analyze", response_model=CVAnalysisResponse)
async def analyze_cv(
    document_id: UUID,
    version_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CVAnalysisResponse:
    await _owned_document(db, document_id, user.id)
    version = await db.scalar(select(CVVersion).where(CVVersion.id == version_id, CVVersion.document_id == document_id))
    if version is None:
        raise AppError(404, "version_not_found", "The CV version was not found.", "Not found")
    extraction = await db.scalar(select(CVExtraction).where(CVExtraction.version_id == version.id))
    if version.status != CVVersionStatus.READY or extraction is None:
        raise AppError(409, "cv_not_ready", "The CV must finish text extraction before analysis.", "CV not ready")
    text = read_document_text(extraction.text_object_key)
    evaluation = evaluate_cv_text(text)
    return CVAnalysisResponse(
        version_id=version.id,
        analysis_type="deterministic_foundation_v1",
        metrics=evaluation.metrics,
        # The evaluator returns lightweight dataclasses; map their fields into
        # the public API response model explicitly.
        checks=[
            CVAnalysisCheck(key=check.key, status=check.status, detail=check.detail, evidence=check.evidence)
            for check in evaluation.checks
        ],
        recommendations=evaluation.recommendations,
        generated_at=datetime.now(timezone.utc),
    )


@router.delete("/{document_id}", status_code=202)
async def delete_document(
    document_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    document = await _owned_document(db, document_id, user.id)
    document.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "deletion_scheduled"}
