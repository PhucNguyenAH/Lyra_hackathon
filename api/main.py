"""FastAPI application exposing the LinkedIn job scraper."""
import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, HTTPException

from linkedin_scraper.core.browser import BrowserManager

from .models import JobCreatedResponse, JobRequest, JobStatusResponse
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
    if SESSION_JSON and not os.path.exists(SESSION_FILE):
        parent = os.path.dirname(SESSION_FILE)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(SESSION_FILE, "w") as fh:
            fh.write(SESSION_JSON)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _materialize_session_file()
    browser = BrowserManager(headless=True)
    try:
        await browser.start()
        await browser.load_session(SESSION_FILE)
    except Exception:
        await browser.close()
        raise
    app.state.browser = browser
    app.state.store = JobStore()
    app.state.semaphore = asyncio.Semaphore(MAX_CONCURRENT_SCRAPES)
    try:
        yield
    finally:
        await browser.close()


app = FastAPI(title="Job Scraper API", lifespan=lifespan)


@app.post("/jobs", status_code=202, response_model=JobCreatedResponse)
async def create_job(req: JobRequest, background: BackgroundTasks):
    job_id = app.state.store.create()
    background.add_task(
        run_job,
        job_id,
        req.title,
        req.location,
        store=app.state.store,
        browser=app.state.browser,
        semaphore=app.state.semaphore,
    )
    return {"job_id": job_id, "status": "pending"}


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str):
    job = app.state.store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
