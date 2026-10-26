from app.schemas.cv_profile import ProfessionalProfile, ProfileEvidence, ProfileSkill
from app.services.cv_profile import _sanitize, normalize_skill_name


def test_skill_normalization_preserves_source_name() -> None:
    assert normalize_skill_name("Postgres") == "postgresql"


def test_profile_evidence_not_in_source_becomes_uncertain() -> None:
    profile = ProfessionalProfile(
        skills=[
            ProfileSkill(
                name="Python",
                normalized_name="python",
                category="language",
                assertion="explicit",
                evidence=[ProfileEvidence(section="skills", quote="Python", assertion="explicit", confidence=0.95)],
            ),
        ]
    )
    sanitized = _sanitize(profile, "Python and FastAPI")
    assert sanitized.skills[0].assertion == "explicit"
    sanitized = _sanitize(profile, "Java and Spring")
    assert sanitized.skills[0].evidence[0].assertion == "uncertain"
    assert sanitized.skills[0].evidence[0].confidence <= 0.35
