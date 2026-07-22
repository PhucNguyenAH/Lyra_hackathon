"""Unit tests for ScraperSession hot-reload."""
import asyncio
import pytest
from api.scraper_session import ScraperSession

pytestmark = pytest.mark.unit


class FakeBrowser:
    def __init__(self):
        self.loaded_from = None

    async def load_session(self, path):
        self.loaded_from = path


async def test_reload_sets_has_session_and_loads_path():
    b = FakeBrowser()
    s = ScraperSession(browser=b, max_concurrent=2, session_file="sess.json")
    assert s.has_session is False
    await s.reload_from_file()
    assert b.loaded_from == "sess.json"
    assert s.has_session is True


async def test_reload_explicit_path_overrides_default():
    b = FakeBrowser()
    s = ScraperSession(browser=b, max_concurrent=2, session_file="sess.json")
    await s.reload_from_file("/data/other.json")
    assert b.loaded_from == "/data/other.json"


async def test_reload_releases_all_permits():
    b = FakeBrowser()
    s = ScraperSession(browser=b, max_concurrent=3, session_file="sess.json")
    await s.reload_from_file()
    # all permits available again -> can acquire max_concurrent without blocking
    for _ in range(3):
        await asyncio.wait_for(s.semaphore.acquire(), timeout=0.5)


async def test_reload_waits_for_in_flight_scrape():
    b = FakeBrowser()
    s = ScraperSession(browser=b, max_concurrent=1, session_file="sess.json")
    await s.semaphore.acquire()  # simulate a scrape in flight
    reload_task = asyncio.create_task(s.reload_from_file())
    await asyncio.sleep(0.05)
    assert not reload_task.done()  # blocked until the permit frees
    s.semaphore.release()
    await asyncio.wait_for(reload_task, timeout=0.5)
    assert b.loaded_from == "sess.json"


async def test_mark_disconnected_sets_has_session_false():
    b = FakeBrowser()
    s = ScraperSession(browser=b, max_concurrent=1, session_file="sess.json", has_session=True)
    assert s.has_session is True
    s.mark_disconnected()
    assert s.has_session is False
    s.mark_disconnected()  # idempotent
    assert s.has_session is False
