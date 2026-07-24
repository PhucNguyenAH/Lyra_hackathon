# Running Athena AI locally

The project has **two processes**: one combined backend + the Next.js frontend.

| Process | Command | Port | Serves |
|---------|---------|------|--------|
| Backend | `uvicorn server:app --port 8000` | 8000 | LinkedIn login (`/auth/session/*`), `/jobs`, `/connection`, email watcher, AI interview, profile |
| Frontend | `cd front-end && npm run dev` | 3000 | Next.js dashboard |

`server:app` is the single combined FastAPI app — the scraper and the Athena
feature set share one process, one port, one lifespan. (`api.main:app` still runs
standalone as a scraper-only fallback, but you don't need it.)

## 1. One-time setup

```bash
# conda env (per README). If `conda` isn't found:
#   source /opt/anaconda3/etc/profile.d/conda.sh
conda activate hack

pip install -r requirements.txt      # covers both backends
playwright install chromium          # browser for the scraper

cp .env.example .env                  # then fill it in (see below)
```

Minimum `.env` values:
- **Scraper / LinkedIn:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SESSION_ENCRYPTION_KEY`
  (generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`).
  Also choose an `ADMIN_TOKEN` when you start the scraper API.
- **Athena backend (only if using email/interview/profile):** `GROQ_API_KEY`,
  `GEMINI_API_KEY`, and the `IMAP_*` vars for the Gmail watcher.

Load `.env` into a shell before starting a backend: `set -a; source .env; set +a`

Supabase: run the SQL files in `supabase_schema/` once in the Supabase SQL editor
(includes `linkedin_sessions.sql` for the encrypted session store).

## 2. Run (two terminals)

```bash
# Terminal 1 — combined backend (needs a display for the login browser; see §4)
set -a; source .env; set +a
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
DISPLAY=:99 ADMIN_TOKEN=dev-secret uvicorn server:app --host 127.0.0.1 --port 8000

# Terminal 2 — frontend
cd front-end && npm run dev
```

Then: frontend http://localhost:3000 · backend docs http://127.0.0.1:8000/docs

## 3. Frontend → backend wiring

`front-end/.env.local`:

```
BACKEND_URL=http://127.0.0.1:8000             # /api/* proxy target
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000 # VNC websocket (login stream), connects direct
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000     # profile/interview client, connects direct
NEXT_PUBLIC_DEMO_USER_ID=<demo-profile-uuid>  # profile the dashboard loads
```

All three URLs point at the **same** combined backend now — there's only one
port to wire.

## 4. LinkedIn login stream needs a display

`/connect-linkedin` opens a native Chromium window on macOS, Windows, and Linux
desktops. In Docker or headless Linux it streams the browser via VNC, which needs
`Xvfb` + `x11vnc`.

- **Easiest — Docker** (bundles them):
  ```bash
  docker build -t job-scraper-api .
  docker run --rm -p 8000:8000 \
    -e ADMIN_TOKEN=dev-secret \
    -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... -e SESSION_ENCRYPTION_KEY=... \
    job-scraper-api
  ```
- **Bare metal:** `sudo apt install -y x11vnc`, then run the scraper API with a
  virtual display:
  ```bash
  Xvfb :99 -screen 0 1280x800x24 &
  set -a; source .env; set +a
  DISPLAY=:99 ADMIN_TOKEN=dev-secret uvicorn server:app --host 127.0.0.1 --port 8000
  ```

On macOS or Windows, start the backend normally and click **Start login**; a
separate local Chromium window opens. On Linux without a desktop display, use
the Docker option above or start Xvfb and export `DISPLAY`.

Once you've logged in once, the session is stored **encrypted in Supabase** and
reloads automatically on every restart — no re-login needed (even with no local
file). The dashboard's "LinkedIn connected" badge reflects this.

## 5. Quick smoke test (scraper)

```bash
# start a scrape (needs a session — log in first, or it returns 409)
curl -X POST http://127.0.0.1:8000/jobs -H "Content-Type: application/json" \
  -d '{"title":"AI Engineer","location":"Sydney"}'
# poll: curl http://127.0.0.1:8000/jobs/<job_id>
curl http://127.0.0.1:8000/connection   # {"connected": true|false}
```

## Deploy (Railway)

The combined backend deploys via the root `Dockerfile` (Xvfb/x11vnc baked in; it
runs `server:app` via `entrypoint.sh`). Set `ADMIN_TOKEN`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SESSION_ENCRYPTION_KEY`, and the `GROQ_API_KEY` /
`GEMINI_API_KEY` / `IMAP_*` vars for the Athena features as service variables.
See `api/DEPLOY.md` for details.
