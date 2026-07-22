"""FastAPI application exposing the LinkedIn job scraper."""
import asyncio
import logging
import os
from contextlib import asynccontextmanager

logger = logging.getLogger("api.main")

from fastapi import FastAPI

from linkedin_scraper import wait_for_manual_login
from linkedin_scraper.core.browser import BrowserManager

from .auth.login_session import LoginSessionManager
from .auth.routes import router as auth_router
from .jobs import router as jobs_router
from .scraper_session import ScraperSession
from .session_store import build_session_store
from .store import JobStore

# Path to the logged-in LinkedIn session file. Overridable so deployments can
# point at a platform secret mount (e.g. Render's /etc/secrets/...).
SESSION_FILE = os.environ.get("LINKEDIN_SESSION_FILE", "linkedin_session.json")
# On platforms without file mounts (e.g. Railway), the whole session JSON can be
# supplied in this env var and is written to SESSION_FILE at startup.
SESSION_JSON = os.environ.get("LINKEDIN_SESSION_JSON")
MAX_CONCURRENT_SCRAPES = int(os.environ.get("MAX_CONCURRENT_SCRAPES", "2"))
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SESSION_ENCRYPTION_KEY = os.environ.get("SESSION_ENCRYPTION_KEY")


def _materialize_session_file() -> None:
    """Write the session JSON from the env var to disk if no file exists yet."""
    abspath = os.path.abspath(SESSION_FILE)
    json_len = len(SESSION_JSON) if SESSION_JSON else 0
    logger.info(
        "Session bootstrap: file=%s (cwd=%s) exists=%s | LINKEDIN_SESSION_JSON set=%s len=%d",
        abspath, os.getcwd(), os.path.exists(SESSION_FILE),
        bool(SESSION_JSON), json_len,
    )
    if os.path.exists(SESSION_FILE):
        return
    if not SESSION_JSON:
        logger.error(
            "No LinkedIn session available: file %s is missing AND the "
            "LINKEDIN_SESSION_JSON env var is empty/unset. Set LINKEDIN_SESSION_JSON "
            "to the full contents of linkedin_session.json (or mount the file and set "
            "LINKEDIN_SESSION_FILE).", abspath,
        )
        return
    parent = os.path.dirname(SESSION_FILE)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(SESSION_FILE, "w") as fh:
        fh.write(SESSION_JSON)
    logger.info("Wrote session file %s (%d bytes) from LINKEDIN_SESSION_JSON", abspath, json_len)


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
                content = fh.read()
            await asyncio.to_thread(store.save, content)
        except Exception:
            logger.exception("Failed to persist session to store")
        await scraper.reload_from_file()
    return _on_saved


async def _start_x11vnc():
    """Start x11vnc against the Xvfb display, bound to localhost:5900.

    NOTE: `-nopw` means x11vnc itself performs no VNC-level authentication.
    That's safe only because of `-localhost` (the port is unreachable from
    outside the host) plus the token-gated proxy in vnc_proxy.py, which is
    the only thing that ever connects to it. If this is ever changed to bind
    a non-localhost address, add a VNC password (or equivalent auth) first.
    """
    return await asyncio.create_subprocess_exec(
        "x11vnc", "-display", ":99", "-forever", "-shared",
        "-nopw", "-localhost", "-rfbport", "5900", "-quiet",
    )


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


app = FastAPI(title="Job Scraper API", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(jobs_router)
