"""Groq Whisper boundary for ephemeral interview-answer transcription."""

from typing import Protocol

from groq import Groq


TRANSCRIPTION_MODEL = "whisper-large-v3-turbo"
MAX_AUDIO_BYTES = 25 * 1024 * 1024


class TranscriptionsAPI(Protocol):
    def create(self, **kwargs: object) -> object: ...


class AudioAPI(Protocol):
    transcriptions: TranscriptionsAPI


class GroqAudioClient(Protocol):
    audio: AudioAPI


def transcribe_audio(
    filename: str,
    content: bytes,
    content_type: str,
    client: GroqAudioClient | None = None,
) -> tuple[str, float | None]:
    """Transcribe one recording without persisting the source audio."""
    if not content:
        raise ValueError("The recording is empty")
    if len(content) > MAX_AUDIO_BYTES:
        raise ValueError("The recording exceeds the 25 MB upload limit")

    groq = client or Groq()
    result = groq.audio.transcriptions.create(
        file=(filename or "interview-answer.webm", content, content_type or "audio/webm"),
        model=TRANSCRIPTION_MODEL,
        language="en",
        response_format="verbose_json",
        temperature=0.0,
    )
    text = str(getattr(result, "text", "") or "").strip()
    if not text:
        raise ValueError("No speech was detected in the recording")
    raw_duration = getattr(result, "duration", None)
    duration = float(raw_duration) if raw_duration is not None else None
    return text, duration
