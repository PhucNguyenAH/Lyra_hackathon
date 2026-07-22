# Athena AI

**An end-to-end AI job-application assistant.** Athena AI takes you from *finding* a
role to *landing* it — discovering and scoring jobs, tailoring your CV, tracking
every application, and practising interviews — with the tedious parts automated
and the risky parts kept safe.

---

## What it does

Athena AI follows the whole job hunt as one connected flow:

1. **Discover** — scrape LinkedIn postings by title and location.
2. **Match** — embed your resume and the jobs, rank them by relevance, and
   filter/re-rank against your stated preferences (salary, work mode, must-have
   skills, deal-breakers).
3. **Tailor** — adapt your CV to a specific posting and keep versioned variants.
4. **Apply & track** — maintain an application pipeline (scored → applied →
   interview → offer / rejected) that updates itself.
5. **Watch the inbox** — a Gmail watcher reads job-related emails, classifies
   them (interview invite, rejection, offer…), and advances the matching
   application automatically — only when it's confident.
6. **Prepare** — practise interviews by job title with structured scoring and
   post-session reports.

The whole thing is driven from a single dashboard.

---

## Features

### Job discovery & LinkedIn access
- Scrapes LinkedIn job postings (title, company, location, posting date,
  applicant count, full description).
- **Log into LinkedIn from the web.** Instead of copying cookies, a real
  browser runs server-side and is **streamed to your dashboard** (over VNC), so
  you log in normally — including 2FA / CAPTCHA — from `/connect-linkedin`.
- **Sessions are encrypted at rest** (Fernet) in Supabase, so a login survives
  restarts and redeploys with no local file or volume.
- A **connection badge** shows whether LinkedIn is connected; an expired session
  is detected during scraping and prompts a one-click reconnect.

### Resume ↔ job matching
- Embeds jobs and your resume with a Qwen3 embedding model and ranks them by
  cosine similarity.
- Turns a free-text description of what you want ("senior AI roles in Sydney,
  remote, ≥160k, no crypto") into **structured expectations** used to exclude
  deal-breakers and boost matches on skills, location, and work mode.

### CV tailoring & profile
- User profiles, CV uploads, and tailored CV variants targeted at specific
  postings.

### Application pipeline + email watcher
- A **deterministic pipeline** (not a free-roaming agent): every model output is
  schema-validated and every status change follows a fixed transition table.
- Watches a burner Gmail inbox, classifies each message with an LLM, fuzzy-matches
  the company to an active application, and applies a status change **only when
  classification and matching are both strong** — uncertain cases are routed to
  human review rather than acted on.

### AI interview practice
- Generates interview questions by job title, scores answers on STAR structure
  and relevance, and produces a session report.

---

## Architecture

```
                         ┌────────────────────────────┐
                         │   Next.js dashboard (web)   │
                         └──────────────┬─────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 │                                              │
      ┌──────────▼───────────┐                    ┌────────────▼────────────┐
      │  Scraper API          │                    │  Athena backend          │
      │  (FastAPI)            │                    │  (FastAPI)               │
      │  • LinkedIn login     │                    │  • email watcher          │
      │    (streamed browser) │                    │  • AI interview           │
      │  • job scraping       │                    │  • profile / CV           │
      │  • connection status  │                    │                          │
      └──────────┬───────────┘                    └────────────┬────────────┘
                 │                                              │
                 └──────────────────┬───────────────────────────┘
                                    │
                         ┌──────────▼──────────┐        ┌─────────────────┐
                         │      Supabase        │        │  LLM providers   │
                         │  (Postgres datastore)│        │  Groq / Gemini / │
                         └──────────────────────┘        │  OpenAI / vLLM   │
                                                          └─────────────────┘
```

- **Frontend** — a Next.js dashboard: jobs feed, application pipeline, CV editor,
  interview practice, and LinkedIn connection.
- **Two backends** — a scraping/LinkedIn service (Playwright + streamed login),
  and the "Athena" server for email, interview, and profile features.
- **Supabase** is the shared datastore. Core tables: `jobs`, `applications`,
  `status_history`, `emails`, `needs_attention`, `prep_materials`,
  `interview_sessions` / `interview_reports`, `profiles`, `cv_uploads` /
  `cv_variants`, and `linkedin_sessions` (the encrypted LinkedIn session).
- **LLMs** power classification, expectation extraction, and interview
  generation — Groq for email intent, Gemini/OpenAI or a local vLLM model
  elsewhere.

### Design principles
- **Deterministic where it matters.** The email → application-status automation
  is a validated pipeline with a fixed transition table; ambiguous cases become
  human-review items, never silent changes.
- **Secrets stay server-side.** LinkedIn session cookies live encrypted in
  Supabase and are never exposed to the browser; the dashboard only ever sees a
  connection boolean.

---

## Repository layout

| Path | What lives there |
|------|------------------|
| `api/` | Scraper API + LinkedIn login flow (FastAPI) |
| `linkedin_scraper/` | LinkedIn scraping library (Playwright) |
| `email_services/` | Gmail watcher + application-status pipeline |
| `interview/` | AI interview practice (questions, scoring, reports) |
| `profile/` | Profiles and CV tailoring |
| `misc/` | Standalone scripts (job scraping, embedding extractor) |
| `matcher.py`, `expectations.py` | Resume↔job matching and preference extraction |
| `server.py` | Athena backend entry point |
| `front-end/` | Next.js dashboard |
| `supabase_schema/` | Database schema (run in the Supabase SQL editor) |

---

## Running it

Setup and run instructions live in **[`RUNNING.md`](RUNNING.md)**; deployment
details for the scraper service are in **[`api/DEPLOY.md`](api/DEPLOY.md)**.
