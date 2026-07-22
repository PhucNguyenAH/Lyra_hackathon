"""Pure mapping from the scraper Job model to the API response shape."""
from linkedin_scraper.models.job import Job


def job_to_response(job: Job) -> dict:
    """Convert a scraped Job into the API response dict."""
    return {
        "job_url": job.linkedin_url,
        "title": job.job_title,
        "company": job.company,
        "location": job.location,
        "posted": job.posted_date,
        "applicants": job.applicant_count,
        "description": job.job_description,
    }
