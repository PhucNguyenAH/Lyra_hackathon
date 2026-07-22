"""Opinionated, transcript-grounded end-of-session evaluation."""

import json
from typing import cast

from interview.llm import MAX_RETRIES, MODEL_NAME, MODEL_TEMPERATURE, StructuredClient, create_structured_client
from interview.schemas import FeedbackReport, InterviewState, Topic


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

Never invent facts the candidate did not say. Never use generic praise. Every evaluative
claim must reference transcript evidence. When an answer was strong, explain specifically
why it worked so the candidate can repeat it.
""".strip()


def evaluate_session(
    topics: list[Topic],
    state: InterviewState,
    client: StructuredClient | None = None,
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
            {"role": "system", "content": EVALUATOR_PROMPT},
            {"role": "user", "content": json.dumps(evidence, ensure_ascii=False)},
        ],
        temperature=MODEL_TEMPERATURE,
        max_retries=MAX_RETRIES,
    )
    return cast(FeedbackReport, result)
