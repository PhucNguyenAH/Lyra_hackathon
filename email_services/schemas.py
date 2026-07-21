"""Validated data contracts shared by the inbox watcher pipeline."""

from enum import Enum

from typing import Any

from pydantic import BaseModel, Field, field_validator


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

    @field_validator(
        "proposed_times",
        mode="before",
        json_schema_input_type=list[str] | None,
    )
    @classmethod
    def normalize_missing_times(cls, value: Any) -> Any:
        """Treat a model's null as no proposed times instead of losing the email."""
        return [] if value is None else value
