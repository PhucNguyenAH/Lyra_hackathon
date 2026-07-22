# Running Athena AI locally

The project has **three processes**: two backends + the Next.js frontend.

| Process | Command | Port | Serves |
|---------|---------|------|--------|
| Scraper API | `uvicorn api.main:app --port 8000` | 8000 | LinkedIn login (`/auth/session/*`), `/jobs`, `/connection` |
| Athena backend | `uvicorn server:app --reload --port 8008` | 8008 | email watcher, AI interview, profile |
| Frontend | `cd front-end && npm run dev` | 3000 | Next.js dashboard |

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

## 2. Run (three terminals)

```bash
# Terminal 1 — scraper API
set -a; source .env; set +a
ADMIN_TOKEN=dev-secret uvicorn api.main:app --host 127.0.0.1 --port 8000

# Terminal 2 — Athena backend
set -a; source .env; set +a
uvicorn server:app --reload --port 8008

# Terminal 3 — frontend
cd front-end && npm run dev
```

Then: frontend http://localhost:3000 · scraper docs http://127.0.0.1:8000/docs ·
Athena docs http://127.0.0.1:8008/docs

## 3. Frontend → backend wiring

`front-end/.env.local`:

```
BACKEND_URL=http://127.0.0.1:8000            # /api/* proxy target
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000 # VNC websocket (login stream), connects direct
```

⚠️ The `/api/*` rewrite targets **one** backend. Point `BACKEND_URL` at whichever
you're using: `:8000` for LinkedIn/scraper features, `:8008` for
email/interview/profile. Serving both under one origin (gateway or per-path
rewrites) is an open integration item.

## 4. LinkedIn login stream needs a display

`/connect-linkedin` streams a real browser via VNC, which needs `Xvfb` + `x11vnc`.

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
  DISPLAY=:99 ADMIN_TOKEN=dev-secret uvicorn api.main:app --host 127.0.0.1 --port 8000
  ```

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

Scraper API deploys via the root `Dockerfile` (Xvfb/x11vnc baked in). Set
`ADMIN_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_ENCRYPTION_KEY`
as service variables. See `api/DEPLOY.md` for details.
