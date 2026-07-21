from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime

class EmailIntent(str, Enum):
    INTERVIEW_INVITE = "interview_invite"
    REJECTION = "rejection"
    OFFER = "offer"
    ACK = "ack" # Notification
    UNRELATED = "unrelated"

class ClassifiedEmail(BaseModel):
    intent: EmailIntent
    company_guess: str | None
    role_guess: str | None
    proposed_times: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str # force LLM to justify 


class InboxEvent(BaseModel):
    """What lands in Needs Attention, or drives an auto-action."""
    id: str
    email_subject: str
    email_from: str
    received_at: datetime
    classification: ClassifiedEmail
    matched_application_id: str | None = None
    match_confidence: float = 0.0
    resolution: str  # "auto_applied" | "needs_confirmation" | "ignored"




