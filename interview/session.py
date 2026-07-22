"""Supabase persistence and interview session orchestration."""

from collections.abc import Mapping

from supabase import Client

from interview.evaluator import evaluate_session
from interview.llm import StructuredClient
from interview.question_gen import generate_topics
from interview.schemas import (
    AnswerVerdict,
    ChatMessage,
    DeliveryEvidence,
    FeedbackReport,
    HiringProcessResearch,
    InterviewSession,
    InterviewStage,
    InterviewState,
    NextMove,
    SessionConfig,
    SessionEvent,
    SessionEventType,
    SessionStatus,
    SessionSummary,
    TopicState,
    TurnAnalysis,
    TurnRecord,
    WeakTopic,
)
from interview.turn import analyze


SESSIONS_TABLE = "interview_sessions"
REPORTS_TABLE = "interview_reports"
USERS_TABLE = "users"


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


def _load_recent_weak_topics(
    db: Client,
    user_id: str,
    interview_stage: InterviewStage,
    company: str | None,
    job_title: str | None,
) -> list[WeakTopic]:
    """Reuse coaching only for the same job and round, never across interview formats."""
    report_response = (
        db.table(REPORTS_TABLE)
        .select("report,created_at,interview_sessions!inner(user_id,config)")
        .eq("interview_sessions.user_id", user_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    rows = report_response.data if isinstance(report_response.data, list) else []
    for raw_row in rows:
        if not isinstance(raw_row, Mapping):
            continue
        joined = raw_row.get("interview_sessions")
        joined_session = joined[0] if isinstance(joined, list) and joined else joined
        config = joined_session.get("config") if isinstance(joined_session, Mapping) else None
        if not isinstance(config, Mapping):
            continue
        same_round = config.get("interview_stage") == interview_stage.value
        same_company = str(config.get("company") or "").casefold() == str(company or "").casefold()
        same_job = str(config.get("job_title") or "").casefold() == str(job_title or "").casefold()
        report = raw_row.get("report")
        if same_round and same_company and same_job and isinstance(report, Mapping) and isinstance(report.get("weak_topics"), list):
            return [WeakTopic.model_validate(item) for item in report["weak_topics"]]
    return []


def list_completed_sessions(db: Client, user_id: str, limit: int = 20) -> list[SessionSummary]:
    """Real practice history — every completed session already persists here."""
    response = (
        db.table(REPORTS_TABLE)
        .select("session_id,report,created_at,interview_sessions!inner(user_id,config,status)")
        .eq("interview_sessions.user_id", user_id)
        .eq("interview_sessions.status", SessionStatus.COMPLETED.value)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = response.data if isinstance(response.data, list) else []
    summaries: list[SessionSummary] = []
    for raw_row in rows:
        if not isinstance(raw_row, Mapping):
            continue
        joined = raw_row.get("interview_sessions")
        joined_session = joined[0] if isinstance(joined, list) and joined else joined
        config = joined_session.get("config") if isinstance(joined_session, Mapping) else None
        report = raw_row.get("report")
        if not isinstance(report, Mapping):
            continue
        summaries.append(
            SessionSummary(
                id=str(raw_row.get("session_id")),
                job_title=config.get("job_title") if isinstance(config, Mapping) else None,
                company=config.get("company") if isinstance(config, Mapping) else None,
                cv_draft_id=config.get("cv_draft_id") if isinstance(config, Mapping) else None,
                created_at=str(raw_row.get("created_at")),
                report=FeedbackReport.model_validate(report),
            )
        )
    return summaries


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
    cv_text: str | None = None,
    role_level: str | None = None,
    interview_stage: InterviewStage = InterviewStage.EXPERIENCE_TECHNICAL,
    job_title: str | None = None,
    company: str | None = None,
    cv_draft_id: str | None = None,
    hiring_process: HiringProcessResearch | None = None,
    llm_client: StructuredClient | None = None,
) -> InterviewSession:
    """Seed a session from the CV and most recent coaching weaknesses."""
    candidate_cv = cv_text.strip() if cv_text else _load_cv_text(db, user_id)
    weak_topics = _load_recent_weak_topics(db, user_id, interview_stage, company, job_title)
    topics = generate_topics(
        candidate_cv,
        job_description,
        weak_topics,
        role_level,
        interview_stage,
        llm_client,
    )
    config = SessionConfig(
        user_id=user_id,
        job_description=job_description,
        role_level=role_level,
        interview_stage=interview_stage,
        job_title=job_title,
        company=company,
        cv_draft_id=cv_draft_id,
        hiring_process=hiring_process,
        topics=topics,
    )
    first_topic = topics[0]
    opening = " ".join(part for part in (first_topic.callback, first_topic.opening_question) if part)
    state = InterviewState(
        topic_states=[TopicState(topic_id=topic.id) for topic in topics],
        messages=[ChatMessage(role="interviewer", content=opening)],
        events=[SessionEvent(type=SessionEventType.SESSION_STARTED, detail={"stage": interview_stage.value})],
    )
    response = (
        db.table(SESSIONS_TABLE)
        .insert(
            {
                "user_id": user_id,
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
    delivery: DeliveryEvidence | None = None,
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
    analysis, move = analyze(
        answer.strip(), topic, topic_state, next_topic, llm_client,
        interview_stage=session.config.interview_stage,
    )

    topic_state.answer_count += 1
    if move is NextMove.FOLLOW_UP:
        topic_state.followup_count += 1
    elif move is NextMove.HINT:
        topic_state.hint_count += 1
    else:
        topic_state.completed = True
        session.state.current_topic_index += 1

    turn = TurnRecord(
        topic_id=topic.id,
        answer=answer.strip(),
        delivery=delivery,
        analysis=analysis,
        move=move,
    )
    session.state.turns.append(turn)
    session.state.events.append(
        SessionEvent(
            type=SessionEventType.ANSWER_SUBMITTED,
            topic_id=topic.id,
            detail={"verdict": analysis.verdict.value, "move": move.value},
        )
    )
    if move is NextMove.HINT:
        session.state.events.append(
            SessionEvent(type=SessionEventType.HINT_REQUESTED, topic_id=topic.id)
        )
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
    session.state.events.append(SessionEvent(type=SessionEventType.FINISHED_EARLY))
    db.table(SESSIONS_TABLE).update(
        {"state": session.state.model_dump(mode="json"), "status": session.status.value}
    ).eq("id", session_id).execute()
    return session


def skip_topic(db: Client, session_id: str) -> tuple[InterviewSession, str]:
    """Honor an explicit candidate skip without spending follow-up or hint quota."""
    session = load_session(db, session_id)
    if session.status is not SessionStatus.ACTIVE:
        raise InvalidSessionStateError("Only active sessions can skip a topic")
    index = session.state.current_topic_index
    if index >= len(session.config.topics):
        raise InvalidSessionStateError("All interview topics are already complete")

    session.state.topic_states[index].completed = True
    session.state.current_topic_index += 1
    if session.state.current_topic_index < len(session.config.topics):
        next_topic = session.config.topics[session.state.current_topic_index]
        message = " ".join(
            part for part in (next_topic.callback, next_topic.opening_question) if part
        )
    else:
        session.status = SessionStatus.EVALUATING
        message = "That was the final topic. I’ll prepare your feedback report now."
    session.state.messages.append(ChatMessage(role="interviewer", content=message))
    session.state.events.append(
        SessionEvent(type=SessionEventType.TOPIC_SKIPPED, topic_id=session.config.topics[index].id)
    )
    db.table(SESSIONS_TABLE).update(
        {"state": session.state.model_dump(mode="json"), "status": session.status.value}
    ).eq("id", session_id).execute()
    return session, message


def timeout_topic(
    db: Client,
    session_id: str,
    llm_client: StructuredClient | None = None,
) -> tuple[InterviewSession, TurnAnalysis, NextMove]:
    """React to candidate silence without recording fabricated candidate speech."""
    session = load_session(db, session_id)
    if session.status is not SessionStatus.ACTIVE:
        raise InvalidSessionStateError("Only active sessions can handle inactivity")
    index = session.state.current_topic_index
    if index >= len(session.config.topics):
        raise InvalidSessionStateError("All interview topics are already complete")

    topic = session.config.topics[index]
    topic_state = session.state.topic_states[index]
    next_topic = session.config.topics[index + 1] if index + 1 < len(session.config.topics) else None
    analysis, move = analyze(
        "The candidate has remained silent and has not provided an answer.",
        topic,
        topic_state,
        next_topic,
        llm_client,
        AnswerVerdict.STUCK,
        interview_stage=session.config.interview_stage,
    )
    topic_state.answer_count += 1
    if move is NextMove.HINT:
        topic_state.hint_count += 1
    elif move is NextMove.FOLLOW_UP:
        topic_state.followup_count += 1
    else:
        topic_state.completed = True
        session.state.current_topic_index += 1
    session.state.messages.append(
        ChatMessage(role="interviewer", content=analysis.interviewer_message)
    )
    session.state.events.append(
        SessionEvent(
            type=SessionEventType.TIMEOUT,
            topic_id=topic.id,
            detail={"move": move.value},
        )
    )
    if move is NextMove.COMPLETE:
        session.status = SessionStatus.EVALUATING

    db.table(SESSIONS_TABLE).update(
        {"state": session.state.model_dump(mode="json"), "status": session.status.value}
    ).eq("id", session_id).execute()
    return session, analysis, move


def record_session_event(
    db: Client,
    session_id: str,
    event_type: SessionEventType,
    detail: dict[str, object] | None = None,
) -> InterviewSession:
    """Persist a client lifecycle event such as pause or resume."""
    session = load_session(db, session_id)
    if session.status is not SessionStatus.ACTIVE:
        raise InvalidSessionStateError("Only active sessions accept lifecycle events")
    topic_id = (
        session.config.topics[session.state.current_topic_index].id
        if session.state.current_topic_index < len(session.config.topics)
        else None
    )
    session.state.events.append(
        SessionEvent(type=event_type, topic_id=topic_id, detail=detail or {})
    )
    db.table(SESSIONS_TABLE).update({"state": session.state.model_dump(mode="json")}).eq(
        "id", session_id
    ).execute()
    return session


def abandon_session(db: Client, session_id: str, reason: str) -> InterviewSession:
    """Persist an intentional exit so incomplete sessions are not left active forever."""
    session = load_session(db, session_id)
    if session.status is not SessionStatus.ACTIVE:
        return session
    session.state.events.append(
        SessionEvent(type=SessionEventType.ABANDONED, detail={"reason": reason})
    )
    session.status = SessionStatus.ABANDONED
    db.table(SESSIONS_TABLE).update(
        {"state": session.state.model_dump(mode="json"), "status": session.status.value}
    ).eq("id", session_id).execute()
    return session


def evaluate_and_save(db: Client, session_id: str, llm_client: StructuredClient | None = None) -> None:
    """Background task: evaluate once, persist report, then expose completed status."""
    session = load_session(db, session_id)
    try:
        report = evaluate_session(
            session.config.topics,
            session.state,
            llm_client,
            interview_stage=session.config.interview_stage,
        )
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
