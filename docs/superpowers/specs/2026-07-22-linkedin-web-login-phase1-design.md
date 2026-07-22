# LinkedIn Web Login — Phase 1 Design

**Date:** 2026-07-22
**Status:** Approved
**Phase:** 1 of 3 (single operator session; per-user auth/storage and scraper
per-user refactor are deferred to Phases 2 and 3).

## Goal

Let an operator create the scraper's LinkedIn session **from a web page**,
without SSHing in or running `create_session.py` locally. A protected Next.js
page streams a real, server-side Chromium via noVNC; the operator logs into
LinkedIn (including 2FA/CAPTCHA); the backend captures the session, persists it
to a volume, and hot-reloads the scraper so the next `/jobs` request uses it —
no restart.

## Why the front-end can't do this directly (context)

LinkedIn's auth cookies are `httpOnly` on `linkedin.com`; a Vercel-origin page
cannot read them. The scraper needs a **server-side** browser's `storage_state`.
So the login must happen in a browser the backend controls, streamed to the
operator. noVNC gives full input fidelity, which is required for 2FA/CAPTCHA.

## Architecture

Two independent browsers live in the backend container:

- **Scraper browser** — headless, holds the saved session, serves `/jobs`.
- **Login browser** — headful Chromium on a virtual display (Xvfb), launched
  only during a login session and streamed to the operator via noVNC.

```
Next.js /connect-linkedin
  │  POST /api/auth/session/start   (X-Admin-Token)   launch login browser
  │  WS   /api/auth/session/vnc?token=…               noVNC canvas (live browser)
  │  GET  /api/auth/session/status?token=…  (poll)    idle→awaiting_login→saved
  ▼
FastAPI (Railway container)
  Xvfb :99 ── Chromium(headful, LinkedIn) ── x11vnc :5900 ── websockify :6080
     on login detected → save_session(/data/…) → hot-reload scraper browser
```

FastAPI **proxies** the VNC websocket (one public port, gated by the admin
token). Only one login session may run at a time.

## Backend components

New package layout under `api/`:

- `api/auth/token.py` — admin-token dependency (`require_admin_token`) checking
  `X-Admin-Token` header (HTTP) or `token` query param (websocket) against the
  `ADMIN_TOKEN` env var. Uses `secrets.compare_digest`. If `ADMIN_TOKEN` is
  unset, all `/auth/*` routes return `503` (feature disabled) — never open.
- `api/auth/login_session.py` — the `LoginSession` state machine + manager:
  - States: `idle | starting | awaiting_login | logged_in | saving | saved | error | cancelled`.
  - `start()` — acquire the single-login lock; launch headful Chromium on
    `DISPLAY=:99` at `https://www.linkedin.com/login`; start `x11vnc` bound to
    `:99`; spawn a background task running `wait_for_manual_login(page)`.
  - On `wait_for_manual_login` success → state `logged_in` → `save_session(SESSION_FILE)`
    → call the scraper reload hook → state `saved`; tear down the login browser
    and x11vnc; release the lock.
  - On timeout/exception → state `error` with message; tear down; release lock.
  - `cancel()` — tear down, release lock, state `cancelled`.
  - Enforces one session: `start()` while a session is active returns a conflict.
- `api/auth/vnc_proxy.py` — websocket endpoint that, after token check, opens a
  client websocket to the local `websockify` (`ws://127.0.0.1:6080`) and pumps
  bytes both directions until either side closes.
- `api/auth/routes.py` — the four `/auth/session/*` routes wired to the manager.
- `api/scraper_session.py` — extracted scraper-session concerns:
  - `ScraperSession` holding `app.state.browser` + a `has_session: bool` flag
    and an `asyncio.Lock`.
  - `reload_from_file(path)` — acquire the scrape semaphore's full capacity
    (so no job is in flight), call `browser.load_session(path)` (which rebuilds
    the context in place), set `has_session=True`, release. This is the hot
    reload the login flow calls.

`api/main.py` changes:

- Register the `/auth` router.
- Lifespan: start the scraper browser but **do not** hard-fail when no session
  exists. If `SESSION_FILE` exists (or `LINKEDIN_SESSION_JSON` materialized it),
  `load_session` and set `has_session=True`; otherwise log a warning and leave
  `has_session=False`. Store the scrape semaphore where the reload can reach it.
- `POST /jobs`: if `has_session` is `False`, return `409` with
  `{"detail": "no LinkedIn session — open /connect-linkedin to log in"}`.

## Endpoints

All `/auth/*` require the admin token.

| Method | Path | Auth | Behaviour |
|--------|------|------|-----------|
| POST | `/auth/session/start` | `X-Admin-Token` | Launch login browser + x11vnc. `200 {session_id, state:"awaiting_login"}`, or `409` if one is active, or `503` if `ADMIN_TOKEN` unset. |
| WS | `/auth/session/vnc?token=…` | query token | Token-checked passthrough to `websockify`; noVNC connects here. Closes if no active session. |
| GET | `/auth/session/status?token=…` | query token | `{state, error?, session_id?}`. |
| POST | `/auth/session/cancel` | `X-Admin-Token` | Abort the active session; `200 {state:"cancelled"}`. |

`POST /jobs` / `GET /jobs/{id}` unchanged except the `has_session` guard above.

## Login-session state machine

```
idle ──start()──▶ starting ──browser up──▶ awaiting_login
awaiting_login ──is_logged_in()──▶ logged_in ──save_session()──▶ saving ──reload──▶ saved
awaiting_login ──timeout/error──▶ error
(any active) ──cancel()──▶ cancelled
saved/error/cancelled ──start()──▶ starting   (a new session resets state)
```

## Deployment (Railway)

**Dockerfile** (extends the existing Playwright base):

- `apt-get install`: `xvfb x11vnc websockify fluxbox` (+ fonts already in base).
- Copy an `entrypoint.sh` that:
  1. starts `Xvfb :99 -screen 0 1280x800x24` (background),
  2. exports `DISPLAY=:99`,
  3. starts `websockify 6080 localhost:5900` (background; x11vnc is started
     per-login by the manager and always targets :5900),
  4. `exec`s `uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}`.
- Single public port (FastAPI); websockify/x11vnc stay on localhost.

**Config / persistence:**

- Railway **Volume** mounted at `/data`.
- `LINKEDIN_SESSION_FILE=/data/linkedin_session.json` (survives restarts).
- `ADMIN_TOKEN` = a strong random string (required to enable `/auth/*`).
- `LINKEDIN_SESSION_JSON` remains an optional one-time seed.
- `railway.json` unchanged (`numReplicas: 1` — still single instance).

## Front-end

New page `front-end/app/connect-linkedin/page.tsx`:

- Input for the admin token (kept in component state; sent as `X-Admin-Token`
  and as the `token` query param for the websocket).
- "Start login" → `POST /api/auth/session/start`; on success, mount the noVNC
  client (`@novnc/novnc` `RFB`) against `wss://<host>/api/auth/session/vnc?token=…`,
  rendered into a `<div>` canvas container.
- Poll `GET /api/auth/session/status` every ~2s; show `awaiting_login` →
  `saved` (success message) or `error`. Offer "Cancel" (`POST /auth/session/cancel`).
- Add `@novnc/novnc` to `front-end/package.json`. Uses the existing `/api/*`
  rewrite (works locally and, with `BACKEND_URL`, in production).

## Security

- Every `/auth/*` route is admin-token gated; unset token ⇒ `503` (fail closed).
- The stream carries a live LinkedIn login (operator types a password) — it must
  run over `wss` (TLS), which Railway/Vercel provide. The token travels in the
  WS query string; acceptable under TLS for Phase 1. Documented as such.
- `x11vnc`/`websockify` bind localhost only; never publicly exposed.

## Testing

Unit / integration (no real browser, no VNC, no LinkedIn):

- Admin-token dependency: valid token passes; missing/wrong ⇒ `401`; unset
  `ADMIN_TOKEN` ⇒ `503`. (FastAPI `TestClient`.)
- `LoginSession` state machine with the Playwright/x11vnc calls mocked: start →
  awaiting_login; simulated `wait_for_manual_login` success drives
  logged_in→saving→saved and calls `save_session` + the reload hook; timeout ⇒
  error; second `start()` while active ⇒ conflict; `cancel()` ⇒ cancelled.
- `ScraperSession.reload_from_file` with a fake browser: acquires full semaphore
  capacity, calls `load_session`, flips `has_session`.
- `POST /jobs` returns `409` when `has_session` is `False`; normal path when
  `True` (existing tests keep passing with `has_session` seeded True).

Manual (documented, needs a real deploy + LinkedIn account):

- End-to-end: open `/connect-linkedin`, enter the admin token, complete a real
  login in the streamed browser, confirm `saved`, then run a scrape.

## Out of scope (Phase 1)

- Per-user identity, auth, and per-user session storage (Phase 2).
- Encryption of the session file at rest (Phase 2) — noted as a known limitation;
  the cookie file lives on the Railway volume.
- Scraper refactor to select a session per request (Phase 3).
- More than one concurrent login session.
- Session-expiry auto-detection / re-login prompts (a scrape that fails on an
  expired session still returns `status:"error"`, as today).
