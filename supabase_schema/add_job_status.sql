-- Migration: add a job_status enum column to an existing jobs table.
-- Idempotent — safe to run in the Supabase SQL editor on a DB created before
-- job_status was added to job_pipeline.sql.

do $$
begin
    create type job_status as enum (
        'not_applied',
        'applied',
        'interview',
        'offer',
        'rejected',
        'accepted',
        'withdrawn'
    );
exception
    when duplicate_object then null;
end $$;

alter table jobs
    add column if not exists job_status job_status not null default 'not_applied';
