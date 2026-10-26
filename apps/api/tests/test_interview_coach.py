from app.models.interview import InterviewDifficulty, InterviewMode
from app.services.interview_coach import (
    aggregate_evaluations,
    evaluate_answer,
    extract_cv_skills,
    first_question,
    next_question,
)


def test_first_question_uses_cv_skill_and_mode() -> None:
    skills = extract_cv_skills("Built FastAPI services with PostgreSQL and Redis.")
    question = first_question(InterviewMode.TECHNICAL, InterviewDifficulty.MEDIUM, skills, "Backend Engineer", [])
    assert "fastapi" in question.prompt.lower()
    assert question.topic == "technical_architecture"


def test_short_answer_gets_evidence_follow_up() -> None:
    question = next_question(
        InterviewMode.BEHAVIORAL,
        InterviewDifficulty.MEDIUM,
        [],
        None,
        [],
        ["behavioral_ownership"],
        "I helped.",
        "behavioral_ownership",
    )
    assert question.topic.endswith("_follow_up")
    assert "concrete" in question.prompt.lower()


def test_evaluation_is_rubric_based_and_aggregate_is_bounded() -> None:
    first = evaluate_answer(
        "Describe a project.",
        "I reduced latency by 38% because I added tracing, then validated the result with load tests.",
        InterviewMode.TECHNICAL,
    )
    second = evaluate_answer("Describe teamwork.", "We worked together.", InterviewMode.BEHAVIORAL)
    overall = aggregate_evaluations([first, second])
    assert first.dimensions["depth"] >= 2
    assert 0 <= overall.dimensions["clarity"] <= 5
    assert any("measur" in strength.lower() for strength in first.strengths)
