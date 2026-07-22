"""Unit coverage for sourced Tavily hiring-process research."""

from datetime import UTC, datetime

import pytest

from interview.hiring_process import TAVILY_SEARCH_URL, research_hiring_process
from interview.schemas import HiringProcessResearch


class FakeResponse:
    def raise_for_status(self) -> None: pass
    def json(self) -> dict[str, object]:
        return {
            "answer": "Candidates report a recruiter call followed by a technical conversation.",
            "results": [
                {"title": "Company careers", "url": "https://example.com/careers", "content": "Recruiter call and technical interview."},
                {"title": "Candidate report", "url": "https://example.org/report", "content": "An online assessment may follow."},
            ],
        }


class FakeHTTP:
    def __init__(self) -> None: self.calls: list[tuple[str, dict[str, object]]] = []
    def post(self, url: str, **kwargs: object) -> FakeResponse:
        self.calls.append((url, kwargs))
        return FakeResponse()


class FakeCompletions:
    def __init__(self, result: HiringProcessResearch) -> None:
        self.result = result
        self.calls: list[dict[str, object]] = []
    def create(self, **kwargs: object) -> HiringProcessResearch:
        self.calls.append(kwargs)
        return self.result


class FakeClient:
    def __init__(self, result: HiringProcessResearch) -> None:
        self.completions = FakeCompletions(result)
        self.chat = type("Chat", (), {"completions": self.completions})()


def researched_process() -> HiringProcessResearch:
    return HiringProcessResearch.model_validate({
        "company": "Example Co",
        "job_title": "Backend Engineer",
        "summary": "A typical two-stage conversational process, with an OA reported by one source.",
        "stages": [
            {"name": "Recruiter call", "category": "phone_screen", "description": "Role fit", "evidence": [{"url": "https://example.com/careers", "title": "Company careers"}], "confidence": 0.9, "practice_supported": True},
            {"name": "Online assessment", "category": "coding_assessment", "description": "Coding task", "evidence": [{"url": "https://example.org/report", "title": "Candidate report"}], "confidence": 0.5, "practice_supported": False},
        ],
        "researched_at": datetime.now(UTC),
        "confidence": 0.75,
    })


def test_research_uses_tavily_sources_and_groq_normalization(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    http = FakeHTTP()
    client = FakeClient(researched_process())

    result = research_hiring_process("Example Co", "Backend Engineer", http=http, llm_client=client)

    assert result.stages[0].practice_supported is True
    assert result.stages[1].practice_supported is False
    assert http.calls[0][0] == TAVILY_SEARCH_URL
    assert "Example Co" in str(http.calls[0][1])
    assert "https://example.com/careers" in str(client.completions.calls[0]["messages"])


def test_research_requires_tavily_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="TAVILY_API_KEY"):
        research_hiring_process("Example Co", "Backend Engineer")


def test_coding_phone_screen_is_not_marked_as_supported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    process = researched_process()
    process.stages[0] = process.stages[0].model_copy(update={
        "name": "Technical phone screen",
        "category": "experience_technical",
        "description": "Solve a medium-difficulty coding problem with a Karat engineer",
        "practice_supported": True,
    })

    result = research_hiring_process("Example Co", "Backend Engineer", http=FakeHTTP(), llm_client=FakeClient(process))

    assert result.stages[0].category.value == "coding_assessment"
    assert result.stages[0].practice_supported is False
