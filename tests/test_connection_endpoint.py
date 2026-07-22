"""GET /connection reflects scraper.has_session; no auth, no cookies."""
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


def test_connection_reports_connected_true():
    with patch("api.main.BrowserManager", FakeBrowserManager):
        from api.main import app
        with TestClient(app) as client:
            client.app.state.scraper.has_session = True
            r = client.get("/connection")
            assert r.status_code == 200
            assert r.json() == {"connected": True}


def test_connection_reports_connected_false():
    with patch("api.main.BrowserManager", FakeBrowserManager):
        from api.main import app
        with TestClient(app) as client:
            client.app.state.scraper.has_session = False
            r = client.get("/connection")
            assert r.status_code == 200
            assert r.json() == {"connected": False}
