# Phase 3 — LinkedIn Connection Status + Expiry Handling

**Date:** 2026-07-22
**Status:** Approved
**Phase:** 3 (a small, high-value increment; full multi-user was explicitly
declined as over-scoped for a single-user tool).

## Goal

Make the LinkedIn connection state visible and self-correcting: surface a
"Connected / Not connected" badge in the dashboard, and when a scrape reveals
the session has expired, report a clear "reconnect" message and flip the
backend to unauthenticated (so the badge updates and `/jobs` gates until the
user logs in again).

## Background

Today `app.state.scraper.has_session` is the single source of truth for whether
the scraper has a usable session, but it is only observable indirectly (a `409`
from `/jobs`), and an expired session produces a generic scrape error with no
signal to reconnect. This phase exposes the flag and adds expiry detection.

## Components

### 1. Connection-status endpoint (`api/jobs.py` or a small status route)

- `GET /connection` → `{"connected": <bool>}` where the bool is
  `request.app.state.scraper.has_session`.
- **Unauthenticated** (no admin token): the value is a non-sensitive boolean,
  and the dashboard badge must read it on load without the admin token. No
  cookies, no session bytes — only the boolean.
- Distinct from the existing admin-gated `GET /auth/session/status`, which
  reports the interactive *login-flow* state. Naming is `/connection` to avoid
  collision.

### 2. `ScraperSession.mark_disconnected()` (`api/scraper_session.py`)

- Sets `has_session = False`. Called when a scrape detects an expired session.
- Idempotent, no I/O.

### 3. Expiry detection in the worker (`api/scraper_worker.py`)

`run_job` gains a keyword arg `on_expired` (a zero-arg callable, optional) and
imports `is_logged_in` from `linkedin_scraper`. New behaviour on the
no-results branch:

```
urls = await JobSearchScraper(page).search(keywords=title, location=location, limit=1)
if not urls:
    if not await is_logged_in(page):
        if on_expired is not None:
            on_expired()
        store.set(job_id, status="error",
                  error="LinkedIn session expired — reconnect via Account settings")
    else:
        store.set(job_id, status="error", error="no jobs found")
    return
```

- `is_logged_in(page)` is the existing detector (`linkedin_scraper/core/auth.py`).
  An expired session redirects search to the login wall, so `is_logged_in`
  returns `False` there — this cleanly distinguishes expiry from a genuine
  empty result.
- Everything else in `run_job` (the launch-failure guard, page teardown,
  success path, generic exception handling) is unchanged.

`api/jobs.py`'s `create_job` passes `on_expired=request.app.state.scraper.mark_disconnected`
into `run_job`.

### 4. Frontend connection badge (`front-end/components/dashboard-layout.tsx`)

- A small badge near the Account settings entry (bottom-left): green
  "LinkedIn connected" / muted "LinkedIn not connected".
- Fetches `GET /api/connection` on mount and re-fetches after the Connect
  LinkedIn dialog closes / a login reaches `saved`.
- The "Not connected" state is clickable → opens the existing Connect LinkedIn
  dialog (already wired in Phase 2).
- Touches the shared dashboard layout → a `front-end/docs/ai/` decision record
  is added per `front-end/CLAUDE.md`.

## Data flow

```
scrape (run_job): search empty + not is_logged_in  ─▶ on_expired() ─▶ scraper.has_session=False
                                                     └▶ job error "…reconnect…"
GET /api/connection ─▶ {connected: has_session}  ─▶ dashboard badge (red/green)
badge "Not connected" click ─▶ Connect LinkedIn dialog ─▶ login ─▶ has_session=True ─▶ badge green
```

## Error handling

- `on_expired` is optional; if a caller omits it, expiry still produces the
  clear error message (only the flag-flip is skipped) — backward compatible.
- `/connection` never touches the session bytes, so it can't leak cookies and
  can't fail on a missing session (returns `{"connected": false}`).

## Testing

- `GET /connection` returns `{"connected": true}` when `has_session` is True and
  `{"connected": false}` when False (TestClient, seeding `app.state.scraper`).
- Worker expiry: search returns `[]` and `is_logged_in→False` (both mocked) →
  job error is the expiry message **and** `on_expired` was called; `is_logged_in→True`
  + `[]` → `"no jobs found"` and `on_expired` NOT called; success path unchanged.
- `ScraperSession.mark_disconnected()` flips `has_session` to False.
- Existing unit tests stay green (the new `on_expired` param is optional).
- Frontend: `npm run build` succeeds with the badge added.

## Out of scope

- Multi-user / auth (declined).
- Automatic re-login, retries, or push notifications on expiry — the user
  reconnects manually via the existing flow.
- Proactive/periodic session-health polling on the backend — expiry is detected
  lazily, only when a scrape actually hits the login wall.
