-- =====================================================================
-- Make jobs.url unique so the matcher pipeline can upsert idempotently
-- (push_matches.py syncs matches.json keyed by the LinkedIn job URL).
-- Postgres unique constraints allow multiple NULLs, so hand-entered jobs
-- without a URL remain valid. Requires every writer to store the same
-- canonical URL form (the scraper emits .../jobs/view/<id>/).
-- Run once in the Supabase SQL Editor, after job_pipeline.sql.
-- =====================================================================

alter table jobs add constraint jobs_url_unique unique (url);
