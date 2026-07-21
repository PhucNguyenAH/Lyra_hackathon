"""Runnable email-service API kept inside the feature package."""

from fastapi import FastAPI

from email_services.api import configure_email_services, inbox_watcher_lifespan


app = FastAPI(
    title="Athena Email Services",
    lifespan=inbox_watcher_lifespan,
)

configure_email_services(app)
