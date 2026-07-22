"""Startup loads from the session store; login persists through it."""
import asyncio
import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

pytestmark = pytest.mark.unit

STATE = '{"cookies":[],"origins":[]}'

# api.main's SESSION_FILE defaults to this relative path when
# LINKEDIN_SESSION_FILE isn't set (as in these tests). _bootstrap_session_state
# writes the resolved state back to it, so without isolation one test's write
# would leak into the next. Back up/restore any real local dev artifact and
# ensure a clean slate for each test.
_DEFAULT_SESSION_FILE = "linkedin_session.json"


@pytest.fixture(autouse=True)
def _isolate_default_session_file():
    backup = None
    if os.path.exists(_DEFAULT_SESSION_FILE):
        with open(_DEFAULT_SESSION_FILE) as fh:
            backup = fh.read()
        os.remove(_DEFAULT_SESSION_FILE)
    try:
        yield
    finally:
        if os.path.exists(_DEFAULT_SESSION_FILE):
            os.remove(_DEFAULT_SESSION_FILE)
        if backup is not None:
            with open(_DEFAULT_SESSION_FILE, "w") as fh:
                fh.write(backup)


class FakeBrowserManager:
    def __init__(self, *a, **k): pass
    async def start(self): return None
    async def load_session(self, p): return None
    async def new_page(self): return None
    async def close(self): return None


class FakeStore:
    def __init__(self, state=None):
        self._state = state
        self.saved = None
    def load(self): return self._state
    def save(self, s): self.saved = s


def test_startup_loads_session_from_store():
    store = FakeStore(state=STATE)
    with patch("api.main.BrowserManager", FakeBrowserManager), \
         patch("api.main.build_session_store", return_value=store):
        from api.main import app
        with TestClient(app) as client:
            # has_session should be True purely from the store load (no manual set)
            assert client.app.state.scraper.has_session is True


def test_startup_unauthenticated_when_store_empty():
    store = FakeStore(state=None)
    with patch("api.main.BrowserManager", FakeBrowserManager), \
         patch("api.main.build_session_store", return_value=store):
        from api.main import app
        with TestClient(app) as client:
            assert client.app.state.scraper.has_session is False
            r = client.post("/jobs", json={"title": "x", "location": "y"})
            assert r.status_code == 409


def test_make_on_saved_persists_then_reloads(tmp_path):
    from api.main import _make_on_saved
    p = tmp_path / "sess.json"
    p.write_text(STATE)
    store = FakeStore()
    reloaded = {"called": False}

    class FakeScraper:
        async def reload_from_file(self, path=None):
            reloaded["called"] = True

    on_saved = _make_on_saved(store, str(p), FakeScraper())
    asyncio.run(on_saved())
    assert store.saved == STATE          # persisted through the store
    assert reloaded["called"] is True    # then hot-reloaded
