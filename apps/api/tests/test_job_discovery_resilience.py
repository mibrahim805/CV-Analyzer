import httpx
import pytest
from datetime import datetime, timedelta, timezone

from app.api.routes.jobs import _expire_stale_search
from app.core.config import settings
from app.models.job import JobSearchQuery, JobSearchStatus
from app.services import job_providers
from app.services.cv_profile import CVProfileError, generate_professional_profile
from app.services.job_search import _provider_result_state


def test_provider_result_states_cover_success_empty_partial_and_failure() -> None:
    assert _provider_result_state([], 1, 2) == (JobSearchStatus.SUCCEEDED, "available", None)
    assert _provider_result_state(["provider_empty"], 0, 0) == (JobSearchStatus.SUCCEEDED, "empty", None)
    assert _provider_result_state(["provider_timeout"], 1, 2) == (JobSearchStatus.PARTIAL, "partial", None)
    assert _provider_result_state(["provider_timeout"], 0, 0) == (
        JobSearchStatus.FAILED,
        "unavailable",
        "provider_timeout",
    )


def test_provider_timeout_retries_are_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = 0

    class TimeoutClient:
        def __init__(self, **_: object) -> None:
            pass

        def __enter__(self) -> "TimeoutClient":
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def get(self, *_: object, **__: object) -> object:
            nonlocal calls
            calls += 1
            raise httpx.TimeoutException("provider timed out")

    monkeypatch.setattr(job_providers.httpx, "Client", TimeoutClient)
    monkeypatch.setattr(job_providers.time, "sleep", lambda _: None)
    monkeypatch.setattr(settings, "JOB_PROVIDER_MAX_RETRIES", 2)

    payload, error = job_providers._request_json("https://jobs.example.test")

    assert payload is None
    assert error == "provider_timeout"
    assert calls == 3


def test_unconfigured_provider_is_explicit() -> None:
    assert job_providers.GreenhouseProvider(()).search(job_providers.SearchCriteria(())).error_code == "provider_unconfigured"


def test_missing_ai_configuration_is_a_terminal_profile_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "AI_PROVIDER", "none")
    monkeypatch.setattr(settings, "AI_API_KEY", "")
    monkeypatch.setattr(settings, "AI_MODEL_NAME", "")

    with pytest.raises(CVProfileError, match="not configured") as exc_info:
        generate_professional_profile("Python and FastAPI")

    assert exc_info.value.code == "ai_provider_unconfigured"


def test_stale_search_is_expired_instead_of_polling_forever(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "JOB_SEARCH_TIMEOUT_SECONDS", 60)
    search = JobSearchQuery(
        status=JobSearchStatus.RUNNING,
        created_at=datetime.now(timezone.utc) - timedelta(minutes=2),
    )

    assert _expire_stale_search(search) is True
    assert search.status == JobSearchStatus.FAILED
    assert search.provider_status == "timeout"
    assert search.failure_code == "search_timeout"
    assert search.completed_at is not None
