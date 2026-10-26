"""Transparent, evidence-based CV checks used before model-backed analysis."""

import re
from dataclasses import dataclass

SECTION_ALIASES: dict[str, tuple[str, ...]] = {
    "summary": ("summary", "profile", "about me", "objective"),
    "experience": ("experience", "employment", "work history", "professional history"),
    "education": ("education", "academic background"),
    "skills": ("skills", "technical skills", "competencies", "technologies"),
    "projects": ("projects", "selected projects"),
    "certifications": ("certifications", "certificates", "training"),
}


@dataclass(frozen=True)
class CVCheck:
    key: str
    status: str
    detail: str
    evidence: str


@dataclass(frozen=True)
class CVEvaluation:
    metrics: dict[str, int]
    checks: list[CVCheck]
    recommendations: list[str]


def evaluate_cv_text(text: str) -> CVEvaluation:
    normalized = text.strip()
    lower = normalized.lower()
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    words = re.findall(r"\b\w+[\w'/-]*\b", normalized)
    sections = {
        key: any(re.search(rf"(?:^|\n)\s*{re.escape(alias)}\s*:?\s*(?:\n|$)", lower) for alias in aliases)
        for key, aliases in SECTION_ALIASES.items()
    }
    email_found = bool(re.search(r"\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b", lower))
    phone_found = bool(re.search(r"(?:\+?\d[\d ()-]{7,}\d)", normalized))
    measurable = bool(re.search(r"(?:\b\d+%|\$\s?\d|\b\d+[+]?(?:%| users| clients| projects| years))", lower))
    bullets = sum(line.startswith(("-", "•", "*")) for line in lines)
    contact_detail = "Contact details are detectable." if email_found or phone_found else (
        "No email address or phone number was detected."
    )
    summary_detail = "A summary/profile section was detected." if sections["summary"] else (
        "Add a concise professional summary near the top."
    )
    experience_detail = "An experience section was detected." if sections["experience"] else (
        "Add employment history with role, employer, dates, and outcomes."
    )
    education_detail = "An education section was detected." if sections["education"] else (
        "Add education or relevant training with institution and completion dates."
    )
    skills_detail = "A skills section was detected." if sections["skills"] else (
        "Add a focused skills section using terms supported by your experience."
    )
    achievement_detail = "Some quantified evidence was detected." if measurable else (
        "No measurable outcomes were detected in the extracted text."
    )

    checks = [
        CVCheck(
            "contact_information",
            "pass" if email_found or phone_found else "warning",
            contact_detail,
            "email" if email_found else ("phone" if phone_found else "none"),
        ),
        CVCheck(
            "professional_summary",
            "pass" if sections["summary"] else "warning",
            summary_detail,
            "summary section" if sections["summary"] else "missing",
        ),
        CVCheck(
            "work_experience",
            "pass" if sections["experience"] else "warning",
            experience_detail,
            "experience section" if sections["experience"] else "missing",
        ),
        CVCheck(
            "education",
            "pass" if sections["education"] else "warning",
            education_detail,
            "education section" if sections["education"] else "missing",
        ),
        CVCheck(
            "skills",
            "pass" if sections["skills"] else "warning",
            skills_detail,
            "skills section" if sections["skills"] else "missing",
        ),
        CVCheck(
            "achievement_evidence",
            "pass" if measurable else "warning",
            achievement_detail,
            "quantified statement" if measurable else "none detected",
        ),
    ]
    recommendations = [check.detail for check in checks if check.status == "warning"]
    if bullets == 0:
        recommendations.append(
            "Use concise bullet points for responsibilities and achievements so the experience is easier to scan."
        )
    return CVEvaluation(
        metrics={
            "character_count": len(normalized),
            "word_count": len(words),
            "line_count": len(lines),
            "detected_section_count": sum(sections.values()),
            "bullet_count": bullets,
        },
        checks=checks,
        recommendations=recommendations,
    )
