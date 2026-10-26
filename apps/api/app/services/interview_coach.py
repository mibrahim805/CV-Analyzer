"""Deterministic interview controller and rubric used before model-backed coaching."""

import re
from dataclasses import dataclass

from app.models.interview import InterviewDifficulty, InterviewMode
from app.services.job_matching import KNOWN_SKILLS


@dataclass(frozen=True)
class QuestionPlan:
    prompt: str
    topic: str
    intent: str
    source_evidence: list[str]


@dataclass(frozen=True)
class AnswerEvaluation:
    dimensions: dict[str, float]
    strengths: list[str]
    improvements: list[str]
    example_structure: str
    evidence: list[str]


def extract_cv_skills(text: str) -> list[str]:
    lower = text.lower()
    return sorted(skill for skill in KNOWN_SKILLS if re.search(rf"(?<![\w+#]){re.escape(skill)}(?![\w+#])", lower))


def evidence_lines(text: str, skills: list[str]) -> list[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    selected: list[str] = []
    for line in lines:
        lower = line.lower()
        if any(skill in lower for skill in skills) or any(
            marker in lower for marker in ("project", "experience", "developed", "built", "led")
        ):
            selected.append(line[:240])
        if len(selected) == 3:
            break
    return selected


def _skill_evidence(skills: list[str], evidence: list[str]) -> list[str]:
    if skills:
        return [f"CV skill: {skills[0]}", *evidence[:2]]
    return evidence[:2]


def first_question(
    mode: InterviewMode, difficulty: InterviewDifficulty, skills: list[str], job_title: str | None, evidence: list[str]
) -> QuestionPlan:
    role = job_title or "the role you are targeting"
    skill = skills[0] if skills else "a recent project or responsibility"
    if mode == InterviewMode.TECHNICAL:
        prompt = (
            f"You mention {skill} in your CV. Walk me through how you used it in {role}, "
            "including one design decision and its trade-off."
        )
        topic, intent = "technical_architecture", "test architecture knowledge and trade-off reasoning"
    elif mode == InterviewMode.BEHAVIORAL:
        prompt = (
            f"Tell me about a time you had to solve a difficult problem while working toward {role}. "
            "What was your responsibility, and what changed because of your actions?"
        )
        topic, intent = "behavioral_ownership", "elicit a concrete STAR-style ownership example"
    elif mode == InterviewMode.PROJECT:
        prompt = (
            f"Choose one project from your CV that best represents your fit for {role}. "
            "What was the goal, what did you personally build, and how did you know it worked?"
        )
        topic, intent = "project_impact", "connect project scope, contribution, and outcome"
    elif mode == InterviewMode.JOB_SPECIFIC:
        prompt = (
            f"Why is {role} the right next step for you, and which experience from your CV "
            "would help you contribute first?"
        )
        topic, intent = "role_relevance", "connect stated experience to the selected role"
    elif mode == InterviewMode.HR:
        prompt = f"What are you looking for in your next role, and why does {role} interest you now?"
        topic, intent = "motivation", "understand motivation and expectations without psychological inference"
    else:
        prompt = (
            f"Give me a concise overview of your experience relevant to {role}, then highlight "
            "one achievement you would like to discuss."
        )
        topic, intent = "professional_summary", "establish role context and an evidence-backed achievement"
    if difficulty == InterviewDifficulty.HARD:
        prompt += " Be precise about constraints, alternatives, and measurable results."
    return QuestionPlan(prompt, topic, intent, _skill_evidence(skills, evidence))


def next_question(
    mode: InterviewMode,
    difficulty: InterviewDifficulty,
    skills: list[str],
    job_title: str | None,
    evidence: list[str],
    asked_topics: list[str],
    previous_answer: str,
    previous_topic: str,
) -> QuestionPlan:
    normalized = previous_answer.strip()
    if len(normalized.split()) < 25:
        return QuestionPlan(
            "Could you make that more concrete with the situation, your specific contribution, and the outcome?",
            f"{previous_topic}_follow_up",
            "request missing evidence instead of assuming a claim",
            evidence[:2],
        )
    if mode == InterviewMode.TECHNICAL and any(
        word in normalized.lower() for word in ("cache", "database", "api", "architecture", "deploy")
    ):
        return QuestionPlan(
            "What failure mode or trade-off did you consider, and how would you change the design "
            "if the scale or constraints doubled?",
            "technical_tradeoffs",
            "probe depth using the candidate's prior technical answer",
            evidence[:2],
        )
    candidates = [
        (
            "communication",
            "Describe how you explained a complex decision to someone with a different perspective.",
            "test clarity and collaboration",
        ),
        (
            "quality",
            "How did you test or validate the result, and what did you do when the first approach was not enough?",
            "test quality and learning loop",
        ),
        (
            "impact",
            "What measurable or observable outcome followed from your work, and how did you separate "
            "your contribution from the team's?",
            "test evidence and ownership",
        ),
        (
            "growth",
            "What would you learn next to become stronger in this role, and how would you practice it?",
            "test realistic development planning",
        ),
    ]
    for topic, prompt, intent in candidates:
        if topic not in asked_topics:
            if difficulty == InterviewDifficulty.HARD:
                prompt += " Include a concrete example rather than a general principle."
            return QuestionPlan(prompt, topic, intent, evidence[:2])
    return first_question(mode, difficulty, skills, job_title, evidence)


def evaluate_answer(prompt: str, answer: str, mode: InterviewMode, skipped: bool = False) -> AnswerEvaluation:
    if skipped:
        return AnswerEvaluation(
            dimensions={"technical_accuracy": 0.0, "clarity": 0.0, "depth": 0.0, "role_relevance": 0.0},
            strengths=[],
            improvements=["Use the skip option intentionally, then practice a concise answer to this question."],
            example_structure="Situation → task → action → result → reflection",
            evidence=["Question was skipped; no answer evidence was available."],
        )
    words = answer.split()
    lower = answer.lower()
    has_structure = any(marker in lower for marker in ("because", "so that", "result", "learned", "then"))
    has_measure = bool(re.search(r"\b\d+(?:%|\+)?\b", answer))
    dimensions: dict[str, float] = {
        "technical_accuracy": min(5, 2 + int(any(skill in lower for skill in KNOWN_SKILLS)))
        if mode == InterviewMode.TECHNICAL
        else 3,
        "clarity": min(5, 2 + int(len(words) >= 25) + int(has_structure)),
        "depth": min(5, 1 + int(len(words) >= 25) + int(len(words) >= 60) + int(has_measure)),
        "role_relevance": min(
            5,
            2 + int(len(words) >= 20) + int(any(marker in lower for marker in ("project", "team", "customer", "user"))),
        ),
    }
    strengths: list[str] = []
    improvements: list[str] = []
    if len(words) >= 25:
        strengths.append("The answer provides enough detail to review rather than relying on a one-line claim.")
    else:
        improvements.append(
            "Add the situation, your action, and the result so the answer can be evaluated with evidence."
        )
    if has_measure:
        strengths.append("A measurable detail makes the outcome easier to understand.")
    else:
        improvements.append("Where possible, quantify scale, outcome, time saved, quality change, or user impact.")
    if not has_structure:
        improvements.append(
            "Use a simple situation → action → result structure to keep the explanation easy to follow."
        )
    return AnswerEvaluation(
        dimensions=dimensions,
        strengths=strengths,
        improvements=improvements,
        example_structure="Situation → task → action → result → reflection",
        evidence=[
            f"{len(words)} words submitted",
            "Rubric uses answer evidence only; it does not infer personality or hiring probability.",
        ],
    )


def aggregate_evaluations(evaluations: list[AnswerEvaluation]) -> AnswerEvaluation:
    if not evaluations:
        return AnswerEvaluation(
            {},
            [],
            ["Complete at least one answer before requesting feedback."],
            "Situation → task → action → result → reflection",
            [],
        )
    keys = evaluations[0].dimensions.keys()
    dimensions = {
        key: round(sum(item.dimensions.get(key, 0) for item in evaluations) / len(evaluations), 2) for key in keys
    }
    strengths = list(dict.fromkeys(strength for item in evaluations for strength in item.strengths))[:5]
    improvements = list(dict.fromkeys(improvement for item in evaluations for improvement in item.improvements))[:6]
    evidence = [
        f"Aggregated from {len(evaluations)} answered question(s).",
        "Overall feedback is coaching guidance, not an employment decision.",
    ]
    return AnswerEvaluation(
        dimensions, strengths, improvements, "Situation → task → action → result → reflection", evidence
    )
