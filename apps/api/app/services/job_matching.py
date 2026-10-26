"""Normalize provider jobs and calculate transparent relevance indicators."""

import re
from dataclasses import dataclass
from hashlib import sha256
from urllib.parse import urlparse

from app.services.job_providers import ProviderJob, SearchCriteria

KNOWN_SKILLS = {
    "python", "java", "javascript", "typescript", "go", "rust", "php", "ruby", "c#", "c++",
    "fastapi", "django", "flask", "react", "next.js", "vue", "angular", "node.js", "express",
    "postgresql", "postgres", "mysql", "sqlite", "redis", "mongodb", "sql", "graphql", "rest",
    "docker", "kubernetes", "aws", "azure", "gcp", "terraform", "linux", "git", "ci/cd",
    "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch", "spark", "airflow", "kafka",
}


@dataclass(frozen=True)
class NormalizedJob:
    external_id: str
    title: str
    company_name: str
    location: str | None
    work_arrangement: str | None
    experience_level: str | None
    description: str
    canonical_url: str
    required_skills: list[str]
    optional_skills: list[str]
    salary_min_minor: int | None
    salary_max_minor: int | None
    salary_currency: str | None
    published_at: object
    expires_at: object
    fingerprint: str
    source_payload: dict[str, object] | None


def _skills(text: str) -> list[str]:
    lower = text.lower()
    return sorted(skill for skill in KNOWN_SKILLS if re.search(rf"(?<![\w+#]){re.escape(skill)}(?![\w+#])", lower))


def _section(text: str, markers: tuple[str, ...]) -> str:
    lower = text.lower()
    positions = [lower.find(marker) for marker in markers if lower.find(marker) >= 0]
    if not positions:
        return ""
    return lower[min(positions) : min(len(text), min(positions) + 2400)]


def normalize_provider_job(job: ProviderJob) -> NormalizedJob | None:
    parsed = urlparse(job.canonical_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    title = job.title.strip()
    company = job.company_name.strip()
    description = job.description.strip()
    if not title or not company or not description or not job.external_id.strip():
        return None
    required = _skills(_section(description, ("required", "requirements", "must have", "qualifications")))
    all_skills = _skills(description)
    optional = _skills(_section(description, ("preferred", "nice to have", "bonus", "desired")))
    required = sorted(set(required) | (set(all_skills) - set(optional)))
    fingerprint_value = "|".join((company.lower(), title.lower(), (job.location or "").lower(), description.lower()))
    return NormalizedJob(
        external_id=job.external_id.strip(),
        title=title,
        company_name=company,
        location=job.location.strip() if job.location else None,
        work_arrangement=job.work_arrangement.strip().lower() if job.work_arrangement else None,
        experience_level=job.experience_level.strip().lower() if job.experience_level else None,
        description=description,
        canonical_url=job.canonical_url,
        required_skills=required,
        optional_skills=optional,
        salary_min_minor=job.salary_min_minor,
        salary_max_minor=job.salary_max_minor,
        salary_currency=job.salary_currency.lower() if job.salary_currency else None,
        published_at=job.published_at,
        expires_at=job.expires_at,
        fingerprint=sha256(fingerprint_value.encode("utf-8")).hexdigest(),
        source_payload=job.source_payload,
    )


def _overlap(left: str, right: str) -> bool:
    left_words = {word for word in re.findall(r"[a-z0-9+#.]+", left.lower()) if len(word) > 2}
    right_words = {word for word in re.findall(r"[a-z0-9+#.]+", right.lower()) if len(word) > 2}
    return bool(left_words & right_words)


def score_job(
    job: NormalizedJob, criteria: SearchCriteria, cv_text: str
) -> tuple[int, list[str], list[str], dict[str, object]]:
    cv_skills = set(_skills(cv_text))
    required = set(job.required_skills)
    optional = set(job.optional_skills)
    matched = sorted((required | optional) & cv_skills)
    missing = sorted(required - cv_skills)
    skill_score = 0.0 if not required else (len(required & cv_skills) / len(required)) * 50
    if not required and optional:
        skill_score = (len(optional & cv_skills) / len(optional)) * 35
    role_score = 20 if any(_overlap(job.title, role) for role in criteria.target_roles) else 0
    location_score = 10 if not criteria.locations or not job.location or any(
        _overlap(job.location, location) for location in criteria.locations
    ) else 0
    arrangement_score = 10 if not criteria.work_arrangements or not job.work_arrangement or any(
        _overlap(job.work_arrangement, arrangement) for arrangement in criteria.work_arrangements
    ) else 0
    experience_score = 10 if not criteria.experience_levels or not job.experience_level or any(
        _overlap(job.experience_level, level) for level in criteria.experience_levels
    ) else 0
    score = min(100, round(skill_score + role_score + location_score + arrangement_score + experience_score))
    evidence: dict[str, object] = {
        "formula_version": "job_match_v1",
        "dimensions": {
            "required_skill_coverage": round(skill_score, 2),
            "role_similarity": role_score,
            "location_alignment": location_score,
            "work_arrangement_alignment": arrangement_score,
            "experience_alignment": experience_score,
        },
        "notes": [
            "Relevance indicator only; it is not a prediction of hiring success.",
            "Unknown provider fields are not treated as a mismatch.",
        ],
    }
    return score, matched, missing, evidence
