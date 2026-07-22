"""FastAPI routes for creating, running, ending, and polling interviews."""

import os

from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, HTTPException, status
from supabase import Client, create_client

from interview.schemas import (
    AnswerRequest,
    AnswerResponse,
    CreateSessionRequest,
    InterviewSession,
    ReportResponse,
    SkipResponse,
)
from interview.session import (
    InvalidSessionStateError,
    SessionNotFoundError,
    answer_session,
    create_session,
    evaluate_and_save,
    load_report,
    load_session,
    mark_for_evaluation,
    skip_topic,
    timeout_topic,
)


API_PREFIX = "/interview"
router = APIRouter(prefix=API_PREFIX, tags=["interview"])


def _required_environment(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_interview_db() -> Client:
    return create_client(
        _required_environment("SUPABASE_URL"),
        _required_environment("SUPABASE_SERVICE_ROLE_KEY"),
    )


def _translate_session_error(error: Exception) -> HTTPException:
    if isinstance(error, SessionNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found")
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))


@router.post("/sessions", response_model=InterviewSession, status_code=status.HTTP_201_CREATED)
def start_session(request: CreateSessionRequest, db: Client = Depends(get_interview_db)) -> InterviewSession:
    try:
        return create_session(
            db,
            request.user_id,
            request.job_description,
            request.cv_text,
            request.role_level,
        )
    except InvalidSessionStateError as error:
        raise _translate_session_error(error) from error


@router.get("/sessions/{session_id}", response_model=InterviewSession)
def get_session(session_id: str, db: Client = Depends(get_interview_db)) -> InterviewSession:
    try:
        return load_session(db, session_id)
    except SessionNotFoundError as error:
        raise _translate_session_error(error) from error


@router.post("/sessions/{session_id}/answer", response_model=AnswerResponse)
def submit_answer(
    session_id: str,
    request: AnswerRequest,
    background_tasks: BackgroundTasks,
    db: Client = Depends(get_interview_db),
) -> AnswerResponse:
    try:
        interview_session, turn = answer_session(db, session_id, request.answer)
    except (SessionNotFoundError, InvalidSessionStateError) as error:
        raise _translate_session_error(error) from error

    session_complete = interview_session.status.value == "evaluating"
    if session_complete:
        background_tasks.add_task(evaluate_and_save, db, session_id)
    return AnswerResponse(
        interviewer_message=turn.analysis.interviewer_message,
        verdict=turn.analysis.verdict,
        move=turn.move,
        session_complete=session_complete,
    )


@router.post("/sessions/{session_id}/end", response_model=ReportResponse, status_code=status.HTTP_202_ACCEPTED)
def end_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: Client = Depends(get_interview_db),
) -> ReportResponse:
    try:
        interview_session = mark_for_evaluation(db, session_id)
    except (SessionNotFoundError, InvalidSessionStateError) as error:
        raise _translate_session_error(error) from error
    background_tasks.add_task(evaluate_and_save, db, session_id)
    return ReportResponse(status=interview_session.status, report=None)


@router.post("/sessions/{session_id}/skip", response_model=SkipResponse)
def skip_current_topic(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: Client = Depends(get_interview_db),
) -> SkipResponse:
    try:
        interview_session, message = skip_topic(db, session_id)
    except (SessionNotFoundError, InvalidSessionStateError) as error:
        raise _translate_session_error(error) from error
    session_complete = interview_session.status.value == "evaluating"
    if session_complete:
        background_tasks.add_task(evaluate_and_save, db, session_id)
    return SkipResponse(interviewer_message=message, session_complete=session_complete)


@router.post("/sessions/{session_id}/timeout", response_model=AnswerResponse)
def handle_topic_timeout(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: Client = Depends(get_interview_db),
) -> AnswerResponse:
    try:
        interview_session, analysis, move = timeout_topic(db, session_id)
    except (SessionNotFoundError, InvalidSessionStateError) as error:
        raise _translate_session_error(error) from error
    session_complete = interview_session.status.value == "evaluating"
    if session_complete:
        background_tasks.add_task(evaluate_and_save, db, session_id)
    return AnswerResponse(
        interviewer_message=analysis.interviewer_message,
        verdict=analysis.verdict,
        move=move,
        session_complete=session_complete,
    )


@router.get("/sessions/{session_id}/report", response_model=ReportResponse)
def get_report(session_id: str, db: Client = Depends(get_interview_db)) -> ReportResponse:
    try:
        report_status, report = load_report(db, session_id)
    except SessionNotFoundError as error:
        raise _translate_session_error(error) from error
    return ReportResponse(status=report_status, report=report)


def configure_interview(app: FastAPI) -> None:
    app.include_router(router)
