import pytest
from pydantic import ValidationError

from app.schemas.jobs import JobSearchRequest


def test_job_search_allows_profile_derived_roles() -> None:
    assert JobSearchRequest().target_roles == []


def test_job_search_rejects_inverted_salary_range() -> None:
    with pytest.raises(ValidationError):
        JobSearchRequest(target_roles=["Backend Engineer"], salary_min_minor=200, salary_max_minor=100)
