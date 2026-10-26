from app.services.job_matching import normalize_provider_job, score_job
from app.services.job_providers import ProviderJob, SearchCriteria


def sample_job() -> ProviderJob:
    return ProviderJob(
        external_id="job-1",
        title="Backend Engineer",
        company_name="Example Co",
        location="Remote",
        work_arrangement="remote",
        experience_level="mid",
        description=(
            "Required: Python, FastAPI, PostgreSQL. Preferred: Docker. "
            "Build REST services for our customers."
        ),
        canonical_url="https://jobs.example.com/job-1",
    )


def test_normalization_rejects_unsafe_urls_and_extracts_skills() -> None:
    job = normalize_provider_job(sample_job())
    assert job is not None
    assert "python" in job.required_skills
    assert "docker" in job.optional_skills
    unsafe = ProviderJob(**{**sample_job().__dict__, "canonical_url": "javascript:alert(1)"})
    assert normalize_provider_job(unsafe) is None


def test_matching_is_explainable_and_reports_missing_skills() -> None:
    job = normalize_provider_job(sample_job())
    assert job is not None
    score, matched, missing, evidence = score_job(
        job,
        SearchCriteria(target_roles=("Backend Engineer",), locations=("Remote",), work_arrangements=("remote",)),
        "Python and FastAPI developer",
    )
    assert score > 0
    assert matched == ["fastapi", "python"]
    assert "postgresql" in missing
    assert evidence["formula_version"] == "job_match_v1"


def test_matching_uses_profile_roles_and_excludes_uncertain_skills() -> None:
    job = normalize_provider_job(sample_job())
    assert job is not None
    profile = {
        "skills": [
            {"name": "Python", "normalized_name": "python", "assertion": "explicit"},
            {"name": "Postgres", "normalized_name": "postgresql", "assertion": "uncertain"},
        ],
        "roles": [{"title": "Python API Developer"}],
    }
    score, matched, missing, evidence = score_job(job, SearchCriteria(target_roles=()), profile)
    assert score > 0
    assert matched == ["python"]
    assert "postgresql" in missing
    assert evidence["profile_uncertain_skills"] == ["postgresql"]
