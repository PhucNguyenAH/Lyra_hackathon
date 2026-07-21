"""Fast unit coverage for interview prompts and code-enforced movement."""

from collections.abc import Callable

from interview.evaluator import evaluate_session
from interview.question_gen import build_question_prompt, generate_topics
from interview.schemas import (
    AnswerVerdict,
    ChatMessage,
    FeedbackReport,
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

    exhausted = TopicState(topic_id="topic", followup_count=2, hint_count=2)
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


def test_second_hint_prompt_narrows_without_revealing_answer() -> None:
    prompt = build_turn_prompt(
        topic(),
        TopicState(topic_id="api-caching", hint_count=1),
        topic("next"),
    )
    assert "hint #2" in prompt
    assert "without revealing the answer" in prompt


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
    )
    assert "banking API at CloudCorp" in prompt
    assert "Quantifying impact" in prompt
    assert "topics 1-2 MUST target them" in prompt


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
