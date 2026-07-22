"""Canonical FastAPI entry point for the Athena backend."""

from fastapi import FastAPI

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
