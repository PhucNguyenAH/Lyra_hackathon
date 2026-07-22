# LinkedIn Web Login — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator create the scraper's LinkedIn session from a protected web page that streams a real server-side Chromium via noVNC; on login the backend captures the session, persists it, and hot-reloads the scraper.

**Architecture:** Two browsers in the backend container — a headless *scraper* browser (serves `/jobs`) and a headful *login* browser on an Xvfb display, streamed to the operator. FastAPI exposes admin-token-gated `/auth/session/*` routes and proxies the VNC socket. On login-complete the session is saved to a volume and the scraper browser is reloaded in place.

**Tech Stack:** Python 3, FastAPI, Playwright, Xvfb + x11vnc (system), Next.js (app router), `@novnc/novnc`, pytest.

**Refinement vs spec:** the spec described `websockify` as the VNC↔WS bridge. This plan instead proxies the raw VNC TCP socket (`127.0.0.1:5900`) directly inside the FastAPI websocket endpoint. Same result, one fewer process and dependency. `x11vnc` still serves raw RFB on `:5900`; the entrypoint therefore does NOT run websockify.

## Global Constraints

- **Fail closed:** if `ADMIN_TOKEN` is unset, every `/auth/*` route returns `503`. Never open the login flow without a token.
- **Single login at a time:** a second `POST /auth/session/start` while one is active returns `409`.
- **Single process / single instance:** in-memory job store and single login session — never run multiple workers/replicas.
- **Backend binds `0.0.0.0:${PORT:-8000}`;** `x11vnc` binds `localhost` only.
- **Session persistence:** `LINKEDIN_SESSION_FILE` (default `linkedin_session.json`) points at a writable path; on Railway a Volume at `/data` with `LINKEDIN_SESSION_FILE=/data/linkedin_session.json`.
- **Startup must not hard-fail without a session:** boot unauthenticated; `/jobs` returns `409` until a session exists.
- No `Co-Authored-By` line on any commit.
- Reuse existing `linkedin_scraper` (`BrowserManager`, `wait_for_manual_login`, `save_session`, `load_session`); do not reimplement.

---

### Task 1: ScraperSession (holds the scraper browser + hot reload)

**Files:**
- Create: `api/scraper_session.py`
- Test: `tests/test_scraper_session.py`

**Interfaces:**
- Consumes: a browser object exposing `async load_session(path)` and `async new_page()` (the existing `BrowserManager`).
- Produces: `api.scraper_session.ScraperSession` with attributes `browser`, `semaphore` (`asyncio.Semaphore`), `max_concurrent: int`, `session_file: str`, `has_session: bool`, and `async reload_from_file(path: str | None = None) -> None` which drains all in-flight scrapes (acquires every semaphore permit), calls `browser.load_session(path or session_file)`, sets `has_session=True`, then releases the permits.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_scraper_session.py`:

```python
"""Unit tests for ScraperSession hot-reload."""
import asyncio
import pytest
from api.scraper_session import ScraperSession

pytestmark = pytest.mark.unit


class FakeBrowser:
    def __init__(self):
        self.loaded_from = None

    async def load_session(self, path):
        self.loaded_from = path


async def test_reload_sets_has_session_and_loads_path():
    b = FakeBrowser()
    s = ScraperSession(browser=b, max_concurrent=2, session_file="sess.json")
    assert s.has_session is False
    await s.reload_from_file()
    assert b.loaded_from == "sess.json"
    assert s.has_session is True


async def test_reload_explicit_path_overrides_default():
    b = FakeBrowser()
    s = ScraperSession(browser=b, max_concurrent=2, session_file="sess.json")
    await s.reload_from_file("/data/other.json")
    assert b.loaded_from == "/data/other.json"


async def test_reload_releases_all_permits():
    b = FakeBrowser()
    s = ScraperSession(browser=b, max_concurrent=3, session_file="sess.json")
    await s.reload_from_file()
    # all permits available again -> can acquire max_concurrent without blocking
    for _ in range(3):
        await asyncio.wait_for(s.semaphore.acquire(), timeout=0.5)


async def test_reload_waits_for_in_flight_scrape():
    b = FakeBrowser()
    s = ScraperSession(browser=b, max_concurrent=1, session_file="sess.json")
    await s.semaphore.acquire()  # simulate a scrape in flight
    reload_task = asyncio.create_task(s.reload_from_file())
    await asyncio.sleep(0.05)
    assert not reload_task.done()  # blocked until the permit frees
    s.semaphore.release()
    await asyncio.wait_for(reload_task, timeout=0.5)
    assert b.loaded_from == "sess.json"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_scraper_session.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.scraper_session'`.

- [ ] **Step 3: Implement ScraperSession**

Create `api/scraper_session.py`:

```python
"""Holds the scraper browser and supports hot-reloading its session."""
import asyncio
from typing import Optional


class ScraperSession:
    """The headless scraper browser plus its concurrency gate and auth state."""

    def __init__(self, browser, max_concurrent: int, session_file: str,
                 has_session: bool = False) -> None:
        self.browser = browser
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.session_file = session_file
        self.has_session = has_session
        self._reload_lock = asyncio.Lock()

    async def reload_from_file(self, path: Optional[str] = None) -> None:
        """Drain in-flight scrapes, reload the session, then resume."""
        target = path or self.session_file
        async with self._reload_lock:
            acquired = 0
            try:
                for _ in range(self.max_concurrent):
                    await self.semaphore.acquire()
                    acquired += 1
                await self.browser.load_session(target)
                self.has_session = True
            finally:
                for _ in range(acquired):
                    self.semaphore.release()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_scraper_session.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add api/scraper_session.py tests/test_scraper_session.py
git commit -m "feat(api): add ScraperSession with hot session reload"
```

---

### Task 2: Optional session at startup + `/jobs` guard

**Files:**
- Modify: `api/main.py`
- Modify: `tests/test_api_endpoints.py`
- Test: `tests/test_jobs_session_guard.py`

**Interfaces:**
- Consumes: `api.scraper_session.ScraperSession` (Task 1), `run_job` (unchanged).
- Produces: `app.state.scraper` (a `ScraperSession`). Lifespan loads the session only if the file exists (never hard-fails). `POST /jobs` returns `409 {"detail": "no LinkedIn session — open /connect-linkedin to log in"}` when `app.state.scraper.has_session` is `False`; otherwise schedules `run_job` with `store=app.state.store, browser=app.state.scraper.browser, semaphore=app.state.scraper.semaphore`.

- [ ] **Step 1: Write the failing test for the guard**

Create `tests/test_jobs_session_guard.py`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_jobs_session_guard.py -v`
Expected: FAIL — either `AttributeError` on `app.state.scraper` or `202` where `409` is expected.

- [ ] **Step 3: Refactor `api/main.py`**

Replace the lifespan and `create_job` in `api/main.py` with:

```python
"""FastAPI application exposing the LinkedIn job scraper."""
import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, HTTPException

from linkedin_scraper.core.browser import BrowserManager

from .models import JobCreatedResponse, JobRequest, JobStatusResponse
from .scraper_session import ScraperSession
from .scraper_worker import run_job
from .store import JobStore

logger = logging.getLogger("api.main")

SESSION_FILE = os.environ.get("LINKEDIN_SESSION_FILE", "linkedin_session.json")
SESSION_JSON = os.environ.get("LINKEDIN_SESSION_JSON")
MAX_CONCURRENT_SCRAPES = int(os.environ.get("MAX_CONCURRENT_SCRAPES", "2"))


def _materialize_session_file() -> None:
    """Write the session JSON from the env var to disk if no file exists yet."""
    if SESSION_JSON and not os.path.exists(SESSION_FILE):
        parent = os.path.dirname(SESSION_FILE)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(SESSION_FILE, "w") as fh:
            fh.write(SESSION_JSON)
        logger.info("Wrote session file %s from LINKEDIN_SESSION_JSON", SESSION_FILE)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _materialize_session_file()
    browser = BrowserManager(headless=True)
    await browser.start()
    scraper = ScraperSession(
        browser=browser,
        max_concurrent=MAX_CONCURRENT_SCRAPES,
        session_file=SESSION_FILE,
    )
    if os.path.exists(SESSION_FILE):
        try:
            await browser.load_session(SESSION_FILE)
            scraper.has_session = True
            logger.info("Loaded LinkedIn session from %s", SESSION_FILE)
        except Exception:
            logger.exception("Failed to load session %s; starting unauthenticated", SESSION_FILE)
    else:
        logger.warning("No session file at %s; starting unauthenticated. "
                       "Log in via /connect-linkedin.", SESSION_FILE)
    app.state.scraper = scraper
    app.state.store = JobStore()
    try:
        yield
    finally:
        await browser.close()


app = FastAPI(title="Job Scraper API", lifespan=lifespan)


@app.post("/jobs", status_code=202, response_model=JobCreatedResponse)
async def create_job(req: JobRequest, background: BackgroundTasks):
    scraper = app.state.scraper
    if not scraper.has_session:
        raise HTTPException(
            status_code=409,
            detail="no LinkedIn session — open /connect-linkedin to log in",
        )
    job_id = app.state.store.create()
    background.add_task(
        run_job,
        job_id,
        req.title,
        req.location,
        store=app.state.store,
        browser=scraper.browser,
        semaphore=scraper.semaphore,
    )
    return {"job_id": job_id, "status": "pending"}


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str):
    job = app.state.store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
```

- [ ] **Step 4: Update the existing endpoint tests to seed `has_session`**

In `tests/test_api_endpoints.py`, the lifespan no longer guarantees a session. In `test_post_then_get_returns_done_result`, immediately after `with TestClient(app) as client:` add:

```python
            client.app.state.scraper.has_session = True
```

(The `404` and `422` tests do not need it — `404` never checks the session, and `422` fails validation before the guard.) Leave everything else unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pytest tests/test_jobs_session_guard.py tests/test_api_endpoints.py -v`
Expected: PASS (2 + 3).

- [ ] **Step 6: Run the full unit suite**

Run: `pytest -m unit -v`
Expected: all prior tests plus the new ones PASS.

- [ ] **Step 7: Commit**

```bash
git add api/main.py tests/test_api_endpoints.py tests/test_jobs_session_guard.py
git commit -m "feat(api): boot without a session and gate /jobs on has_session"
```

---

### Task 3: Admin-token gate

**Files:**
- Create: `api/auth/__init__.py`
- Create: `api/auth/token.py`
- Test: `tests/test_auth_token.py`

**Interfaces:**
- Produces:
  - `api.auth.token.ADMIN_TOKEN` — value of the `ADMIN_TOKEN` env var (or `None`).
  - `api.auth.token.require_admin_token(x_admin_token: str | None = Header(None)) -> None` — FastAPI dependency: `503` if `ADMIN_TOKEN` unset; `401` if header missing or mismatched; passes otherwise. Uses `secrets.compare_digest`.
  - `api.auth.token.check_ws_token(token: str | None) -> bool` — `True` only if `ADMIN_TOKEN` set and equal.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_auth_token.py`:

```python
"""Admin-token dependency behaviour."""
import importlib
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

pytestmark = pytest.mark.unit


def _app_with_token(monkeypatch, token):
    if token is None:
        monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    else:
        monkeypatch.setenv("ADMIN_TOKEN", token)
    import api.auth.token as tok
    importlib.reload(tok)
    app = FastAPI()

    @app.get("/protected", dependencies=[Depends(tok.require_admin_token)])
    def protected():
        return {"ok": True}

    return app, tok


def test_503_when_token_unset(monkeypatch):
    app, _ = _app_with_token(monkeypatch, None)
    r = TestClient(app).get("/protected")
    assert r.status_code == 503


def test_401_when_header_missing(monkeypatch):
    app, _ = _app_with_token(monkeypatch, "secret")
    r = TestClient(app).get("/protected")
    assert r.status_code == 401


def test_401_when_header_wrong(monkeypatch):
    app, _ = _app_with_token(monkeypatch, "secret")
    r = TestClient(app).get("/protected", headers={"X-Admin-Token": "nope"})
    assert r.status_code == 401


def test_200_when_header_correct(monkeypatch):
    app, _ = _app_with_token(monkeypatch, "secret")
    r = TestClient(app).get("/protected", headers={"X-Admin-Token": "secret"})
    assert r.status_code == 200


def test_check_ws_token(monkeypatch):
    _, tok = _app_with_token(monkeypatch, "secret")
    assert tok.check_ws_token("secret") is True
    assert tok.check_ws_token("nope") is False
    assert tok.check_ws_token(None) is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_auth_token.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.auth'`.

- [ ] **Step 3: Implement the token gate**

Create `api/auth/__init__.py`:

```python
"""Admin-token-gated LinkedIn login flow."""
```

Create `api/auth/token.py`:

```python
"""Admin-token authentication for the /auth routes."""
import os
import secrets
from typing import Optional

from fastapi import Header, HTTPException

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN")


def require_admin_token(x_admin_token: Optional[str] = Header(default=None)) -> None:
    """FastAPI dependency: 503 if the feature is disabled, 401 if unauthorized."""
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="login flow disabled (ADMIN_TOKEN unset)")
    if not x_admin_token or not secrets.compare_digest(x_admin_token, ADMIN_TOKEN):
        raise HTTPException(status_code=401, detail="invalid admin token")


def check_ws_token(token: Optional[str]) -> bool:
    """True only if ADMIN_TOKEN is set and matches (for websocket auth)."""
    if not ADMIN_TOKEN or not token:
        return False
    return secrets.compare_digest(token, ADMIN_TOKEN)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_auth_token.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add api/auth/__init__.py api/auth/token.py tests/test_auth_token.py
git commit -m "feat(api): add admin-token gate for auth routes"
```

---

### Task 4: LoginSessionManager (state machine)

**Files:**
- Create: `api/auth/login_session.py`
- Test: `tests/test_login_session.py`

**Interfaces:**
- Produces:
  - `api.auth.login_session.LoginInProgress` (Exception).
  - `api.auth.login_session.LoginSessionManager` constructed with keyword factories:
    `browser_factory()` → object with `async start()`, `page` (with `async goto(url)`), `async save_session(path)`, `async close()`;
    `vnc_starter()` → awaitable returning a process-like object with `terminate()`;
    `login_waiter(page)` → awaitable that returns on success / raises on failure;
    `on_saved()` → awaitable (the scraper reload hook);
    `save_path: str`.
  - Methods: `async start() -> dict` (raises `LoginInProgress` if active; sets state `awaiting_login`, launches browser+vnc, spawns the detection task, returns `{"session_id", "state"}`); `async cancel() -> None`; `status() -> dict` (`{"state", "error", "session_id"}`); attribute `state`.
  - States: `idle, awaiting_login, logged_in, saving, saved, error, cancelled`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_login_session.py`:

```python
"""LoginSessionManager state machine (all I/O mocked)."""
import asyncio
import pytest
from api.auth.login_session import LoginSessionManager, LoginInProgress

pytestmark = pytest.mark.unit


class FakePage:
    def __init__(self):
        self.goto_url = None

    async def goto(self, url):
        self.goto_url = url


class FakeBrowser:
    def __init__(self):
        self.page = FakePage()
        self.started = False
        self.closed = False
        self.saved_to = None

    async def start(self):
        self.started = True

    async def save_session(self, path):
        self.saved_to = path

    async def close(self):
        self.closed = True


class FakeVnc:
    def __init__(self):
        self.terminated = False

    def terminate(self):
        self.terminated = True


def _manager(login_waiter, on_saved=None, browser=None, vnc=None):
    browser = browser or FakeBrowser()
    vnc = vnc or FakeVnc()
    saved = {"called": False}

    async def default_on_saved():
        saved["called"] = True

    async def start_vnc():
        return vnc

    m = LoginSessionManager(
        browser_factory=lambda: browser,
        vnc_starter=start_vnc,
        login_waiter=login_waiter,
        on_saved=on_saved or default_on_saved,
        save_path="/data/sess.json",
    )
    return m, browser, vnc, saved


async def test_start_launches_browser_and_navigates():
    async def never(page):
        await asyncio.sleep(3600)
    m, browser, vnc, _ = _manager(never)
    res = await m.start()
    assert res["state"] == "awaiting_login"
    assert browser.started is True
    assert browser.page.goto_url and "linkedin.com/login" in browser.page.goto_url
    await m.cancel()


async def test_successful_login_saves_and_reloads():
    async def instant(page):
        return None
    m, browser, vnc, saved = _manager(instant)
    await m.start()
    for _ in range(50):
        if m.state in ("saved", "error"):
            break
        await asyncio.sleep(0.02)
    assert m.state == "saved"
    assert browser.saved_to == "/data/sess.json"
    assert saved["called"] is True
    assert browser.closed is True and vnc.terminated is True


async def test_login_failure_sets_error():
    async def boom(page):
        raise RuntimeError("2fa timeout")
    m, browser, vnc, _ = _manager(boom)
    await m.start()
    for _ in range(50):
        if m.state in ("saved", "error"):
            break
        await asyncio.sleep(0.02)
    assert m.state == "error"
    assert "2fa timeout" in m.status()["error"]
    assert browser.closed is True and vnc.terminated is True


async def test_second_start_while_active_raises():
    async def never(page):
        await asyncio.sleep(3600)
    m, *_ = _manager(never)
    await m.start()
    with pytest.raises(LoginInProgress):
        await m.start()
    await m.cancel()


async def test_cancel_tears_down_and_sets_cancelled():
    async def never(page):
        await asyncio.sleep(3600)
    m, browser, vnc, _ = _manager(never)
    await m.start()
    await m.cancel()
    assert m.state == "cancelled"
    assert browser.closed is True and vnc.terminated is True
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_login_session.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.auth.login_session'`.

- [ ] **Step 3: Implement the manager**

Create `api/auth/login_session.py`:

```python
"""Single interactive LinkedIn login session, streamed via a login browser."""
import asyncio
import logging
import uuid

logger = logging.getLogger("api.auth.login_session")

LOGIN_URL = "https://www.linkedin.com/login"


class LoginInProgress(Exception):
    """Raised when a login session is already active."""


class LoginSessionManager:
    """Drives one headful login browser and captures the session on success."""

    def __init__(self, *, browser_factory, vnc_starter, login_waiter,
                 on_saved, save_path: str) -> None:
        self._browser_factory = browser_factory
        self._vnc_starter = vnc_starter
        self._login_waiter = login_waiter
        self._on_saved = on_saved
        self._save_path = save_path

        self.state = "idle"
        self.error = None
        self.session_id = None
        self._active = False
        self._browser = None
        self._vnc = None
        self._task = None
        self._lock = asyncio.Lock()

    def status(self) -> dict:
        return {"state": self.state, "error": self.error, "session_id": self.session_id}

    async def start(self) -> dict:
        async with self._lock:
            if self._active:
                raise LoginInProgress("a login session is already active")
            self._active = True
            self.state = "starting"
            self.error = None
            self.session_id = str(uuid.uuid4())
        self._browser = self._browser_factory()
        await self._browser.start()
        await self._browser.page.goto(LOGIN_URL)
        self._vnc = await self._vnc_starter()
        self.state = "awaiting_login"
        self._task = asyncio.create_task(self._run())
        return {"session_id": self.session_id, "state": self.state}

    async def _run(self) -> None:
        try:
            await self._login_waiter(self._browser.page)
            self.state = "logged_in"
            self.state = "saving"
            await self._browser.save_session(self._save_path)
            await self._on_saved()
            self.state = "saved"
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Login session failed")
            self.state = "error"
            self.error = str(exc)
        finally:
            await self._teardown()

    async def cancel(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        await self._teardown()
        self.state = "cancelled"

    async def _teardown(self) -> None:
        if self._vnc is not None:
            try:
                self._vnc.terminate()
            except Exception:
                logger.exception("Failed to terminate VNC")
            self._vnc = None
        if self._browser is not None:
            try:
                await self._browser.close()
            except Exception:
                logger.exception("Failed to close login browser")
            self._browser = None
        self._active = False
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_login_session.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add api/auth/login_session.py tests/test_login_session.py
git commit -m "feat(api): add LoginSessionManager state machine"
```

---

### Task 5: Auth routes + VNC proxy, wired into the app

**Files:**
- Create: `api/auth/vnc_proxy.py`
- Create: `api/auth/routes.py`
- Modify: `api/main.py`
- Test: `tests/test_auth_routes.py`

**Interfaces:**
- Consumes: `require_admin_token`, `check_ws_token` (Task 3); `LoginSessionManager`, `LoginInProgress` (Task 4); `ScraperSession` (Task 1); `BrowserManager`, `wait_for_manual_login`.
- Produces:
  - `api.auth.vnc_proxy.vnc_websocket(ws)` — accepts the websocket after `check_ws_token`, opens a TCP connection to `127.0.0.1:5900`, and pumps bytes both ways until close; closes with policy-violation if the token is bad.
  - `api.auth.routes.router` — `APIRouter(prefix="/auth")` with `POST /session/start`, `GET /session/status`, `POST /session/cancel` (all `Depends(require_admin_token)` except status which takes the token as a query param), and `WS /session/vnc`.
  - `api/main.py` lifespan additionally builds `app.state.login_manager = LoginSessionManager(...)` with real factories (headful `BrowserManager`, an `x11vnc` subprocess starter, `wait_for_manual_login`, and `app.state.scraper.reload_from_file` as `on_saved`), and includes the router.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_auth_routes.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_auth_routes.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.auth.routes'`.

- [ ] **Step 3: Implement the VNC proxy**

Create `api/auth/vnc_proxy.py`:

```python
"""Proxy a browser websocket to the local x11vnc TCP port (raw RFB)."""
import asyncio
import logging

from fastapi import WebSocket, WebSocketDisconnect

from .token import check_ws_token

logger = logging.getLogger("api.auth.vnc_proxy")

VNC_HOST = "127.0.0.1"
VNC_PORT = 5900


async def vnc_websocket(ws: WebSocket) -> None:
    """Token-gated raw pipe between the noVNC client and x11vnc."""
    token = ws.query_params.get("token")
    if not check_ws_token(token):
        await ws.close(code=1008)  # policy violation
        return
    await ws.accept()
    try:
        reader, writer = await asyncio.open_connection(VNC_HOST, VNC_PORT)
    except OSError:
        logger.exception("Cannot reach x11vnc at %s:%s", VNC_HOST, VNC_PORT)
        await ws.close(code=1011)
        return

    async def ws_to_tcp():
        try:
            while True:
                data = await ws.receive_bytes()
                writer.write(data)
                await writer.drain()
        except (WebSocketDisconnect, RuntimeError):
            pass

    async def tcp_to_ws():
        try:
            while True:
                data = await reader.read(65536)
                if not data:
                    break
                await ws.send_bytes(data)
        except (WebSocketDisconnect, RuntimeError, ConnectionError):
            pass

    try:
        await asyncio.gather(ws_to_tcp(), tcp_to_ws())
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
```

- [ ] **Step 4: Implement the routes**

Create `api/auth/routes.py`:

```python
"""HTTP + websocket routes for the interactive login flow."""
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket

from .login_session import LoginInProgress
from .token import require_admin_token
from .vnc_proxy import vnc_websocket

router = APIRouter(prefix="/auth")


@router.post("/session/start", dependencies=[Depends(require_admin_token)])
async def start_session(request: Request):
    manager = request.app.state.login_manager
    try:
        return await manager.start()
    except LoginInProgress:
        raise HTTPException(status_code=409, detail="a login session is already active")


@router.get("/session/status", dependencies=[Depends(require_admin_token)])
async def session_status(request: Request):
    return request.app.state.login_manager.status()


@router.post("/session/cancel", dependencies=[Depends(require_admin_token)])
async def cancel_session(request: Request):
    await request.app.state.login_manager.cancel()
    return {"state": "cancelled"}


@router.websocket("/session/vnc")
async def session_vnc(websocket: WebSocket):
    await vnc_websocket(websocket)
```

Note: `session_status` uses `require_admin_token`, which reads the `X-Admin-Token` header. The test and front-end pass `?token=` for status too; to accept both, `require_admin_token` only checks the header, so `session_status` must ALSO accept the query token. Implement status auth inline instead:

Replace the `session_status` route above with:

```python
from .token import check_ws_token

@router.get("/session/status")
async def session_status(request: Request):
    if not check_ws_token(request.query_params.get("token")):
        raise HTTPException(status_code=401, detail="invalid admin token")
    return request.app.state.login_manager.status()
```

- [ ] **Step 5: Wire the manager + router into `api/main.py`**

In `api/main.py`, add these imports near the top:

```python
import asyncio as _asyncio  # already have asyncio; reuse it instead
from linkedin_scraper import wait_for_manual_login
from .auth.login_session import LoginSessionManager
from .auth.routes import router as auth_router
```

(Use the existing `asyncio` import; do not add a duplicate.) Add a subprocess starter near the other module functions:

```python
async def _start_x11vnc():
    """Start x11vnc against the Xvfb display, bound to localhost:5900."""
    return await asyncio.create_subprocess_exec(
        "x11vnc", "-display", ":99", "-forever", "-shared",
        "-nopw", "-localhost", "-rfbport", "5900", "-quiet",
    )
```

Inside `lifespan`, after `app.state.scraper` is set and before `yield`, add:

```python
    app.state.login_manager = LoginSessionManager(
        browser_factory=lambda: BrowserManager(
            headless=False, viewport={"width": 1280, "height": 800}
        ),
        vnc_starter=_start_x11vnc,
        login_waiter=wait_for_manual_login,
        on_saved=scraper.reload_from_file,
        save_path=SESSION_FILE,
    )
```

After `app = FastAPI(...)`, register the router:

```python
app.include_router(auth_router)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pytest tests/test_auth_routes.py -v`
Expected: PASS (4 passed).

- [ ] **Step 7: Run the full unit suite**

Run: `pytest -m unit -v`
Expected: all tests PASS (Tasks 1–5 plus prior work).

- [ ] **Step 8: Commit**

```bash
git add api/auth/vnc_proxy.py api/auth/routes.py api/main.py tests/test_auth_routes.py
git commit -m "feat(api): add login-session routes and VNC websocket proxy"
```

---

### Task 6: Docker image + entrypoint + deploy docs

**Files:**
- Modify: `Dockerfile`
- Create: `entrypoint.sh`
- Modify: `api/DEPLOY.md`

**Interfaces:**
- Consumes: `api.main:app`.
- Produces: an image with Xvfb + x11vnc that starts Xvfb + a window manager, then execs uvicorn; docs for the volume, `ADMIN_TOKEN`, and the `/connect-linkedin` flow.

- [ ] **Step 1: Add system packages and entrypoint to the Dockerfile**

In `Dockerfile`, after the `RUN playwright install chromium` line, add:

```dockerfile
# System packages for the interactive login stream (Xvfb display + VNC server).
RUN apt-get update && apt-get install -y --no-install-recommends \
        xvfb x11vnc fluxbox \
    && rm -rf /var/lib/apt/lists/*
```

Replace the final `CMD` line with:

```dockerfile
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
CMD ["/app/entrypoint.sh"]
```

- [ ] **Step 2: Create the entrypoint**

Create `entrypoint.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Virtual display for the headful login browser.
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
export DISPLAY=:99

# Minimal window manager so the browser window is framed/maximized.
fluxbox >/dev/null 2>&1 &

# x11vnc is started per-login by the app (LoginSessionManager); it targets :99.
# The app binds the platform port; VNC stays on localhost.
exec uvicorn api.main:app --host 0.0.0.0 --port "${PORT:-8000}"
```

- [ ] **Step 3: Verify the image builds (if Docker is available)**

Run: `docker build -t job-scraper-api .`
Expected: build succeeds. If Docker is unavailable in this environment, skip and note it — the build runs on the deploy platform.

- [ ] **Step 4: Document the login flow in `api/DEPLOY.md`**

Append this section to `api/DEPLOY.md`:

````markdown
## Interactive LinkedIn login (Phase 1)

Instead of pasting a session, an operator can create it from the web:

1. Add a Railway **Volume** mounted at `/data`, and set
   `LINKEDIN_SESSION_FILE=/data/linkedin_session.json` so a captured session
   survives restarts.
2. Set a strong `ADMIN_TOKEN` (required — without it every `/auth/*` route
   returns `503`).
3. Deploy. The service now boots even with no session (`/jobs` returns `409`
   until you log in).
4. Open `https://<frontend>/connect-linkedin`, enter the admin token, and click
   **Start login**. A live LinkedIn login (running in the server's browser) is
   streamed to you — log in, including 2FA/CAPTCHA.
5. On success the session is saved to the volume and the scraper hot-reloads;
   `/jobs` starts working immediately.

**Security:** the stream carries a live login (you type a password), so it must
run over `wss` (TLS) — Railway/Vercel provide this. The admin token gates every
route. `x11vnc` binds localhost and is only reachable through the token-gated
proxy.

**Known limitation (Phase 1):** the session cookie file is stored unencrypted on
the volume; single operator only. Per-user sessions and encryption at rest are
Phase 2.
````

- [ ] **Step 5: Commit**

```bash
git add Dockerfile entrypoint.sh api/DEPLOY.md
git commit -m "feat(deploy): add Xvfb/x11vnc image and login-flow docs"
```

---

### Task 7: Front-end `/connect-linkedin` page

**Files:**
- Create: `front-end/app/connect-linkedin/page.tsx`
- Modify: `front-end/package.json`

**Interfaces:**
- Consumes: the `/api/auth/session/*` routes via the existing `/api/*` rewrite.
- Produces: a client page that starts a login, streams the browser with `@novnc/novnc`, polls status, and can cancel.

- [ ] **Step 1: Add the noVNC dependency**

In `front-end/package.json`, add to `dependencies`:

```json
"@novnc/novnc": "^1.5.0"
```

Then run (from `front-end/`): `npm install`
Expected: `@novnc/novnc` is installed.

- [ ] **Step 2: Create the page**

Create `front-end/app/connect-linkedin/page.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

type State =
  | "idle"
  | "awaiting_login"
  | "logged_in"
  | "saving"
  | "saved"
  | "error"
  | "cancelled";

export default function ConnectLinkedInPage() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<unknown>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function start() {
    setError(null);
    const res = await fetch("/api/auth/session/start", {
      method: "POST",
      headers: { "X-Admin-Token": token },
    });
    if (!res.ok) {
      setState("error");
      setError(res.status === 401 ? "Invalid admin token" : `Start failed (${res.status})`);
      return;
    }
    const { default: RFB } = await import("@novnc/novnc/core/rfb");
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/api/auth/session/vnc?token=${encodeURIComponent(token)}`;
    rfbRef.current = new RFB(screenRef.current as HTMLElement, url);
    setState("awaiting_login");
    pollRef.current = setInterval(pollStatus, 2000);
  }

  async function pollStatus() {
    const res = await fetch(`/api/auth/session/status?token=${encodeURIComponent(token)}`);
    if (!res.ok) return;
    const data = await res.json();
    setState(data.state);
    if (data.error) setError(data.error);
    if (["saved", "error", "cancelled"].includes(data.state) && pollRef.current) {
      clearInterval(pollRef.current);
    }
  }

  async function cancel() {
    await fetch("/api/auth/session/cancel", {
      method: "POST",
      headers: { "X-Admin-Token": token },
    });
    if (pollRef.current) clearInterval(pollRef.current);
    setState("cancelled");
  }

  return (
    <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Connect LinkedIn</h1>
      <p>Log into LinkedIn in the streamed browser to create the scraper session.</p>

      {state === "idle" || state === "error" || state === "cancelled" ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="password"
            placeholder="Admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ flex: 1, padding: 8 }}
          />
          <button onClick={start} disabled={!token}>Start login</button>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <strong>Status:</strong> {state} <button onClick={cancel}>Cancel</button>
        </div>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {state === "saved" && <p style={{ color: "green" }}>✅ Session saved — scraping is ready.</p>}

      <div
        ref={screenRef}
        style={{ width: "100%", height: 640, background: "#111", borderRadius: 8 }}
      />
    </main>
  );
}
```

- [ ] **Step 3: Type-check / build the front-end (if tooling available)**

Run (from `front-end/`): `npm run build`
Expected: the page compiles. If the build environment is unavailable here, skip and note it — Vercel builds on deploy. (`@novnc/novnc` ships its own types; if TS complains about the deep import, add `// @ts-expect-error` above the `import("@novnc/novnc/core/rfb")` line.)

- [ ] **Step 4: Commit**

```bash
git add front-end/app/connect-linkedin/page.tsx front-end/package.json front-end/package-lock.json
git commit -m "feat(frontend): add /connect-linkedin noVNC login page"
```

---

## Self-Review

**Spec coverage:**
- noVNC streaming of a headful login browser → Tasks 5 (proxy), 6 (Xvfb/x11vnc), 7 (client). ✓
- Admin-token gate, fail-closed 503 → Task 3. ✓
- `/auth/session/{start,status,cancel,vnc}` → Task 5. ✓
- Login detection via `wait_for_manual_login` → Tasks 4 (injected), 5 (wired). ✓
- Save to volume + hot reload scraper → Task 1 (`reload_from_file`), Task 4 (`on_saved`), Task 5 (wiring). ✓
- Startup optional session + `/jobs` 409 guard → Task 2. ✓
- Railway volume, `LINKEDIN_SESSION_FILE`, `ADMIN_TOKEN` → Tasks 2, 6. ✓
- Single login at a time → Task 4 (`LoginInProgress`), Task 5 (409). ✓
- Front-end page → Task 7. ✓
- Out-of-scope items (per-user, encryption) not implemented. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code and exact commands.

**Type consistency:** `ScraperSession(browser, max_concurrent, session_file, has_session=False)`, `reload_from_file(path=None)`, `require_admin_token`/`check_ws_token`, `LoginSessionManager(browser_factory, vnc_starter, login_waiter, on_saved, save_path)` with `start/cancel/status/state`, and `app.state.scraper` / `app.state.login_manager` names are used identically across the tasks that define and consume them. The `on_saved=scraper.reload_from_file` hook matches Task 1's signature (callable, no required args). ✓
