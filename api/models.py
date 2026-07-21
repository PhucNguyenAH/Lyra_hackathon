"""Request/response models for the job-scraping API."""
from typing import Optional
from pydantic import BaseModel


class JobRequest(BaseModel):
    """Body for POST /jobs."""
    title: str
    location: str


class JobCreatedResponse(BaseModel):
    """Returned by POST /jobs."""
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    """Returned by GET /jobs/{job_id}."""
    status: str
    result: Optional[dict] = None
    error: Optional[str] = None
