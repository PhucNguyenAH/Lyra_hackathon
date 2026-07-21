"""Validated data contracts shared by the inbox watcher pipeline."""

from enum import Enum

from pydantic import BaseModel, Field


class EmailIntent(str, Enum):
    """Constrain classification output to decisions the watcher understands."""

    INTERVIEW_INVITE = "interview_invite"
    REJECTION = "rejection"
    OFFER = "offer"
    ACK = "ack"
    UNRELATED = "unrelated"


class ClassifiedEmail(BaseModel):
    """Keep model output typed and confidence-bounded before matching applications."""

    intent: EmailIntent
    company_guess: str | None = None
    role_guess: str | None = None
    proposed_times: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
