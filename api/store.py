"""In-memory job store. Single-process only; state is lost on restart."""
import uuid
from typing import Optional


class JobStore:
    """Maps job_id -> {status, result, error}."""

    def __init__(self) -> None:
        self._jobs: dict[str, dict] = {}

    def create(self) -> str:
        """Create a pending job and return its id."""
        job_id = str(uuid.uuid4())
        self._jobs[job_id] = {"status": "pending", "results": None, "error": None}
        return job_id

    def set(self, job_id: str, **fields) -> None:
        """Update fields on an existing job."""
        self._jobs[job_id].update(fields)

    def get(self, job_id: str) -> Optional[dict]:
        """Return a copy of the stored job, or None if unknown."""
        job = self._jobs.get(job_id)
        return dict(job) if job is not None else None
