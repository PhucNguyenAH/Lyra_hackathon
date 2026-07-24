"""Persist and list scraped jobs in the Supabase `jobs` table."""
import logging
from typing import Optional

logger = logging.getLogger("api.jobs_repository")

TABLE = "jobs"


class JobsRepository:
    """Upserts scraped jobs (deduped by url) and lists them."""

    def __init__(self, client, table: str = TABLE) -> None:
        self.client = client
        self.table = table

    def upsert(self, job: dict) -> None:
        company = job.get("company")
        if not company:
            logger.warning("Skipping job with no company: %s", job.get("job_url"))
            return
        row = {
            "role": job.get("title"),
            "company": company,
            "url": job.get("job_url"),
            "location": job.get("location"),
            "description": job.get("description"),
        }
        self.client.table(self.table).upsert(row, on_conflict="url").execute()

    def list_jobs(self, limit: int = 100) -> list:
        resp = (
            self.client.table(self.table)
            .select("id,company,role,url,location,description,job_status,created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data or []


def build_jobs_repository(supabase_url, service_key) -> Optional[JobsRepository]:
    """Build a JobsRepository from Supabase creds, or None if unavailable."""
    if not (supabase_url and service_key):
        return None
    try:
        from supabase import create_client

        return JobsRepository(create_client(supabase_url, service_key))
    except Exception:
        logger.exception("Jobs repository unavailable; job persistence disabled")
        return None
