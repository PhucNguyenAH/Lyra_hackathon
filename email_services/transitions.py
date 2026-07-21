"""Safety policy for converting email evidence into application actions."""

from collections.abc import Mapping
from typing import Literal, TypeAlias

from email_services.schemas import ClassifiedEmail, EmailIntent


AUTO_CLASSIFICATION_CONFIDENCE = 0.85
AUTO_MATCH_SCORE = 0.80
STATUS_FIELD = "status"

Decision: TypeAlias = Literal["auto", "needs_attention", "ignore"]

LEGAL_TRANSITIONS: dict[tuple[str, EmailIntent], str] = {
    ("applied", EmailIntent.INTERVIEW_INVITE): "interview",
    ("applied", EmailIntent.REJECTION): "rejected",
    ("interview", EmailIntent.REJECTION): "rejected",
    ("interview", EmailIntent.OFFER): "offer",
}


def _field_value(application: object, field_name: str) -> object | None:
    """Keep transition policy compatible with mappings and existing DB model objects."""
    if isinstance(application, Mapping):
        return application.get(field_name)
    return getattr(application, field_name, None)


def _status_value(application: object) -> str:
    """Normalize enum-backed statuses before consulting the legal transition table."""
    raw_status = _field_value(application, STATUS_FIELD)
    enum_value = getattr(raw_status, "value", raw_status)
    return str(enum_value).strip().lower() if enum_value is not None else ""


def transition_target(
    application: object | None,
    classified: ClassifiedEmail,
) -> str | None:
    """Centralize target lookup so decision and persistence cannot disagree."""
    if application is None:
        return None
    return LEGAL_TRANSITIONS.get((_status_value(application), classified.intent))


def decide(
    application: object | None,
    classified: ClassifiedEmail,
    match_score: float,
) -> Decision:
    """Require both strong identity and intent evidence before changing user data."""
    if classified.intent is EmailIntent.UNRELATED:
        return "ignore"

    if classified.intent is EmailIntent.ACK:
        return "ignore"

    target_status = transition_target(application, classified)
    if target_status is None:
        return "needs_attention"

    if (
        match_score >= AUTO_MATCH_SCORE
        and classified.confidence >= AUTO_CLASSIFICATION_CONFIDENCE
    ):
        return "auto"

    return "needs_attention"
