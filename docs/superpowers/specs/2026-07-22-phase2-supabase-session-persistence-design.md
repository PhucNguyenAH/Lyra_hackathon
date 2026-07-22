# Phase 2 — Encrypted Supabase Session Persistence + Account-Settings Entry

**Date:** 2026-07-22
**Status:** Approved
**Phase:** 2 of 3 (single-user). Phase 1 delivered the web login; Phase 3 (per-user
sessions / multi-tenant) remains out of scope.

## Goal

Persist the single LinkedIn scraper session in **Supabase, encrypted at rest**,
so it survives restarts with no Railway volume, and surface the login from an
**Account settings** area in the dashboard. Falls back to the Phase-1 file
behavior when Supabase isn't configured.

## Background / constraints discovered

- The app is **single-tenant** — no user identity, no app login. Supabase is
  reached with a **service-role key** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`),
  as `email_services` already does via `create_client(...)`.
- `cryptography` (Fernet) 43.x is available for encryption at rest.
- **Namespace hazard:** a local `supabase/` directory (the SQL folder) shadows
  the pip `supabase` package when importing from the repo root
  (`from supabase import create_client` → "unknown location"). This must be
  resolved or the backend can't use the client.

## Architecture

A `SessionStore` abstraction with two interchangeable backends; the rest of the
app depends only on the interface.

```
LoginSessionManager.on_saved ─┐
                              ▼
        persist_and_reload():  store.save(json) ──▶ SessionStore
                               scraper.reload_from_file()      │
startup: store.load() ──▶ write working file ──▶ scraper.load_session
                                                                │
                                          ┌─────────────────────┴───────────┐
                                    SupabaseSessionStore            FileSessionStore
                                  (Fernet-encrypted row)          (Phase-1 file)
```

### `SessionStore` interface (`api/session_store.py`)

```python
class SessionStore(Protocol):
    def load(self) -> str | None:   # decrypted storage_state JSON, or None
    def save(self, state_json: str) -> None:   # persist (encrypting if applicable)
```

- `FileSessionStore(path)` — `load` reads the file (or None if absent); `save`
  writes it. Exactly Phase-1 behavior.
- `SupabaseSessionStore(client, fernet, table="linkedin_sessions")` —
  `save` Fernet-encrypts the JSON and **upserts the singleton row**
  (`id="default"`); `load` fetches the row, decrypts, returns the JSON (or None
  if no row / decryption fails — logged).

### Store selection (`api/main.py`)

At startup, build the store:
- If `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, **and** `SESSION_ENCRYPTION_KEY`
  are all set → `SupabaseSessionStore`.
- Otherwise → `FileSessionStore(SESSION_FILE)` (a warning is logged if Supabase
  is partially configured, e.g. URL set but key missing — never store plaintext
  in Supabase).

### Startup load (precedence)

1. `state = store.load()`.
2. If `None` and `SupabaseSessionStore` in use but a local `SESSION_FILE` exists
   (first-run migration): read the file, `store.save(...)` it, use that state.
3. If still `None`, fall back to `LINKEDIN_SESSION_JSON` env → `SESSION_FILE`.
4. If a `state` was obtained, write it to `SESSION_FILE` and
   `browser.load_session(SESSION_FILE)`, set `has_session=True`. Else boot
   unauthenticated (Phase-1 behavior).

### Save on login

The login flow's `on_saved` hook becomes `persist_and_reload()`:
1. `browser.save_session(SESSION_FILE)` already wrote the file (unchanged).
2. Read `SESSION_FILE`, `store.save(json)` (encrypts + upserts to Supabase).
3. `await scraper.reload_from_file()` (unchanged hot-reload).

So a web login now persists to Supabase encrypted, and the very next `/jobs`
works — no restart, no volume.

## Schema (`supabase_schema/linkedin_sessions.sql`, run in Supabase SQL editor)

```sql
create table if not exists linkedin_sessions (
    id          text primary key default 'default',  -- singleton row (single-user)
    cipher_text text not null,                        -- Fernet-encrypted storage_state JSON
    updated_at  timestamptz not null default now()
);
```

Upsert always targets `id = 'default'`.

## Namespace fix

Rename the repo directory `supabase/` → `supabase_schema/` so `import supabase`
resolves to the pip package. Grep the repo for references to the `supabase/`
path and update them (SQL is run manually, so references are expected to be
few/none). Confirm `email_services` still imports the client afterward.

## Encryption

- `SESSION_ENCRYPTION_KEY` = a Fernet key
  (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`).
- Session cookies are **never** written to Supabase in plaintext. The key lives
  only in backend env; losing it means re-logging-in (acceptable).
- If the key is missing while Supabase is configured, the backend falls back to
  the file store and logs a clear warning rather than storing plaintext.

## Frontend — account-settings entry

- Add an **Account settings** entry to `dashboard-layout.tsx` (bottom-left) that
  opens a **Connect LinkedIn** panel reusing the existing `/connect-linkedin`
  logic (streamed login — unchanged for Phase 2).
- This touches the shared dashboard (the CV/interview slice owner's UI) → a
  decision record is written in `front-end/docs/ai/` and the assumption flagged,
  per `front-end/CLAUDE.md`.
- No new login *method* in Phase 2 (the username/password form is deferred).

## Config summary (new env)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase client (already used by email_services). |
| `SESSION_ENCRYPTION_KEY` | Fernet key for encrypting the session at rest. |

All optional: unset → Phase-1 file behavior, unchanged.

## Testing

Unit / integration (no real Supabase, no browser):
- `FileSessionStore.load/save` round-trip; `load` returns None when file absent.
- `SupabaseSessionStore.save` encrypts (stored bytes ≠ plaintext) and upserts the
  `default` row via a **fake Supabase client**; `load` decrypts back to the exact
  JSON; `load` returns None on missing row and on a decryption failure (logged).
- Store selection: all three env vars set → Supabase store; any missing → file
  store (with the partial-config warning path).
- `persist_and_reload` calls `store.save` with the file contents then
  `scraper.reload_from_file` (fakes) — order verified.
- Startup first-run migration: store empty + local file present → file pushed to
  store and used.
- Existing Phase-1 tests still pass unchanged when Supabase env is unset.

Manual (needs a real Supabase project): run the SQL, set env, log in via the web
flow, restart the backend with **no** local session file, confirm the session
loads from Supabase and `/jobs` works.

## Out of scope (Phase 3 / later)

- Multi-user identity / app authentication (app stays single-tenant).
- Per-request session selection in the scraper.
- The hybrid username/password login form (separate follow-up).
- Supabase Row-Level Security (single service-role writer; single row).
