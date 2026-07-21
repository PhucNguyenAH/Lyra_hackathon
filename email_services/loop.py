"""Polling orchestration for safely applying inbox evidence to Supabase."""

import asyncio
import logging
import os
from collections.abc import Mapping

from dotenv import load_dotenv
from supabase import Client

from email_services.classifier import classify
from email_services.imap_client import EmailData, MAILBOX_NAME, fetch_unseen, mark_seen
from email_services.matcher import match_application
from email_services.schemas import ClassifiedEmail, EmailIntent
from email_services.transitions import decide, transition_target


DEFAULT_POLL_INTERVAL_SECONDS = 30
MIN_POLL_INTERVAL_SECONDS = 1
DEDUP_QUERY_LIMIT = 1
APPLICATION_VIEW = "application_overview"
EMAILS_TABLE = "emails"
NEEDS_ATTENTION_TABLE = "needs_attention"
WATCHABLE_STATUSES = ("applied", "interview", "offer")
WATCHER_TRANSITION_RPC = "apply_watcher_transition"
ACTIVITY_RPC = "bump_application_activity"

LOGGER = logging.getLogger("email_services.watcher")

load_dotenv()


def _required_environment(name: str) -> str:
    """Fail at startup rather than silently polling with incomplete credentials."""
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _poll_interval_seconds() -> int:
    """Keep deployment timing configurable without hiding an invalid value."""
    raw_value = os.getenv("INBOX_POLL_SECONDS", str(DEFAULT_POLL_INTERVAL_SECONDS))
    interval = int(raw_value)
    if interval < MIN_POLL_INTERVAL_SECONDS:
        raise ValueError("INBOX_POLL_SECONDS must be greater than zero")
    return interval


def _watcher_enabled() -> bool:
    """Allow deployments to disable mailbox access without removing the task."""
    return os.getenv("INBOX_WATCHER_ENABLED", "true").strip().lower() == "true"


def _rows(response_data: object) -> list[dict[str, object]]:
    """Normalize Supabase response data at one boundary for typed pipeline code."""
    if not isinstance(response_data, list):
        return []
    return [dict(row) for row in response_data if isinstance(row, Mapping)]


def _already_persisted(db: Client, imap_user: str, email_data: EmailData) -> bool:
    """Stop retries from creating duplicate actions after a completed DB write."""
    response = (
        db.table(EMAILS_TABLE)
        .select("id")
        .eq("imap_user", imap_user)
        .eq("mailbox", MAILBOX_NAME)
        .eq("imap_uid", email_data["imap_uid"])
        .limit(DEDUP_QUERY_LIMIT)
        .execute()
    )
    return bool(_rows(response.data))


def _eligible_applications(db: Client) -> list[dict[str, object]]:
    """Fetch matcher-ready rows while excluding jobs the user has not applied to."""
    response = (
        db.table(APPLICATION_VIEW)
        .select("id,company,role,status,last_activity_at")
        .in_("status", list(WATCHABLE_STATUSES))
        .execute()
    )
    return _rows(response.data)


def _persist_email(
    db: Client,
    imap_user: str,
    email_data: EmailData,
    classified: ClassifiedEmail,
    application: Mapping[str, object] | None,
    match_score: float,
    decision: str,
) -> str:
    """Create the audit record before downstream actions reference the email."""
    payload = {
        "imap_user": imap_user,
        "mailbox": MAILBOX_NAME,
        "imap_uid": int(email_data["imap_uid"]),
        "message_id": email_data.get("message_id") or None,
        "from_address": email_data["from"],
        "subject": email_data.get("subject") or None,
        "body": email_data.get("body") or None,
        "received_at": email_data.get("received_at") or None,
        "intent": classified.intent.value,
        "company_guess": classified.company_guess,
        "role_guess": classified.role_guess,
        "proposed_times": classified.proposed_times,
        "confidence": classified.confidence,
        "matched_application_id": application.get("id") if application else None,
        "match_score": match_score,
        "decision": decision,
    }
    response = db.table(EMAILS_TABLE).insert(payload).execute()
    rows = _rows(response.data)
    if not rows or not isinstance(rows[0].get("id"), str):
        raise RuntimeError("Supabase did not return the persisted email ID")
    return str(rows[0]["id"])


def _enqueue_attention(
    db: Client,
    email_id: str,
    classified: ClassifiedEmail,
    application: Mapping[str, object] | None,
) -> None:
    """Give uncertain evidence a concrete question instead of losing it in logs."""
    company = classified.company_guess or "this sender"
    db.table(NEEDS_ATTENTION_TABLE).insert(
        {
            "email_id": email_id,
            "candidate_application_id": application.get("id") if application else None,
            "question": f"Is this {classified.intent.value} email about your {company} application?",
        }
    ).execute()


def _process_email(
    db: Client,
    imap_user: str,
    email_data: EmailData,
) -> Mapping[str, object] | None:
    """Keep classification, persistence, and action ordered before IMAP acknowledgement."""
    if _already_persisted(db, imap_user, email_data):
        LOGGER.info(
            "email_already_processed",
            extra={"imap_uid": email_data["imap_uid"]},
        )
        return None

    classified = classify(email_data)
    applications = _eligible_applications(db)
    application, match_score = match_application(classified, applications)
    action = decide(application, classified, match_score)
    email_id = _persist_email(
        db,
        imap_user,
        email_data,
        classified,
        application,
        match_score,
        action,
    )

    try:
        if action == "auto":
            target_status = transition_target(application, classified)
            if application is None or target_status is None:
                raise RuntimeError("Auto decision has no legal application transition")
            db.rpc(
                WATCHER_TRANSITION_RPC,
                {
                    "p_application_id": application["id"],
                    "p_email_id": email_id,
                    "p_to_status": target_status,
                },
            ).execute()
        elif action == "needs_attention":
            _enqueue_attention(db, email_id, classified, application)
        elif classified.intent is EmailIntent.ACK and application is not None:
            db.rpc(
                ACTIVITY_RPC,
                {"p_application_id": application["id"]},
            ).execute()
    except Exception:
        db.table(EMAILS_TABLE).delete().eq("id", email_id).execute()
        raise

    LOGGER.info(
        "email_processed",
        extra={
            "imap_uid": email_data["imap_uid"],
            "intent": classified.intent.value,
            "classification_confidence": classified.confidence,
            "match_score": match_score,
            "decision": action,
            "application_id": application.get("id") if application else None,
        },
    )

    if action == "auto" and classified.intent is EmailIntent.INTERVIEW_INVITE:
        return application
    return None


async def generate_prep(application: Mapping[str, object]) -> None:
    """Reserve a non-blocking extension point for interview preparation generation."""
    LOGGER.info(
        "prep_generation_requested",
        extra={"application_id": application.get("id")},
    )


async def watcher_loop(db: Client) -> None:
    """Keep transient mailbox or model failures from terminating the FastAPI process."""
    if not _watcher_enabled():
        LOGGER.info("watcher_disabled")
        return

    imap_host = _required_environment("IMAP_HOST")
    imap_user = _required_environment("IMAP_USER")
    imap_password = _required_environment("IMAP_APP_PASSWORD")
    poll_interval = _poll_interval_seconds()

    LOGGER.info(
        "watcher_started",
        extra={"imap_host": imap_host, "poll_interval_seconds": poll_interval},
    )

    while True:
        try:
            unseen = await asyncio.to_thread(fetch_unseen, imap_host, imap_user, imap_password)
            LOGGER.info("watcher_poll", extra={"unseen_count": len(unseen)})

            for email_data in unseen:
                prep_application = await asyncio.to_thread(
                    _process_email,
                    db,
                    imap_user,
                    email_data,
                )
                if prep_application is not None:
                    asyncio.create_task(generate_prep(prep_application))

                await asyncio.to_thread(
                    mark_seen,
                    imap_host,
                    imap_user,
                    imap_password,
                    email_data["imap_uid"],
                )
        except asyncio.CancelledError:
            LOGGER.info("watcher_stopped")
            raise
        except Exception:
            LOGGER.exception("watcher_iteration_failed")

        await asyncio.sleep(poll_interval)
