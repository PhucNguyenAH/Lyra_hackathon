"""LoginSessionManager state machine (all I/O mocked)."""
import asyncio
import pytest
from api.auth.login_session import LoginSessionManager, LoginInProgress

pytestmark = pytest.mark.unit


class FakePage:
    def __init__(self):
        self.goto_url = None

    async def goto(self, url):
        self.goto_url = url


class FakeBrowser:
    def __init__(self):
        self.page = FakePage()
        self.started = False
        self.closed = False
        self.saved_to = None

    async def start(self):
        self.started = True

    async def save_session(self, path):
        self.saved_to = path

    async def close(self):
        self.closed = True


class FakeVnc:
    def __init__(self):
        self.terminated = False

    def terminate(self):
        self.terminated = True


def _manager(login_waiter, on_saved=None, browser=None, vnc=None):
    browser = browser or FakeBrowser()
    vnc = vnc or FakeVnc()
    saved = {"called": False}

    async def default_on_saved():
        saved["called"] = True

    async def start_vnc():
        return vnc

    m = LoginSessionManager(
        browser_factory=lambda: browser,
        vnc_starter=start_vnc,
        login_waiter=login_waiter,
        on_saved=on_saved or default_on_saved,
        save_path="/data/sess.json",
    )
    return m, browser, vnc, saved


async def test_start_launches_browser_and_navigates():
    async def never(page):
        await asyncio.sleep(3600)
    m, browser, vnc, _ = _manager(never)
    res = await m.start()
    assert res["state"] == "awaiting_login"
    assert browser.started is True
    assert browser.page.goto_url and "linkedin.com/login" in browser.page.goto_url
    await m.cancel()


async def test_successful_login_saves_and_reloads():
    async def instant(page):
        return None
    m, browser, vnc, saved = _manager(instant)
    await m.start()
    for _ in range(50):
        if m.state in ("saved", "error"):
            break
        await asyncio.sleep(0.02)
    assert m.state == "saved"
    assert browser.saved_to == "/data/sess.json"
    assert saved["called"] is True
    assert browser.closed is True and vnc.terminated is True


async def test_login_failure_sets_error():
    async def boom(page):
        raise RuntimeError("2fa timeout")
    m, browser, vnc, _ = _manager(boom)
    await m.start()
    for _ in range(50):
        if m.state in ("saved", "error"):
            break
        await asyncio.sleep(0.02)
    assert m.state == "error"
    assert "2fa timeout" in m.status()["error"]
    assert browser.closed is True and vnc.terminated is True


async def test_second_start_while_active_raises():
    async def never(page):
        await asyncio.sleep(3600)
    m, *_ = _manager(never)
    await m.start()
    with pytest.raises(LoginInProgress):
        await m.start()
    await m.cancel()


async def test_cancel_tears_down_and_sets_cancelled():
    async def never(page):
        await asyncio.sleep(3600)
    m, browser, vnc, _ = _manager(never)
    await m.start()
    await m.cancel()
    assert m.state == "cancelled"
    assert browser.closed is True and vnc.terminated is True
