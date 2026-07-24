"""Fast unit coverage for interview prompts and code-enforced movement."""

from collections.abc import Callable
from datetime import UTC, datetime

from interview.evaluator import evaluate_session
from interview.question_gen import build_question_prompt, generate_topics
from interview.schemas import (
    AnswerVerdict,
    ChatMessage,
    DeliveryEvidence,
    FeedbackReport,
    HiringProcessResearch,
    HiringStage,
    HiringStageCategory,
    HiringStageEvidence,
    InterviewStage,
    InterviewState,
    NextMove,
    QuestionType,
    Topic,
    TopicState,
    TurnAnalysis,
    WeakTopic,
)
from interview.turn import analyze, build_turn_prompt, next_move


def topic(topic_id: str = "api-caching") -> Topic:
    return Topic(
        id=topic_id,
        type=QuestionType.TECHNICAL,
        title="Banking API caching",
        opening_question="How did you cache requests in your banking API?",
        what_good_looks_like=["Names the cache", "Quantifies impact", "Explains invalidation"],
    )


class FakeCompletions:
    def __init__(self, responder: Callable[[object], object]) -> None:
        self.responder = responder
        self.calls: list[dict[str, object]] = []

    def create(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        return self.responder(kwargs["response_model"])


class FakeChat:
    def __init__(self, completions: FakeCompletions) -> None:
        self.completions = completions


class FakeClient:
    def __init__(self, responder: Callable[[object], object]) -> None:
        self.completions = FakeCompletions(responder)
        self.chat = FakeChat(self.completions)


def test_next_move_enforces_followup_and_hint_quotas() -> None:
    active = TopicState(topic_id="topic")
    assert next_move(AnswerVerdict.VAGUE, active, True) is NextMove.FOLLOW_UP
    assert next_move(AnswerVerdict.STUCK, active, True) is NextMove.HINT

    exhausted = TopicState(topic_id="topic", followup_count=1, hint_count=1)
    assert next_move(AnswerVerdict.VAGUE, exhausted, True) is NextMove.NEXT_TOPIC
    assert next_move(AnswerVerdict.STUCK, exhausted, False) is NextMove.COMPLETE


def test_analyze_uses_one_call_and_targets_vague_claim() -> None:
    expected = TurnAnalysis(
        verdict=AnswerVerdict.VAGUE,
        weakest_point="optimized the API",
        reasoning="The claim has no implementation detail or metric.",
        interviewer_message="You said you 'optimized the API'. What changed, and by how much?",
    )
    client = FakeClient(lambda _: expected)

    analysis, move = analyze(
        "I optimized the API and made it faster.",
        topic(),
        TopicState(topic_id="api-caching"),
        topic("database-tradeoffs"),
        client,
    )

    assert len(client.completions.calls) == 1
    assert analysis.weakest_point == "optimized the API"
    assert move is NextMove.FOLLOW_UP


def test_hint_prompt_narrows_without_revealing_answer() -> None:
    prompt = build_turn_prompt(
        topic(),
        TopicState(topic_id="api-caching"),
        topic("next"),
    )
    assert "hint #1" in prompt
    assert "without revealing the answer" in prompt


def test_turn_prompt_treats_fillers_as_stuck_and_forbids_double_questions() -> None:
    prompt = build_turn_prompt(topic(), TopicState(topic_id="api-caching"), topic("next"))
    assert '"Hmm"' in prompt
    assert "stuck, not vague" in prompt
    assert "aimed only at weakest_point" in prompt
    assert 'Never open with "You mentioned"' in prompt
    assert 'cut everything after "and"' in prompt


def test_failed_followup_forces_deescalation_and_transition() -> None:
    prompt = build_turn_prompt(
        topic(),
        TopicState(topic_id="api-caching", followup_count=1),
        topic("next"),
    )
    assert "YOUR LAST FOLLOW-UP DID NOT LAND" in prompt
    assert "Do not probe deeper" in prompt


def test_transition_includes_next_topics_cross_session_callback() -> None:
    revisit = topic("revisit-metrics").model_copy(
        update={"callback": "Last time you struggled with metrics — let's revisit that."}
    )
    prompt = build_turn_prompt(topic(), TopicState(topic_id="api-caching"), revisit)
    assert "WHEN TRANSITIONING, OPEN WITH THIS CALLBACK" in prompt
    assert "Last time you struggled with metrics" in prompt


def test_question_prompt_prioritizes_previous_weakness_and_cv() -> None:
    weak = WeakTopic(
        topic="Quantifying impact",
        why_weak="No metrics were given",
        drill_suggestion="Prepare before-and-after latency numbers",
    )
    prompt = build_question_prompt(
        "Built a banking API at CloudCorp using Redis.",
        "Needs distributed caching experience.",
        [weak],
        "Intern / junior",
    )
    assert "banking API at CloudCorp" in prompt
    assert "Quantifying impact" in prompt
    assert "topics 1-2 MUST target them" in prompt
    assert "TARGET SENIORITY: Intern / junior" in prompt
    assert "Do not challenge" in prompt


def test_question_prompt_uses_research_for_the_selected_round_only() -> None:
    research = HiringProcessResearch(
        company="Stripe",
        job_title="Backend Engineer",
        summary="Reported multi-stage process",
        stages=[
            HiringStage(
                name="Technical screen",
                category=HiringStageCategory.EXPERIENCE_TECHNICAL,
                description="Focuses on API design trade-offs and debugging production systems.",
                evidence=[HiringStageEvidence(title="Stripe interview guide", url="https://example.com/stripe")],
                confidence=0.91,
                practice_supported=True,
            ),
            HiringStage(
                name="Recruiter call",
                category=HiringStageCategory.PHONE_SCREEN,
                description="Covers motivation and availability.",
                confidence=0.8,
                practice_supported=True,
            ),
        ],
        researched_at=datetime.now(UTC),
        confidence=0.9,
    )

    prompt = build_question_prompt(
        "Built a payments API with retries and idempotency.",
        "Backend Engineer at Stripe",
        [],
        "Junior",
        InterviewStage.EXPERIENCE_TECHNICAL,
        research,
    )

    assert "API design trade-offs and debugging production systems" in prompt
    assert "Stripe interview guide" in prompt
    assert "motivation and availability" not in prompt
    assert "shape at least 2 topics" in prompt


def test_question_prompt_keeps_platform_rounds_conversational() -> None:
    phone_prompt = build_question_prompt(
        "Built a banking API at CloudCorp.",
        "Backend Engineer at Example Co",
        [],
        "Junior",
        InterviewStage.PHONE_SCREEN,
    )
    technical_prompt = build_question_prompt(
        "Built a banking API at CloudCorp.",
        "Backend Engineer at Example Co",
        [],
        "Junior",
        InterviewStage.EXPERIENCE_TECHNICAL,
    )

    assert "INTERVIEW ROUND: phone_screen" in phone_prompt
    assert "Do not ask coding" in phone_prompt
    assert "INTERVIEW ROUND: experience_technical" in technical_prompt
    assert "Do not ask LeetCode" in technical_prompt
    assert "recruiter conducting a realistic 25-30 minute phone screen" in phone_prompt
    assert "engineer conducting a 45-60 minute technical experience phone screen" in technical_prompt


def test_live_followups_match_the_selected_round() -> None:
    recruiter_prompt = build_turn_prompt(
        topic(), TopicState(topic_id="api-caching"), topic("next"),
        interview_stage=InterviewStage.PHONE_SCREEN,
    )
    technical_prompt = build_turn_prompt(
        topic(), TopicState(topic_id="api-caching"), topic("next"),
        interview_stage=InterviewStage.EXPERIENCE_TECHNICAL,
    )

    assert "You are a recruiter" in recruiter_prompt
    assert "Never probe for code" in recruiter_prompt
    assert "You are an engineer" in technical_prompt
    assert "debugging process" in technical_prompt


def test_generate_topics_requests_structured_topic_list() -> None:
    topics = [topic(f"topic-{index}") for index in range(6)]
    client = FakeClient(lambda _: topics)
    generated = generate_topics("Built a banking API.", client=client)
    assert generated == topics
    assert client.completions.calls[0]["response_model"] == list[Topic]


def test_evaluator_receives_transcript_and_returns_typed_report() -> None:
    report = FeedbackReport.model_validate(
        {
            "overall": "You named Redis, but did not quantify the latency change.",
            "scores": {
                "specificity": 2,
                "technical_depth": 3,
                "communication": 3,
                "handling_pressure": 2,
            },
            "per_topic": [
                {
                    "topic_id": "api-caching",
                    "verdict_summary": "Vague impact",
                    "what_they_said": "'I used Redis'",
                    "what_was_missing": "No invalidation strategy or metric",
                    "stronger_answer": "I used Redis for the endpoint. I would add the measured result.",
                }
            ],
            "weak_topics": [
                {"topic": "Metrics", "why_weak": "None given", "drill_suggestion": "Write down two metrics"},
                {"topic": "Trade-offs", "why_weak": "None given", "drill_suggestion": "Compare two options"},
            ],
            "one_thing": "Quantify every performance claim.",
        }
    )
    client = FakeClient(lambda _: report)
    state = InterviewState(
        topic_states=[TopicState(topic_id="api-caching")],
        messages=[ChatMessage(role="candidate", content="I used Redis")],
    )
    result = evaluate_session([topic()], state, client)
    user_message = client.completions.calls[0]["messages"]
    assert result == report
    assert "I used Redis" in str(user_message)


def test_evaluator_uses_round_specific_score_expectations() -> None:
    report = FeedbackReport.model_validate({
        "overall": "Clear motivation.",
        "scores": {"specificity": 3, "technical_depth": 3, "communication": 4, "handling_pressure": 3},
        "per_topic": [{"topic_id": "api-caching", "verdict_summary": "Clear", "what_they_said": "Redis", "what_was_missing": "Impact", "stronger_answer": "I used Redis to improve response time."}],
        "weak_topics": [
            {"topic": "Impact", "why_weak": "No result", "drill_suggestion": "Add one metric"},
            {"topic": "Motivation", "why_weak": "Generic", "drill_suggestion": "Name one company reason"},
        ],
        "one_thing": "Be specific.",
    })
    client = FakeClient(lambda _: report)
    state = InterviewState(topic_states=[TopicState(topic_id="api-caching")])

    evaluate_session([topic()], state, client, interview_stage=InterviewStage.PHONE_SCREEN)

    assert "recruiter phone screen" in str(client.completions.calls[0]["messages"])
    assert "Do not penalize missing low-level technical depth" in str(client.completions.calls[0]["messages"])


def test_evaluator_receives_observable_delivery_evidence() -> None:
    report = FeedbackReport.model_validate(
        {
            "overall": "The answer had useful detail but ran long.",
            "scores": {"specificity": 3, "technical_depth": 3, "communication": 2, "handling_pressure": 3},
            "per_topic": [{"topic_id": "api-caching", "verdict_summary": "Long answer", "what_they_said": "I used Redis", "what_was_missing": "A concise result", "stronger_answer": "I used Redis and measured the result."}],
            "weak_topics": [
                {"topic": "Pace", "why_weak": "The answer was rushed", "drill_suggestion": "Pause after each STAR section"},
                {"topic": "Impact", "why_weak": "No result", "drill_suggestion": "End with one metric"},
            ],
            "one_thing": "Slow down and close with impact.",
        }
    )
    client = FakeClient(lambda _: report)
    state = InterviewState(
        topic_states=[TopicState(topic_id="api-caching")],
        messages=[ChatMessage(role="candidate", content="I used Redis")],
        turns=[
            {
                "topic_id": "api-caching",
                "answer": "I used Redis",
                "delivery": DeliveryEvidence(duration_seconds=12, word_count=3, words_per_minute=15, filler_words=1),
                "analysis": {"verdict": "solid", "reasoning": "Specific", "interviewer_message": "Thanks."},
                "move": "complete",
            }
        ],
    )

    evaluate_session([topic()], state, client)

    assert "words_per_minute" in str(client.completions.calls[0]["messages"])
    assert "filler_words" in str(client.completions.calls[0]["messages"])
