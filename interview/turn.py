"""Per-answer analysis and deterministic interview movement."""

from typing import cast

from interview.llm import MAX_RETRIES, MODEL_NAME, MODEL_TEMPERATURE, StructuredClient, create_structured_client
from interview.schemas import AnswerVerdict, NextMove, Topic, TopicState, TurnAnalysis


MAX_FOLLOW_UPS_PER_TOPIC = 2
MAX_HINTS_PER_TOPIC = 2

TURN_PROMPT_TEMPLATE = """
You are a senior engineer conducting a mock interview. You are rigorous but warm —
you want the candidate to succeed by being pushed.

CURRENT TOPIC: {topic_title}
WHAT A GOOD ANSWER COVERS:
{good_answer_criteria}
FOLLOW-UPS REMAINING ON THIS TOPIC: {followups_remaining}
HINTS REMAINING: {hints_remaining}

Analyze the candidate's latest answer and produce:
- verdict: "solid" | "vague" | "stuck"
  * solid: specific, includes real details (numbers, names, trade-offs), and covers the criteria
  * vague: buzzwords without implementation details, or claims without evidence
  * stuck: "I don't know", rambling without content, a very short non-answer, or repetition
- weakest_point: the single vaguest claim worth probing (null if solid/stuck)
- reasoning: 1-2 sentences, internal only
- interviewer_message: what you say next, following the REQUIRED MOVE below.

Choose the interviewer_message using these application-enforced rules:
- vague with follow-ups remaining: ask ONE probing question aimed at weakest_point and quote
  the candidate's words.
- stuck with hints remaining: give hint #{hint_number}. Hint 1 rephrases the question
  concretely. Hint 2 gives a narrow nudge without revealing the answer.
- solid, or the relevant quota is exhausted: acknowledge one specific thing they said, then
  transition to NEXT_TOPIC. If there is no NEXT_TOPIC, close the interview naturally.

Never provide the full answer. Use 2-4 conversational sentences, with no bullet lists.
{next_topic_line}
{callback_line}
""".strip()


def next_move(verdict: AnswerVerdict, topic_state: TopicState, has_next_topic: bool) -> NextMove:
    """Enforce quotas in code; model output can never grant itself extra turns."""
    if verdict is AnswerVerdict.VAGUE and topic_state.followup_count < MAX_FOLLOW_UPS_PER_TOPIC:
        return NextMove.FOLLOW_UP
    if verdict is AnswerVerdict.STUCK and topic_state.hint_count < MAX_HINTS_PER_TOPIC:
        return NextMove.HINT
    return NextMove.NEXT_TOPIC if has_next_topic else NextMove.COMPLETE


def build_turn_prompt(
    topic: Topic,
    topic_state: TopicState,
    next_topic: Topic | None,
) -> str:
    """Rebuild instructions from live counters on every answer."""
    callback = next_topic.callback if next_topic else None
    return TURN_PROMPT_TEMPLATE.format(
        topic_title=topic.title,
        good_answer_criteria="\n".join(f"- {criterion}" for criterion in topic.what_good_looks_like),
        followups_remaining=MAX_FOLLOW_UPS_PER_TOPIC - topic_state.followup_count,
        hints_remaining=MAX_HINTS_PER_TOPIC - topic_state.hint_count,
        hint_number=topic_state.hint_count + 1,
        next_topic_line=(f"NEXT_TOPIC: {next_topic.opening_question}" if next_topic else ""),
        callback_line=(
            f"WHEN TRANSITIONING, OPEN WITH THIS CALLBACK: {callback}" if callback else ""
        ),
    )


def analyze(
    answer: str,
    topic: Topic,
    topic_state: TopicState,
    next_topic: Topic | None,
    client: StructuredClient | None = None,
) -> tuple[TurnAnalysis, NextMove]:
    """Analyze in one model call, then independently enforce movement quotas in code."""
    llm = client or create_structured_client()
    prompt = build_turn_prompt(topic, topic_state, next_topic)
    result = llm.chat.completions.create(
        model=MODEL_NAME,
        response_model=TurnAnalysis,
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"Candidate's latest answer:\n{answer}"},
        ],
        temperature=MODEL_TEMPERATURE,
        max_retries=MAX_RETRIES,
    )
    analysis = cast(TurnAnalysis, result)
    move = next_move(analysis.verdict, topic_state, next_topic is not None)
    return analysis, move
