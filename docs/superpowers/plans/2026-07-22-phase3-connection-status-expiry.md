# Phase 3 — Connection Status + Expiry Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the scraper's LinkedIn connection state (a `/connection` endpoint + a dashboard badge) and detect an expired session during a scrape, flipping the backend to unauthenticated with a clear "reconnect" message.

**Architecture:** Add `ScraperSession.mark_disconnected()`; give the background worker an optional `on_expired` callback that fires when a search hits LinkedIn's login wall (`is_logged_in(page)` is False); expose `GET /connection` returning `{connected: has_session}` and wire `on_expired=scraper.mark_disconnected` into the job scheduler; add a connection badge in the dashboard.

**Tech Stack:** Python, FastAPI, `linkedin_scraper` (`is_logged_in`), pytest; Next.js (frontend).

## Global Constraints

- `GET /connection` is **unauthenticated** and returns only `{"connected": <bool>}` — no cookies, no session bytes.
- Expiry detection is **lazy** — only when a scrape's search returns no URLs AND `is_logged_in(page)` is False. Never background-poll.
- The worker's `on_expired` param is **optional** — omitting it still produces the expiry error message; only the flag-flip is skipped (backward compatible).
- No multi-user, no auto-relogin, no retries.
- No `Co-Authored-By` line on any commit.
- Reuse `linkedin_scraper.is_logged_in`; don't reimplement login detection.

---

### Task 1: `ScraperSession.mark_disconnected()`

**Files:**
- Modify: `api/scraper_session.py`
- Test: `tests/test_scraper_session.py`

**Interfaces:**
- Produces: `ScraperSession.mark_disconnected() -> None` — sets `has_session = False`. Idempotent, no I/O.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_scraper_session.py`:

```python
async def test_mark_disconnected_sets_has_session_false():
    b = FakeBrowser()
    s = ScraperSession(browser=b, max_concurrent=1, session_file="sess.json", has_session=True)
    assert s.has_session is True
    s.mark_disconnected()
    assert s.has_session is False
    s.mark_disconnected()  # idempotent
    assert s.has_session is False
```

(`FakeBrowser` and `ScraperSession` are already imported in this test file.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_scraper_session.py::test_mark_disconnected_sets_has_session_false -v`
Expected: FAIL with `AttributeError: 'ScraperSession' object has no attribute 'mark_disconnected'`.

- [ ] **Step 3: Implement the method**

In `api/scraper_session.py`, add this method to the `ScraperSession` class (after `reload_from_file`):

```python
    def mark_disconnected(self) -> None:
        """Mark the session unusable (e.g. after an expired-session scrape)."""
        self.has_session = False
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/test_scraper_session.py -v`
Expected: PASS (all prior tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add api/scraper_session.py tests/test_scraper_session.py
git commit -m "feat(api): add ScraperSession.mark_disconnected"
```

---

### Task 2: Worker expiry detection

**Files:**
- Modify: `api/scraper_worker.py`
- Modify: `tests/test_api_worker.py`

**Interfaces:**
- Consumes: `linkedin_scraper.is_logged_in` (async `is_logged_in(page) -> bool`).
- Produces: `run_job(job_id, title, location, *, store, browser, semaphore, on_expired=None)` — new optional keyword `on_expired` (zero-arg callable). On an empty search result, if `is_logged_in(page)` is False it calls `on_expired()` (when provided) and stores error `"LinkedIn session expired — reconnect via Account settings"`; otherwise stores `"no jobs found"`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_api_worker.py` (top-level import already imports from `api.scraper_worker`; add the `is_logged_in` patch target). Add these tests:

```python
async def test_run_job_expired_session_flips_and_reports(monkeypatch):
    store = JobStore()
    job_id = store.create()
    browser = FakeBrowser()
    expired = {"called": False}

    search = MagicMock()
    search.search = AsyncMock(return_value=[])  # empty result

    async def fake_logged_in(page):
        return False  # session expired -> login wall

    with patch("api.scraper_worker.JobSearchScraper", return_value=search), \
         patch("api.scraper_worker.JobScraper", return_value=MagicMock()), \
         patch("api.scraper_worker.is_logged_in", fake_logged_in):
        await run_job(job_id, "AI", "Sydney",
                      store=store, browser=browser, semaphore=_semaphore(),
                      on_expired=lambda: expired.__setitem__("called", True))

    stored = store.get(job_id)
    assert stored["status"] == "error"
    assert "expired" in stored["error"].lower()
    assert expired["called"] is True


async def test_run_job_no_results_when_logged_in(monkeypatch):
    store = JobStore()
    job_id = store.create()
    browser = FakeBrowser()
    expired = {"called": False}

    search = MagicMock()
    search.search = AsyncMock(return_value=[])

    async def fake_logged_in(page):
        return True  # still logged in -> genuinely no jobs

    with patch("api.scraper_worker.JobSearchScraper", return_value=search), \
         patch("api.scraper_worker.JobScraper", return_value=MagicMock()), \
         patch("api.scraper_worker.is_logged_in", fake_logged_in):
        await run_job(job_id, "Nope", "Nowhere",
                      store=store, browser=browser, semaphore=_semaphore(),
                      on_expired=lambda: expired.__setitem__("called", True))

    stored = store.get(job_id)
    assert stored["status"] == "error"
    assert stored["error"] == "no jobs found"
    assert expired["called"] is False
```

Then update the PRE-EXISTING empty-result test so it still asserts `"no jobs found"` under the new branch. Find the existing test that mocks `search.search = AsyncMock(return_value=[])` and expects `"no jobs found"` (e.g. `test_run_job_no_results_sets_error`) and add `is_logged_in` patched to return True to its `with patch(...)` block:

```python
    async def fake_logged_in(page):
        return True

    with patch("api.scraper_worker.JobSearchScraper", return_value=search), \
         patch("api.scraper_worker.JobScraper", return_value=MagicMock()), \
         patch("api.scraper_worker.is_logged_in", fake_logged_in):
        await run_job(...)  # keep its existing call/args
```

(If that existing test doesn't pass `on_expired`, that's fine — the param is optional.)

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pytest tests/test_api_worker.py -v`
Expected: the two new tests FAIL (`is_logged_in` not importable from `api.scraper_worker` / `on_expired` unexpected keyword), and the pre-existing empty-result test may now error on `is_logged_in` patch target not existing.

- [ ] **Step 3: Implement the worker change**

Edit `api/scraper_worker.py`. Add the import near the others:

```python
from linkedin_scraper import is_logged_in
```

Change the `run_job` signature and the empty-result branch:

```python
async def run_job(job_id, title, location, *, store, browser, semaphore, on_expired=None) -> None:
    """Run a single scrape job and record its outcome in the store."""
    async with semaphore:
        store.set(job_id, status="running")
        page = None
        try:
            page = await browser.new_page()
            urls = await JobSearchScraper(page).search(
                keywords=title, location=location, limit=1
            )
            if not urls:
                if not await is_logged_in(page):
                    if on_expired is not None:
                        on_expired()
                    store.set(job_id, status="error",
                              error="LinkedIn session expired — reconnect via Account settings")
                else:
                    store.set(job_id, status="error", error="no jobs found")
                return
            job = await JobScraper(page).scrape(urls[0])
            store.set(job_id, status="done", result=job_to_response(job))
        except Exception as exc:  # never let one job crash the server
            logger.exception("Job %s failed", job_id)
            store.set(job_id, status="error", error=str(exc))
        finally:
            if page is not None:
                try:
                    await page.close()
                except Exception:
                    logger.exception("Failed to close page for job %s", job_id)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_api_worker.py -v`
Expected: PASS (new expiry + no-results-when-logged-in tests, updated existing test, and the untouched success/exception/launch-failure tests).

- [ ] **Step 5: Commit**

```bash
git add api/scraper_worker.py tests/test_api_worker.py
git commit -m "feat(api): detect expired LinkedIn session during scrape"
```

---

### Task 3: `/connection` endpoint + wire `on_expired`

**Files:**
- Modify: `api/jobs.py`
- Test: `tests/test_connection_endpoint.py`

**Interfaces:**
- Consumes: `ScraperSession.mark_disconnected` (Task 1), `run_job`'s `on_expired` param (Task 2).
- Produces: `GET /connection` → `{"connected": <bool>}` (from `request.app.state.scraper.has_session`); `create_job` now schedules `run_job(..., on_expired=scraper.mark_disconnected)`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_connection_endpoint.py`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_connection_endpoint.py -v`
Expected: FAIL — `GET /connection` returns `404` (route not defined).

- [ ] **Step 3: Add the endpoint and wire `on_expired`**

Edit `api/jobs.py`. In `create_job`, add `on_expired` to the `background.add_task(...)` call:

```python
    background.add_task(
        run_job,
        job_id,
        req.title,
        req.location,
        store=store,
        browser=scraper.browser,
        semaphore=scraper.semaphore,
        on_expired=scraper.mark_disconnected,
    )
```

Add a new route (after `get_job`):

```python
@router.get("/connection")
async def connection_status(request: Request):
    """Unauthenticated boolean: does the scraper have a usable LinkedIn session?"""
    return {"connected": bool(request.app.state.scraper.has_session)}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/test_connection_endpoint.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Run the full unit suite**

Run: `pytest -m unit -v`
Expected: all pass (only the known starlette/httpx deprecation warning).

- [ ] **Step 6: Commit**

```bash
git add api/jobs.py tests/test_connection_endpoint.py
git commit -m "feat(api): add /connection status endpoint and wire expiry callback"
```

---

### Task 4: Dashboard connection badge

**Files:**
- Modify: `front-end/components/dashboard-layout.tsx`

**Interfaces:**
- Consumes: `GET /api/connection` → `{connected: boolean}` (via the existing `/api/*` rewrite); the existing Connect LinkedIn dialog state added in Phase 2.
- Produces: a connection badge near the Account settings entry.

- [ ] **Step 1: Read the current layout**

Read `front-end/components/dashboard-layout.tsx` to find the sidebar-footer area where the Phase-2 "Account settings" button + Connect LinkedIn `Dialog` were added (search for `accountSettingsOpen` and the decision-record comment).

- [ ] **Step 2: Add connection state + fetch**

Inside the `DashboardLayout` component, add state and a fetch helper (follow the file's existing React/hook style):

```tsx
const [linkedinConnected, setLinkedinConnected] = useState<boolean | null>(null);

const refreshConnection = useCallback(async () => {
  try {
    const res = await fetch("/api/connection");
    if (!res.ok) return;
    const data = await res.json();
    setLinkedinConnected(Boolean(data.connected));
  } catch {
    /* leave as-is on network error */
  }
}, []);

useEffect(() => {
  refreshConnection();
}, [refreshConnection]);
```

Ensure `useState`, `useEffect`, `useCallback` are imported from `react` (add to the existing import if missing).

- [ ] **Step 3: Re-fetch when the Connect dialog closes**

Where the Phase-2 Connect LinkedIn `Dialog`'s `open`/`onOpenChange` is handled (`accountSettingsOpen`), call `refreshConnection()` when it transitions to closed, e.g.:

```tsx
onOpenChange={(open) => {
  setAccountSettingsOpen(open);
  if (!open) refreshConnection();
}}
```

- [ ] **Step 4: Render the badge**

Near the Account settings button in the sidebar footer, add a badge that reflects `linkedinConnected` and opens the dialog when not connected. Match the file's existing className/styling conventions:

```tsx
{/* LinkedIn connection status — see front-end/docs/ai/2026-07-22-linkedin-connection-badge.md */}
<button
  type="button"
  onClick={() => setAccountSettingsOpen(true)}
  className="flex items-center gap-2 text-xs"
  title="LinkedIn connection"
>
  <span
    className={
      linkedinConnected
        ? "inline-block h-2 w-2 rounded-full bg-green-500"
        : "inline-block h-2 w-2 rounded-full bg-muted-foreground/50"
    }
  />
  {(sidebarOpen || mobileNavOpen) && (
    <span>{linkedinConnected ? "LinkedIn connected" : "LinkedIn not connected"}</span>
  )}
</button>
```

(Use the same label-visibility gate the adjacent elements use — the Phase-2 button used `(sidebarOpen || mobileNavOpen)`; match whatever that file actually uses.)

- [ ] **Step 5: Build to verify**

Run (from `front-end/`): `npm run build`
Expected: build succeeds; the dashboard compiles with the badge. If the build environment is unavailable, note it and still commit (Vercel builds on deploy).

- [ ] **Step 6: Commit**

```bash
git add front-end/components/dashboard-layout.tsx
git commit -m "feat(frontend): add LinkedIn connection status badge"
```

---

## Self-Review

**Spec coverage:**
- `GET /connection` unauthenticated boolean → Task 3. ✓
- `ScraperSession.mark_disconnected()` → Task 1. ✓
- Worker expiry detection (`on_expired` + `is_logged_in`, expiry message, no-jobs-when-logged-in) → Task 2. ✓
- `create_job` passes `on_expired=scraper.mark_disconnected` → Task 3. ✓
- Dashboard badge (fetch on mount + after dialog close, click to reconnect) → Task 4. ✓
- Backward compatibility (`on_expired` optional) → Task 2 Global Constraints + optional param. ✓

**Placeholder scan:** No TBD/TODO; backend steps have complete code. Task 4's exact insertion point is discovery-based (unfamiliar shared component) but the badge/fetch code is fully specified.

**Type consistency:** `mark_disconnected()`, `run_job(..., on_expired=None)`, `GET /connection` → `{"connected": bool}`, and `on_expired=scraper.mark_disconnected` are used identically where defined (Task 1/2) and consumed (Task 3). `on_expired` is a zero-arg callable and `mark_disconnected` takes no args — signatures match. ✓
