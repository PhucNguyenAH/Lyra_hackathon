# Job-scraping API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing Python LinkedIn scraper as a FastAPI service where `POST /jobs {title, location}` starts a background scrape and `GET /jobs/{job_id}` returns the single job result.

**Architecture:** A new standalone `api/` package runs FastAPI + uvicorn and imports the existing `linkedin_scraper` package directly. `POST /jobs` stores a job in an in-memory dict and schedules a background worker (search → scrape → map). The frontend (normal Next.js server) polls `GET /jobs/{job_id}` until `done`/`error`.

**Tech Stack:** Python 3, FastAPI, uvicorn, Pydantic v2, Playwright (via existing `linkedin_scraper`), pytest + pytest-asyncio, httpx (test client).

## Global Constraints

- Single process only — the job store is an in-memory dict; never run `uvicorn --workers >1`.
- Backend listens on `localhost:8000`.
- Response shape (when `status == "done"`) is exactly: `{ "job_url", "title", "company", "location", "posted", "applicants", "description" }`.
- Reuse the existing `linkedin_scraper` scrapers — do NOT reimplement scraping.
- The scraper requires a logged-in `linkedin_session.json` at repo root (generated via existing `create_session.py`). The API loads it once at startup; it does not create it.
- Follow existing repo conventions: modules under a package dir, tests under `tests/`, pytest markers from `pytest.ini` (`unit`, `integration`).

---

### Task 1: Dependencies, Pydantic models, and response mapping

**Files:**
- Modify: `requirements.txt`
- Create: `api/__init__.py`
- Create: `api/models.py`
- Create: `api/mapping.py`
- Test: `tests/test_api_mapping.py`

**Interfaces:**
- Consumes: `linkedin_scraper.models.job.Job` (fields `linkedin_url`, `job_title`, `company`, `location`, `posted_date`, `applicant_count`, `job_description`).
- Produces:
  - `api.models.JobRequest(BaseModel)` with `title: str`, `location: str`.
  - `api.models.JobCreatedResponse(BaseModel)` with `job_id: str`, `status: str`.
  - `api.models.JobStatusResponse(BaseModel)` with `status: str`, `result: Optional[dict] = None`, `error: Optional[str] = None`.
  - `api.mapping.job_to_response(job: Job) -> dict` returning the 7-field response shape.

- [ ] **Step 1: Add dependencies**

Append to `requirements.txt` under a new section:

```
# API server
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
httpx>=0.27.0
```

- [ ] **Step 2: Install dependencies**

Run: `pip install -r requirements.txt`
Expected: fastapi, uvicorn, httpx install successfully (no errors).

- [ ] **Step 3: Create the package init**

Create `api/__init__.py`:

```python
"""FastAPI service exposing the LinkedIn job scraper over HTTP."""
```

- [ ] **Step 4: Write the failing test for the mapping function**

Create `tests/test_api_mapping.py`:

```python
"""Unit tests for the Job -> API response mapping."""
import pytest
from linkedin_scraper.models.job import Job
from api.mapping import job_to_response

pytestmark = pytest.mark.unit


def test_maps_all_fields():
    job = Job(
        linkedin_url="https://www.linkedin.com/jobs/view/123",
        job_title="AI Engineer",
        company="Acme",
        location="Sydney",
        posted_date="2 days ago",
        applicant_count="42 applicants",
        job_description="Build things.",
    )
    assert job_to_response(job) == {
        "job_url": "https://www.linkedin.com/jobs/view/123",
        "title": "AI Engineer",
        "company": "Acme",
        "location": "Sydney",
        "posted": "2 days ago",
        "applicants": "42 applicants",
        "description": "Build things.",
    }


def test_maps_missing_optional_fields_to_none():
    job = Job(linkedin_url="https://www.linkedin.com/jobs/view/999")
    result = job_to_response(job)
    assert result["job_url"] == "https://www.linkedin.com/jobs/view/999"
    assert result["title"] is None
    assert result["company"] is None
    assert result["description"] is None
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pytest tests/test_api_mapping.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.mapping'`.

- [ ] **Step 6: Implement the models**

Create `api/models.py`:

```python
"""Request/response models for the job-scraping API."""
from typing import Optional
from pydantic import BaseModel


class JobRequest(BaseModel):
    """Body for POST /jobs."""
    title: str
    location: str


class JobCreatedResponse(BaseModel):
    """Returned by POST /jobs."""
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    """Returned by GET /jobs/{job_id}."""
    status: str
    result: Optional[dict] = None
    error: Optional[str] = None
```

- [ ] **Step 7: Implement the mapping function**

Create `api/mapping.py`:

```python
"""Pure mapping from the scraper Job model to the API response shape."""
from linkedin_scraper.models.job import Job


def job_to_response(job: Job) -> dict:
    """Convert a scraped Job into the API response dict."""
    return {
        "job_url": job.linkedin_url,
        "title": job.job_title,
        "company": job.company,
        "location": job.location,
        "posted": job.posted_date,
        "applicants": job.applicant_count,
        "description": job.job_description,
    }
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pytest tests/test_api_mapping.py -v`
Expected: PASS (2 passed).

- [ ] **Step 9: Commit**

```bash
git add requirements.txt api/__init__.py api/models.py api/mapping.py tests/test_api_mapping.py
git commit -m "feat(api): add models and Job->response mapping"
```

---

### Task 2: In-memory job store

**Files:**
- Create: `api/store.py`
- Test: `tests/test_api_store.py`

**Interfaces:**
- Produces: `api.store.JobStore` with:
  - `create() -> str` — generates a uuid4 `job_id`, stores `{"status": "pending", "result": None, "error": None}`, returns the id.
  - `set(job_id: str, **fields) -> None` — updates stored fields for that job (no-op keys not allowed to create new jobs; assume job exists).
  - `get(job_id: str) -> Optional[dict]` — returns the stored dict (a copy) or `None` if unknown.

- [ ] **Step 1: Write the failing test**

Create `tests/test_api_store.py`:

```python
"""Unit tests for the in-memory JobStore."""
import pytest
from api.store import JobStore

pytestmark = pytest.mark.unit


def test_create_returns_id_and_pending_status():
    store = JobStore()
    job_id = store.create()
    assert isinstance(job_id, str) and len(job_id) > 0
    assert store.get(job_id) == {"status": "pending", "result": None, "error": None}


def test_create_returns_unique_ids():
    store = JobStore()
    assert store.create() != store.create()


def test_set_updates_fields():
    store = JobStore()
    job_id = store.create()
    store.set(job_id, status="done", result={"title": "AI Engineer"})
    stored = store.get(job_id)
    assert stored["status"] == "done"
    assert stored["result"] == {"title": "AI Engineer"}
    assert stored["error"] is None


def test_get_unknown_returns_none():
    store = JobStore()
    assert store.get("nope") is None


def test_get_returns_copy_not_reference():
    store = JobStore()
    job_id = store.create()
    got = store.get(job_id)
    got["status"] = "mutated"
    assert store.get(job_id)["status"] == "pending"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_api_store.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.store'`.

- [ ] **Step 3: Implement the store**

Create `api/store.py`:

```python
"""In-memory job store. Single-process only; state is lost on restart."""
import uuid
from typing import Optional


class JobStore:
    """Maps job_id -> {status, result, error}."""

    def __init__(self) -> None:
        self._jobs: dict[str, dict] = {}

    def create(self) -> str:
        """Create a pending job and return its id."""
        job_id = str(uuid.uuid4())
        self._jobs[job_id] = {"status": "pending", "result": None, "error": None}
        return job_id

    def set(self, job_id: str, **fields) -> None:
        """Update fields on an existing job."""
        self._jobs[job_id].update(fields)

    def get(self, job_id: str) -> Optional[dict]:
        """Return a copy of the stored job, or None if unknown."""
        job = self._jobs.get(job_id)
        return dict(job) if job is not None else None
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/test_api_store.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add api/store.py tests/test_api_store.py
git commit -m "feat(api): add in-memory job store"
```

---

### Task 3: Background scraper worker

**Files:**
- Create: `api/scraper_worker.py`
- Test: `tests/test_api_worker.py`

**Interfaces:**
- Consumes: `api.store.JobStore` (`set`), `api.mapping.job_to_response`, `linkedin_scraper.scrapers.job_search.JobSearchScraper`, `linkedin_scraper.scrapers.job.JobScraper`, a `BrowserManager`-like object exposing `async new_page()`, and an `asyncio.Semaphore`.
- Produces:
  - `api.scraper_worker.run_job(job_id: str, title: str, location: str, *, store, browser, semaphore) -> None` — async. Sets status `running`, searches (limit=1), scrapes the first URL, maps and stores the result as `done`; stores `error` on no results or exception; always closes the page.

Note: `JobSearchScraper` and `JobScraper` are imported at module top-level inside `api/scraper_worker.py` so tests can patch `api.scraper_worker.JobSearchScraper` / `api.scraper_worker.JobScraper`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_api_worker.py`:

```python
"""Unit tests for the background scraper worker (scrapers mocked)."""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from linkedin_scraper.models.job import Job
from api.store import JobStore
from api.scraper_worker import run_job

pytestmark = pytest.mark.unit


class FakePage:
    def __init__(self):
        self.closed = False

    async def close(self):
        self.closed = True


class FakeBrowser:
    def __init__(self):
        self.page = FakePage()

    async def new_page(self):
        return self.page


def _semaphore():
    return asyncio.Semaphore(1)


async def test_run_job_success_sets_done_with_mapped_result():
    store = JobStore()
    job_id = store.create()
    browser = FakeBrowser()

    search = MagicMock()
    search.search = AsyncMock(return_value=["https://www.linkedin.com/jobs/view/123"])
    scraper = MagicMock()
    scraper.scrape = AsyncMock(return_value=Job(
        linkedin_url="https://www.linkedin.com/jobs/view/123",
        job_title="AI Engineer", company="Acme", location="Sydney",
        posted_date="2 days ago", applicant_count="42", job_description="Build.",
    ))

    with patch("api.scraper_worker.JobSearchScraper", return_value=search), \
         patch("api.scraper_worker.JobScraper", return_value=scraper):
        await run_job(job_id, "AI Engineer", "Sydney",
                      store=store, browser=browser, semaphore=_semaphore())

    stored = store.get(job_id)
    assert stored["status"] == "done"
    assert stored["result"]["title"] == "AI Engineer"
    assert stored["result"]["job_url"] == "https://www.linkedin.com/jobs/view/123"
    assert browser.page.closed is True
    search.search.assert_awaited_once_with(keywords="AI Engineer", location="Sydney", limit=1)


async def test_run_job_no_results_sets_error():
    store = JobStore()
    job_id = store.create()
    browser = FakeBrowser()

    search = MagicMock()
    search.search = AsyncMock(return_value=[])

    with patch("api.scraper_worker.JobSearchScraper", return_value=search), \
         patch("api.scraper_worker.JobScraper", return_value=MagicMock()):
        await run_job(job_id, "Nope", "Nowhere",
                      store=store, browser=browser, semaphore=_semaphore())

    stored = store.get(job_id)
    assert stored["status"] == "error"
    assert stored["error"] == "no jobs found"
    assert browser.page.closed is True


async def test_run_job_scraper_exception_sets_error():
    store = JobStore()
    job_id = store.create()
    browser = FakeBrowser()

    search = MagicMock()
    search.search = AsyncMock(side_effect=RuntimeError("boom"))

    with patch("api.scraper_worker.JobSearchScraper", return_value=search), \
         patch("api.scraper_worker.JobScraper", return_value=MagicMock()):
        await run_job(job_id, "AI", "Sydney",
                      store=store, browser=browser, semaphore=_semaphore())

    stored = store.get(job_id)
    assert stored["status"] == "error"
    assert "boom" in stored["error"]
    assert browser.page.closed is True
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_api_worker.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.scraper_worker'`.

- [ ] **Step 3: Implement the worker**

Create `api/scraper_worker.py`:

```python
"""Background worker: search LinkedIn, scrape the top match, store the result."""
import logging

from linkedin_scraper.scrapers.job_search import JobSearchScraper
from linkedin_scraper.scrapers.job import JobScraper

from .mapping import job_to_response

logger = logging.getLogger(__name__)


async def run_job(job_id, title, location, *, store, browser, semaphore) -> None:
    """Run a single scrape job and record its outcome in the store."""
    async with semaphore:
        store.set(job_id, status="running")
        page = await browser.new_page()
        try:
            urls = await JobSearchScraper(page).search(
                keywords=title, location=location, limit=1
            )
            if not urls:
                store.set(job_id, status="error", error="no jobs found")
                return
            job = await JobScraper(page).scrape(urls[0])
            store.set(job_id, status="done", result=job_to_response(job))
        except Exception as exc:  # never let one job crash the server
            logger.exception("Job %s failed", job_id)
            store.set(job_id, status="error", error=str(exc))
        finally:
            await page.close()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_api_worker.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add api/scraper_worker.py tests/test_api_worker.py
git commit -m "feat(api): add background scraper worker"
```

---

### Task 4: FastAPI app, lifespan, and endpoints

**Files:**
- Create: `api/main.py`
- Test: `tests/test_api_endpoints.py`

**Interfaces:**
- Consumes: `api.models` (`JobRequest`, `JobCreatedResponse`, `JobStatusResponse`), `api.store.JobStore`, `api.scraper_worker.run_job`, `linkedin_scraper.core.browser.BrowserManager`.
- Produces: `api.main.app` (a `FastAPI` instance) with:
  - lifespan that creates `BrowserManager(headless=True)`, `await start()`, `await load_session("linkedin_session.json")`, and sets `app.state.browser`, `app.state.store = JobStore()`, `app.state.semaphore = asyncio.Semaphore(2)`; closes the browser on shutdown.
  - `POST /jobs` → 202, `{job_id, status:"pending"}`, schedules `run_job` via `BackgroundTasks`.
  - `GET /jobs/{job_id}` → stored status dict, or 404 if unknown.

Note: `BrowserManager` is imported as `api.main.BrowserManager` so tests can patch it with a fake (no real browser launched).

- [ ] **Step 1: Write the failing integration test**

Create `tests/test_api_endpoints.py`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_api_endpoints.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.main'`.

- [ ] **Step 3: Implement the app**

Create `api/main.py`:

```python
"""FastAPI application exposing the LinkedIn job scraper."""
import asyncio
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, HTTPException

from linkedin_scraper.core.browser import BrowserManager

from .models import JobCreatedResponse, JobRequest, JobStatusResponse
from .scraper_worker import run_job
from .store import JobStore

SESSION_FILE = "linkedin_session.json"
MAX_CONCURRENT_SCRAPES = 2


@asynccontextmanager
async def lifespan(app: FastAPI):
    browser = BrowserManager(headless=True)
    await browser.start()
    await browser.load_session(SESSION_FILE)
    app.state.browser = browser
    app.state.store = JobStore()
    app.state.semaphore = asyncio.Semaphore(MAX_CONCURRENT_SCRAPES)
    try:
        yield
    finally:
        await browser.close()


app = FastAPI(title="Job Scraper API", lifespan=lifespan)


@app.post("/jobs", status_code=202, response_model=JobCreatedResponse)
async def create_job(req: JobRequest, background: BackgroundTasks):
    job_id = app.state.store.create()
    background.add_task(
        run_job,
        job_id,
        req.title,
        req.location,
        store=app.state.store,
        browser=app.state.browser,
        semaphore=app.state.semaphore,
    )
    return {"job_id": job_id, "status": "pending"}


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str):
    job = app.state.store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_api_endpoints.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Run the full test suite (unit only, no browser)**

Run: `pytest -m unit -v`
Expected: all Task 1–4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add api/main.py tests/test_api_endpoints.py
git commit -m "feat(api): add FastAPI app with /jobs endpoints"
```

---

### Task 5: Run docs and Next.js proxy wiring

**Files:**
- Create: `api/README.md`
- Modify: the Next.js config file in the frontend project (`next.config.ts` or `next.config.mjs` — whichever exists where your Next source lives).

**Interfaces:**
- Consumes: `api.main.app`.
- Produces: documented run command and a same-origin `/api/*` → `http://localhost:8000/*` rewrite.

- [ ] **Step 1: Write the API README**

Create `api/README.md`:

````markdown
# Job Scraper API

FastAPI service wrapping the `linkedin_scraper` package.

## Prerequisites

- `pip install -r requirements.txt`
- A logged-in `linkedin_session.json` at the repo root (generate with `python create_session.py`).

## Run

```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

Single process only — do NOT pass `--workers >1` (the job store is in-memory).

## Endpoints

Start a scrape:

```bash
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{"title": "AI Engineer", "location": "Sydney"}'
# -> 202 {"job_id": "<uuid>", "status": "pending"}
```

Poll for the result:

```bash
curl http://localhost:8000/jobs/<uuid>
# -> {"status": "done", "result": {"job_url": ..., "title": ..., ...}, "error": null}
```

`status` is one of `pending | running | done | error`.
````

- [ ] **Step 2: Add the Next.js rewrite**

In the Next.js config file, add a `rewrites` function so the browser calls same-origin `/api/*`:

```js
const nextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:8000/:path*" },
    ];
  },
};
```

Merge into the existing config object if one already exists (keep other keys).

- [ ] **Step 3: Manual smoke test (documented, requires a real session)**

Start the API: `uvicorn api.main:app --port 8000`
Run: `curl -X POST http://localhost:8000/jobs -H "Content-Type: application/json" -d '{"title":"AI Engineer","location":"Sydney"}'`
Expected: `202` with a `job_id`. Then `curl http://localhost:8000/jobs/<job_id>` transitions `pending`/`running` → `done` (with the 7-field `result`) or `error`.

Note: this step needs a valid `linkedin_session.json` and cannot run in CI. If no session is available, skip and note it.

- [ ] **Step 4: Commit**

```bash
git add api/README.md
git commit -m "docs(api): add run instructions and Next.js proxy rewrite"
```

Note: commit the Next.js config change separately in the frontend project if it lives outside this repo/`.gitignore`.

---

## Self-Review

**Spec coverage:**
- POST /jobs + GET /jobs/{id} → Tasks 1, 4. ✓
- Background worker (search limit=1 → scrape → map) → Task 3. ✓
- Response field mapping → Task 1 (`job_to_response`). ✓
- In-memory store, single process → Task 2 + Global Constraints. ✓
- Lifespan shared BrowserManager + `load_session` + Semaphore(2) → Task 4. ✓
- Error handling: 404 unknown id, 422 invalid body, "no jobs found", caught scraper exceptions → Tasks 3, 4 (tested). ✓
- Frontend same-origin rewrite → Task 5. ✓
- Session prerequisite documented → Task 5 README + Global Constraints. ✓

**Placeholder scan:** No TBD/TODO; all code steps contain full code and exact commands.

**Type consistency:** `job_to_response` signature, `JobStore.create/set/get`, `run_job(job_id, title, location, *, store, browser, semaphore)`, and `app.state.{browser,store,semaphore}` names are identical across the tasks that define and consume them. ✓
