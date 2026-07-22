-- AI interviewer persistence. Run after the application's users table exists.

create table if not exists interview_sessions (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid,
    config     jsonb not null,
    state      jsonb not null,
    status     text not null default 'active'
               check (status in ('active', 'evaluating', 'completed', 'failed', 'abandoned')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Upgrade databases created from the first hackathon migration.
alter table interview_sessions add column if not exists user_id uuid;

-- Upgrade the lifecycle constraint for databases created before abandoned
-- sessions were tracked explicitly.
alter table interview_sessions
    drop constraint if exists interview_sessions_status_check;
alter table interview_sessions
    add constraint interview_sessions_status_check
    check (status in ('active', 'evaluating', 'completed', 'failed', 'abandoned'));

create index if not exists idx_interview_sessions_created
    on interview_sessions(created_at desc);

create index if not exists idx_interview_sessions_user
    on interview_sessions(user_id, created_at desc);

drop index if exists idx_interview_sessions_config;

create table if not exists interview_reports (
    session_id uuid primary key references interview_sessions(id) on delete cascade,
    report     jsonb not null,
    created_at timestamptz not null default now()
);

create or replace function touch_interview_session_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_interview_session_updated_at on interview_sessions;
create trigger trg_interview_session_updated_at
    before update on interview_sessions
    for each row execute function touch_interview_session_updated_at();

-- The backend uses the service-role key. Keep browser clients away from raw CV,
-- transcript, model reasoning, and report rows.
alter table interview_sessions enable row level security;
alter table interview_reports enable row level security;
