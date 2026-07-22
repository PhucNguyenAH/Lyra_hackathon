"""Canonical FastAPI entry point for the Athena backend."""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI

# Load the repository environment before importing feature routers.  Interview
# research must not depend on another feature (currently email services) being
# imported first just to make TAVILY_API_KEY and GROQ_API_KEY available.
load_dotenv(Path(__file__).resolve().parent / ".env")

from email_services.api import configure_email_services, inbox_watcher_lifespan
from interview.router import configure_interview
from profile.router import configure_profile


app = FastAPI(
    title="Athena Backend",
    lifespan=inbox_watcher_lifespan,
)

configure_email_services(app)
configure_interview(app)
configure_profile(app)
