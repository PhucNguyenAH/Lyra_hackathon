"""Canonical FastAPI entry point for the Athena backend.

This is the single, combined backend: it serves BOTH the LinkedIn job-scraper
API (jobs, connection status, interactive login/VNC) and the Athena feature set
(email watcher, AI interview, profile). Run one process:

    uvicorn server:app --port 8000

The scraper still needs an X display for the interactive-login browser
(`DISPLAY=:99` with Xvfb running) — see RUNNING.md.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI

# Load the repository environment before importing feature routers.  Interview
# research must not depend on another feature (currently email services) being
# imported first just to make TAVILY_API_KEY and GROQ_API_KEY available.
load_dotenv(Path(__file__).resolve().parent / ".env")

# Scraper app: reuse its lifespan (browser + LinkedIn session bootstrap) and
# routers instead of running it as a second process on a second port.
from api.main import lifespan as scraper_lifespan
from api.auth.routes import router as auth_router
from api.jobs import router as jobs_router

from email_services.api import configure_email_services, inbox_watcher_lifespan
from interview.router import configure_interview
from profile.router import configure_profile


@asynccontextmanager
async def combined_lifespan(app: FastAPI):
    """Run both subsystems' startup/shutdown in one FastAPI lifespan.

    The scraper lifespan starts the headless browser and loads the LinkedIn
    session (populating app.state.scraper/store/jobs_repo/login_manager); the
    inbox-watcher lifespan starts the background email poll. Nesting enters both
    on startup and exits them in reverse on shutdown.
    """
    async with scraper_lifespan(app):
        async with inbox_watcher_lifespan(app):
            yield


app = FastAPI(
    title="Athena Backend",
    lifespan=combined_lifespan,
)

# Scraper routes: /jobs, /jobs/{id}, /connection, and the interactive-login
# (/auth/session/*, VNC) routes.
app.include_router(auth_router)
app.include_router(jobs_router)

# Athena routes. configure_email_services also installs the (dev-permissive)
# CORS middleware used by every browser-facing route on this app.
configure_email_services(app)
configure_interview(app)
configure_profile(app)
