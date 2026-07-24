"""Reusable FastAPI integration boundary for the inbox watcher."""

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from typing import Literal

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import Client, create_client

from email_services.loop import watcher_loop
from email_services.schemas import ClassifiedEmail, EmailIntent
from email_services.transitions import transition_target


WATCHER_TASK_NAME = "inbox-watcher"
ATTENTION_TABLE = "needs_attention"
EMAILS_TABLE = "emails"
APPLICATION_VIEW = "application_overview"
APPLICATIONS_TABLE = "applications"
PREP_MATERIALS_TABLE = "prep_materials"
TRANSITION_RPC = "apply_watcher_transition"
API_PREFIX = "/email-services"
DEFAULT_FRONTEND_ORIGIN = "http://localhost:3001"

load_dotenv()

router = APIRouter(prefix=API_PREFIX, tags=["email-services"])


class EmailNotification(BaseModel):
    """Expose only the review context the dashboard needs."""

    id: str
    email_id: str
    company: str
    role: str
    subject: str
    body: str
    received_at: str | None
    intent: EmailIntent
    confidence: float
    match_score: float
    question: str


class AttentionActionResult(BaseModel):
    """Give the frontend a stable acknowledgement after a review action."""

    id: str
    resolution: str


ApplicationStatus = Literal[
    "not_applied",
    "applied",
    "interview",
    "offer",
    "rejected",
    "accepted",
    "withdrawn",
]


class ApplicationRecord(BaseModel):
    """Return the database-owned status for one job application."""

    id: str
    job_id: str
    status: ApplicationStatus
    applied_at: str | None
    last_activity_at: str


class ApplicationStatusUpdate(BaseModel):
    """Constrain manual board movements to statuses supported by Supabase."""

    status: ApplicationStatus


class InterviewPrepDraft(BaseModel):
    """A persisted handoff from an interview email to the practice workspace."""

    id: str
    application_id: str
    job_id: str
    company: str
    job_title: str
    suggested_stage: str
    created_at: str


def _required_environment(name: str) -> str:
    """Reject incomplete server configuration before background work begins."""
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def create_watcher_db_client() -> Client:
    """Keep the privileged Supabase key confined to the backend integration."""
    return create_client(
        _required_environment("SUPABASE_URL"),
        _required_environment("SUPABASE_SERVICE_ROLE_KEY"),
    )


def configure_email_services(app: FastAPI) -> None:
    """Attach review routes and narrowly scoped browser access to an existing API."""
    frontend_origin = os.getenv("FRONTEND_ORIGIN", DEFAULT_FRONTEND_ORIGIN)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[frontend_origin],
        # Local dev: also accept any localhost/127.0.0.1 origin (any port) so the
        # browser isn't blocked when opened at 127.0.0.1:3000 vs localhost:3000.
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-User-ID"],
    )
    app.include_router(router)


def _single_row(rows: object) -> dict[str, object] | None:
    """Keep missing-row handling consistent across Supabase review queries."""
    if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
        return None
    return dict(rows[0])


def _load_attention(db: Client, attention_id: str) -> dict[str, object]:
    """Reject stale or repeated review actions before changing application state."""
    response = (
        db.table(ATTENTION_TABLE)
        .select("id,email_id,candidate_application_id,question,resolved,created_at")
        .eq("id", attention_id)
        .limit(1)
        .execute()
    )
    row = _single_row(response.data)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attention item not found")
    if row.get("resolved") is True:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Attention item is already resolved")
    return row


def _load_email(db: Client, email_id: str) -> dict[str, object]:
    """Use persisted classification evidence instead of calling the model again."""
    response = db.table(EMAILS_TABLE).select("*").eq("id", email_id).limit(1).execute()
    row = _single_row(response.data)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email record not found")
    return row


def _load_application(db: Client, application_id: str) -> dict[str, object]:
    """Read company, role, and current status from the matcher-ready view."""
    response = db.table(APPLICATION_VIEW).select("*").eq("id", application_id).limit(1).execute()
    row = _single_row(response.data)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return row


def _application_record(row: dict[str, object]) -> ApplicationRecord:
    """Validate Supabase application rows before returning them to the browser."""
    return ApplicationRecord.model_validate(row)


@router.get("/applications", response_model=list[ApplicationRecord])
def list_applications() -> list[ApplicationRecord]:
    """Make Supabase the source of truth for the application board."""
    db = create_watcher_db_client()
    response = (
        db.table(APPLICATION_VIEW)
        .select("id,job_id,status,applied_at,last_activity_at")
        .execute()
    )
    rows = response.data if isinstance(response.data, list) else []
    return [
        _application_record(dict(row))
        for row in rows
        if isinstance(row, dict)
    ]


@router.patch("/applications/{job_id}", response_model=ApplicationRecord)
def update_application_status(
    job_id: str,
    update: ApplicationStatusUpdate,
) -> ApplicationRecord:
    """Persist a manual drag-and-drop movement instead of writing browser storage."""
    db = create_watcher_db_client()
    current_response = (
        db.table(APPLICATIONS_TABLE)
        .select("id,job_id,status,applied_at,last_activity_at")
        .eq("job_id", job_id)
        .limit(1)
        .execute()
    )
    current = _single_row(current_response.data)
    now = datetime.now(UTC).isoformat()

    if current is None:
        payload: dict[str, object] = {"job_id": job_id, "status": update.status}
        if update.status != "not_applied":
            payload["applied_at"] = now
        response = db.table(APPLICATIONS_TABLE).insert(payload).execute()
    else:
        payload = {"status": update.status}
        if not current.get("applied_at") and update.status != "not_applied":
            payload["applied_at"] = now
        response = (
            db.table(APPLICATIONS_TABLE)
            .update(payload)
            .eq("id", str(current["id"]))
            .execute()
        )

    row = _single_row(response.data)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase did not return the updated application",
        )
    return _application_record(row)


@router.get("/notifications", response_model=list[EmailNotification])
def list_notifications() -> list[EmailNotification]:
    """Return unresolved decisions so the browser never needs privileged Supabase access."""
    db = create_watcher_db_client()
    attention_response = (
        db.table(ATTENTION_TABLE)
        .select("id,email_id,candidate_application_id,question,resolved,created_at")
        .eq("resolved", False)
        .order("created_at", desc=True)
        .execute()
    )
    attention_rows = attention_response.data if isinstance(attention_response.data, list) else []
    notifications: list[EmailNotification] = []

    for raw_attention in attention_rows:
        if not isinstance(raw_attention, dict):
            continue
        attention = dict(raw_attention)
        email_id = str(attention["email_id"])
        email_row = _load_email(db, email_id)
        application_id = attention.get("candidate_application_id")
        application = _load_application(db, str(application_id)) if application_id else None
        notifications.append(
            EmailNotification(
                id=str(attention["id"]),
                email_id=email_id,
                company=str((application or {}).get("company") or email_row.get("company_guess") or "Unknown company"),
                role=str((application or {}).get("role") or email_row.get("role_guess") or "Role not identified"),
                subject=str(email_row.get("subject") or "No subject"),
                body=str(email_row.get("body") or ""),
                received_at=str(email_row["received_at"]) if email_row.get("received_at") else None,
                intent=EmailIntent(str(email_row["intent"])),
                confidence=float(email_row.get("confidence") or 0.0),
                match_score=float(email_row.get("match_score") or 0.0),
                question=str(attention["question"]),
            )
        )
    return notifications


@router.get("/interview-prep", response_model=list[InterviewPrepDraft])
def list_interview_prep() -> list[InterviewPrepDraft]:
    """Expose ready practice drafts without giving the browser direct database access."""
    db = create_watcher_db_client()
    response = (
        db.table(PREP_MATERIALS_TABLE)
        .select("id,application_id,content,created_at")
        .order("created_at", desc=True)
        .execute()
    )
    rows = response.data if isinstance(response.data, list) else []
    drafts: list[InterviewPrepDraft] = []
    for raw_row in rows:
        if not isinstance(raw_row, dict) or not isinstance(raw_row.get("content"), dict):
            continue
        row = dict(raw_row)
        content = dict(row["content"])
        if content.get("kind") != "interview_practice_draft" or content.get("status") != "ready":
            continue
        required_content = ("job_id", "company", "job_title")
        if any(not content.get(field) for field in required_content):
            continue
        drafts.append(
            InterviewPrepDraft(
                id=str(row["id"]),
                application_id=str(row["application_id"]),
                job_id=str(content["job_id"]),
                company=str(content["company"]),
                job_title=str(content["job_title"]),
                suggested_stage=str(content.get("suggested_stage") or "phone_screen"),
                created_at=str(row["created_at"]),
            )
        )
    return drafts


@router.post("/needs-attention/{attention_id}/confirm", response_model=AttentionActionResult)
def confirm_attention(attention_id: str) -> AttentionActionResult:
    """Let a human approve low-confidence evidence while retaining legal transition rules."""
    db = create_watcher_db_client()
    attention = _load_attention(db, attention_id)
    application_id = attention.get("candidate_application_id")
    if not application_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No candidate application is linked")

    email_row = _load_email(db, str(attention["email_id"]))
    application = _load_application(db, str(application_id))
    classified = ClassifiedEmail(
        intent=EmailIntent(str(email_row["intent"])),
        company_guess=str(email_row["company_guess"]) if email_row.get("company_guess") else None,
        role_guess=str(email_row["role_guess"]) if email_row.get("role_guess") else None,
        proposed_times=list(email_row.get("proposed_times") or []),
        confidence=float(email_row.get("confidence") or 0.0),
    )
    target_status = transition_target(application, classified)
    if target_status is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This status transition is not legal")

    db.rpc(
        TRANSITION_RPC,
        {
            "p_application_id": str(application_id),
            "p_email_id": str(attention["email_id"]),
            "p_to_status": target_status,
        },
    ).execute()
    db.table(ATTENTION_TABLE).update(
        {"resolved": True, "resolution": "confirmed", "resolved_at": datetime.now(UTC).isoformat()}
    ).eq("id", attention_id).execute()

    return AttentionActionResult(id=attention_id, resolution="confirmed")


@router.post("/needs-attention/{attention_id}/dismiss", response_model=AttentionActionResult)
def dismiss_attention(attention_id: str) -> AttentionActionResult:
    """Resolve rejected evidence without changing the linked application."""
    db = create_watcher_db_client()
    _load_attention(db, attention_id)
    db.table(ATTENTION_TABLE).update(
        {"resolved": True, "resolution": "dismissed", "resolved_at": datetime.now(UTC).isoformat()}
    ).eq("id", attention_id).execute()
    return AttentionActionResult(id=attention_id, resolution="dismissed")


def start_watcher(db: Client | None = None) -> asyncio.Task[None]:
    """Return the task so the owning API can cancel it during shutdown."""
    return asyncio.create_task(
        watcher_loop(db or create_watcher_db_client()),
        name=WATCHER_TASK_NAME,
    )


async def stop_watcher(task: asyncio.Task[None]) -> None:
    """Await cancellation so shutdown never leaves mailbox work half-owned."""
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


@asynccontextmanager
async def inbox_watcher_lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Offer an attachable lifespan without constructing the FastAPI application."""
    watcher_task = start_watcher()
    try:
        yield
    finally:
        await stop_watcher(watcher_task)
