# Backend image for the COMBINED backend (server:app = scraper API + Athena).
#
# Build context is the REPO ROOT (not front-end/): the image needs the scraper
# packages (`api/`, `linkedin_scraper/`) AND the Athena packages
# (`email_services/`, `interview/`, `profile/`, `server.py`).
#
# The base image is Microsoft's official Playwright-for-Python image: it ships
# Chromium plus all the OS libraries Chromium needs, already matched to the
# Playwright version in the tag (v1.61.0 == playwright==1.61.0 in requirements).
# noble (Ubuntu 24.04) ships Python 3.12 — required: the Athena code uses
# datetime.UTC and other 3.11+ features (jammy's Python 3.10 can't import them).
FROM mcr.microsoft.com/playwright/python:v1.61.0-noble

# Fail fast, unbuffered logs (so container logs stream in real time).
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install Python deps first so this layer is cached across code changes.
# requirements-server.txt pulls in api/requirements.txt plus the Athena feature
# deps (groq, instructor, markitdown, rapidfuzz, python-multipart).
COPY api/requirements.txt ./api/requirements.txt
COPY requirements-server.txt ./requirements-server.txt
RUN pip install --no-cache-dir -r requirements-server.txt

# Chromium is already in the base image; this is a defensive no-op that
# guarantees the browser matching the installed Playwright version is present.
RUN playwright install chromium

# System packages for the interactive login stream (Xvfb display + VNC server).
# DEBIAN_FRONTEND=noninteractive is required: x11vnc/fluxbox pull in tzdata,
# whose post-install otherwise prompts for a timezone and hangs a TTY-less
# (Railway/CI) build. Scoped to this RUN so it doesn't affect the running app.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        xvfb x11vnc fluxbox \
    && rm -rf /var/lib/apt/lists/*

# Copy the backend source (see .dockerignore for what's excluded).
COPY api/ ./api/
COPY linkedin_scraper/ ./linkedin_scraper/
# Athena packages served by the combined server:app.
COPY email_services/ ./email_services/
COPY interview/ ./interview/
COPY profile/ ./profile/
COPY server.py ./server.py

# IMPORTANT: linkedin_session.json is NOT copied into the image — it holds live
# LinkedIn cookies. Provide it at runtime via a secret mount / volume and point
# the app at it with LINKEDIN_SESSION_FILE (see api/DEPLOY.md).

EXPOSE 8000

# Single process only: the job store is in-memory, so it must NOT be split
# across multiple uvicorn workers. Bind 0.0.0.0 so the platform can route to it.
#
# Bind $PORT when the platform injects one (Railway, Cloud Run, Heroku), else
# default to 8000 (local `docker run`). `exec` keeps uvicorn as PID 1 so it
# receives SIGTERM and shuts the browser down cleanly.
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
CMD ["/app/entrypoint.sh"]
