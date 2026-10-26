from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class JobSearchRequest(BaseModel):
    target_roles: list[str] = Field(default_factory=list, max_length=8)
    locations: list[str] = Field(default_factory=list, max_length=8)
    work_arrangements: list[str] = Field(default_factory=list, max_length=4)
    experience_levels: list[str] = Field(default_factory=list, max_length=4)
    salary_min_minor: int | None = Field(default=None, ge=0)
    salary_max_minor: int | None = Field(default=None, ge=0)
    salary_currency: str | None = Field(default=None, min_length=3, max_length=3)
    include_salary_unknown: bool = True

    @model_validator(mode="after")
    def validate_salary_range(self) -> "JobSearchRequest":
        if (
            self.salary_min_minor is not None
            and self.salary_max_minor is not None
            and self.salary_min_minor > self.salary_max_minor
        ):
            raise ValueError("Minimum salary cannot exceed maximum salary")
        if not self.target_roles:
            raise ValueError("At least one target role is required")
        return self


class JobSourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    provider_key: str
    display_name: str
    terms_url: HttpUrl
    status: str
    enabled: bool
    last_health_at: datetime | None


class JobSearchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    target_roles: list[str]
    locations: list[str]
    work_arrangements: list[str]
    experience_levels: list[str]
    status: str
    provider_status: str
    result_count: int
    provider_count: int
    failure_code: str | None
    created_at: datetime
    completed_at: datetime | None


class JobSourceSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    provider_key: str
    display_name: str
    terms_url: HttpUrl


class JobListingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    company_name: str
    location: str | None
    work_arrangement: str | None
    experience_level: str | None
    description: str
    required_skills: list[str]
    optional_skills: list[str]
    salary_min_minor: int | None
    salary_max_minor: int | None
    salary_currency: str | None
    published_at: datetime | None
    last_verified_at: datetime
    canonical_url: HttpUrl
    status: str
    source: JobSourceSummary


class JobMatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    score: int = Field(ge=0, le=100)
    rank: int = Field(ge=1)
    matched_skills: list[str]
    missing_required_skills: list[str]
    evidence: dict[str, object]
    listing: JobListingResponse


class SavedJobCreateRequest(BaseModel):
    listing_id: UUID


class SavedJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    listing_id: UUID
    created_at: datetime
    listing: JobListingResponse
