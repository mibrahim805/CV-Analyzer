"""Provider orchestration, normalization, persistence, and matching."""

import logging
import re
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.problems import AppError
from app.models.cv import CVDocument, CVExtraction, CVVersion, CVVersionStatus
from app.models.job import (
    JobListing,
    JobListingStatus,
    JobMatch,
    JobSearchQuery,
    JobSearchStatus,
    JobSource,
    JobSourceStatus,
)
from app.services.job_matching import NormalizedJob, normalize_provider_job, score_job
from app.services.job_providers import SearchCriteria, configured_providers
from app.services.object_storage import read_document_text

logger = logging.getLogger(__name__)


def _criteria(search: JobSearchQuery) -> SearchCriteria:
    return SearchCriteria(
        target_roles=tuple(search.target_roles or ()),
        locations=tuple(search.locations or ()),
        work_arrangements=tuple(search.work_arrangements or ()),
        experience_levels=tuple(search.experience_levels or ()),
        salary_min_minor=search.salary_min_minor,
        salary_max_minor=search.salary_max_minor,
        salary_currency=search.salary_currency,
        include_salary_unknown=search.include_salary_unknown,
    )


def _salary_allowed(job: NormalizedJob, criteria: SearchCriteria) -> bool:
    if criteria.salary_min_minor is not None and job.salary_max_minor is not None:
        if job.salary_max_minor < criteria.salary_min_minor:
            return False
    elif criteria.salary_min_minor is not None and not criteria.include_salary_unknown:
        return False
    if criteria.salary_max_minor is not None and job.salary_min_minor is not None:
        if job.salary_min_minor > criteria.salary_max_minor:
            return False
    elif criteria.salary_max_minor is not None and not criteria.include_salary_unknown:
        return False
    return True


def _known_filters_allowed(job: NormalizedJob, criteria: SearchCriteria) -> bool:
    if criteria.locations and job.location:
        location_matches = any(
            re.search(rf"\b{re.escape(location.lower())}\b", job.location.lower())
            for location in criteria.locations
        )
        remote_listing = "remote" in job.location.lower() or (job.work_arrangement or "") == "remote"
        if not location_matches and not remote_listing:
            return False
    if criteria.work_arrangements and job.work_arrangement:
        arrangement_matches = any(
            re.search(rf"\b{re.escape(arrangement.lower())}\b", job.work_arrangement)
            for arrangement in criteria.work_arrangements
        )
        if not arrangement_matches:
            return False
    if criteria.experience_levels and job.experience_level:
        experience_matches = any(
            re.search(rf"\b{re.escape(level.lower())}\b", job.experience_level)
            for level in criteria.experience_levels
        )
        if not experience_matches:
            return False
    return True


def _latest_cv_text(db: Session, user_id: UUID) -> str:
    extraction = db.scalar(
        select(CVExtraction)
        .join(CVVersion, CVVersion.id == CVExtraction.version_id)
        .join(CVDocument, CVDocument.id == CVVersion.document_id)
        .where(CVDocument.user_id == user_id, CVVersion.status == CVVersionStatus.READY)
        .order_by(CVVersion.created_at.desc())
    )
    if extraction is None:
        return ""
    try:
        return read_document_text(extraction.text_object_key)
    except AppError:
        logger.warning("job_search_cv_text_unavailable", extra={"user_id": str(user_id)})
        return ""


def _upsert_listing(db: Session, source: JobSource, job: NormalizedJob) -> JobListing:
    listing = db.scalar(
        select(JobListing).where(JobListing.source_id == source.id, JobListing.external_id == job.external_id)
    )
    now = datetime.now(timezone.utc)
    values = {
        "source_id": source.id,
        "external_id": job.external_id,
        "canonical_url": job.canonical_url,
        "title": job.title,
        "company_name": job.company_name,
        "location": job.location,
        "work_arrangement": job.work_arrangement,
        "experience_level": job.experience_level,
        "description": job.description,
        "required_skills": job.required_skills,
        "optional_skills": job.optional_skills,
        "salary_min_minor": job.salary_min_minor,
        "salary_max_minor": job.salary_max_minor,
        "salary_currency": job.salary_currency,
        "published_at": job.published_at,
        "expires_at": job.expires_at,
        "last_verified_at": now,
        "fingerprint": job.fingerprint,
        "status": JobListingStatus.ACTIVE,
        "source_payload": job.source_payload,
    }
    if listing is None:
        listing = JobListing(**values)
        db.add(listing)
        db.flush()
    else:
        for field, value in values.items():
            setattr(listing, field, value)
    return listing


def run_job_search(search_id: str) -> None:
    """Execute one durable search in a worker process."""
    from sqlalchemy import create_engine

    from app.core.config import settings

    engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)
    search_uuid = UUID(search_id)
    with Session(engine) as db:
        search = db.get(JobSearchQuery, search_uuid, with_for_update=True)
        if search is None or search.status == JobSearchStatus.SUCCEEDED:
            engine.dispose()
            return
        search.status = JobSearchStatus.RUNNING
        db.commit()
        criteria = _criteria(search)
        cv_text = _latest_cv_text(db, search.user_id)

        providers = configured_providers()
        if not providers:
            search.status = JobSearchStatus.SUCCEEDED
            search.provider_status = "unconfigured"
            search.provider_count = 0
            search.result_count = 0
            search.completed_at = datetime.now(timezone.utc)
            db.commit()
            engine.dispose()
            return

        pages = [provider.search(criteria) for provider in providers]
        successful_pages = [page for page in pages if page.error_code is None]
        errors = [page.error_code for page in pages if page.error_code]
        seen_fingerprints: set[str] = set()
        scored: list[tuple[JobListing, int, list[str], list[str], dict[str, object]]] = []
        for provider, page in zip(providers, pages, strict=True):
            source = db.scalar(select(JobSource).where(JobSource.provider_key == provider.key))
            if source is None:
                source = JobSource(
                    provider_key=provider.key,
                    display_name=provider.display_name,
                    terms_url=provider.terms_url,
                    status=JobSourceStatus.ACTIVE,
                    enabled=True,
                )
                db.add(source)
                db.flush()
            source.last_health_at = datetime.now(timezone.utc)
            source.status = JobSourceStatus.ACTIVE if page.error_code is None else JobSourceStatus.DEGRADED
            source.last_error_code = page.error_code
            for raw_job in page.jobs:
                normalized = normalize_provider_job(raw_job)
                if (
                    normalized is None
                    or normalized.fingerprint in seen_fingerprints
                    or not _salary_allowed(normalized, criteria)
                    or not _known_filters_allowed(normalized, criteria)
                ):
                    continue
                seen_fingerprints.add(normalized.fingerprint)
                listing = _upsert_listing(db, source, normalized)
                score, matched, missing, evidence = score_job(normalized, criteria, cv_text)
                scored.append((listing, score, matched, missing, evidence))

        db.execute(delete(JobMatch).where(JobMatch.search_id == search.id))
        scored.sort(key=lambda row: (-row[1], row[0].last_verified_at))
        for rank, (listing, score, matched, missing, evidence) in enumerate(scored, start=1):
            db.add(
                JobMatch(
                    search_id=search.id,
                    listing_id=listing.id,
                    score=score,
                    rank=rank,
                    matched_skills=matched,
                    missing_required_skills=missing,
                    evidence=evidence,
                )
            )
        search.status = JobSearchStatus.PARTIAL if errors and scored else JobSearchStatus.SUCCEEDED
        search.provider_status = "partial" if errors and successful_pages else "unavailable" if errors else "available"
        search.provider_count = len(providers)
        search.result_count = len(scored)
        search.failure_code = errors[0] if errors and not scored else None
        search.completed_at = datetime.now(timezone.utc)
        db.commit()
    engine.dispose()
