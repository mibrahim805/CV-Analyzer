from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_user, require_csrf
from app.api.problems import AppError
from app.db.session import get_db
from app.models.cv import CVDocument, CVExtraction, CVVersion, CVVersionStatus
from app.models.interview import (
    InterviewDifficulty,
    InterviewEvaluation,
    InterviewMode,
    InterviewQuestion,
    InterviewQuestionStatus,
    InterviewResponse,
    InterviewSession,
    InterviewSessionStatus,
)
from app.models.job import JobListing
from app.models.user import User
from app.schemas.common import Page
from app.schemas.interviews import (
    InterviewAnswerResponse,
    InterviewDetailResponse,
    InterviewEvaluationResponse,
    InterviewHistoryResponse,
    InterviewQuestionDetailResponse,
    InterviewQuestionResponse,
    InterviewResponseRequest,
    InterviewSessionResponse,
    InterviewStartRequest,
    InterviewTurnResponse,
)
from app.services.interview_coach import (
    aggregate_evaluations,
    evaluate_answer,
    evidence_lines,
    extract_cv_skills,
    first_question,
    next_question,
)
from app.services.object_storage import read_document_text

router = APIRouter(prefix="/interviews", tags=["interviews"], dependencies=[Depends(require_csrf)])


async def _owned_session(db: AsyncSession, session_id: UUID, user_id: UUID) -> InterviewSession:
    session = await db.scalar(
        select(InterviewSession)
        .options(
            selectinload(InterviewSession.questions).selectinload(InterviewQuestion.response),
            selectinload(InterviewSession.evaluations),
        )
        .where(InterviewSession.id == session_id, InterviewSession.user_id == user_id)
    )
    if session is None:
        raise AppError(404, "interview_not_found", "The interview session was not found.", "Not found")
    return session


def _current_question(session: InterviewSession) -> InterviewQuestion | None:
    return next(
        (
            question
            for question in session.questions
            if question.sequence == session.current_sequence and question.status == InterviewQuestionStatus.ASKED
        ),
        None,
    )


def _question_response(question: InterviewQuestion) -> InterviewQuestionResponse:
    return InterviewQuestionResponse.model_validate(question)


def _session_response(session: InterviewSession) -> InterviewSessionResponse:
    current = _current_question(session)
    return InterviewSessionResponse(
        id=session.id,
        cv_version_id=session.cv_version_id,
        listing_id=session.listing_id,
        mode=session.mode.value,
        difficulty=session.difficulty.value,
        status=session.status.value,
        max_questions=session.max_questions,
        current_sequence=session.current_sequence,
        started_at=session.started_at,
        completed_at=session.completed_at,
        current_question=_question_response(current) if current else None,
    )


def _detail_response(session: InterviewSession) -> InterviewDetailResponse:
    questions = [
        InterviewQuestionDetailResponse(
            **_question_response(question).model_dump(),
            response=InterviewAnswerResponse.model_validate(question.response) if question.response else None,
        )
        for question in session.questions
    ]
    return InterviewDetailResponse(
        **_session_response(session).model_dump(),
        questions=questions,
        evaluations=[InterviewEvaluationResponse.model_validate(evaluation) for evaluation in session.evaluations],
    )


async def _resolve_cv(db: AsyncSession, user_id: UUID, requested_version_id: UUID | None) -> tuple[CVVersion, str]:
    if requested_version_id:
        version = await db.scalar(
            select(CVVersion)
            .join(CVDocument, CVDocument.id == CVVersion.document_id)
            .where(
                CVVersion.id == requested_version_id,
                CVDocument.user_id == user_id,
                CVDocument.deleted_at.is_(None),
                CVVersion.status == CVVersionStatus.READY,
            )
        )
    else:
        version = await db.scalar(
            select(CVVersion)
            .join(CVDocument, CVDocument.id == CVVersion.document_id)
            .where(
                CVDocument.user_id == user_id,
                CVDocument.deleted_at.is_(None),
                CVVersion.status == CVVersionStatus.READY,
            )
            .order_by(CVVersion.created_at.desc())
        )
    if version is None:
        raise AppError(409, "cv_required", "Upload and process a CV before starting an interview.", "CV required")
    extraction = await db.scalar(select(CVExtraction).where(CVExtraction.version_id == version.id))
    if extraction is None:
        raise AppError(
            409, "cv_extraction_required", "The selected CV has no completed text extraction.", "CV required"
        )
    return version, read_document_text(extraction.text_object_key)


@router.post("", response_model=InterviewDetailResponse, status_code=status.HTTP_201_CREATED)
async def start_interview(
    payload: InterviewStartRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewDetailResponse:
    version, cv_text = await _resolve_cv(db, user.id, payload.cv_version_id)
    listing = None
    if payload.listing_id:
        listing = await db.scalar(select(JobListing).where(JobListing.id == payload.listing_id))
        if listing is None:
            raise AppError(404, "job_listing_not_found", "The selected job listing was not found.", "Not found")
    mode = InterviewMode(payload.mode)
    difficulty = InterviewDifficulty(payload.difficulty)
    skills = extract_cv_skills(cv_text)
    evidence = evidence_lines(cv_text, skills)
    plan = first_question(mode, difficulty, skills, listing.title if listing else None, evidence)
    now = datetime.now(timezone.utc)
    session = InterviewSession(
        id=uuid4(),
        user_id=user.id,
        cv_version_id=version.id,
        listing_id=listing.id if listing else None,
        mode=mode,
        difficulty=difficulty,
        status=InterviewSessionStatus.ACTIVE,
        max_questions=payload.max_questions,
        current_sequence=1,
        context_snapshot={
            "skills": skills,
            "evidence": evidence,
            "job_title": listing.title if listing else None,
            "job_description": (listing.description[:3000] if listing else None),
            "controller_version": "deterministic_coach_v1",
        },
        started_at=now,
    )
    session.questions.append(
        InterviewQuestion(
            sequence=1,
            prompt=plan.prompt,
            topic=plan.topic,
            intent=plan.intent,
            source_evidence=plan.source_evidence,
            status=InterviewQuestionStatus.ASKED,
            asked_at=now,
        )
    )
    db.add(session)
    await db.commit()
    return _detail_response(await _owned_session(db, session.id, user.id))


@router.get("", response_model=Page[InterviewHistoryResponse])
async def list_interviews(
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[InterviewHistoryResponse]:
    rows = list(
        (
            await db.scalars(
                select(InterviewSession)
                .options(selectinload(InterviewSession.questions).selectinload(InterviewQuestion.response))
                .where(InterviewSession.user_id == user.id)
                .order_by(InterviewSession.created_at.desc())
                .limit(limit + 1)
            )
        ).all()
    )
    history = [
        InterviewHistoryResponse(
            id=row.id,
            mode=row.mode.value,
            difficulty=row.difficulty.value,
            status=row.status.value,
            question_count=len(row.questions),
            answered_count=sum(question.response is not None for question in row.questions),
            started_at=row.started_at,
            completed_at=row.completed_at,
        )
        for row in rows[:limit]
    ]
    return Page(data=history, has_more=len(rows) > limit)


@router.get("/{session_id}", response_model=InterviewDetailResponse)
async def get_interview(
    session_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> InterviewDetailResponse:
    return _detail_response(await _owned_session(db, session_id, user.id))


@router.post("/{session_id}/responses", response_model=InterviewTurnResponse)
async def submit_interview_response(
    session_id: UUID,
    payload: InterviewResponseRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewTurnResponse:
    session = await _owned_session(db, session_id, user.id)
    if session.status != InterviewSessionStatus.ACTIVE:
        raise AppError(409, "interview_not_active", "This interview is no longer accepting answers.", "Conflict")
    question = _current_question(session)
    if question is None or question.response is not None:
        raise AppError(409, "question_not_available", "There is no unanswered question available.", "Conflict")
    now = datetime.now(timezone.utc)
    answer = payload.answer_text.strip()
    question.response = InterviewResponse(answer_text=answer, skipped=payload.skipped, submitted_at=now)
    question.status = InterviewQuestionStatus.SKIPPED if payload.skipped else InterviewQuestionStatus.ANSWERED
    question.answered_at = now
    current_evaluation = evaluate_answer(question.prompt, answer, session.mode, payload.skipped)
    db.add(
        InterviewEvaluation(
            session_id=session.id,
            question_id=question.id,
            rubric_version="deterministic_v1",
            dimensions=current_evaluation.dimensions,
            strengths=current_evaluation.strengths,
            improvements=current_evaluation.improvements,
            example_structure=current_evaluation.example_structure,
            evidence=current_evaluation.evidence,
        )
    )
    completed = payload.end_interview or question.sequence >= session.max_questions
    if completed:
        session.status = InterviewSessionStatus.COMPLETED
        session.completed_at = now
        evaluations = [
            evaluate_answer(item.prompt, item.response.answer_text, session.mode, item.response.skipped)
            for item in session.questions
            if item.response is not None
        ]
        overall = aggregate_evaluations(evaluations)
        db.add(
            InterviewEvaluation(
                session_id=session.id,
                question_id=None,
                rubric_version="deterministic_v1",
                dimensions=overall.dimensions,
                strengths=overall.strengths,
                improvements=overall.improvements,
                example_structure=overall.example_structure,
                evidence=overall.evidence,
            )
        )
    else:
        context = session.context_snapshot
        asked_topics = [item.topic for item in session.questions]
        snapshot_skills = context.get("skills", [])
        snapshot_evidence = context.get("evidence", [])
        snapshot_job_title = context.get("job_title")
        plan = next_question(
            session.mode,
            session.difficulty,
            [str(skill) for skill in snapshot_skills] if isinstance(snapshot_skills, list) else [],
            str(snapshot_job_title) if snapshot_job_title else None,
            [str(item) for item in snapshot_evidence] if isinstance(snapshot_evidence, list) else [],
            asked_topics,
            answer,
            question.topic,
        )
        session.current_sequence += 1
        session.questions.append(
            InterviewQuestion(
                sequence=session.current_sequence,
                prompt=plan.prompt,
                topic=plan.topic,
                intent=plan.intent,
                source_evidence=plan.source_evidence,
                status=InterviewQuestionStatus.ASKED,
                asked_at=now,
            )
        )
    await db.commit()
    refreshed = await _owned_session(db, session.id, user.id)
    evaluation = next((item for item in refreshed.evaluations if item.question_id == question.id), None)
    if completed:
        evaluation = next((item for item in refreshed.evaluations if item.question_id is None), evaluation)
    return InterviewTurnResponse(
        session=_session_response(refreshed),
        evaluation=InterviewEvaluationResponse.model_validate(evaluation) if evaluation else None,
        completed=completed,
    )


@router.post("/{session_id}/end", response_model=InterviewDetailResponse)
async def end_interview(
    session_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> InterviewDetailResponse:
    session = await _owned_session(db, session_id, user.id)
    if session.status == InterviewSessionStatus.ACTIVE:
        session.status = InterviewSessionStatus.COMPLETED
        session.completed_at = datetime.now(timezone.utc)
        if not any(evaluation.question_id is None for evaluation in session.evaluations):
            evaluations = [
                evaluate_answer(question.prompt, question.response.answer_text, session.mode, question.response.skipped)
                for question in session.questions
                if question.response is not None
            ]
            overall = aggregate_evaluations(evaluations)
            db.add(
                InterviewEvaluation(
                    session_id=session.id,
                    question_id=None,
                    rubric_version="deterministic_v1",
                    dimensions=overall.dimensions,
                    strengths=overall.strengths,
                    improvements=overall.improvements,
                    example_structure=overall.example_structure,
                    evidence=overall.evidence,
                )
            )
        await db.commit()
    return _detail_response(await _owned_session(db, session.id, user.id))
