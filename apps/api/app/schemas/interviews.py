from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class InterviewStartRequest(BaseModel):
    mode: str = Field(pattern=r"^(general|technical|behavioral|project|job_specific|hr)$")
    difficulty: str = Field(default="medium", pattern=r"^(easy|medium|hard)$")
    cv_version_id: UUID | None = None
    listing_id: UUID | None = None
    max_questions: int = Field(default=6, ge=3, le=12)


class InterviewResponseRequest(BaseModel):
    answer_text: str = Field(default="", max_length=12000)
    skipped: bool = False
    end_interview: bool = False

    @model_validator(mode="after")
    def require_answer_or_skip(self) -> "InterviewResponseRequest":
        if not self.skipped and not self.answer_text.strip():
            raise ValueError("Provide an answer or mark the question as skipped")
        if self.skipped and self.answer_text.strip():
            raise ValueError("A skipped question cannot include answer text")
        return self


class InterviewQuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sequence: int
    prompt: str
    topic: str
    intent: str
    source_evidence: list[str]
    status: str
    asked_at: datetime
    answered_at: datetime | None


class InterviewAnswerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    answer_text: str
    skipped: bool
    submitted_at: datetime


class InterviewQuestionDetailResponse(InterviewQuestionResponse):
    response: InterviewAnswerResponse | None = None


class InterviewEvaluationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    question_id: UUID | None
    rubric_version: str
    dimensions: dict[str, object]
    strengths: list[str]
    improvements: list[str]
    example_structure: str
    evidence: list[str]
    created_at: datetime


class InterviewSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cv_version_id: UUID | None
    listing_id: UUID | None
    mode: str
    difficulty: str
    status: str
    max_questions: int
    current_sequence: int
    started_at: datetime
    completed_at: datetime | None
    current_question: InterviewQuestionResponse | None = None


class InterviewDetailResponse(InterviewSessionResponse):
    questions: list[InterviewQuestionDetailResponse]
    evaluations: list[InterviewEvaluationResponse]


class InterviewTurnResponse(BaseModel):
    session: InterviewSessionResponse
    evaluation: InterviewEvaluationResponse | None = None
    completed: bool


class InterviewHistoryResponse(BaseModel):
    id: UUID
    mode: str
    difficulty: str
    status: str
    question_count: int
    answered_count: int
    started_at: datetime
    completed_at: datetime | None
