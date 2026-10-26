from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


Assertion = Literal["explicit", "supported", "uncertain"]


class ProfileEvidence(BaseModel):
    section: str = Field(min_length=1, max_length=80)
    quote: str = Field(min_length=1, max_length=600)
    assertion: Assertion
    confidence: float = Field(ge=0, le=1)


class ProfileSkill(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    normalized_name: str = Field(min_length=1, max_length=120)
    category: str = Field(default="other", min_length=1, max_length=80)
    assertion: Assertion
    evidence: list[ProfileEvidence] = Field(default_factory=list, max_length=8)


class ProfileExperience(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    company: str | None = Field(default=None, max_length=180)
    start_date: date | None = None
    end_date: date | None = None
    current: bool = False
    responsibilities: list[str] = Field(default_factory=list, max_length=20)
    achievements: list[str] = Field(default_factory=list, max_length=20)
    evidence: list[ProfileEvidence] = Field(default_factory=list, max_length=8)


class ProfileEducation(BaseModel):
    degree: str = Field(min_length=1, max_length=180)
    institution: str | None = Field(default=None, max_length=180)
    field_of_study: str | None = Field(default=None, max_length=180)
    start_date: date | None = None
    end_date: date | None = None
    evidence: list[ProfileEvidence] = Field(default_factory=list, max_length=8)


class ProfileProject(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str | None = Field(default=None, max_length=1200)
    technologies: list[ProfileSkill] = Field(default_factory=list, max_length=40)
    responsibilities: list[str] = Field(default_factory=list, max_length=20)
    outcomes: list[str] = Field(default_factory=list, max_length=20)
    links: list[str] = Field(default_factory=list, max_length=8)
    evidence: list[ProfileEvidence] = Field(default_factory=list, max_length=8)


class ProfileRole(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    rationale: str = Field(min_length=1, max_length=500)
    confidence: float = Field(ge=0, le=1)
    evidence: list[ProfileEvidence] = Field(default_factory=list, max_length=8)


class ProfessionalProfile(BaseModel):
    schema_version: str = "cv_profile_v1"
    summary: str | None = Field(default=None, max_length=1600)
    skills: list[ProfileSkill] = Field(default_factory=list, max_length=160)
    experiences: list[ProfileExperience] = Field(default_factory=list, max_length=40)
    education: list[ProfileEducation] = Field(default_factory=list, max_length=20)
    projects: list[ProfileProject] = Field(default_factory=list, max_length=40)
    certifications: list[str] = Field(default_factory=list, max_length=40)
    domain_expertise: list[str] = Field(default_factory=list, max_length=40)
    transferable_skills: list[ProfileSkill] = Field(default_factory=list, max_length=80)
    roles: list[ProfileRole] = Field(default_factory=list, max_length=20)


class CVProfessionalProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version_id: UUID
    status: str
    revision: int
    profile: ProfessionalProfile | None
    provider: str | None
    model_name: str | None
    prompt_version: str | None
    failure_code: str | None
    source_text_sha256: str | None
    created_at: datetime
    updated_at: datetime
    reviewed_at: datetime | None


class UpdateProfessionalProfileRequest(BaseModel):
    profile: ProfessionalProfile

    @field_validator("profile")
    @classmethod
    def require_roles_or_evidence(cls, value: ProfessionalProfile) -> ProfessionalProfile:
        if not value.skills and not value.experiences and not value.projects and not value.roles:
            raise ValueError("The profile must retain at least one supported professional detail")
        return value
