"""Supabase persistence and interview session orchestration."""

from collections.abc import Mapping

from supabase import Client

from interview.evaluator import evaluate_session
from interview.llm import StructuredClient
from interview.question_gen import generate_topics
from interview.schemas import (
    ChatMessage,
    FeedbackReport,
    InterviewSession,
    InterviewState,
    NextMove,
    SessionConfig,
    SessionStatus,
    TopicState,
    TurnRecord,
    WeakTopic,
)
from interview.turn import analyze


SESSIONS_TABLE = "interview_sessions"
REPORTS_TABLE = "interview_reports"
USERS_TABLE = "users"
RECENT_SESSION_SCAN_LIMIT = 10


class SessionNotFoundError(LookupError):
    """Raised when an interview session id is stale or inaccessible."""


class InvalidSessionStateError(RuntimeError):
    """Raised when a lifecycle action is invalid for the persisted status."""


def _single_row(data: object) -> dict[str, object] | None:
    if not isinstance(data, list) or not data or not isinstance(data[0], Mapping):
        return None
    return dict(data[0])


def _load_cv_text(db: Client, user_id: str) -> str:
    response = db.table(USERS_TABLE).select("cv_text").eq("id", user_id).limit(1).execute()
    row = _single_row(response.data)
    cv_text = str(row.get("cv_text") or "").strip() if row else ""
    if not cv_text:
        raise InvalidSessionStateError("The user must save a CV before starting an interview")
    return cv_text


def _load_recent_weak_topics(db: Client, user_id: str) -> list[WeakTopic]:
    """Find the newest completed report through the user id stored in session config."""
    session_response = (
        db.table(SESSIONS_TABLE)
        .select("id,config,created_at")
        .contains("config", {"user_id": user_id})
        .order("created_at", desc=True)
        .limit(RECENT_SESSION_SCAN_LIMIT)
        .execute()
    )
    sessions = session_response.data if isinstance(session_response.data, list) else []
    for raw_session in sessions:
        if not isinstance(raw_session, Mapping) or not raw_session.get("id"):
            continue
        report_response = (
            db.table(REPORTS_TABLE)
            .select("report")
            .eq("session_id", str(raw_session["id"]))
            .limit(1)
            .execute()
        )
        report_row = _single_row(report_response.data)
        report = report_row.get("report") if report_row else None
        if isinstance(report, Mapping) and isinstance(report.get("weak_topics"), list):
            return [WeakTopic.model_validate(item) for item in report["weak_topics"]]
    return []


def load_session(db: Client, session_id: str) -> InterviewSession:
    response = db.table(SESSIONS_TABLE).select("id,config,state,status").eq("id", session_id).limit(1).execute()
    row = _single_row(response.data)
    if row is None:
        raise SessionNotFoundError(session_id)
    return InterviewSession.model_validate(row)


def create_session(
    db: Client,
    user_id: str,
    job_description: str | None,
    llm_client: StructuredClient | None = None,
) -> InterviewSession:
    """Seed a session from the CV and most recent coaching weaknesses."""
    cv_text = _load_cv_text(db, user_id)
    weak_topics = _load_recent_weak_topics(db, user_id)
    topics = generate_topics(cv_text, job_description, weak_topics, llm_client)
    config = SessionConfig(user_id=user_id, job_description=job_description, topics=topics)
    first_topic = topics[0]
    opening = " ".join(part for part in (first_topic.callback, first_topic.opening_question) if part)
    state = InterviewState(
        topic_states=[TopicState(topic_id=topic.id) for topic in topics],
        messages=[ChatMessage(role="interviewer", content=opening)],
    )
    response = (
        db.table(SESSIONS_TABLE)
        .insert(
            {
                "config": config.model_dump(mode="json"),
                "state": state.model_dump(mode="json"),
                "status": SessionStatus.ACTIVE.value,
            }
        )
        .execute()
    )
    row = _single_row(response.data)
    if row is None:
        raise RuntimeError("Supabase did not return the created interview session")
    return InterviewSession.model_validate(row)


def answer_session(
    db: Client,
    session_id: str,
    answer: str,
    llm_client: StructuredClient | None = None,
) -> tuple[InterviewSession, TurnRecord]:
    """Analyze one answer, mutate quota counters, and persist the next state."""
    session = load_session(db, session_id)
    if session.status is not SessionStatus.ACTIVE:
        raise InvalidSessionStateError("Only active sessions accept answers")

    index = session.state.current_topic_index
    if index >= len(session.config.topics):
        raise InvalidSessionStateError("All interview topics are already complete")
    topic = session.config.topics[index]
    topic_state = session.state.topic_states[index]
    next_topic = session.config.topics[index + 1] if index + 1 < len(session.config.topics) else None
    analysis, move = analyze(answer.strip(), topic, topic_state, next_topic, llm_client)

    topic_state.answer_count += 1
    if move is NextMove.FOLLOW_UP:
        topic_state.followup_count += 1
    elif move is NextMove.HINT:
        topic_state.hint_count += 1
    else:
        topic_state.completed = True
        session.state.current_topic_index += 1

    turn = TurnRecord(topic_id=topic.id, answer=answer.strip(), analysis=analysis, move=move)
    session.state.turns.append(turn)
    session.state.messages.extend(
        [
            ChatMessage(role="candidate", content=answer.strip()),
            ChatMessage(role="interviewer", content=analysis.interviewer_message),
        ]
    )
    if move is NextMove.COMPLETE:
        session.status = SessionStatus.EVALUATING

    db.table(SESSIONS_TABLE).update(
        {
            "state": session.state.model_dump(mode="json"),
            "status": session.status.value,
        }
    ).eq("id", session_id).execute()
    return session, turn


def mark_for_evaluation(db: Client, session_id: str) -> InterviewSession:
    session = load_session(db, session_id)
    if session.status is SessionStatus.COMPLETED:
        return session
    if not session.state.turns:
        raise InvalidSessionStateError("Answer at least one question before ending the interview")
    session.status = SessionStatus.EVALUATING
    db.table(SESSIONS_TABLE).update({"status": session.status.value}).eq("id", session_id).execute()
    return session


def evaluate_and_save(db: Client, session_id: str, llm_client: StructuredClient | None = None) -> None:
    """Background task: evaluate once, persist report, then expose completed status."""
    session = load_session(db, session_id)
    try:
        report = evaluate_session(session.config.topics, session.state, llm_client)
        db.table(REPORTS_TABLE).upsert(
            {"session_id": session_id, "report": report.model_dump(mode="json")},
            on_conflict="session_id",
        ).execute()
        db.table(SESSIONS_TABLE).update({"status": SessionStatus.COMPLETED.value}).eq("id", session_id).execute()
    except Exception:
        db.table(SESSIONS_TABLE).update({"status": SessionStatus.FAILED.value}).eq("id", session_id).execute()
        raise


def load_report(db: Client, session_id: str) -> tuple[SessionStatus, FeedbackReport | None]:
    session = load_session(db, session_id)
    response = db.table(REPORTS_TABLE).select("report").eq("session_id", session_id).limit(1).execute()
    row = _single_row(response.data)
    report_data = row.get("report") if row else None
    report = FeedbackReport.model_validate(report_data) if report_data else None
    return session.status, report
