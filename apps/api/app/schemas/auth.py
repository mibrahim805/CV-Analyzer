from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)
    terms_version: str = Field(min_length=1, max_length=32)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    display_name: str
    headline: str | None
    country_code: str | None
    locale: str
    timezone: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    status: str
    email_verified_at: datetime | None
    profile: ProfileResponse
    created_at: datetime


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    headline: str | None = Field(default=None, max_length=180)
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    locale: str | None = Field(default=None, min_length=2, max_length=16)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)


class PreferencesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    target_roles: list[str]
    locations: list[str]
    work_arrangements: list[str]
    experience_levels: list[str]
    salary_min_minor: int | None
    salary_max_minor: int | None
    salary_currency: str | None
    include_salary_unknown: bool


class UpdatePreferencesRequest(PreferencesResponse):
    pass
