"""Unit coverage for the Groq Whisper transcription boundary."""

from types import SimpleNamespace

import pytest

from interview.transcription import MAX_AUDIO_BYTES, TRANSCRIPTION_MODEL, transcribe_audio


class FakeTranscriptions:
    def __init__(self, result: object) -> None:
        self.result = result
        self.calls: list[dict[str, object]] = []

    def create(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        return self.result


def test_transcribe_audio_uses_groq_whisper_and_returns_duration() -> None:
    transcriptions = FakeTranscriptions(SimpleNamespace(text="I improved latency by 30 percent.", duration=12.5))
    client = SimpleNamespace(audio=SimpleNamespace(transcriptions=transcriptions))

    text, duration = transcribe_audio("answer.webm", b"audio-bytes", "audio/webm", client)

    assert text == "I improved latency by 30 percent."
    assert duration == 12.5
    assert transcriptions.calls[0]["model"] == TRANSCRIPTION_MODEL
    assert transcriptions.calls[0]["response_format"] == "verbose_json"
    assert transcriptions.calls[0]["file"] == ("answer.webm", b"audio-bytes", "audio/webm")


def test_transcribe_audio_rejects_empty_or_oversized_recordings() -> None:
    with pytest.raises(ValueError, match="empty"):
        transcribe_audio("answer.webm", b"", "audio/webm")
    with pytest.raises(ValueError, match="25 MB"):
        transcribe_audio("answer.webm", b"x" * (MAX_AUDIO_BYTES + 1), "audio/webm")


def test_transcribe_audio_rejects_silence() -> None:
    transcriptions = FakeTranscriptions(SimpleNamespace(text="   ", duration=2.0))
    client = SimpleNamespace(audio=SimpleNamespace(transcriptions=transcriptions))
    with pytest.raises(ValueError, match="No speech"):
        transcribe_audio("answer.webm", b"audio-bytes", "audio/webm", client)
