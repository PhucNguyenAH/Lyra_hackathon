# Resume upload triggers a scraped job feed

- **Date:** 2026-07-22
- **Status:** proposed
- **Type:** UI, CONTRACT
- **Owner slice:** UI (profile + jobs dashboard) — change originates from the job-scraping slice

## Context

Uploading a resume on `/profile` currently only builds the master profile; the
jobs dashboard shows hardcoded seed data (`JOB_POSTINGS_SEED`). We want upload to
kick off a real LinkedIn scrape and populate the dashboard. Since scraped jobs
are persisted to the Supabase `jobs` table, the dashboard can read jobs from the
DB rather than passing React state between the `/profile` page and the home
dashboard.

## Decision

After `uploadCV` succeeds, show an **editable confirm bar** (pre-filled with the
resume's derived title/location) with a "Find jobs" button that scrapes ~10 jobs
via the scraper API and persists them. The home dashboard's jobs list is sourced
from `GET /api/jobs` (Supabase), falling back to the existing seed only when the
DB returns no jobs.

## Alternatives Considered

- **Scrape immediately, no confirm bar:** rejected — the resume yields the
  *current* title, which may not be the role the user wants to search; a quick
  editable step avoids scraping the wrong thing.
- **Keep the mock seed, append scraped jobs in React state:** rejected — would
  require sharing jobs state across the `/profile` and home pages; reading from
  Supabase is simpler and makes results survive a refresh.

## Consequences

- Easier: one upload flows into a real, persisted job feed; results survive
  refresh; no cross-page state plumbing.
- Debt: the dashboard's `jobs` source changes from a static seed to a fetch;
  scraped jobs lack `matchScore`/skills (those came from the matcher), so those
  columns render empty until a matcher pass is wired in later. Extends the
  scraping slice's dependency on the shared `app/page.tsx` and profile workspace.

## Contract Impact

- **Consumes (from the scraper backend slice):**
  - `POST /api/jobs { title, location, count }` → `{ job_id, status }`
  - `GET /api/jobs/{job_id}` → `{ status, results: JobResult[], error }`
  - `GET /api/jobs` → `JobResult[]` (persisted jobs)
  where `JobResult = { job_url, title, company, location, posted, applicants, description }`.
- **Exposes / assumes (to the profile & dashboard slice owners):** a confirm bar
  in `profile-workspace.tsx` after upload, and a change to `app/page.tsx` so the
  `jobs` list is fetched (from `GET /api/jobs`) instead of seeded — with the seed
  retained as an empty-state fallback.
