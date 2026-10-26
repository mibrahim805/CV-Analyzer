from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ALLOWED_MEDIA_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}


class UploadInitiateRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    media_type: str
    byte_size: int = Field(gt=0)
    sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    label: str | None = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def media_matches_extension(self) -> "UploadInitiateRequest":
        expected = ALLOWED_MEDIA_TYPES.get(self.media_type)
        if expected is None:
            raise ValueError("Only PDF and DOCX files are supported")
        if not self.filename.lower().endswith(expected):
            raise ValueError("Filename extension does not match media type")
        if "/" in self.filename or "\\" in self.filename or "\x00" in self.filename:
            raise ValueError("Filename contains unsafe characters")
        return self

    @field_validator("sha256")
    @classmethod
    def normalize_sha256(cls, value: str) -> str:
        return value.lower()


class UploadCompleteRequest(BaseModel):
    byte_size: int = Field(gt=0)
    sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")


class CVVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    version_no: int
    original_name: str
    media_type: str
    byte_size: int
    sha256: str
    status: str
    failure_code: str | None
    created_at: datetime
    updated_at: datetime


class CVExtractionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version_id: UUID
    method: str
    text_sha256: str
    page_count: int | None
    character_count: int
    language: str | None
    created_at: datetime
    updated_at: datetime


class CVExtractionStatusResponse(BaseModel):
    version_id: UUID
    status: str
    failure_code: str | None
    extraction: CVExtractionResponse | None


class CVAnalysisCheck(BaseModel):
    key: str
    status: str
    detail: str
    evidence: str


class CVAnalysisResponse(BaseModel):
    version_id: UUID
    analysis_type: str
    metrics: dict[str, int]
    checks: list[CVAnalysisCheck]
    recommendations: list[str]
    generated_at: datetime


class CVDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str
    active_version_id: UUID | None
    created_at: datetime
    updated_at: datetime


class PresignedUpload(BaseModel):
    url: str
    method: str = "PUT"
    headers: dict[str, str]
    expires_at: datetime


class UploadInitiateResponse(BaseModel):
    document: CVDocumentResponse
    version: CVVersionResponse
    upload: PresignedUpload
