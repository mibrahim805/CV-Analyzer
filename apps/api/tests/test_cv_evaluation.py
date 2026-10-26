from app.services.cv_evaluation import evaluate_cv_text


def test_evaluation_reports_evidence_and_recommendations() -> None:
    result = evaluate_cv_text(
        "Alex Doe\n alex@example.com\n\nSUMMARY\nBackend engineer.\n\n"
        "EXPERIENCE\n- Reduced latency by 30%\n\nSKILLS\nPython, PostgreSQL"
    )

    assert result.metrics["word_count"] > 0
    assert result.metrics["detected_section_count"] == 3
    assert result.metrics["bullet_count"] == 1
    assert any(check.key == "achievement_evidence" and check.status == "pass" for check in result.checks)
    assert any("education" in recommendation.lower() for recommendation in result.recommendations)
