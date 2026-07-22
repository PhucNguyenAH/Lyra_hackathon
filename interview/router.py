"""FastAPI routes for creating, running, ending, and polling interviews."""

import os

from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, File, HTTPException, UploadFile, status
from supabase import Client, create_client

from interview.schemas import (
    AbandonSessionRequest,
    AnswerRequest,
    AnswerResponse,
    CreateSessionRequest,
    HiringProcessRequest,
    HiringProcessResearch,
    InterviewSession,
    ReportResponse,
    SessionEventRequest,
    SessionSummary,
    SkipResponse,
    TranscriptionResponse,
)
from interview.session import (
    InvalidSessionStateError,
    SessionNotFoundError,
    abandon_session,
    answer_session,
    create_session,
    evaluate_and_save,
    list_completed_sessions,
    load_report,
    load_session,
    mark_for_evaluation,
    record_session_event,
    skip_topic,
    timeout_topic,
)
from interview.transcription import transcribe_audio
from interview.hiring_process import research_hiring_process


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
            db=db,
            user_id=request.user_id,
            job_description=request.job_description,
            cv_text=request.cv_text,
            role_level=request.role_level,
            interview_stage=request.interview_stage,
            job_title=request.job_title,
            company=request.company,
            cv_draft_id=request.cv_draft_id,
            hiring_process=request.hiring_process,
        )
    except InvalidSessionStateError as error:
        raise _translate_session_error(error) from error


@router.get("/sessions", response_model=list[SessionSummary])
def list_sessions(user_id: str, db: Client = Depends(get_interview_db)) -> list[SessionSummary]:
    return list_completed_sessions(db, user_id)


@router.get("/sessions/{session_id}", response_model=InterviewSession)
def get_session(session_id: str, db: Client = Depends(get_interview_db)) -> InterviewSession:
    try:
        return load_session(db, session_id)
    except SessionNotFoundError as error:
        raise _translate_session_error(error) from error


@router.post("/hiring-process/research", response_model=HiringProcessResearch)
def research_job_hiring_process(request: HiringProcessRequest) -> HiringProcessResearch:
    try:
        return research_hiring_process(request.company, request.job_title, request.job_url)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error


@router.post("/sessions/{session_id}/answer", response_model=AnswerResponse)
def submit_answer(
    session_id: str,
    request: AnswerRequest,
    background_tasks: BackgroundTasks,
    db: Client = Depends(get_interview_db),
) -> AnswerResponse:
    try:
        interview_session, turn = answer_session(
            db,
            session_id,
            request.answer,
            request.delivery,
        )
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


@router.post("/transcriptions", response_model=TranscriptionResponse)
async def transcribe_interview_answer(audio: UploadFile = File(...)) -> TranscriptionResponse:
    """Transcribe a recorded answer with Groq Whisper, then discard the audio bytes."""
    try:
        text, duration = transcribe_audio(
            audio.filename or "interview-answer.webm",
            await audio.read(),
            audio.content_type or "audio/webm",
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    return TranscriptionResponse(text=text, duration_seconds=duration)


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


@router.post("/sessions/{session_id}/events", response_model=InterviewSession)
def add_session_event(
    session_id: str,
    request: SessionEventRequest,
    db: Client = Depends(get_interview_db),
) -> InterviewSession:
    try:
        return record_session_event(db, session_id, request.type, request.detail)
    except (SessionNotFoundError, InvalidSessionStateError) as error:
        raise _translate_session_error(error) from error


@router.post("/sessions/{session_id}/abandon", response_model=InterviewSession)
def abandon_interview_session(
    session_id: str,
    request: AbandonSessionRequest,
    db: Client = Depends(get_interview_db),
) -> InterviewSession:
    try:
        return abandon_session(db, session_id, request.reason)
    except SessionNotFoundError as error:
        raise _translate_session_error(error) from error


@router.get("/sessions/{session_id}/report", response_model=ReportResponse)
def get_report(session_id: str, db: Client = Depends(get_interview_db)) -> ReportResponse:
    try:
        report_status, report = load_report(db, session_id)
    except SessionNotFoundError as error:
        raise _translate_session_error(error) from error
    return ReportResponse(status=report_status, report=report)


def configure_interview(app: FastAPI) -> None:
    app.include_router(router)
