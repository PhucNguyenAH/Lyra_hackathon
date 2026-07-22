"""POST /jobs is gated on having a LinkedIn session."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

pytestmark = pytest.mark.unit


class FakePage:
    async def close(self):
        return None


class FakeBrowserManager:
    def __init__(self, *a, **k):
        pass

    async def start(self):
        return None

    async def load_session(self, filepath):
        return None

    async def new_page(self):
        return FakePage()

    async def close(self):
        return None


def _client():
    return patch("api.main.BrowserManager", FakeBrowserManager)


def test_jobs_returns_409_when_no_session():
    with _client():
        from api.main import app
        with TestClient(app) as client:
            client.app.state.scraper.has_session = False
            resp = client.post("/jobs", json={"title": "x", "location": "y"})
            assert resp.status_code == 409
            assert "connect-linkedin" in resp.json()["detail"]


def test_jobs_accepts_when_session_present():
    search = MagicMock(); search.search = AsyncMock(return_value=[])
    with _client(), \
         patch("api.scraper_worker.JobSearchScraper", return_value=search), \
         patch("api.scraper_worker.JobScraper", return_value=MagicMock()):
        from api.main import app
        with TestClient(app) as client:
            client.app.state.scraper.has_session = True
            resp = client.post("/jobs", json={"title": "x", "location": "y"})
            assert resp.status_code == 202
            assert resp.json()["status"] == "pending"
