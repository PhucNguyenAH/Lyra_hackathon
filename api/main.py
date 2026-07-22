"""FastAPI application exposing the LinkedIn job scraper."""
import asyncio
import logging
import os
from contextlib import asynccontextmanager

logger = logging.getLogger("api.main")

from fastapi import BackgroundTasks, FastAPI, HTTPException

from linkedin_scraper import wait_for_manual_login
from linkedin_scraper.core.browser import BrowserManager

from .auth.login_session import LoginSessionManager
from .auth.routes import router as auth_router
from .models import JobCreatedResponse, JobRequest, JobStatusResponse
from .scraper_session import ScraperSession
from .scraper_worker import run_job
from .store import JobStore

# Path to the logged-in LinkedIn session file. Overridable so deployments can
# point at a platform secret mount (e.g. Render's /etc/secrets/...).
SESSION_FILE = os.environ.get("LINKEDIN_SESSION_FILE", "linkedin_session.json")
# On platforms without file mounts (e.g. Railway), the whole session JSON can be
# supplied in this env var and is written to SESSION_FILE at startup.
SESSION_JSON = os.environ.get("LINKEDIN_SESSION_JSON")
MAX_CONCURRENT_SCRAPES = int(os.environ.get("MAX_CONCURRENT_SCRAPES", "2"))


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


async def _start_x11vnc():
    """Start x11vnc against the Xvfb display, bound to localhost:5900."""
    return await asyncio.create_subprocess_exec(
        "x11vnc", "-display", ":99", "-forever", "-shared",
        "-nopw", "-localhost", "-rfbport", "5900", "-quiet",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _materialize_session_file()
    browser = BrowserManager(headless=True)
    await browser.start()
    scraper = ScraperSession(
        browser=browser,
        max_concurrent=MAX_CONCURRENT_SCRAPES,
        session_file=SESSION_FILE,
    )
    if os.path.exists(SESSION_FILE):
        try:
            await browser.load_session(SESSION_FILE)
            scraper.has_session = True
            logger.info("Loaded LinkedIn session from %s", SESSION_FILE)
        except Exception:
            logger.exception("Failed to load session %s; starting unauthenticated", SESSION_FILE)
    else:
        logger.warning("No session file at %s; starting unauthenticated. "
                       "Log in via /connect-linkedin.", SESSION_FILE)
    app.state.scraper = scraper
    app.state.store = JobStore()
    app.state.login_manager = LoginSessionManager(
        browser_factory=lambda: BrowserManager(
            headless=False, viewport={"width": 1280, "height": 800}
        ),
        vnc_starter=_start_x11vnc,
        login_waiter=wait_for_manual_login,
        on_saved=scraper.reload_from_file,
        save_path=SESSION_FILE,
    )
    try:
        yield
    finally:
        await browser.close()


app = FastAPI(title="Job Scraper API", lifespan=lifespan)
app.include_router(auth_router)


@app.post("/jobs", status_code=202, response_model=JobCreatedResponse)
async def create_job(req: JobRequest, background: BackgroundTasks):
    scraper = app.state.scraper
    if not scraper.has_session:
        raise HTTPException(
            status_code=409,
            detail="no LinkedIn session — open /connect-linkedin to log in",
        )
    job_id = app.state.store.create()
    background.add_task(
        run_job,
        job_id,
        req.title,
        req.location,
        store=app.state.store,
        browser=scraper.browser,
        semaphore=scraper.semaphore,
    )
    return {"job_id": job_id, "status": "pending"}


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str):
    job = app.state.store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
