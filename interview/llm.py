"""Small typed boundary around Instructor's Groq client."""

from typing import Protocol

import instructor
from groq import Groq


MODEL_NAME = "llama-3.3-70b-versatile"
MAX_RETRIES = 2
MODEL_TEMPERATURE = 0.0


class CompletionAPI(Protocol):
    def create(
        self,
        *,
        model: str,
        response_model: object,
        messages: list[dict[str, str]],
        temperature: float,
        max_retries: int,
    ) -> object: ...


class ChatAPI(Protocol):
    completions: CompletionAPI


class StructuredClient(Protocol):
    chat: ChatAPI


def create_structured_client() -> StructuredClient:
    """Create the live client lazily so imports and unit tests need no API key."""
    return instructor.from_groq(Groq())
