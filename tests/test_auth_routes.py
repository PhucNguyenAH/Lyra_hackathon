"""Auth route wiring (LoginSessionManager replaced with a fake)."""
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


class FakeManager:
    def __init__(self):
        self.state = "idle"; self.started = False; self.cancelled = False
    async def start(self):
        self.started = True; self.state = "awaiting_login"
        return {"session_id": "s1", "state": self.state}
    async def cancel(self):
        self.cancelled = True; self.state = "cancelled"
    def status(self):
        return {"state": self.state, "error": None, "session_id": "s1"}


def _client(monkeypatch, token="secret"):
    monkeypatch.setenv("ADMIN_TOKEN", token)
    import importlib
    import api.auth.token as tok; importlib.reload(tok)
    import api.auth.routes as routes; importlib.reload(routes)
    import api.main as main; importlib.reload(main)
    return main


def test_start_requires_token(monkeypatch):
    main = _client(monkeypatch)
    with patch("api.main.BrowserManager", FakeBrowserManager):
        with TestClient(main.app) as client:
            client.app.state.login_manager = FakeManager()
            assert client.post("/auth/session/start").status_code == 401
            r = client.post("/auth/session/start", headers={"X-Admin-Token": "secret"})
            assert r.status_code == 200
            assert r.json()["state"] == "awaiting_login"


def test_status_and_cancel(monkeypatch):
    main = _client(monkeypatch)
    with patch("api.main.BrowserManager", FakeBrowserManager):
        with TestClient(main.app) as client:
            fake = FakeManager(); client.app.state.login_manager = fake
            assert client.get("/auth/session/status?token=secret").json()["state"] == "idle"
            assert client.get("/auth/session/status?token=wrong").status_code == 401
            r = client.post("/auth/session/cancel", headers={"X-Admin-Token": "secret"})
            assert r.status_code == 200 and fake.cancelled is True


def test_double_start_returns_409(monkeypatch):
    from api.auth.login_session import LoginInProgress
    main = _client(monkeypatch)

    class Busy(FakeManager):
        async def start(self):
            raise LoginInProgress()

    with patch("api.main.BrowserManager", FakeBrowserManager):
        with TestClient(main.app) as client:
            client.app.state.login_manager = Busy()
            r = client.post("/auth/session/start", headers={"X-Admin-Token": "secret"})
            assert r.status_code == 409


def test_vnc_rejects_bad_token(monkeypatch):
    main = _client(monkeypatch)
    with patch("api.main.BrowserManager", FakeBrowserManager):
        with TestClient(main.app) as client:
            client.app.state.login_manager = FakeManager()
            with pytest.raises(Exception):
                with client.websocket_connect("/auth/session/vnc?token=wrong"):
                    pass
