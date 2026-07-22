"""Holds the scraper browser and supports hot-reloading its session."""
import asyncio
from typing import Optional


class ScraperSession:
    """The headless scraper browser plus its concurrency gate and auth state."""

    def __init__(self, browser, max_concurrent: int, session_file: str,
                 has_session: bool = False) -> None:
        self.browser = browser
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.session_file = session_file
        self.has_session = has_session
        self._reload_lock = asyncio.Lock()

    async def reload_from_file(self, path: Optional[str] = None) -> None:
        """Drain in-flight scrapes, reload the session, then resume."""
        target = path or self.session_file
        async with self._reload_lock:
            acquired = 0
            try:
                for _ in range(self.max_concurrent):
                    await self.semaphore.acquire()
                    acquired += 1
                await self.browser.load_session(target)
                self.has_session = True
            finally:
                for _ in range(acquired):
                    self.semaphore.release()

    def mark_disconnected(self) -> None:
        """Mark the session unusable (e.g. after an expired-session scrape)."""
        self.has_session = False
