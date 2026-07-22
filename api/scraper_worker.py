"""Background worker: search LinkedIn, scrape the top match, store the result."""
import logging

from linkedin_scraper import is_logged_in
from linkedin_scraper.scrapers.job_search import JobSearchScraper
from linkedin_scraper.scrapers.job import JobScraper

from .mapping import job_to_response

logger = logging.getLogger(__name__)


async def run_job(job_id, title, location, *, store, browser, semaphore, on_expired=None) -> None:
    """Run a single scrape job and record its outcome in the store."""
    async with semaphore:
        store.set(job_id, status="running")
        page = None
        try:
            page = await browser.new_page()
            urls = await JobSearchScraper(page).search(
                keywords=title, location=location, limit=1
            )
            if not urls:
                if not await is_logged_in(page):
                    if on_expired is not None:
                        on_expired()
                    store.set(job_id, status="error",
                              error="LinkedIn session expired — reconnect via Account settings")
                else:
                    store.set(job_id, status="error", error="no jobs found")
                return
            job = await JobScraper(page).scrape(urls[0])
            store.set(job_id, status="done", result=job_to_response(job))
        except Exception as exc:  # never let one job crash the server
            logger.exception("Job %s failed", job_id)
            store.set(job_id, status="error", error=str(exc))
        finally:
            if page is not None:
                try:
                    await page.close()
                except Exception:
                    logger.exception("Failed to close page for job %s", job_id)
