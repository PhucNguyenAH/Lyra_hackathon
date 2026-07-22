"""Opinionated, transcript-grounded end-of-session evaluation."""

import json
from typing import cast

from interview.llm import MAX_RETRIES, MODEL_NAME, MODEL_TEMPERATURE, StructuredClient, create_structured_client
from interview.schemas import FeedbackReport, InterviewStage, InterviewState, Topic


EVALUATOR_PROMPT = """
You are a blunt but constructive interview coach reviewing a completed mock interview.
Produce a report as JSON:

- overall: 2-3 honest sentences. Lead with the strongest and weakest patterns observed.
- scores from 1-5: specificity, technical_depth, communication, handling_pressure. Base
  handling_pressure on responses to follow-ups and hints.
- per_topic: topic_id, verdict_summary, what_they_said (a short exact quote),
  what_was_missing (tied to what_good_looks_like), and stronger_answer (a 2-3 sentence
  rewrite of their weakest answer using only their experience in the transcript).
- weak_topics: 2-3 items with topic, why_weak, and a concrete drill_suggestion. This feeds
  the next session's topic generation.
- one_thing: the single highest-leverage improvement for next time.

When delivery evidence is present, evaluate only observable signals: speaking duration,
words per minute, filler-word count, and whether the answer stayed structured. Mention pace
or concision when the numbers support it. Do not infer confidence, emotion, personality,
accent quality, or mental state from a transcript. Distinguish content gaps from delivery gaps.

Never invent facts the candidate did not say. Never use generic praise. Every evaluative
claim must reference transcript evidence. When an answer was strong, explain specifically
why it worked so the candidate can repeat it.
""".strip()

STAGE_EVALUATION = {
    InterviewStage.PHONE_SCREEN: "Evaluate this as a recruiter phone screen. Weight concise career narrative, role motivation, relevance, communication, and credible impact. Do not penalize missing low-level technical depth.",
    InterviewStage.EXPERIENCE_TECHNICAL: "Evaluate this as a spoken technical experience screen. Weight personal technical contribution, decisions, debugging, trade-offs, validation, and measurable results. Do not expect live-coded solutions.",
}


def evaluate_session(
    topics: list[Topic],
    state: InterviewState,
    client: StructuredClient | None = None,
    interview_stage: InterviewStage = InterviewStage.EXPERIENCE_TECHNICAL,
) -> FeedbackReport:
    """Make one structured model call over the complete evidence bundle."""
    llm = client or create_structured_client()
    evidence = {
        "topics": [topic.model_dump(mode="json") for topic in topics],
        "transcript": [message.model_dump() for message in state.messages],
        "turns": [turn.model_dump(mode="json") for turn in state.turns],
    }
    result = llm.chat.completions.create(
        model=MODEL_NAME,
        response_model=FeedbackReport,
        messages=[
            {"role": "system", "content": f"{EVALUATOR_PROMPT}\n\n{STAGE_EVALUATION[interview_stage]}"},
            {"role": "user", "content": json.dumps(evidence, ensure_ascii=False)},
        ],
        temperature=MODEL_TEMPERATURE,
        max_retries=MAX_RETRIES,
    )
    return cast(FeedbackReport, result)
