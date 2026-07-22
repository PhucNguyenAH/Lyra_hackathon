-- Allow interview sessions that the candidate intentionally exits.
-- Lifecycle events themselves are stored in interview_sessions.state.events.

alter table public.interview_sessions
    drop constraint if exists interview_sessions_status_check;

alter table public.interview_sessions
    add constraint interview_sessions_status_check
    check (status in ('active', 'evaluating', 'completed', 'failed', 'abandoned'));
