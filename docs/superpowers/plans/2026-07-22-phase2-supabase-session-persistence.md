# Phase 2 — Supabase Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the single LinkedIn scraper session in Supabase, encrypted at rest (Fernet), with graceful fallback to the Phase-1 file behavior, and add an Account-settings entry point to the dashboard that opens the existing streamed login.

**Architecture:** A `SessionStore` abstraction with `FileSessionStore` and `SupabaseSessionStore` backends selected by env. Startup loads the session via the store (with first-run file→Supabase migration); a successful web login persists the captured session through the store and hot-reloads the scraper. Frontend adds an Account-settings entry reusing the `/connect-linkedin` flow.

**Tech Stack:** Python, FastAPI, `supabase` (v2 client), `cryptography` (Fernet), pytest; Next.js (frontend).

## Global Constraints

- **Backward compatible:** with none of `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SESSION_ENCRYPTION_KEY` set, behavior is exactly Phase-1 (file store) — existing tests must stay green.
- **Never store plaintext:** if Supabase is configured but `SESSION_ENCRYPTION_KEY` is missing, fall back to the file store (log a warning); do not write unencrypted cookies to Supabase.
- **Single-user:** one Supabase row, `id = 'default'`. No app auth, no per-user logic.
- **The `supabase` pip package and `cryptography` must be importable at runtime**; the local `supabase/` directory must not shadow the pip package.
- No `Co-Authored-By` line on any commit.
- Reuse existing components; do not reimplement the scraper, login flow, or `/connect-linkedin` behavior.

---

### Task 1: SessionStore (file + Supabase + encryption)

**Files:**
- Create: `api/session_store.py`
- Modify: `api/requirements.txt`
- Test: `tests/test_session_store.py`

**Interfaces:**
- Produces:
  - `api.session_store.FileSessionStore(path: str)` with `load() -> str | None` and `save(state_json: str) -> None`.
  - `api.session_store.SupabaseSessionStore(client, fernet, table="linkedin_sessions", row_id="default")` with the same two methods; `save` Fernet-encrypts and upserts `{id, cipher_text}`; `load` selects the row, decrypts, returns JSON (or `None` on missing row / any error, logged).
  - `api.session_store.build_session_store(*, session_file, supabase_url, service_key, encryption_key) -> object` — returns a `SupabaseSessionStore` when all three of `supabase_url`/`service_key`/`encryption_key` are truthy (importing `supabase`/`cryptography` lazily; on any failure falls back to file), else a `FileSessionStore` (warning if partially configured).

- [ ] **Step 1: Add dependencies**

Append to `api/requirements.txt`:

```
# Session persistence (Phase 2)
supabase>=2.10.0
cryptography>=43.0.0
```

- [ ] **Step 2: Install**

Run: `pip install -r api/requirements.txt`
Expected: succeeds (both already present in the environment).

- [ ] **Step 3: Write the failing tests**

Create `tests/test_session_store.py`:

```python
"""Unit tests for the SessionStore backends and selector."""
import pytest
from cryptography.fernet import Fernet
from api.session_store import (
    FileSessionStore, SupabaseSessionStore, build_session_store,
)

pytestmark = pytest.mark.unit

STATE = '{"cookies":[{"name":"li_at","value":"abc"}],"origins":[]}'


def test_file_store_round_trip(tmp_path):
    p = tmp_path / "sess.json"
    store = FileSessionStore(str(p))
    assert store.load() is None
    store.save(STATE)
    assert store.load() == STATE


class FakeTable:
    def __init__(self, rows):
        self._rows = rows
        self.upserted = None

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()

    def upsert(self, row):
        self.upserted = row
        return self


class FakeClient:
    def __init__(self, rows=None):
        self._table = FakeTable(rows or [])

    def table(self, name):
        return self._table


def test_supabase_store_save_encrypts_and_upserts():
    key = Fernet.generate_key()
    client = FakeClient()
    store = SupabaseSessionStore(client, Fernet(key))
    store.save(STATE)
    row = client._table.upserted
    assert row["id"] == "default"
    assert row["cipher_text"] != STATE                 # encrypted, not plaintext
    assert Fernet(key).decrypt(row["cipher_text"].encode()).decode() == STATE


def test_supabase_store_load_decrypts():
    key = Fernet.generate_key()
    cipher = Fernet(key).encrypt(STATE.encode()).decode()
    client = FakeClient(rows=[{"cipher_text": cipher}])
    store = SupabaseSessionStore(client, Fernet(key))
    assert store.load() == STATE


def test_supabase_store_load_none_when_no_row():
    client = FakeClient(rows=[])
    store = SupabaseSessionStore(client, Fernet(Fernet.generate_key()))
    assert store.load() is None


def test_supabase_store_load_none_on_bad_cipher():
    client = FakeClient(rows=[{"cipher_text": "not-a-valid-token"}])
    store = SupabaseSessionStore(client, Fernet(Fernet.generate_key()))
    assert store.load() is None


def test_build_selects_file_store_when_unconfigured(tmp_path):
    store = build_session_store(
        session_file=str(tmp_path / "s.json"),
        supabase_url=None, service_key=None, encryption_key=None,
    )
    assert isinstance(store, FileSessionStore)


def test_build_selects_file_store_when_key_missing(tmp_path):
    store = build_session_store(
        session_file=str(tmp_path / "s.json"),
        supabase_url="https://x.supabase.co", service_key="k", encryption_key=None,
    )
    assert isinstance(store, FileSessionStore)
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pytest tests/test_session_store.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.session_store'`.

- [ ] **Step 5: Implement the module**

Create `api/session_store.py`:

```python
"""Persistence for the LinkedIn session: file or encrypted Supabase row."""
import logging
import os
from typing import Optional

logger = logging.getLogger("api.session_store")

TABLE = "linkedin_sessions"
ROW_ID = "default"


class FileSessionStore:
    """Reads/writes the session JSON as a local file (Phase-1 behavior)."""

    def __init__(self, path: str) -> None:
        self.path = path

    def load(self) -> Optional[str]:
        if not os.path.exists(self.path):
            return None
        with open(self.path) as fh:
            return fh.read()

    def save(self, state_json: str) -> None:
        parent = os.path.dirname(self.path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(self.path, "w") as fh:
            fh.write(state_json)


class SupabaseSessionStore:
    """Stores the session as a Fernet-encrypted singleton row in Supabase."""

    def __init__(self, client, fernet, table: str = TABLE, row_id: str = ROW_ID) -> None:
        self.client = client
        self.fernet = fernet
        self.table = table
        self.row_id = row_id

    def load(self) -> Optional[str]:
        try:
            resp = (
                self.client.table(self.table)
                .select("cipher_text")
                .eq("id", self.row_id)
                .limit(1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                return None
            cipher = rows[0]["cipher_text"]
            return self.fernet.decrypt(cipher.encode()).decode()
        except Exception:
            logger.exception("Failed to load session from Supabase")
            return None

    def save(self, state_json: str) -> None:
        cipher = self.fernet.encrypt(state_json.encode()).decode()
        self.client.table(self.table).upsert({"id": self.row_id, "cipher_text": cipher}).execute()


def build_session_store(*, session_file: str, supabase_url, service_key, encryption_key):
    """Pick the Supabase store when fully configured, else the file store."""
    if supabase_url and service_key and encryption_key:
        try:
            from supabase import create_client
            from cryptography.fernet import Fernet

            client = create_client(supabase_url, service_key)
            key = encryption_key.encode() if isinstance(encryption_key, str) else encryption_key
            logger.info("Using Supabase session store (encrypted at rest)")
            return SupabaseSessionStore(client, Fernet(key))
        except Exception:
            logger.exception("Supabase session store unavailable; using file store")
            return FileSessionStore(session_file)
    if supabase_url or service_key:
        logger.warning(
            "Supabase partially configured; need SUPABASE_URL + "
            "SUPABASE_SERVICE_ROLE_KEY + SESSION_ENCRYPTION_KEY. Using file store."
        )
    return FileSessionStore(session_file)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pytest tests/test_session_store.py -v`
Expected: PASS (8 passed).

- [ ] **Step 7: Commit**

```bash
git add api/session_store.py api/requirements.txt tests/test_session_store.py
git commit -m "feat(api): add SessionStore with encrypted Supabase backend"
```

---

### Task 2: Rename `supabase/` dir + add the session table SQL

**Files:**
- Rename: `supabase/job_pipeline.sql` → `supabase_schema/job_pipeline.sql`
- Create: `supabase_schema/linkedin_sessions.sql`

**Interfaces:**
- Produces: the `linkedin_sessions` table DDL; removes the `supabase/` directory that shadows the pip package.

- [ ] **Step 1: Confirm the shadow, then rename the directory**

Run: `python -c "import supabase, os; print(getattr(supabase,'__file__',None) or os.path.dirname(supabase.__path__[0]))"`
(If it prints a path inside the repo's `supabase/`, that's the shadow.)

Run:
```bash
git mv supabase/job_pipeline.sql supabase_schema/job_pipeline.sql
rmdir supabase 2>/dev/null || true
```

- [ ] **Step 2: Verify the shadow is gone**

Run: `python -c "from supabase import create_client; print('supabase import OK')"`
Expected: prints `supabase import OK` (the pip package now resolves). If `supabase` isn't installed, this errors — that's acceptable at runtime because `build_session_store` falls back to the file store; note it in the report.

- [ ] **Step 3: Confirm nothing referenced the old path**

Run: `grep -rn "supabase/" --include=*.py --include=*.md --include=*.json --include=*.sh . | grep -v node_modules | grep -v supabase_schema`
Expected: no results (or only unrelated matches). Fix any real reference to point at `supabase_schema/`.

- [ ] **Step 4: Add the session table DDL**

Create `supabase_schema/linkedin_sessions.sql`:

```sql
-- Encrypted single-row store for the LinkedIn scraper session (Phase 2).
-- Run once in the Supabase SQL editor. Single-user: exactly one row (id='default').
create table if not exists linkedin_sessions (
    id          text primary key default 'default',
    cipher_text text not null,                 -- Fernet-encrypted storage_state JSON
    updated_at  timestamptz not null default now()
);
```

- [ ] **Step 5: Verify existing tests still import cleanly**

Run: `pytest -m unit -q`
Expected: all currently-passing tests still pass (the rename doesn't touch Python imports of the app).

- [ ] **Step 6: Commit**

```bash
git add -A supabase_schema
git rm -r --cached supabase 2>/dev/null || true
git commit -m "chore: rename supabase/ dir to supabase_schema/ and add linkedin_sessions table"
```

---

### Task 3: Wire the store into startup + persist-on-login

**Files:**
- Modify: `api/main.py`
- Modify: `tests/test_api_endpoints.py` (only if needed — see step)
- Test: `tests/test_main_session_store.py`

**Interfaces:**
- Consumes: `api.session_store.build_session_store`, `SupabaseSessionStore`, `FileSessionStore`; `ScraperSession`, `LoginSessionManager` (unchanged).
- Produces:
  - `api.main.build_session_store` imported and used to create `app`-level store from env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_ENCRYPTION_KEY`).
  - `api.main._bootstrap_session_state(store) -> str | None` — returns the session JSON to load (store → first-run file migration → `LINKEDIN_SESSION_JSON` env → file) and ensures it's written to `SESSION_FILE`.
  - `api.main._make_on_saved(store, session_file, scraper)` — returns an async callable that reads `session_file`, `store.save(...)` it, then `await scraper.reload_from_file()`. Wired as the login manager's `on_saved`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_main_session_store.py`:

```python
"""Startup loads from the session store; login persists through it."""
import asyncio
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

pytestmark = pytest.mark.unit

STATE = '{"cookies":[],"origins":[]}'


class FakeBrowserManager:
    def __init__(self, *a, **k): pass
    async def start(self): return None
    async def load_session(self, p): return None
    async def new_page(self): return None
    async def close(self): return None


class FakeStore:
    def __init__(self, state=None):
        self._state = state
        self.saved = None
    def load(self): return self._state
    def save(self, s): self.saved = s


def test_startup_loads_session_from_store():
    store = FakeStore(state=STATE)
    with patch("api.main.BrowserManager", FakeBrowserManager), \
         patch("api.main.build_session_store", return_value=store):
        from api.main import app
        with TestClient(app) as client:
            # has_session should be True purely from the store load (no manual set)
            assert client.app.state.scraper.has_session is True


def test_startup_unauthenticated_when_store_empty():
    store = FakeStore(state=None)
    with patch("api.main.BrowserManager", FakeBrowserManager), \
         patch("api.main.build_session_store", return_value=store):
        from api.main import app
        with TestClient(app) as client:
            assert client.app.state.scraper.has_session is False
            r = client.post("/jobs", json={"title": "x", "location": "y"})
            assert r.status_code == 409


def test_make_on_saved_persists_then_reloads(tmp_path):
    from api.main import _make_on_saved
    p = tmp_path / "sess.json"
    p.write_text(STATE)
    store = FakeStore()
    reloaded = {"called": False}

    class FakeScraper:
        async def reload_from_file(self, path=None):
            reloaded["called"] = True

    on_saved = _make_on_saved(store, str(p), FakeScraper())
    asyncio.get_event_loop().run_until_complete(on_saved())
    assert store.saved == STATE          # persisted through the store
    assert reloaded["called"] is True    # then hot-reloaded
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_main_session_store.py -v`
Expected: FAIL (`_make_on_saved` not defined / `build_session_store` not patchable in `api.main`).

- [ ] **Step 3: Edit `api/main.py`**

Add imports (below the existing imports, after `from .store import JobStore`):

```python
from .session_store import build_session_store
```

Add env vars near the other config (after `MAX_CONCURRENT_SCRAPES`):

```python
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SESSION_ENCRYPTION_KEY = os.environ.get("SESSION_ENCRYPTION_KEY")
```

Add these two helpers (after `_materialize_session_file`):

```python
def _bootstrap_session_state(store) -> "str | None":
    """Resolve the session JSON to load and ensure it is written to SESSION_FILE.

    Precedence: store -> first-run file->store migration -> LINKEDIN_SESSION_JSON
    env -> existing file.
    """
    from .session_store import SupabaseSessionStore

    state = store.load()
    if state is None and isinstance(store, SupabaseSessionStore) and os.path.exists(SESSION_FILE):
        with open(SESSION_FILE) as fh:
            state = fh.read()
        try:
            store.save(state)
            logger.info("Migrated local session file to Supabase")
        except Exception:
            logger.exception("Failed to migrate local session file to Supabase")
    if state is None:
        _materialize_session_file()  # LINKEDIN_SESSION_JSON -> SESSION_FILE
        if os.path.exists(SESSION_FILE):
            with open(SESSION_FILE) as fh:
                state = fh.read()
    if state is not None:
        parent = os.path.dirname(SESSION_FILE)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(SESSION_FILE, "w") as fh:
            fh.write(state)
    return state


def _make_on_saved(store, session_file, scraper):
    """Return an async hook that persists the captured session then hot-reloads."""
    async def _on_saved():
        try:
            with open(session_file) as fh:
                store.save(fh.read())
        except Exception:
            logger.exception("Failed to persist session to store")
        await scraper.reload_from_file()
    return _on_saved
```

Replace the body of `lifespan` (the session-loading block and the `on_saved` wiring) with:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    store = build_session_store(
        session_file=SESSION_FILE,
        supabase_url=SUPABASE_URL,
        service_key=SUPABASE_SERVICE_ROLE_KEY,
        encryption_key=SESSION_ENCRYPTION_KEY,
    )
    browser = BrowserManager(headless=True)
    await browser.start()
    scraper = ScraperSession(
        browser=browser,
        max_concurrent=MAX_CONCURRENT_SCRAPES,
        session_file=SESSION_FILE,
    )
    state = _bootstrap_session_state(store)
    if state is not None:
        try:
            await browser.load_session(SESSION_FILE)
            scraper.has_session = True
            logger.info("Loaded LinkedIn session at startup")
        except Exception:
            logger.exception("Failed to load session; starting unauthenticated")
    else:
        logger.warning("No LinkedIn session found; starting unauthenticated. "
                       "Log in via /connect-linkedin.")
    app.state.scraper = scraper
    app.state.store = JobStore()
    app.state.login_manager = LoginSessionManager(
        browser_factory=lambda: BrowserManager(
            headless=False, viewport={"width": 1280, "height": 800}
        ),
        vnc_starter=_start_x11vnc,
        login_waiter=wait_for_manual_login,
        on_saved=_make_on_saved(store, SESSION_FILE, scraper),
        save_path=SESSION_FILE,
    )
    try:
        yield
    finally:
        await browser.close()
```

- [ ] **Step 4: Run the new tests**

Run: `pytest tests/test_main_session_store.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Run the full unit suite (backward-compat check)**

Run: `pytest -m unit -v`
Expected: all tests pass. If `tests/test_api_endpoints.py`'s success test now fails because startup already set `has_session` from a real local `linkedin_session.json`, leave it — setting `has_session = True` again is idempotent. If it fails because the local file is absent and `has_session` is False, the existing line `client.app.state.scraper.has_session = True` still covers it. Only touch that file if a test actually fails; keep changes minimal.

- [ ] **Step 6: Commit**

```bash
git add api/main.py tests/test_main_session_store.py
git commit -m "feat(api): load/persist LinkedIn session via the session store"
```

---

### Task 4: Account-settings entry in the dashboard

**Files:**
- Create: `front-end/components/connect-linkedin-panel.tsx`
- Modify: `front-end/app/connect-linkedin/page.tsx` (re-export the panel to avoid duplicated logic)
- Modify: `front-end/components/dashboard-layout.tsx`

**Interfaces:**
- Consumes: the `/api/auth/session/*` flow (unchanged).
- Produces: a reusable `<ConnectLinkedInPanel />` and a dashboard **Account settings** affordance that renders it.

- [ ] **Step 1: Extract the panel component**

Move the current logic of `front-end/app/connect-linkedin/page.tsx` into a new client component `front-end/components/connect-linkedin-panel.tsx` exporting `ConnectLinkedInPanel` (same code — `"use client"`, the `start`/`pollStatus`/`cancel` handlers, the dynamic `import("@novnc/novnc")`, the direct-WS URL logic, and the JSX). Do not change behavior.

- [ ] **Step 2: Point the page at the panel**

Replace `front-end/app/connect-linkedin/page.tsx` with:

```tsx
import { ConnectLinkedInPanel } from "@/components/connect-linkedin-panel";

export default function ConnectLinkedInPage() {
  return <ConnectLinkedInPanel />;
}
```

- [ ] **Step 3: Add the Account-settings entry to the dashboard**

Read `front-end/components/dashboard-layout.tsx`. Following its existing sidebar/nav patterns and styling, add a bottom-left **Account settings** affordance (e.g. a button/section) that reveals `<ConnectLinkedInPanel />` (in a dialog/panel or a dedicated view — match how the layout already shows secondary content). Import it:

```tsx
import { ConnectLinkedInPanel } from "@/components/connect-linkedin-panel";
```

Keep the change scoped to adding the settings entry + rendering the panel; do not restructure existing task navigation. Reference the decision record in a comment:

```tsx
{/* Account settings / Connect LinkedIn — see front-end/docs/ai/2026-07-22-account-settings-linkedin-entry.md */}
```

- [ ] **Step 4: Build to verify**

Run (from `front-end/`): `npm run build`
Expected: build succeeds; `/connect-linkedin` still compiles and the dashboard builds with the new entry. If the build environment is unavailable here, skip and note it (Vercel builds on deploy).

- [ ] **Step 5: Commit**

```bash
git add front-end/components/connect-linkedin-panel.tsx front-end/app/connect-linkedin/page.tsx front-end/components/dashboard-layout.tsx
git commit -m "feat(frontend): add Account settings entry that opens Connect LinkedIn"
```

---

## Self-Review

**Spec coverage:**
- `SessionStore` file + Supabase + encryption → Task 1. ✓
- Store selection / graceful fallback / partial-config warning → Task 1 (`build_session_store`). ✓
- `linkedin_sessions` table + namespace rename → Task 2. ✓
- Startup load with precedence + first-run migration → Task 3 (`_bootstrap_session_state`). ✓
- Persist-on-login + hot reload → Task 3 (`_make_on_saved`). ✓
- New env vars (`SESSION_ENCRYPTION_KEY`, reuse `SUPABASE_*`) → Task 3. ✓
- Account-settings entry reusing streamed login → Task 4. ✓
- Backward compatibility (no env → file store, existing tests green) → Global Constraints + Task 3 step 5. ✓

**Placeholder scan:** No TBD/TODO; backend steps carry complete code. Task 4's dashboard edit is intentionally discovery-based (it integrates into an unfamiliar shared component) but the reusable panel it renders is fully specified.

**Type consistency:** `build_session_store(*, session_file, supabase_url, service_key, encryption_key)`, `FileSessionStore(path)`, `SupabaseSessionStore(client, fernet, table, row_id)`, `_bootstrap_session_state(store)`, `_make_on_saved(store, session_file, scraper)`, and `ConnectLinkedInPanel` are used identically where defined and consumed. `_make_on_saved`'s returned hook matches `LoginSessionManager`'s `on_saved` (async, no args). ✓
