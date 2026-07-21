"""Reusable FastAPI integration boundary for the inbox watcher."""

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from dotenv import load_dotenv
from fastapi import FastAPI
from supabase import Client, create_client

from email_services.loop import watcher_loop


WATCHER_TASK_NAME = "inbox-watcher"

load_dotenv()


def _required_environment(name: str) -> str:
    """Reject incomplete server configuration before background work begins."""
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def create_watcher_db_client() -> Client:
    """Keep the privileged Supabase key confined to the backend integration."""
    return create_client(
        _required_environment("SUPABASE_URL"),
        _required_environment("SUPABASE_SERVICE_ROLE_KEY"),
    )


def start_watcher(db: Client | None = None) -> asyncio.Task[None]:
    """Return the task so the owning API can cancel it during shutdown."""
    return asyncio.create_task(
        watcher_loop(db or create_watcher_db_client()),
        name=WATCHER_TASK_NAME,
    )


async def stop_watcher(task: asyncio.Task[None]) -> None:
    """Await cancellation so shutdown never leaves mailbox work half-owned."""
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


@asynccontextmanager
async def inbox_watcher_lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Offer an attachable lifespan without constructing the FastAPI application."""
    watcher_task = start_watcher()
    try:
        yield
    finally:
        await stop_watcher(watcher_task)
