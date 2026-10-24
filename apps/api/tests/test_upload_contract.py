import pytest
from pydantic import ValidationError

from app.schemas.cv import UploadInitiateRequest


def request(**overrides: object) -> UploadInitiateRequest:
    values: dict[str, object] = {
        "filename": "resume.pdf",
        "media_type": "application/pdf",
        "byte_size": 1024,
        "sha256": "a" * 64,
    }
    values.update(overrides)
    return UploadInitiateRequest(**values)


def test_accepts_pdf_and_normalizes_checksum() -> None:
    upload = request(filename="Career CV.PDF", sha256="A" * 64)
    assert upload.sha256 == "a" * 64


def test_accepts_docx() -> None:
    upload = request(
        filename="career.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    assert upload.filename == "career.docx"


@pytest.mark.parametrize(
    ("filename", "media_type"),
    [
        ("resume.exe", "application/pdf"),
        ("resume.pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("../resume.pdf", "application/pdf"),
        ("resume.txt", "text/plain"),
    ],
)
def test_rejects_unsafe_or_mismatched_uploads(filename: str, media_type: str) -> None:
    with pytest.raises(ValidationError):
        request(filename=filename, media_type=media_type)


def test_rejects_invalid_checksum() -> None:
    with pytest.raises(ValidationError):
        request(sha256="not-a-sha")
