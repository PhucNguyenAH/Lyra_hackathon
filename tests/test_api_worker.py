"""Unit tests for the background scraper worker (scrapers mocked)."""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from linkedin_scraper.models.job import Job
from api.store import JobStore
from api.scraper_worker import run_job

pytestmark = pytest.mark.unit


class FakePage:
    def __init__(self):
        self.closed = False

    async def close(self):
        self.closed = True


class FakeBrowser:
    def __init__(self):
        self.page = FakePage()

    async def new_page(self):
        return self.page


def _semaphore():
    return asyncio.Semaphore(1)


async def test_run_job_success_sets_done_with_mapped_result():
    store = JobStore()
    job_id = store.create()
    browser = FakeBrowser()

    search = MagicMock()
    search.search = AsyncMock(return_value=["https://www.linkedin.com/jobs/view/123"])
    scraper = MagicMock()
    scraper.scrape = AsyncMock(return_value=Job(
        linkedin_url="https://www.linkedin.com/jobs/view/123",
        job_title="AI Engineer", company="Acme", location="Sydney",
        posted_date="2 days ago", applicant_count="42", job_description="Build.",
    ))

    with patch("api.scraper_worker.JobSearchScraper", return_value=search), \
         patch("api.scraper_worker.JobScraper", return_value=scraper):
        await run_job(job_id, "AI Engineer", "Sydney",
                      store=store, browser=browser, semaphore=_semaphore())

    stored = store.get(job_id)
    assert stored["status"] == "done"
    assert stored["result"]["title"] == "AI Engineer"
    assert stored["result"]["job_url"] == "https://www.linkedin.com/jobs/view/123"
    assert browser.page.closed is True
    search.search.assert_awaited_once_with(keywords="AI Engineer", location="Sydney", limit=1)


async def test_run_job_no_results_sets_error():
    store = JobStore()
    job_id = store.create()
    browser = FakeBrowser()

    search = MagicMock()
    search.search = AsyncMock(return_value=[])

    with patch("api.scraper_worker.JobSearchScraper", return_value=search), \
         patch("api.scraper_worker.JobScraper", return_value=MagicMock()):
        await run_job(job_id, "Nope", "Nowhere",
                      store=store, browser=browser, semaphore=_semaphore())

    stored = store.get(job_id)
    assert stored["status"] == "error"
    assert stored["error"] == "no jobs found"
    assert browser.page.closed is True
    search.search.assert_awaited_once_with(keywords="Nope", location="Nowhere", limit=1)


async def test_run_job_search_exception_sets_error():
    store = JobStore()
    job_id = store.create()
    browser = FakeBrowser()

    search = MagicMock()
    search.search = AsyncMock(side_effect=RuntimeError("boom"))

    with patch("api.scraper_worker.JobSearchScraper", return_value=search), \
         patch("api.scraper_worker.JobScraper", return_value=MagicMock()):
        await run_job(job_id, "AI", "Sydney",
                      store=store, browser=browser, semaphore=_semaphore())

    stored = store.get(job_id)
    assert stored["status"] == "error"
    assert "boom" in stored["error"]
    assert browser.page.closed is True


async def test_run_job_scrape_exception_sets_error():
    store = JobStore()
    job_id = store.create()
    browser = FakeBrowser()

    search = MagicMock()
    search.search = AsyncMock(return_value=["https://www.linkedin.com/jobs/view/123"])
    scraper = MagicMock()
    scraper.scrape = AsyncMock(side_effect=RuntimeError("scrape boom"))

    with patch("api.scraper_worker.JobSearchScraper", return_value=search), \
         patch("api.scraper_worker.JobScraper", return_value=scraper):
        await run_job(job_id, "AI", "Sydney",
                      store=store, browser=browser, semaphore=_semaphore())

    stored = store.get(job_id)
    assert stored["status"] == "error"
    assert "scrape boom" in stored["error"]
    assert browser.page.closed is True


async def test_run_job_new_page_failure_sets_error():
    store = JobStore()
    job_id = store.create()
    browser = MagicMock()
    browser.new_page = AsyncMock(side_effect=RuntimeError("no page"))

    with patch("api.scraper_worker.JobSearchScraper", return_value=MagicMock()), \
         patch("api.scraper_worker.JobScraper", return_value=MagicMock()):
        await run_job(job_id, "AI", "Sydney",
                      store=store, browser=browser, semaphore=_semaphore())

    stored = store.get(job_id)
    assert stored["status"] == "error"
    assert "no page" in stored["error"]


async def test_run_job_page_close_failure_does_not_escape():
    store = JobStore()
    job_id = store.create()
    browser = FakeBrowser()
    browser.page.close = AsyncMock(side_effect=RuntimeError("close boom"))

    search = MagicMock()
    search.search = AsyncMock(return_value=["https://www.linkedin.com/jobs/view/123"])
    scraper = MagicMock()
    scraper.scrape = AsyncMock(return_value=Job(
        linkedin_url="https://www.linkedin.com/jobs/view/123",
        job_title="AI Engineer", company="Acme", location="Sydney",
        posted_date="2 days ago", applicant_count="42", job_description="Build.",
    ))

    with patch("api.scraper_worker.JobSearchScraper", return_value=search), \
         patch("api.scraper_worker.JobScraper", return_value=scraper):
        await run_job(job_id, "AI Engineer", "Sydney",
                      store=store, browser=browser, semaphore=_semaphore())

    stored = store.get(job_id)
    assert stored["status"] == "done"
    assert stored["result"]["title"] == "AI Engineer"
    assert stored["result"]["job_url"] == "https://www.linkedin.com/jobs/view/123"
