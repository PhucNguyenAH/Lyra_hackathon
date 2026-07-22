# Job Scraper API

FastAPI service wrapping the `linkedin_scraper` package.

## Prerequisites

- `pip install -r requirements.txt`
- A logged-in `linkedin_session.json` at the repo root (generate with `python create_session.py`).

## Run

```bash
uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Binds to localhost only — the API has no authentication and drives a logged-in LinkedIn session, so it must not be exposed on the network.

Single process only — do NOT pass `--workers >1` (the job store is in-memory).

## Endpoints

Start a scrape:

```bash
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{"title": "AI Engineer", "location": "Sydney"}'
# -> 202 {"job_id": "<uuid>", "status": "pending"}
```

Poll for the result:

```bash
curl http://localhost:8000/jobs/<uuid>
# -> {"status": "done", "result": {"job_url": ..., "title": ..., ...}, "error": null}
```

`status` is one of `pending | running | done | error`.

## Frontend integration

To enable same-origin calls from the browser, add a `rewrites()` function to your Next.js config file (`next.config.ts` or `next.config.mjs`):

```js
const nextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:8000/:path*" },
    ];
  },
};
```

Merge this into your existing config object, preserving other keys.

**Note:** The `next.config.*` file was not found in this repository. Add the `rewrites()` function above to your Next.js config where your frontend source lives.
