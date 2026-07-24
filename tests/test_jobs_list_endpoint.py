"""GET /jobs returns the persisted jobs list."""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

pytestmark = pytest.mark.unit


class FakeBrowserManager:
    def __init__(self, *a, **k): pass
    async def start(self): return None
    async def load_session(self, p): return None
    async def new_page(self): return None
    async def close(self): return None


class FakeRepo:
    def list_jobs(self, limit=100):
        return [{"id": "1", "role": "AI Engineer", "company": "Acme"}]


def test_list_jobs_returns_repo_rows():
    with patch("api.main.BrowserManager", FakeBrowserManager):
        from api.main import app
        with TestClient(app) as client:
            client.app.state.jobs_repo = FakeRepo()
            r = client.get("/jobs")
            assert r.status_code == 200
            assert r.json() == [{"id": "1", "role": "AI Engineer", "company": "Acme"}]


def test_list_jobs_empty_when_no_repo():
    with patch("api.main.BrowserManager", FakeBrowserManager):
        from api.main import app
        with TestClient(app) as client:
            client.app.state.jobs_repo = None
            r = client.get("/jobs")
            assert r.status_code == 200
            assert r.json() == []
