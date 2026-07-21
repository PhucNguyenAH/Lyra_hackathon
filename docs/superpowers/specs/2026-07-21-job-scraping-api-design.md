# Job-scraping API — Design

**Date:** 2026-07-21
**Status:** Approved

## Goal

Expose the existing Python LinkedIn scraper as an HTTP API the Next.js frontend
can call. Given a job `title` and `location`, return a single job object:

```json
{
  "job_url": "...",
  "title": "...",
  "company": "...",
  "location": "...",
  "posted": "...",
  "applicants": "...",
  "description": "..."
}
```

## Architecture

A standalone Python service (`api/` package, entry `api/main.py`) running
FastAPI + uvicorn. It imports the existing `linkedin_scraper` package directly —
no scraping logic is rewritten.

```
Browser ──▶ Next.js (/api rewrite) ──▶ FastAPI ──▶ linkedin_scraper
```

- Frontend: normal Next.js server (not a static export).
- Backend: separate FastAPI process on `localhost:8000`.
- Single process only (in-memory job store — see Scope).

## Endpoints

| Method | Path            | Body / Params                          | Returns                                                        |
|--------|-----------------|----------------------------------------|----------------------------------------------------------------|
| POST   | `/jobs`         | `{ "title": "...", "location": "..." }`| `202` → `{ "job_id": "<uuid>", "status": "pending" }`          |
| GET    | `/jobs/{job_id}`| —                                      | `{ "status": "...", "result": {...}\|null, "error": null\|"..." }` |

`status` ∈ `pending | running | done | error`.

When `status == "done"`, `result` is the response shape defined in **Goal**.

## Data flow (background worker)

1. `POST /jobs` validates the body via a Pydantic `JobRequest` model, generates a
   `job_id` (uuid4), stores `{status: "pending"}` in the in-memory job store,
   schedules a background asyncio task, and returns `202` immediately.
2. Worker coroutine:
   - `JobSearchScraper(page).search(keywords=title, location=location, limit=1)`
   - Take the first URL. If none, mark `status:"error"`, `error:"no jobs found"`.
   - `JobScraper(page).scrape(url)` → `Job` model.
   - Map to response shape via `job_to_response(job)`.
   - Store `{status:"done", result}`.
3. Frontend polls `GET /jobs/{job_id}` until `done` or `error`.

## Field mapping (`Job` → response)

Implemented as one pure function `job_to_response(job) -> dict`:

| `Job` field       | Response field |
|-------------------|----------------|
| `linkedin_url`    | `job_url`      |
| `job_title`       | `title`        |
| `company`         | `company`      |
| `location`        | `location`     |
| `posted_date`     | `posted`       |
| `applicant_count` | `applicants`   |
| `job_description` | `description`  |

This function is the primary unit-test target (no browser required).

## Browser / session handling

The scraper requires a logged-in `linkedin_session.json`.

- Use FastAPI **lifespan**: start one shared `BrowserManager(headless=True)` at
  app startup and call `load_session("linkedin_session.json")` once.
- Each job gets its own `browser.new_page()`; the page is closed when the job
  finishes.
- An `asyncio.Semaphore(2)` caps concurrent scrapes so LinkedIn is not hammered.
- Browser is closed cleanly on app shutdown (lifespan teardown).

## Error handling

- Unknown `job_id` → `404`.
- Invalid request body → `422` (automatic via Pydantic).
- No search results → `status:"error"`, `error:"no jobs found"`.
- Any scraper/browser exception → caught inside the worker → `status:"error"`
  with the message. The server never crashes on a single failed job.

## Frontend integration

Next.js runs as a normal server, so add a rewrite so the browser calls
same-origin `/api/...` (avoids CORS, hides backend URL):

```js
async rewrites() {
  return [{ source: "/api/:path*", destination: "http://localhost:8000/:path*" }];
}
```

## Testing

- Unit: `job_to_response()` mapping — pure function, all fields incl. `None`.
- Unit: request validation (missing `title`/`location` → 422).
- Integration: `POST /jobs` then `GET /jobs/{id}` with the scraper mocked
  (patched `JobSearchScraper`/`JobScraper`) — asserts the pending → done
  lifecycle and final response shape.

## Scope (YAGNI)

- In-memory job store (a dict), no DB/Redis. Jobs are lost on restart.
- Single-process only — no `uvicorn --workers 2` (would split the store).
- No auth on the API itself.
- Future: swap the dict for Redis behind the same store interface if
  multi-process or persistence is needed. No other changes required.
