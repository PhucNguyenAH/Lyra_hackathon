"""Single interactive LinkedIn login session, streamed via a login browser."""
import asyncio
import logging
import uuid

logger = logging.getLogger("api.auth.login_session")

LOGIN_URL = "https://www.linkedin.com/login"


class LoginInProgress(Exception):
    """Raised when a login session is already active."""


class LoginSessionManager:
    """Drives one headful login browser and captures the session on success."""

    def __init__(self, *, browser_factory, vnc_starter, login_waiter,
                 on_saved, save_path: str) -> None:
        self._browser_factory = browser_factory
        self._vnc_starter = vnc_starter
        self._login_waiter = login_waiter
        self._on_saved = on_saved
        self._save_path = save_path

        self.state = "idle"
        self.error = None
        self.session_id = None
        self._active = False
        self._browser = None
        self._vnc = None
        self._task = None
        self._lock = asyncio.Lock()

    def status(self) -> dict:
        return {"state": self.state, "error": self.error, "session_id": self.session_id}

    async def start(self) -> dict:
        async with self._lock:
            if self._active:
                raise LoginInProgress("a login session is already active")
            self._active = True
            self.state = "starting"
            self.error = None
            self.session_id = str(uuid.uuid4())
        try:
            self._browser = self._browser_factory()
            await self._browser.start()
            await self._browser.page.goto(LOGIN_URL)
            self._vnc = await self._vnc_starter()
            self.state = "awaiting_login"
            self._task = asyncio.create_task(self._run())
        except Exception as exc:
            logger.exception("Failed to start login session")
            await self._teardown()
            self.state = "error"
            self.error = str(exc)
            raise
        return {"session_id": self.session_id, "state": self.state}

    async def _run(self) -> None:
        try:
            await self._login_waiter(self._browser.page)
            self.state = "logged_in"
            self.state = "saving"
            await self._browser.save_session(self._save_path)
            await self._on_saved()
            self.state = "saved"
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Login session failed")
            self.state = "error"
            self.error = str(exc)
        finally:
            await self._teardown()

    async def cancel(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        await self._teardown()
        self.state = "cancelled"

    async def _teardown(self) -> None:
        if self._vnc is not None:
            try:
                self._vnc.terminate()
            except Exception:
                logger.exception("Failed to terminate VNC")
            self._vnc = None
        if self._browser is not None:
            try:
                await self._browser.close()
            except Exception:
                logger.exception("Failed to close login browser")
            self._browser = None
        self._active = False
