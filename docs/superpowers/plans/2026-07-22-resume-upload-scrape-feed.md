# Resume Upload → Job Scrape Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On resume upload, let the user confirm/edit the derived title+location, scrape a feed of ~10 LinkedIn jobs, persist them to Supabase `jobs`, and show them in the dashboard (read from Supabase).

**Architecture:** The scraper service gains multi-job scraping (returns a `results` list), a `JobsRepository` that upserts jobs into Supabase (deduped by `UNIQUE(url)`), and a `GET /jobs` list endpoint. The frontend adds a jobs-api client, a post-upload confirm bar that triggers a scrape, and sources the dashboard jobs list from `GET /api/jobs` (falling back to the seed when empty).

**Tech Stack:** Python, FastAPI, `supabase` client, Playwright (`linkedin_scraper`), pytest; Next.js (frontend).

## Global Constraints

- The scraper response changes from a single `result: dict` to `results: list[dict]` (each item = the existing 7-field job object `{job_url,title,company,location,posted,applicants,description}`).
- `JobRequest.count` defaults to 10, clamped to `[1, 20]`.
- Persistence maps to `jobs` columns: `role←title, company←company, url←job_url, location, description`; upsert `on_conflict="url"`; **skip rows with no company** (column is NOT NULL). `score`/`score_reasoning` left null; `job_status` uses its DB default.
- `GET /jobs` (list) is unauthenticated and returns non-sensitive job rows; it is distinct from `GET /jobs/{job_id}` (the scrape-poll).
- Supabase unconfigured → `JobsRepository` build returns `None`; upsert/list become no-ops/empty (never crash).
- No `Co-Authored-By` line on any commit.
- Reuse `linkedin_scraper` and the existing `job_to_response`; do not reimplement scraping.

---

### Task 1: JobsRepository (Supabase jobs upsert + list)

**Files:**
- Create: `api/jobs_repository.py`
- Test: `tests/test_jobs_repository.py`

**Interfaces:**
- Produces:
  - `JobsRepository(client, table="jobs")` with `upsert(job: dict) -> None` (maps scraped job → jobs columns, upserts `on_conflict="url"`, skips no-company rows) and `list_jobs(limit: int = 100) -> list[dict]`.
  - `build_jobs_repository(supabase_url, service_key) -> JobsRepository | None` (None when unconfigured or the client can't be built).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_jobs_repository.py`:

```python
"""Unit tests for JobsRepository (Supabase jobs upsert/list)."""
import pytest
from api.jobs_repository import JobsRepository, build_jobs_repository

pytestmark = pytest.mark.unit

JOB = {
    "job_url": "https://www.linkedin.com/jobs/view/123/",
    "title": "AI Engineer", "company": "Acme", "location": "Sydney",
    "posted": "1 day ago", "applicants": "10 applicants", "description": "Build.",
}


class FakeTable:
    def __init__(self, rows):
        self._rows = rows
        self.upserted = None
        self.on_conflict = None

    def upsert(self, row, on_conflict=None):
        self.upserted = row
        self.on_conflict = on_conflict
        return self

    def select(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class FakeClient:
    def __init__(self, rows=None):
        self._table = FakeTable(rows or [])

    def table(self, name):
        return self._table


def test_upsert_maps_fields_and_conflicts_on_url():
    c = FakeClient()
    JobsRepository(c).upsert(JOB)
    assert c._table.on_conflict == "url"
    assert c._table.upserted == {
        "role": "AI Engineer", "company": "Acme",
        "url": "https://www.linkedin.com/jobs/view/123/",
        "location": "Sydney", "description": "Build.",
    }


def test_upsert_skips_no_company():
    c = FakeClient()
    JobsRepository(c).upsert({**JOB, "company": None})
    assert c._table.upserted is None   # never called


def test_list_jobs_returns_rows():
    rows = [{"id": "1", "role": "AI Engineer", "company": "Acme"}]
    c = FakeClient(rows=rows)
    assert JobsRepository(c).list_jobs() == rows


def test_build_returns_none_when_unconfigured():
    assert build_jobs_repository(None, None) is None
    assert build_jobs_repository("https://x.supabase.co", None) is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_jobs_repository.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.jobs_repository'`.

- [ ] **Step 3: Implement the repository**

Create `api/jobs_repository.py`:

```python
"""Persist and list scraped jobs in the Supabase `jobs` table."""
import logging
from typing import Optional

logger = logging.getLogger("api.jobs_repository")

TABLE = "jobs"


class JobsRepository:
    """Upserts scraped jobs (deduped by url) and lists them."""

    def __init__(self, client, table: str = TABLE) -> None:
        self.client = client
        self.table = table

    def upsert(self, job: dict) -> None:
        company = job.get("company")
        if not company:
            logger.warning("Skipping job with no company: %s", job.get("job_url"))
            return
        row = {
            "role": job.get("title"),
            "company": company,
            "url": job.get("job_url"),
            "location": job.get("location"),
            "description": job.get("description"),
        }
        self.client.table(self.table).upsert(row, on_conflict="url").execute()

    def list_jobs(self, limit: int = 100) -> list:
        resp = (
            self.client.table(self.table)
            .select("id,company,role,url,location,description,job_status,created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data or []


def build_jobs_repository(supabase_url, service_key) -> Optional[JobsRepository]:
    """Build a JobsRepository from Supabase creds, or None if unavailable."""
    if not (supabase_url and service_key):
        return None
    try:
        from supabase import create_client

        return JobsRepository(create_client(supabase_url, service_key))
    except Exception:
        logger.exception("Jobs repository unavailable; job persistence disabled")
        return None
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_jobs_repository.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add api/jobs_repository.py tests/test_jobs_repository.py
git commit -m "feat(api): add JobsRepository for Supabase job persistence"
```

---

### Task 2: Multi-job scrape (results list + per-job persist)

**Files:**
- Modify: `api/models.py`
- Modify: `api/store.py`
- Modify: `api/scraper_worker.py`
- Modify: `tests/test_api_worker.py`, `tests/test_api_store.py`, `tests/test_api_endpoints.py`

**Interfaces:**
- Consumes: `JobsRepository.upsert` (Task 1), `job_to_response`, `is_logged_in`.
- Produces:
  - `JobRequest` with `count: int` (default 10, `[1,20]`).
  - `JobStatusResponse` with `results: Optional[list[dict]]` (was `result`).
  - `run_job(job_id, title, location, *, store, browser, semaphore, on_expired=None, count=1, jobs_repo=None)` — searches with `limit=count`, scrapes each returned URL (per-URL failure skipped), stores `results=[...]`, and upserts each via `jobs_repo` when provided.

- [ ] **Step 1: Update the models**

Replace `api/models.py` body with:

```python
"""Request/response models for the job-scraping API."""
from typing import Optional
from pydantic import BaseModel, Field


class JobRequest(BaseModel):
    """Body for POST /jobs."""
    title: str
    location: str
    count: int = Field(default=10, ge=1, le=20)


class JobCreatedResponse(BaseModel):
    """Returned by POST /jobs."""
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    """Returned by GET /jobs/{job_id}."""
    status: str
    results: Optional[list[dict]] = None
    error: Optional[str] = None
```

- [ ] **Step 2: Update the in-memory store default**

In `api/store.py`, in `JobStore.create`, change the initial dict from `{"status": "pending", "result": None, "error": None}` to:

```python
        self._jobs[job_id] = {"status": "pending", "results": None, "error": None}
```

In `tests/test_api_store.py`, update the two assertions that reference `"result": None` to `"results": None` (the `test_create_returns_id_and_pending_status` and `test_set_updates_fields` expected dicts).

- [ ] **Step 3: Write/adjust the failing worker tests**

In `tests/test_api_worker.py`:
- The **success** test (`test_run_job_success_sets_done_with_mapped_result`): change its assertion from `stored["result"]["title"] == ...` to operate on the list, e.g.:
  ```python
  assert stored["status"] == "done"
  assert stored["results"][0]["title"] == "AI Engineer"
  assert stored["results"][0]["job_url"] == "https://www.linkedin.com/jobs/view/123"
  ```
- Add a **multi-job + persist** test:
  ```python
  async def test_run_job_scrapes_multiple_and_persists():
      from linkedin_scraper.models.job import Job
      store = JobStore(); job_id = store.create(); browser = FakeBrowser()
      urls = ["https://www.linkedin.com/jobs/view/1",
              "https://www.linkedin.com/jobs/view/2"]
      search = MagicMock(); search.search = AsyncMock(return_value=urls)
      def make_job(u):
          return Job(linkedin_url=u, job_title="Eng", company="Acme", location="Sydney")
      scraper = MagicMock()
      scraper.scrape = AsyncMock(side_effect=[make_job(urls[0]), make_job(urls[1])])
      persisted = []
      class Repo:
          def upsert(self, job): persisted.append(job["job_url"])
      with patch("api.scraper_worker.JobSearchScraper", return_value=search), \
           patch("api.scraper_worker.JobScraper", return_value=scraper):
          await run_job(job_id, "Eng", "Sydney", store=store, browser=browser,
                        semaphore=_semaphore(), count=2, jobs_repo=Repo())
      stored = store.get(job_id)
      assert stored["status"] == "done"
      assert [r["job_url"] for r in stored["results"]] == urls
      assert persisted == urls
  ```
- The existing expiry / no-results tests still assert `error`; leave them (they hit the `if not urls` branch before scraping).

- [ ] **Step 4: Run to verify the new/updated tests fail**

Run: `pytest tests/test_api_worker.py -v`
Expected: FAIL (`results` not set; `run_job` has no `count`/`jobs_repo` kwargs).

- [ ] **Step 5: Update the worker**

In `api/scraper_worker.py`, add `import asyncio` at the top, and replace `run_job` with:

```python
async def run_job(job_id, title, location, *, store, browser, semaphore,
                  on_expired=None, count=1, jobs_repo=None) -> None:
    """Search LinkedIn, scrape up to `count` jobs, store + persist the list."""
    async with semaphore:
        store.set(job_id, status="running")
        page = None
        try:
            page = await browser.new_page()
            urls = await JobSearchScraper(page).search(
                keywords=title, location=location, limit=count
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
            results = []
            for url in urls:
                try:
                    job = await JobScraper(page).scrape(url)
                except Exception:
                    logger.exception("Failed to scrape %s", url)
                    continue
                result = job_to_response(job)
                results.append(result)
                if jobs_repo is not None:
                    try:
                        await asyncio.to_thread(jobs_repo.upsert, result)
                    except Exception:
                        logger.exception("Failed to persist job %s", result.get("job_url"))
            store.set(job_id, status="done", results=results)
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

- [ ] **Step 6: Update the endpoint integration test**

In `tests/test_api_endpoints.py`, `test_post_then_get_returns_done_result`: the fake `search` returns one URL, so change the assertion from `data["result"] == {...}` to `data["results"] == [{...}]` (wrap the expected 7-field object in a one-item list).

- [ ] **Step 7: Run the affected suites**

Run: `pytest tests/test_api_worker.py tests/test_api_store.py tests/test_api_endpoints.py -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/models.py api/store.py api/scraper_worker.py tests/test_api_worker.py tests/test_api_store.py tests/test_api_endpoints.py
git commit -m "feat(api): scrape a feed of jobs (results list) and persist each"
```

---

### Task 3: Endpoints + wiring (`count`, `GET /jobs`, jobs_repo)

**Files:**
- Modify: `api/jobs.py`
- Modify: `api/main.py`
- Test: `tests/test_jobs_list_endpoint.py`

**Interfaces:**
- Consumes: `build_jobs_repository` (Task 1), `run_job(count=, jobs_repo=)` (Task 2).
- Produces: `POST /jobs` forwards `req.count` and `app.state.jobs_repo` into `run_job`; `GET /jobs` returns `jobs_repo.list_jobs()` (or `[]`); `app.state.jobs_repo` built in lifespan.

- [ ] **Step 1: Write the failing test**

Create `tests/test_jobs_list_endpoint.py`:

```python
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_jobs_list_endpoint.py -v`
Expected: FAIL — `GET /jobs` returns 404 (route not defined).

- [ ] **Step 3: Update `api/jobs.py`**

In `create_job`, read the repo and forward `count`/`jobs_repo`:

```python
@router.post("/jobs", status_code=202, response_model=JobCreatedResponse)
async def create_job(req: JobRequest, background: BackgroundTasks, request: Request):
    scraper = request.app.state.scraper
    if not scraper.has_session:
        raise HTTPException(
            status_code=409,
            detail="no LinkedIn session — open /connect-linkedin to log in",
        )
    store = request.app.state.store
    jobs_repo = getattr(request.app.state, "jobs_repo", None)
    job_id = store.create()
    background.add_task(
        run_job,
        job_id,
        req.title,
        req.location,
        store=store,
        browser=scraper.browser,
        semaphore=scraper.semaphore,
        on_expired=scraper.mark_disconnected,
        count=req.count,
        jobs_repo=jobs_repo,
    )
    return {"job_id": job_id, "status": "pending"}
```

Add a list route (place it BEFORE `get_job` so `/jobs` matches the list, not the `{job_id}` param):

```python
@router.get("/jobs")
async def list_jobs(request: Request):
    """Persisted scraped jobs (from Supabase), for the dashboard feed."""
    jobs_repo = getattr(request.app.state, "jobs_repo", None)
    if jobs_repo is None:
        return []
    return jobs_repo.list_jobs()
```

- [ ] **Step 4: Wire the repo in `api/main.py`**

Add the import with the other relative imports:

```python
from .jobs_repository import build_jobs_repository
```

In `lifespan`, after `app.state.store = JobStore()`, add:

```python
    app.state.jobs_repo = build_jobs_repository(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
```

(`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are already module-level in `api/main.py`.)

- [ ] **Step 5: Run tests + full unit suite**

Run: `pytest tests/test_jobs_list_endpoint.py -v`
Expected: PASS (2 passed).
Run: `pytest -m unit -v`
Expected: all pass (only the known starlette/httpx deprecation warning).

- [ ] **Step 6: Commit**

```bash
git add api/jobs.py api/main.py tests/test_jobs_list_endpoint.py
git commit -m "feat(api): forward count/jobs_repo and add GET /jobs list endpoint"
```

---

### Task 4: Frontend jobs API client + dashboard reads Supabase

**Files:**
- Create: `front-end/lib/jobs-api.ts`
- Modify: `front-end/app/page.tsx`

**Interfaces:**
- Consumes: `POST /api/jobs`, `GET /api/jobs/{id}`, `GET /api/jobs` (via the `/api/*` rewrite).
- Produces: `scrapeJobs(title, location, count?) -> Promise<string>` (job_id), `pollJob(jobId) -> Promise<{status, results, error}>`, `listJobs() -> Promise<DbJob[]>`; the dashboard `jobs` state fetched from `listJobs()` with a seed fallback.

- [ ] **Step 1: Create the client**

Create `front-end/lib/jobs-api.ts`:

```ts
export type JobResult = {
  job_url: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  applicants: string;
  description: string;
};

export type DbJob = {
  id: string;
  role: string;
  company: string;
  url: string | null;
  location: string | null;
  description: string | null;
  job_status?: string;
  created_at?: string;
};

export async function scrapeJobs(title: string, location: string, count = 10): Promise<string> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, location, count }),
  });
  if (!res.ok) {
    throw new Error(res.status === 409 ? "Connect LinkedIn first" : `Scrape failed (${res.status})`);
  }
  const data = await res.json();
  return data.job_id as string;
}

export async function pollJob(
  jobId: string,
): Promise<{ status: string; results: JobResult[] | null; error: string | null }> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Poll failed (${res.status})`);
  return res.json();
}

export async function listJobs(): Promise<DbJob[]> {
  const res = await fetch("/api/jobs");
  if (!res.ok) return [];
  return res.json();
}
```

- [ ] **Step 2: Source the dashboard jobs from Supabase (with seed fallback)**

Read `front-end/app/page.tsx`. Find the `const [jobs] = useState<JobPosting[]>(() => ... JOB_POSTINGS_SEED ...)` block (~line 98). Make it stateful and fetch on mount:

- Change `const [jobs]` to `const [jobs, setJobs]`.
- Keep the existing seed mapping as the initial value (fallback).
- Add, near the other effects:

```tsx
useEffect(() => {
  listJobs()
    .then((rows) => {
      if (rows.length) {
        setJobs(
          rows.map((r) => ({
            id: r.id,
            title: r.role,
            company: r.company,
            location: r.location ?? "",
            matchScore: 0,
            skillsRequired: [],
            skillsMatched: [],
            url: r.url ?? undefined,
          })),
        );
      }
    })
    .catch(() => {});
}, []);
```

Add `import { listJobs } from "@/lib/jobs-api";` and ensure `useEffect` is imported. Do not remove the seed — it remains the empty-DB fallback.

- [ ] **Step 3: Build to verify**

Run (from `front-end/`): `npm run build`
Expected: build succeeds. If the environment can't build, note it and still commit (Vercel builds on deploy).

- [ ] **Step 4: Commit**

```bash
git add front-end/lib/jobs-api.ts front-end/app/page.tsx
git commit -m "feat(frontend): jobs-api client; dashboard reads jobs from Supabase"
```

---

### Task 5: Post-upload confirm bar → scrape

**Files:**
- Modify: `front-end/components/profile/profile-workspace.tsx`

**Interfaces:**
- Consumes: `scrapeJobs`, `pollJob` (Task 4); the `ProfileRecord.preferences` fields (`target_titles`, `preferred_locations`, `current_title`, `current_location`).
- Produces: after `uploadCV` succeeds, an editable confirm bar (pre-filled) with a "Find jobs" button that scrapes + polls with a progress state.

- [ ] **Step 1: Read the component**

Read `front-end/components/profile/profile-workspace.tsx` — locate `handleUpload` (~line 234) and the "CV library" card where the upload UI lives, and match the file's existing state/toast/styling conventions.

- [ ] **Step 2: Add scrape state + confirm bar**

Add component state (near the other `useState`s):

```tsx
const [scrapeTitle, setScrapeTitle] = useState("");
const [scrapeLocation, setScrapeLocation] = useState("");
const [showScrapeBar, setShowScrapeBar] = useState(false);
const [isScraping, setIsScraping] = useState(false);
```

In `handleUpload`, after `setProfile(nextProfile);` and the other setters (before the success toast), pre-fill and reveal the bar:

```tsx
const prefs = nextProfile.preferences;
setScrapeTitle(prefs.target_titles?.[0] ?? prefs.current_title ?? "");
setScrapeLocation(prefs.preferred_locations?.[0] ?? prefs.current_location ?? "");
setShowScrapeBar(true);
```

Add the scrape handler:

```tsx
const handleFindJobs = async () => {
  if (!scrapeTitle.trim()) return;
  setIsScraping(true);
  try {
    const jobId = await scrapeJobs(scrapeTitle.trim(), scrapeLocation.trim(), 10);
    // poll until terminal (scraping ~10 jobs can take up to a minute)
    for (let i = 0; i < 40; i++) {
      const data = await pollJob(jobId);
      if (data.status === "done") {
        const n = data.results?.length ?? 0;
        toast.success(`Found ${n} jobs — see the dashboard`);
        setShowScrapeBar(false);
        return;
      }
      if (data.status === "error") {
        toast.error(data.error ?? "Scrape failed");
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    toast.error("Scrape timed out");
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Scrape failed");
  } finally {
    setIsScraping(false);
  }
};
```

- [ ] **Step 3: Render the bar**

Where the CV-library card renders (after the upload controls), render the bar when `showScrapeBar` is true — two inputs bound to `scrapeTitle`/`scrapeLocation` and a "Find jobs" button calling `handleFindJobs` (disabled while `isScraping`, showing a scraping label). Match the file's existing input/button components and classes.

Add imports: `import { scrapeJobs, pollJob } from "@/lib/jobs-api";` (and ensure `useState`/`toast` are already imported — they are).

- [ ] **Step 4: Build to verify**

Run (from `front-end/`): `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add front-end/components/profile/profile-workspace.tsx
git commit -m "feat(frontend): post-upload confirm bar triggers a job scrape"
```

---

## Self-Review

**Spec coverage:**
- Multi-job (results list) → Task 2. ✓
- Persist to Supabase (upsert on url, skip no-company) → Task 1 (`JobsRepository`) + Task 2 (worker calls it). ✓
- `GET /jobs` list + `count` param + repo wiring → Task 3. ✓
- Jobs API client + dashboard reads Supabase with seed fallback → Task 4. ✓
- Upload → editable confirm bar → scrape + poll → Task 5. ✓
- Graceful when Supabase unconfigured → Task 1 (`build_jobs_repository` None) + Task 3 (`GET /jobs` → []). ✓
- 409 when no session → Task 3 (unchanged guard) + Task 4 (client surfaces it). ✓

**Placeholder scan:** No TBD/TODO; backend steps carry complete code. Tasks 4–5's exact JSX insertion points are discovery-based (unfamiliar shared components) but the client, handlers, state, and mapping are fully specified.

**Type consistency:** `JobRequest.count`, `JobStatusResponse.results`, `run_job(..., count=1, jobs_repo=None)`, `JobsRepository.upsert/list_jobs`, `build_jobs_repository`, `scrapeJobs/pollJob/listJobs`, and the DB→`JobPosting` mapping (`role→title`) are used identically where defined and consumed. The worker's `jobs_repo.upsert(result)` matches `JobsRepository.upsert(job: dict)`. ✓
