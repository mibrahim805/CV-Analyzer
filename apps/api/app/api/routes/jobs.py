from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_user, require_csrf
from app.api.problems import AppError
from app.db.session import get_db
from app.models.job import JobListing, JobMatch, JobSearchQuery, JobSearchStatus, SavedJob
from app.models.user import User
from app.schemas.common import Page
from app.schemas.jobs import (
    JobMatchResponse,
    JobSearchRequest,
    JobSearchResponse,
    SavedJobCreateRequest,
    SavedJobResponse,
)

router = APIRouter(prefix="", tags=["jobs"], dependencies=[Depends(require_csrf)])


async def _owned_search(db: AsyncSession, search_id: UUID, user_id: UUID) -> JobSearchQuery:
    search = await db.scalar(
        select(JobSearchQuery).where(JobSearchQuery.id == search_id, JobSearchQuery.user_id == user_id)
    )
    if search is None:
        raise AppError(404, "job_search_not_found", "The job search was not found.", "Not found")
    return search


@router.post("/job-searches", response_model=JobSearchResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_job_search(
    payload: JobSearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobSearchQuery:
    search = JobSearchQuery(
        user_id=user.id,
        target_roles=[role.strip() for role in payload.target_roles if role.strip()],
        locations=[location.strip() for location in payload.locations if location.strip()],
        work_arrangements=[value.strip().lower() for value in payload.work_arrangements if value.strip()],
        experience_levels=[value.strip().lower() for value in payload.experience_levels if value.strip()],
        salary_min_minor=payload.salary_min_minor,
        salary_max_minor=payload.salary_max_minor,
        salary_currency=payload.salary_currency.upper() if payload.salary_currency else None,
        include_salary_unknown=payload.include_salary_unknown,
        status=JobSearchStatus.QUEUED,
        provider_status="queued",
    )
    db.add(search)
    await db.commit()
    await db.refresh(search)
    try:
        from app.workers.tasks import run_job_search

        run_job_search.delay(str(search.id))
    except Exception:
        search.status = JobSearchStatus.FAILED
        search.provider_status = "unavailable"
        search.failure_code = "search_dispatch_failed"
        search.completed_at = datetime.now(timezone.utc)
        await db.commit()
    return search


@router.get("/job-searches", response_model=Page[JobSearchResponse])
async def list_job_searches(
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[JobSearchResponse]:
    rows = list(
        (
            await db.scalars(
                select(JobSearchQuery)
                .where(JobSearchQuery.user_id == user.id)
                .order_by(JobSearchQuery.created_at.desc())
                .limit(limit + 1)
            )
        ).all()
    )
    return Page(data=[JobSearchResponse.model_validate(row) for row in rows[:limit]], has_more=len(rows) > limit)


@router.get("/job-searches/{search_id}", response_model=JobSearchResponse)
async def get_job_search(
    search_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> JobSearchQuery:
    return await _owned_search(db, search_id, user.id)


@router.get("/job-searches/{search_id}/matches", response_model=Page[JobMatchResponse])
async def list_job_matches(
    search_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[JobMatchResponse]:
    search = await _owned_search(db, search_id, user.id)
    rows = list(
        (
            await db.scalars(
                select(JobMatch)
                .options(selectinload(JobMatch.listing).selectinload(JobListing.source))
                .where(JobMatch.search_id == search.id)
                .order_by(JobMatch.rank.asc())
                .limit(limit + 1)
            )
        ).all()
    )
    return Page(data=[JobMatchResponse.model_validate(row) for row in rows[:limit]], has_more=len(rows) > limit)


@router.post("/saved-jobs", response_model=SavedJobResponse, status_code=status.HTTP_201_CREATED)
async def save_job(
    payload: SavedJobCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SavedJob:
    listing = await db.scalar(select(JobListing).where(JobListing.id == payload.listing_id))
    if listing is None or listing.status == "removed":
        raise AppError(404, "job_listing_not_found", "The job listing was not found.", "Not found")
    saved = await db.scalar(
        select(SavedJob)
        .options(selectinload(SavedJob.listing).selectinload(JobListing.source))
        .where(SavedJob.user_id == user.id, SavedJob.listing_id == listing.id)
    )
    if saved is not None:
        return saved
    saved = SavedJob(user_id=user.id, listing_id=listing.id, listing=listing)
    db.add(saved)
    await db.commit()
    refreshed = await db.scalar(
        select(SavedJob)
        .options(selectinload(SavedJob.listing).selectinload(JobListing.source))
        .where(SavedJob.id == saved.id)
    )
    if refreshed is None:
        raise AppError(500, "saved_job_unavailable", "The saved job could not be loaded.", "Persistence error")
    return refreshed


@router.get("/saved-jobs", response_model=Page[SavedJobResponse])
async def list_saved_jobs(
    limit: int = Query(default=50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[SavedJobResponse]:
    rows = list(
        (
            await db.scalars(
                select(SavedJob)
                .options(selectinload(SavedJob.listing).selectinload(JobListing.source))
                .where(SavedJob.user_id == user.id)
                .order_by(SavedJob.created_at.desc())
                .limit(limit + 1)
            )
        ).all()
    )
    return Page(data=[SavedJobResponse.model_validate(row) for row in rows[:limit]], has_more=len(rows) > limit)


@router.delete("/saved-jobs/{saved_job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_job(
    saved_job_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    saved = await db.scalar(select(SavedJob).where(SavedJob.id == saved_job_id, SavedJob.user_id == user.id))
    if saved is None:
        raise AppError(404, "saved_job_not_found", "The saved job was not found.", "Not found")
    await db.delete(saved)
    await db.commit()
