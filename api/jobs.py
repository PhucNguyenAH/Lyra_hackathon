"""Job-scraping HTTP routes."""
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from .models import JobCreatedResponse, JobRequest, JobStatusResponse
from .scraper_worker import run_job

router = APIRouter()


@router.post("/jobs", status_code=202, response_model=JobCreatedResponse)
async def create_job(req: JobRequest, background: BackgroundTasks, request: Request):
    scraper = request.app.state.scraper
    if not scraper.has_session:
        raise HTTPException(
            status_code=409,
            detail="no LinkedIn session — open /connect-linkedin to log in",
        )
    store = request.app.state.store
    job_id = store.create()
    background.add_task(
        run_job,
        job_id,
        req.title,
        req.location,
        store=store,
        browser=scraper.browser,
        semaphore=scraper.semaphore,
        on_expired=scraper.mark_disconnected,
    )
    return {"job_id": job_id, "status": "pending"}


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str, request: Request):
    job = request.app.state.store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.get("/connection")
async def connection_status(request: Request):
    """Unauthenticated boolean: does the scraper have a usable LinkedIn session?"""
    return {"connected": bool(request.app.state.scraper.has_session)}
