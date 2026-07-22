"""Integration tests for the API endpoints (browser + scrapers mocked)."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from linkedin_scraper.models.job import Job

pytestmark = pytest.mark.unit


class FakePage:
    async def close(self):
        return None


class FakeBrowserManager:
    """Stand-in for BrowserManager that launches no real browser."""
    def __init__(self, *args, **kwargs):
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
    # Patch BrowserManager used in the app, plus scrapers used by the worker.
    search = MagicMock()
    search.search = AsyncMock(return_value=["https://www.linkedin.com/jobs/view/123"])
    scraper = MagicMock()
    scraper.scrape = AsyncMock(return_value=Job(
        linkedin_url="https://www.linkedin.com/jobs/view/123",
        job_title="AI Engineer", company="Acme", location="Sydney",
        posted_date="2 days ago", applicant_count="42", job_description="Build.",
    ))
    patches = [
        patch("api.main.BrowserManager", FakeBrowserManager),
        patch("api.scraper_worker.JobSearchScraper", return_value=search),
        patch("api.scraper_worker.JobScraper", return_value=scraper),
    ]
    return patches


def test_post_then_get_returns_done_result():
    patches = _client()
    for p in patches:
        p.start()
    try:
        from api.main import app
        with TestClient(app) as client:
            client.app.state.scraper.has_session = True
            resp = client.post("/jobs", json={"title": "AI Engineer", "location": "Sydney"})
            assert resp.status_code == 202
            body = resp.json()
            assert body["status"] == "pending"
            job_id = body["job_id"]

            # TestClient runs the background task before returning the POST,
            # so the job is already terminal here.
            got = client.get(f"/jobs/{job_id}")
            assert got.status_code == 200
            data = got.json()
            assert data["status"] == "done"
            assert data["result"] == {
                "job_url": "https://www.linkedin.com/jobs/view/123",
                "title": "AI Engineer",
                "company": "Acme",
                "location": "Sydney",
                "posted": "2 days ago",
                "applicants": "42",
                "description": "Build.",
            }
    finally:
        for p in patches:
            p.stop()


def test_get_unknown_job_returns_404():
    patches = _client()
    for p in patches:
        p.start()
    try:
        from api.main import app
        with TestClient(app) as client:
            resp = client.get("/jobs/does-not-exist")
            assert resp.status_code == 404
    finally:
        for p in patches:
            p.stop()


def test_post_missing_field_returns_422():
    patches = _client()
    for p in patches:
        p.start()
    try:
        from api.main import app
        with TestClient(app) as client:
            resp = client.post("/jobs", json={"title": "AI Engineer"})
            assert resp.status_code == 422
    finally:
        for p in patches:
            p.stop()
