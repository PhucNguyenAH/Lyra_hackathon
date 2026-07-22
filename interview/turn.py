"""Per-answer analysis and deterministic interview movement."""

from typing import cast

from interview.llm import MAX_RETRIES, MODEL_NAME, MODEL_TEMPERATURE, StructuredClient, create_structured_client
from interview.schemas import AnswerVerdict, InterviewStage, NextMove, Topic, TopicState, TurnAnalysis


MAX_FOLLOW_UPS_PER_TOPIC = 1
MAX_HINTS_PER_TOPIC = 1

TURN_PROMPT_TEMPLATE = """
{interviewer_persona}

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
- vague with follow-ups remaining: first react in ONE short, natural sentence to what the
  candidate said (for example, "Right, so indexing did the heavy lifting there."). Then ask
  ONE probing question aimed only at weakest_point. Never open with "You mentioned".
  Never ask for both implementation and impact in the same turn. If the draft question
  contains "and", cut everything after "and" so only one thing is being asked.
- stuck with hints remaining: give hint #{hint_number}. Hint 1 rephrases the question
  concretely. Hint 2 gives a narrow nudge without revealing the answer.
- solid, or the relevant quota is exhausted: acknowledge one specific thing they said, then
  transition to NEXT_TOPIC. If there is no NEXT_TOPIC, close the interview naturally.

Never provide the full answer. Use 2-4 conversational sentences, with no bullet lists.

Classification examples:
- "We improved performance with caching and better queries" is vague: it contains claims
  that are worth probing for implementation detail.
- "I just used Supabase and a database index" is stuck: there is not enough substance to
  drill into, so narrow or rephrase instead.
- "Hmm", "uh", "I don't know", filler-only responses, and one-line non-answers to broad
  questions are stuck, not vague.
- If one follow-up has already failed to improve the answer, acknowledge what was said and
  move on. Do not probe more deeply.
{next_topic_line}
{callback_line}
{deescalation_line}
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
    forced_verdict: AnswerVerdict | None = None,
    interview_stage: InterviewStage = InterviewStage.EXPERIENCE_TECHNICAL,
) -> str:
    """Rebuild instructions from live counters on every answer."""
    callback = next_topic.callback if next_topic else None
    deescalation = (
        "YOUR LAST FOLLOW-UP DID NOT LAND. Do not probe deeper. Briefly acknowledge what "
        "the candidate managed to say, then move to NEXT_TOPIC."
        if topic_state.followup_count >= MAX_FOLLOW_UPS_PER_TOPIC
        else ""
    )
    prompt = TURN_PROMPT_TEMPLATE.format(
        interviewer_persona=(
            "You are a recruiter conducting a realistic phone screen. Be warm, concise, and "
            "focused on motivation, relevant experience, communication, and logistics. Never "
            "probe for code, architecture, algorithms, or low-level implementation details."
            if interview_stage is InterviewStage.PHONE_SCREEN
            else "You are an engineer conducting a spoken technical experience screen. Probe "
            "the candidate's personal contribution, engineering decisions, debugging process, "
            "trade-offs, validation, and results. Do not ask live-coding or LeetCode questions."
        ),
        topic_title=topic.title,
        good_answer_criteria="\n".join(f"- {criterion}" for criterion in topic.what_good_looks_like),
        followups_remaining=MAX_FOLLOW_UPS_PER_TOPIC - topic_state.followup_count,
        hints_remaining=MAX_HINTS_PER_TOPIC - topic_state.hint_count,
        hint_number=topic_state.hint_count + 1,
        next_topic_line=(f"NEXT_TOPIC: {next_topic.opening_question}" if next_topic else ""),
        callback_line=(
            f"WHEN TRANSITIONING, OPEN WITH THIS CALLBACK: {callback}" if callback else ""
        ),
        deescalation_line=deescalation,
    )
    if forced_verdict is not None:
        prompt += f"\nFORCED VERDICT: {forced_verdict.value}. Use the matching interviewer behavior."
    return prompt


def analyze(
    answer: str,
    topic: Topic,
    topic_state: TopicState,
    next_topic: Topic | None,
    client: StructuredClient | None = None,
    forced_verdict: AnswerVerdict | None = None,
    interview_stage: InterviewStage = InterviewStage.EXPERIENCE_TECHNICAL,
) -> tuple[TurnAnalysis, NextMove]:
    """Analyze in one model call, then independently enforce movement quotas in code."""
    llm = client or create_structured_client()
    prompt = build_turn_prompt(topic, topic_state, next_topic, forced_verdict, interview_stage)
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
    if forced_verdict is not None:
        analysis.verdict = forced_verdict
        analysis.weakest_point = None
    move = next_move(analysis.verdict, topic_state, next_topic is not None)
    return analysis, move
