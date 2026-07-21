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
MAX_CONCURRENT_SCRAPES = int(os.environ.get("MAX_CONCURRENT_SCRAPES", "2"))


@asynccontextmanager
async def lifespan(app: FastAPI):
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
