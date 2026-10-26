"""Adapters for approved public job feeds.

Providers return untrusted payloads. The search service normalizes and validates
them before anything is persisted or shown to a user.
"""

import html
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol

import httpx

from app.core.config import settings


@dataclass(frozen=True)
class SearchCriteria:
    target_roles: tuple[str, ...]
    locations: tuple[str, ...] = ()
    work_arrangements: tuple[str, ...] = ()
    experience_levels: tuple[str, ...] = ()
    salary_min_minor: int | None = None
    salary_max_minor: int | None = None
    salary_currency: str | None = None
    include_salary_unknown: bool = True


@dataclass(frozen=True)
class ProviderJob:
    external_id: str
    title: str
    company_name: str
    location: str | None
    work_arrangement: str | None
    experience_level: str | None
    description: str
    canonical_url: str
    published_at: datetime | None = None
    expires_at: datetime | None = None
    salary_min_minor: int | None = None
    salary_max_minor: int | None = None
    salary_currency: str | None = None
    source_payload: dict[str, object] | None = None


@dataclass(frozen=True)
class ProviderPage:
    provider_key: str
    jobs: list[ProviderJob] = field(default_factory=list)
    error_code: str | None = None


class JobProvider(Protocol):
    key: str
    display_name: str
    terms_url: str

    def search(self, criteria: SearchCriteria) -> ProviderPage:
        """Return genuine provider records or an explicit error code."""


def _configured_values(value: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in value.split(",") if item.strip())


def _plain_text(value: str | None) -> str:
    if not value:
        return ""
    without_tags = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(without_tags)).strip()


def _request_json(url: str, params: dict[str, str] | None = None) -> Any:
    try:
        with httpx.Client(timeout=settings.JOB_PROVIDER_TIMEOUT_SECONDS, follow_redirects=True) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError):
        return None


class GreenhouseProvider:
    key = "greenhouse"
    display_name = "Greenhouse public boards"
    terms_url = "https://developers.greenhouse.io/job-board.html"

    def __init__(self, board_tokens: tuple[str, ...]) -> None:
        self.board_tokens = board_tokens

    def search(self, criteria: SearchCriteria) -> ProviderPage:
        if not self.board_tokens:
            return ProviderPage(self.key, error_code="provider_unconfigured")
        jobs: list[ProviderJob] = []
        for board_token in self.board_tokens:
            payload = _request_json(
                f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs", {"content": "true"}
            )
            if not isinstance(payload, dict) or not isinstance(payload.get("jobs"), list):
                continue
            for raw in payload["jobs"]:
                if not isinstance(raw, dict):
                    continue
                location = raw.get("location") if isinstance(raw.get("location"), dict) else {}
                jobs.append(
                    ProviderJob(
                        external_id=str(raw.get("id", "")),
                        title=str(raw.get("title", "")).strip(),
                        company_name=f"Greenhouse board: {board_token}",
                        location=str(location.get("name", "")).strip() or None,
                        work_arrangement=None,
                        experience_level=None,
                        description=_plain_text(str(raw.get("content", ""))),
                        canonical_url=str(raw.get("absolute_url", "")).strip(),
                        published_at=_parse_datetime(raw.get("updated_at")),
                        source_payload={"provider": self.key, "board_token": board_token},
                    )
                )
        return ProviderPage(self.key, jobs=jobs, error_code=None if jobs else "provider_empty")


class LeverProvider:
    key = "lever"
    display_name = "Lever public postings"
    terms_url = "https://github.com/lever/postings-api"

    def __init__(self, site_names: tuple[str, ...]) -> None:
        self.site_names = site_names

    def search(self, criteria: SearchCriteria) -> ProviderPage:
        if not self.site_names:
            return ProviderPage(self.key, error_code="provider_unconfigured")
        jobs: list[ProviderJob] = []
        for site_name in self.site_names:
            payload = _request_json(f"https://api.lever.co/v0/postings/{site_name}", {"mode": "json"})
            if not isinstance(payload, list):
                continue
            for raw in payload:
                if not isinstance(raw, dict):
                    continue
                categories = raw.get("categories") if isinstance(raw.get("categories"), dict) else {}
                jobs.append(
                    ProviderJob(
                        external_id=str(raw.get("id", "")),
                        title=str(raw.get("text", "")).strip(),
                        company_name=f"Lever site: {site_name}",
                        location=str(categories.get("location", "")).strip() or None,
                        work_arrangement=str(raw.get("workplaceType", "")).strip() or None,
                        experience_level=None,
                        description=_plain_text(str(raw.get("descriptionPlain", raw.get("description", "")))),
                        canonical_url=str(raw.get("hostedUrl", raw.get("applyUrl", ""))).strip(),
                        published_at=_parse_datetime(raw.get("createdAt")),
                        source_payload={"provider": self.key, "site_name": site_name},
                    )
                )
        return ProviderPage(self.key, jobs=jobs, error_code=None if jobs else "provider_empty")


def _parse_datetime(value: object) -> datetime | None:
    if isinstance(value, int | float):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def configured_providers() -> list[JobProvider]:
    providers: list[JobProvider] = []
    greenhouse_tokens = _configured_values(settings.GREENHOUSE_BOARD_TOKENS)
    lever_sites = _configured_values(settings.LEVER_SITE_NAMES)
    if greenhouse_tokens:
        providers.append(GreenhouseProvider(greenhouse_tokens))
    if lever_sites:
        providers.append(LeverProvider(lever_sites))
    return providers
