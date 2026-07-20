"""
Job scraper for LinkedIn.

Extracts job posting information from LinkedIn job pages.
"""
import logging
import re
from typing import Optional
from playwright.async_api import Page

from ..models.job import Job
from ..core.exceptions import ProfileNotFoundError
from ..callbacks import ProgressCallback, SilentCallback
from .base import BaseScraper

logger = logging.getLogger(__name__)


class JobScraper(BaseScraper):
    """
    Scraper for LinkedIn job postings.
    
    Example:
        async with BrowserManager() as browser:
            scraper = JobScraper(browser.page)
            job = await scraper.scrape("https://www.linkedin.com/jobs/view/123456/")
            print(job.to_json())
    """
    
    def __init__(self, page: Page, callback: Optional[ProgressCallback] = None):
        """
        Initialize job scraper.
        
        Args:
            page: Playwright page object
            callback: Optional progress callback
        """
        super().__init__(page, callback or SilentCallback())
    
    async def scrape(self, linkedin_url: str) -> Job:
        """
        Scrape a LinkedIn job posting.
        
        Args:
            linkedin_url: URL of the LinkedIn job posting
            
        Returns:
            Job object with scraped data
            
        Raises:
            ProfileNotFoundError: If job posting not found
        """
        logger.info(f"Starting job scraping: {linkedin_url}")
        await self.callback.on_start("Job", linkedin_url)
        
        # Navigate to job page
        await self.navigate_and_wait(linkedin_url)
        await self.callback.on_progress("Navigated to job page", 10)

        # Check if page exists
        await self.check_rate_limit()

        # The job page renders its content client-side, so `domcontentloaded`
        # returns before the title/description are in the DOM. Wait for a stable
        # content anchor before extracting.
        await self._wait_for_content()
        
        # Extract job details
        job_title = await self._get_job_title()
        await self.callback.on_progress(f"Got job title: {job_title}", 20)
        
        company = await self._get_company()
        await self.callback.on_progress("Got company name", 30)
        
        location = await self._get_location()
        await self.callback.on_progress("Got location", 40)
        
        posted_date = await self._get_posted_date()
        await self.callback.on_progress("Got posted date", 50)
        
        applicant_count = await self._get_applicant_count()
        await self.callback.on_progress("Got applicant count", 60)
        
        job_description = await self._get_description()
        await self.callback.on_progress("Got job description", 80)
        
        company_url = await self._get_company_url()
        await self.callback.on_progress("Got company URL", 90)
        
        # Create job object
        job = Job(
            linkedin_url=linkedin_url,
            job_title=job_title,
            company=company,
            company_linkedin_url=company_url,
            location=location,
            posted_date=posted_date,
            applicant_count=applicant_count,
            job_description=job_description
        )
        
        await self.callback.on_progress("Scraping complete", 100)
        await self.callback.on_complete("Job", job)
        
        logger.info(f"Successfully scraped job: {job_title}")
        return job
    
    async def _wait_for_content(self, timeout: int = 10000) -> None:
        """Wait for the job posting content to render before extracting fields.

        The redesigned job page uses hashed CSS class names and renders
        client-side; the description box is a reliable signal that content
        has mounted.
        """
        try:
            await self.page.wait_for_selector(
                '[data-testid="expandable-text-box"]', timeout=timeout
            )
        except:
            # Fall back to the "About the job" heading, then just give the
            # page a moment to settle.
            try:
                await self.page.get_by_text("About the job", exact=True).first.wait_for(
                    timeout=3000
                )
            except:
                await self.page.wait_for_timeout(3000)

    async def _get_job_title(self) -> Optional[str]:
        """Extract the job title.

        The page no longer uses an <h1>; the reliable source is the document
        <title>, formatted as "<Job Title> | <Company> | LinkedIn".
        """
        try:
            page_title = await self.page.title()
            if page_title:
                # Strip a leading notification count like "(3) ".
                page_title = re.sub(r'^\(\d+\)\s*', '', page_title).strip()
                parts = [p.strip() for p in page_title.split('|')]
                if parts and parts[0] and parts[0].lower() != 'linkedin':
                    return parts[0]
        except:
            pass

        # Fallback: legacy <h1> markup, in case an older layout is served.
        try:
            title_elem = self.page.locator('h1').first
            await title_elem.wait_for(timeout=3000)
            title = await title_elem.inner_text()
            if title.strip():
                return title.strip()
        except:
            pass
        return None
    
    async def _get_company(self) -> Optional[str]:
        """Extract company name from company link."""
        try:
            # Find company links that have text (not just images)
            company_links = await self.page.locator('a[href*="/company/"]').all()
            for link in company_links:
                text = await link.inner_text()
                text = text.strip()
                # Skip empty or very short text (likely image-only links)
                if text and len(text) > 1 and not text.startswith('logo'):
                    return text
        except:
            pass
        return None
    
    async def _get_company_url(self) -> Optional[str]:
        """Extract company LinkedIn URL."""
        try:
            company_link = self.page.locator('a[href*="/company/"]').first
            if await company_link.count() > 0:
                href = await company_link.get_attribute('href')
                if href:
                    if '?' in href:
                        href = href.split('?')[0]
                    if not href.startswith('http'):
                        href = f"https://www.linkedin.com{href}"
                    return href
        except:
            pass
        return None
    
    async def _get_metadata_parts(self) -> list:
        """Return the top-card metadata line split on '·'.

        The redesigned top card renders a single line such as
        "Sydney, NSW · 2 hours ago · 13 people clicked apply", which holds the
        location, posted date and applicant count. Class names are hashed, so
        we locate the line by its content: the first "·"-separated line that
        also carries a time/applicant signal (skipping "similar jobs" cards
        further down the page).
        """
        signals = ('ago', 'hour', 'day', 'week', 'month', 'minute',
                   'applicant', 'people', 'clicked', 'applied')
        try:
            elements = await self.page.locator('xpath=//*[contains(text(),"·")]').all()
            for elem in elements:
                try:
                    text = " ".join((await elem.inner_text()).split())
                except:
                    continue
                if '·' not in text or len(text) >= 200:
                    continue
                lowered = text.lower()
                if any(s in lowered for s in signals):
                    return [p.strip() for p in text.split('·') if p.strip()]
        except:
            pass
        return []

    async def _get_location(self) -> Optional[str]:
        """Extract job location from the top-card metadata line."""
        parts = await self._get_metadata_parts()
        if parts:
            return parts[0]

        # Fallback: legacy top-card container.
        try:
            container = self.page.locator('.job-details-jobs-unified-top-card__primary-description-container').first
            if await container.count() > 0:
                text = await container.inner_text()
                pieces = text.split('·')
                if pieces:
                    return pieces[0].strip().split('\n')[0].strip()
        except:
            pass
        return None

    async def _get_posted_date(self) -> Optional[str]:
        """Extract posted date from the top-card metadata line."""
        parts = await self._get_metadata_parts()
        if len(parts) > 1:
            return parts[1]

        # Fallback: scan for a relative-time phrase.
        try:
            text_elements = await self.page.locator('span, div').all()
            for elem in text_elements:
                text = await elem.inner_text()
                if text and ('ago' in text.lower() or 'day' in text.lower() or 'week' in text.lower() or 'hour' in text.lower()):
                    text = text.strip()
                    if len(text) < 50:
                        return text
        except:
            pass
        return None

    async def _get_applicant_count(self) -> Optional[str]:
        """Extract applicant count from the top-card metadata line."""
        parts = await self._get_metadata_parts()
        if len(parts) > 2:
            return parts[2]

        # Fallback: scan main content for an applicant phrase.
        try:
            main_content = self.page.locator('main').first
            if await main_content.count() > 0:
                text_elements = await main_content.locator('span, div').all()
                for elem in text_elements:
                    text = await elem.inner_text()
                    text = text.strip()
                    if text and len(text) < 50:
                        text_lower = text.lower()
                        if 'applicant' in text_lower or 'people clicked' in text_lower or 'applied' in text_lower:
                            return text
        except:
            pass
        return None
    
    async def _get_description(self) -> Optional[str]:
        """Extract the job description.

        The description renders inside a `data-testid="expandable-text-box"`
        element following the "About the job" heading.
        """
        # Expand any "show more" toggle so the full text is present.
        try:
            btn = self.page.locator('[data-testid="expandable-text-button"]').first
            if await btn.count() > 0:
                await btn.click(timeout=2000)
        except:
            pass

        # Preferred: the expandable box right after the "About the job" heading.
        try:
            desc = self.page.locator(
                'xpath=//*[normalize-space(text())="About the job"]'
                '/following::*[@data-testid="expandable-text-box"][1]'
            ).first
            if await desc.count() > 0:
                text = (await desc.inner_text()).strip()
                if text:
                    return text
        except:
            pass

        # Fallback: the first expandable box on the page.
        try:
            box = self.page.locator('[data-testid="expandable-text-box"]').first
            if await box.count() > 0:
                text = (await box.inner_text()).strip()
                if text:
                    return text
        except:
            pass

        # Legacy fallback: <article> markup.
        try:
            about_heading = self.page.locator('h2:has-text("About the job")').first
            if await about_heading.count() > 0:
                article = about_heading.locator('xpath=ancestor::article[1]')
                if await article.count() > 0:
                    return (await article.inner_text()).strip()

            article = self.page.locator('article').first
            if await article.count() > 0:
                return (await article.inner_text()).strip()
        except:
            pass
        return None
