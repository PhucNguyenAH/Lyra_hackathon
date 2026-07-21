# Deploying the Job-Scraping Backend

The backend is a **long-running FastAPI process that drives a real headless
Chromium** (Playwright) and keeps **in-memory job state**. That rules out
serverless platforms (including Vercel) — you need a host that runs a
persistent container. The frontend still deploys to Vercel; only the backend
goes here.

## Where to deploy

| Platform | Verdict | Notes |
|----------|---------|-------|
| **Render** (Docker Web Service) | **Recommended** | Simplest path: point it at this repo's `Dockerfile`, one persistent instance, first-class "Secret Files" for the session. |
| **Railway** | Good alternative | Docker support, easy env/volumes, nice DX. |
| **Fly.io** | Good, more control | Docker-native, persistent VMs, regions. |
| **Google Cloud Run** | Works with care | Must set **min instances = 1 AND max instances = 1** (in-memory store can't be split), and enable **CPU always allocated** or the background scrape is throttled after the response returns. |
| **Vercel / Netlify / Lambda** | ✗ Won't work | Serverless: ephemeral, stateless, no persistent browser — see the "Why not serverless" note below. |

**Recommendation: Render.** Below is the full Render flow; the same image runs
anywhere that accepts a Dockerfile.

## Hard constraints (apply to every platform)

1. **Single instance only.** The job store is an in-memory dict. Running more
   than one instance (or more than one uvicorn worker) means a `POST` and its
   follow-up `GET` can land on different processes and the job "disappears."
   Set instance count / scaling to exactly **1**. (To scale out later, swap the
   dict for Redis — the store interface stays the same.)
2. **The session file is a runtime secret, never in the image.** `linkedin_session.json`
   holds live LinkedIn cookies. The `Dockerfile` and `.dockerignore` deliberately
   keep it out of the image. Provide it at runtime and point the app at it with
   the `LINKEDIN_SESSION_FILE` env var.
3. **Sessions expire.** When a scrape starts returning `{"status":"error", ...}`
   with a login/redirect message, regenerate the session locally
   (`python create_session.py`) and update the secret.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LINKEDIN_SESSION_FILE` | `linkedin_session.json` | Path to the mounted session file. On Render secret files this is `/etc/secrets/linkedin_session.json`. |
| `MAX_CONCURRENT_SCRAPES` | `2` | Cap on simultaneous scrapes (semaphore). |

## Deploy on Render (Docker)

1. Push this repo to GitHub (already done for branch `phuc`).
2. Render → **New → Web Service** → connect the repo.
3. Settings:
   - **Runtime:** Docker
   - **Dockerfile path:** `./Dockerfile`  •  **Docker build context:** `.` (repo root)
   - **Instance type:** any paid instance (the free tier sleeps and is too small
     for Chromium). **Scaling: 1 instance.**
4. **Add the session as a Secret File:**
   - Environment → **Secret Files** → filename `linkedin_session.json`, paste the
     contents of your local `linkedin_session.json`. Render mounts it at
     `/etc/secrets/linkedin_session.json`.
   - Environment → add var `LINKEDIN_SESSION_FILE = /etc/secrets/linkedin_session.json`.
5. Deploy. Render builds the image and runs the `CMD`. The container binds
   `$PORT` when the platform injects one, else `8000` — no start-command
   override needed.
6. Verify: open `https://<your-service>.onrender.com/docs`, or:
   ```bash
   curl -X POST https://<your-service>.onrender.com/jobs \
     -H "Content-Type: application/json" \
     -d '{"title":"AI Engineer","location":"Sydney"}'
   ```

## Deploy on Railway (Docker)

Railway defaults to its own Python auto-builder (Railpack), which does **not**
install Chromium and won't know how to start the app — that's the "No start
command detected" error. This repo ships a `railway.json` that forces Railway
to build from the `Dockerfile` instead, so no start command is needed.

1. **The `Dockerfile` and `railway.json` must be on the branch Railway deploys.**
   If your first deploy showed "Detected Python / Using pip", Railway built a
   commit that predated them — push, then redeploy.
2. Railway → **New Project → Deploy from GitHub repo** → pick this repo and the
   branch. Ensure the service **Root Directory** is the repo root (not
   `front-end/`), so `Dockerfile`/`railway.json` are visible.
3. `railway.json` already pins `builder: DOCKERFILE` and `numReplicas: 1`
   (single instance — required by the in-memory store).
4. **Session secret:** Variables → add `linkedin_session.json` as a file/volume,
   or add the JSON as a variable and write it out on boot; then set
   `LINKEDIN_SESSION_FILE` to wherever it lands. Railway also injects `$PORT`,
   which the container binds automatically.
5. Deploy and verify at `https://<your-service>.up.railway.app/docs`.

## Build & run the image locally (optional sanity check)

From the repo root:

```bash
# Build (context = repo root)
docker build -t job-scraper-api .

# Run, mounting your local session file read-only
docker run --rm -p 8000:8000 \
  -v "$PWD/linkedin_session.json:/session/linkedin_session.json:ro" \
  -e LINKEDIN_SESSION_FILE=/session/linkedin_session.json \
  job-scraper-api
# → http://127.0.0.1:8000/docs
```

## Wiring the Vercel frontend to this backend

The documented Next.js rewrite pointed at `http://localhost:8000` for local dev.
In production, point it at the deployed backend via an env var instead:

```js
// next.config.js / .ts  (in your Next.js source)
async rewrites() {
  return [
    { source: "/api/:path*",
      destination: `${process.env.BACKEND_URL}/:path*` },
  ];
}
```

Set `BACKEND_URL` in Vercel → Project → Settings → Environment Variables to your
backend's HTTPS URL (e.g. `https://<your-service>.onrender.com`). The browser
then calls same-origin `/api/...` and Vercel proxies to the backend — no CORS
config needed.

## Why not serverless (Vercel functions, Lambda, etc.)

- **Stateful by design:** `POST` stores the job in memory and runs a background
  task; the client polls `GET`. Serverless invocations are ephemeral and
  isolated — the background task dies when the response returns, and a later
  `GET` hits a different invocation that never saw the `job_id`.
- **Heavy browser:** headless Chromium exceeds typical serverless bundle limits
  and has no persistent process to reuse.
- **Long requests:** a scrape takes 10–30s and needs a warm browser + on-disk
  session, which serverless execution/filesystem limits don't accommodate.
