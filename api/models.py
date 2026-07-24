"""Request/response models for the job-scraping API."""
from typing import Optional
from pydantic import BaseModel, Field


class JobRequest(BaseModel):
    """Body for POST /jobs."""
    title: str
    location: str
    count: int = Field(default=10, ge=1, le=20)


class JobCreatedResponse(BaseModel):
    """Returned by POST /jobs."""
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    """Returned by GET /jobs/{job_id}."""
    status: str
    results: Optional[list[dict]] = None
    error: Optional[str] = None
