# Backend image for the job-scraping API (FastAPI + Playwright).
#
# Build context is the REPO ROOT (not front-end/), because the image needs both
# the `api/` package and the `linkedin_scraper/` package.
#
# The base image is Microsoft's official Playwright-for-Python image: it ships
# Chromium plus all the OS libraries Chromium needs, already matched to the
# Playwright version in the tag (v1.61.0 == playwright==1.61.0 in requirements).
FROM mcr.microsoft.com/playwright/python:v1.61.0-jammy

# Fail fast, unbuffered logs (so container logs stream in real time).
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install Python deps first so this layer is cached across code changes.
COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

# Chromium is already in the base image; this is a defensive no-op that
# guarantees the browser matching the installed Playwright version is present.
RUN playwright install chromium

# System packages for the interactive login stream (Xvfb display + VNC server).
RUN apt-get update && apt-get install -y --no-install-recommends \
        xvfb x11vnc fluxbox \
    && rm -rf /var/lib/apt/lists/*

# Copy only the backend source (see .dockerignore for what's excluded).
COPY api/ ./api/
COPY linkedin_scraper/ ./linkedin_scraper/

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
