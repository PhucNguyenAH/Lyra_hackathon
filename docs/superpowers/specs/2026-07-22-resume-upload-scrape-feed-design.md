# Resume Upload → Job Scrape Feed — Design

**Date:** 2026-07-22
**Status:** Approved

## Goal

When the user uploads a resume, let them confirm/edit the derived job title +
location, then scrape a **feed of ~10 LinkedIn jobs**, **persist** them to the
Supabase `jobs` table, and show them in the dashboard (which reads jobs from
Supabase instead of the current mock seed).

## Current state (from exploration)

- Resume upload works: `/profile` → `uploadCV()` → `POST :8008/profile/upload`
  (Athena backend, direct via `NEXT_PUBLIC_API_URL`). Returns a `ProfileRecord`
  whose `preferences` has `current_title`, `current_location`, `target_titles[]`,
  `preferred_locations[]`. Upload does **not** trigger any scrape.
- The dashboard jobs list is 100% mock (`JOB_POSTINGS_SEED` → `app/page.tsx`,
  read-only `useState`). `/api/jobs` is not called anywhere in the frontend.
- The scraper API (`api/`, behind the `/api/*` rewrite → `BACKEND_URL`) returns
  **one** job per call; `JobSearchScraper.search()` already returns a URL list,
  so multi-job is a worker/model change, not a scraper-library change.
- Supabase `jobs` table: `company NOT NULL, role, url, location, description,
  score, score_reasoning, job_status (default 'not_applied'), created_at`, with
  a `UNIQUE(url)` constraint (`jobs_url_unique`). The scraper emits the canonical
  `https://www.linkedin.com/jobs/view/<id>/` URL that matches that key.

## Architecture

Persistence is the linchpin: the scrape (triggered on `/profile`) writes to
Supabase, and the dashboard (home) reads from Supabase — so the two pages are
connected through the DB, not shared React state.

```
/profile: upload → :8008/profile/upload → {current_title, current_location}
        → editable confirm bar → POST /api/jobs {title, location, count:10}
scraper:   search(limit=count) → scrape each URL → upsert Supabase jobs (on url)
        → GET /api/jobs/{id} poll → results list
home:      GET /api/jobs (Supabase) → jobs feed (replaces the mock seed)
```

## Backend — scraper service (`api/`)

1. **Multi-job request/response** (`api/models.py`):
   - `JobRequest` gains `count: int = 10` (clamp/validate to a sane max, e.g. 20).
   - `JobStatusResponse` field `result: Optional[dict]` becomes
     `results: Optional[list[dict]]` (a list of the existing 7-field job objects).
2. **Worker** (`api/scraper_worker.py`): `search(keywords, location, limit=count)`
   → loop the returned URLs, `scrape()` each (a per-URL failure is skipped, not
   fatal), collect a list; upsert each into Supabase via the repo; store
   `results=[...]`. The expired-session detection (`on_expired`) and
   page-teardown are unchanged.
3. **Jobs repository** (`api/jobs_repository.py`, new): `JobsRepository` built
   from env (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`); no-op when unconfigured.
   - `upsert(job: dict)` maps the scraped job → `jobs` columns
     (`role←title`, `company←company`, `url←job_url`, `location`, `description`)
     and upserts `on_conflict="url"` (dedup). Skips rows with no company (the
     column is NOT NULL) — logs and continues.
   - `list_jobs(limit=100) -> list[dict]` selects recent `jobs` rows.
4. **Endpoints** (`api/jobs.py`, `api/main.py`):
   - `POST /jobs` accepts `count`, passes the repo into `run_job`.
   - `GET /jobs/{job_id}` returns the `results` list (unchanged path).
   - `GET /jobs` (new; distinct from `/jobs/{id}`) → `JobsRepository.list_jobs()`,
     returns the persisted jobs for the dashboard. Unauthenticated read of
     non-sensitive job data.
   - `app.state.jobs_repo` built in lifespan alongside the scraper.

## Frontend (`front-end/`)

5. **Jobs API client** (`front-end/lib/jobs-api.ts`, new): `scrapeJobs(title,
   location, count)` → `POST /api/jobs`; `pollJob(jobId)` → `GET /api/jobs/{id}`;
   `listJobs()` → `GET /api/jobs`. All via the same-origin `/api/*` rewrite.
6. **Upload → confirm → scrape** (`components/profile/profile-workspace.tsx`,
   `handleUpload`): after `uploadCV` resolves, reveal an **editable confirm bar**
   pre-filled from the returned profile
   (`preferences.target_titles[0] ?? current_title`,
   `preferences.preferred_locations[0] ?? current_location`). A "Find jobs"
   button runs `scrapeJobs` + polls with a progress state (scraping ~10 jobs
   takes 30–60s). On success, surface a "N jobs found — view them" affordance.
7. **Dashboard reads Supabase** (`app/page.tsx`): replace the seed-only `jobs`
   `useState` with a `listJobs()` fetch on mount (and after a scrape). Map the DB
   rows to the existing `JobPosting` shape (`title←role`, `company`, `location`,
   `url`; `matchScore` absent/0; `skillsRequired`/`skillsMatched` empty — these
   came from the matcher, out of scope here). **Fallback:** if `listJobs()`
   returns empty, keep showing `JOB_POSTINGS_SEED` so the dashboard isn't blank
   before the first scrape. Touches shared UI → a `front-end/docs/ai/` decision
   record is added.

## Error handling

- No LinkedIn session on the scraper backend → `POST /jobs` returns `409`; the
  confirm bar surfaces "connect LinkedIn first" (the connection badge already
  reflects this).
- Per-job scrape failure → that URL is skipped; the feed returns the jobs that
  succeeded.
- Supabase unconfigured/unreachable → `upsert`/`list_jobs` no-op/empty and are
  logged; the live poll `results` still populate the UI for that session.
- Empty search (no jobs / expired) → existing expiry/"no jobs found" handling;
  `results` is an empty list.

## Testing

- `JobsRepository.upsert` maps fields correctly and calls upsert `on_conflict=url`
  (fake Supabase client); skips a no-company row; `list_jobs` returns mapped rows;
  no-op when unconfigured.
- Worker: `search` returns N URLs → scrapes each, `results` has N items, repo
  `upsert` called per job; a mid-list scrape error is skipped, not fatal; empty
  search → empty `results` + existing expiry path.
- `POST /jobs {count}` schedules with the repo; `GET /jobs/{id}` returns the
  `results` list; `GET /jobs` returns the repo list. Existing tests updated for
  the `results` (list) shape.
- Frontend: `npm run build` succeeds; the jobs-api client hits the right paths.

## Out of scope (YAGNI)

- Computing a match score / skills for scraped jobs (the matcher pipeline is
  separate; the feed shows title/company/location/description only).
- Per-user job scoping (the `jobs` table is single-tenant; no `user_id`).
- Concurrent scraping within one request (jobs are scraped sequentially).
- Auto-relogin, background re-scrape, or scheduling.
