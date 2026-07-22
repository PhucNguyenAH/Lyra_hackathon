"""Unit tests for the Job -> API response mapping."""
import pytest
from linkedin_scraper.models.job import Job
from api.mapping import job_to_response

pytestmark = pytest.mark.unit


def test_maps_all_fields():
    job = Job(
        linkedin_url="https://www.linkedin.com/jobs/view/123",
        job_title="AI Engineer",
        company="Acme",
        location="Sydney",
        posted_date="2 days ago",
        applicant_count="42 applicants",
        job_description="Build things.",
    )
    assert job_to_response(job) == {
        "job_url": "https://www.linkedin.com/jobs/view/123",
        "title": "AI Engineer",
        "company": "Acme",
        "location": "Sydney",
        "posted": "2 days ago",
        "applicants": "42 applicants",
        "description": "Build things.",
    }


def test_maps_missing_optional_fields_to_none():
    job = Job(linkedin_url="https://www.linkedin.com/jobs/view/999")
    result = job_to_response(job)
    assert result["job_url"] == "https://www.linkedin.com/jobs/view/999"
    assert result["title"] is None
    assert result["company"] is None
    assert result["description"] is None
