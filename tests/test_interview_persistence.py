"""Regression coverage for durable interview lifecycle events."""

from types import SimpleNamespace

from interview.schemas import (
    InterviewSession,
    InterviewStage,
    InterviewState,
    QuestionType,
    SessionConfig,
    SessionEventType,
    SessionStatus,
    Topic,
    TopicState,
)
from interview.session import abandon_session, record_session_event


def make_topic(index: int) -> Topic:
    return Topic(
        id=f"topic-{index}",
        type=QuestionType.BEHAVIORAL,
        title=f"Topic {index}",
        opening_question="Tell me about your experience.",
        what_good_looks_like=["Specific example", "Clear impact"],
    )


class FakeTable:
    def __init__(self, row: dict[str, object]) -> None:
        self.row = row
        self.pending_update: dict[str, object] | None = None

    def select(self, *_: object) -> "FakeTable": return self
    def eq(self, *_: object) -> "FakeTable": return self
    def limit(self, *_: object) -> "FakeTable": return self

    def update(self, values: dict[str, object]) -> "FakeTable":
        self.pending_update = values
        return self

    def execute(self) -> SimpleNamespace:
        if self.pending_update is not None:
            self.row.update(self.pending_update)
            self.pending_update = None
        return SimpleNamespace(data=[self.row])


class FakeDB:
    def __init__(self, session: InterviewSession) -> None:
        self.interviews = FakeTable(session.model_dump(mode="json"))

    def table(self, name: str) -> FakeTable:
        assert name == "interview_sessions"
        return self.interviews


def active_session() -> InterviewSession:
    topics = [make_topic(index) for index in range(6)]
    return InterviewSession(
        id="session-id",
        config=SessionConfig(
            user_id="user-id",
            interview_stage=InterviewStage.PHONE_SCREEN,
            job_title="Backend Engineer",
            company="Example Co",
            cv_draft_id="draft-1",
            topics=topics,
        ),
        state=InterviewState(topic_states=[TopicState(topic_id=topic.id) for topic in topics]),
        status=SessionStatus.ACTIVE,
    )


def test_pause_and_resume_events_are_persisted_in_session_state() -> None:
    db = FakeDB(active_session())
    record_session_event(db, "session-id", SessionEventType.PAUSED, {"elapsed_seconds": 42})
    restored = record_session_event(db, "session-id", SessionEventType.RESUMED)

    assert [event.type for event in restored.state.events] == [
        SessionEventType.PAUSED,
        SessionEventType.RESUMED,
    ]
    assert restored.state.events[0].detail == {"elapsed_seconds": 42}


def test_quit_marks_session_abandoned_and_persists_reason() -> None:
    db = FakeDB(active_session())
    abandoned = abandon_session(db, "session-id", "candidate_quit")

    assert abandoned.status is SessionStatus.ABANDONED
    assert abandoned.state.events[-1].type is SessionEventType.ABANDONED
    assert abandoned.state.events[-1].detail == {"reason": "candidate_quit"}
    assert db.interviews.row["status"] == "abandoned"
