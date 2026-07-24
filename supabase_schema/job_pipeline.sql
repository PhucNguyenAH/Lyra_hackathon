-- =====================================================================
-- Job Pipeline + Inbox Watcher — Supabase schema
-- Run once in the Supabase SQL Editor.
-- Pipeline: not_applied -> applied -> interview -> offer -> accepted, with rejected/withdrawn exits
-- =====================================================================

create type application_status as enum (
    'not_applied',
    'applied',
    'interview',
    'offer',
    'rejected',
    'accepted',
    'withdrawn'
);

-- Application status tracked directly on a job row.
create type job_status as enum (
    'not_applied',
    'applied',
    'interview',
    'offer',
    'rejected',
    'accepted',
    'withdrawn'
);

create type email_intent as enum (
    'interview_invite',
    'rejection',
    'offer',
    'ack',
    'unrelated'
);

create type watcher_decision as enum (
    'auto',
    'needs_attention',
    'ignore'
);

create type change_source as enum (
    'manual',
    'watcher'
);


-- Raw job postings added or scraped by the user.
create table jobs (
    id              uuid primary key default gen_random_uuid(),
    company         text not null,
    role            text not null,
    url             text,
    location        text,
    description     text,
    score           numeric(4, 2),
    score_reasoning text,
    job_status      job_status not null default 'not_applied',
    created_at      timestamptz not null default now(),
    constraint jobs_score_range check (score is null or score between 0 and 10)
);


-- One application pipeline record per job.
create table applications (
    id               uuid primary key default gen_random_uuid(),
    job_id           uuid not null references jobs(id) on delete cascade,
    status           application_status not null default 'not_applied',
    applied_at       timestamptz,
    last_activity_at timestamptz not null default now(),
    notes            text,
    cover_letter     text,
    created_at       timestamptz not null default now(),
    constraint applications_job_unique unique (job_id)
);

create index idx_applications_status
    on applications(status);

create index idx_applications_last_activity
    on applications(last_activity_at desc);


-- Every email processed by the watcher, including ignored messages.
create table emails (
    id                     uuid primary key default gen_random_uuid(),
    imap_user              text not null,
    mailbox                text not null default 'INBOX',
    imap_uid               bigint not null,
    message_id             text,
    from_address           text not null,
    subject                text,
    body                   text,
    received_at            timestamptz,
    intent                 email_intent,
    company_guess          text,
    role_guess             text,
    proposed_times         jsonb not null default '[]'::jsonb,
    confidence             numeric(3, 2),
    matched_application_id uuid references applications(id) on delete set null,
    match_score            numeric(3, 2),
    decision               watcher_decision,
    created_at             timestamptz not null default now(),
    constraint emails_imap_uid_unique unique (imap_user, mailbox, imap_uid),
    constraint emails_confidence_range
        check (confidence is null or confidence between 0 and 1),
    constraint emails_match_score_range
        check (match_score is null or match_score between 0 and 1),
    constraint emails_proposed_times_array
        check (jsonb_typeof(proposed_times) = 'array')
);

create index idx_emails_decision
    on emails(decision);

create index idx_emails_matched_application
    on emails(matched_application_id);

create index idx_emails_received_at
    on emails(received_at desc);


-- Human confirmation queue for uncertain or illegal transitions.
create table needs_attention (
    id                       uuid primary key default gen_random_uuid(),
    email_id                 uuid not null references emails(id) on delete cascade,
    candidate_application_id uuid references applications(id) on delete set null,
    question                 text not null,
    resolved                 boolean not null default false,
    resolution               text,
    resolved_at              timestamptz,
    created_at               timestamptz not null default now(),
    constraint needs_attention_email_unique unique (email_id),
    constraint needs_attention_resolution_consistent check (
        (resolved = false and resolved_at is null)
        or
        (resolved = true and resolved_at is not null)
    )
);

create index idx_needs_attention_open
    on needs_attention(created_at desc)
    where resolved = false;


-- Immutable audit trail for application status changes.
create table status_history (
    id              uuid primary key default gen_random_uuid(),
    application_id  uuid not null references applications(id) on delete cascade,
    from_status     application_status not null,
    to_status       application_status not null,
    source          change_source not null,
    source_email_id uuid references emails(id) on delete set null,
    created_at      timestamptz not null default now(),
    constraint status_history_changed check (from_status <> to_status)
);

create index idx_status_history_application
    on status_history(application_id, created_at desc);


-- Generated preparation material after an interview invitation.
create table prep_materials (
    id             uuid primary key default gen_random_uuid(),
    application_id uuid not null references applications(id) on delete cascade,
    source_email_id uuid references emails(id) on delete set null,
    content        jsonb not null,
    created_at     timestamptz not null default now()
);

create index idx_prep_materials_application
    on prep_materials(application_id, created_at desc);

create unique index idx_prep_materials_source_email
    on prep_materials(source_email_id)
    where source_email_id is not null;


-- Any status change refreshes application activity.
create or replace function bump_last_activity_on_status_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.status is distinct from old.status then
        new.last_activity_at := now();
    end if;
    return new;
end;
$$;

create trigger trg_applications_activity
    before update on applications
    for each row
    execute function bump_last_activity_on_status_change();


-- Apply watcher transitions and audit history in one transaction.
create or replace function apply_watcher_transition(
    p_application_id uuid,
    p_email_id uuid,
    p_to_status application_status
)
returns applications
language plpgsql
security definer
set search_path = public
as $$
declare
    v_application applications;
    v_from_status application_status;
begin
    select *
      into v_application
      from applications
     where id = p_application_id
     for update;

    if not found then
        raise exception 'Application % was not found', p_application_id;
    end if;

    v_from_status := v_application.status;

    if not (
        (v_from_status = 'applied' and p_to_status in ('interview', 'rejected'))
        or
        (v_from_status = 'interview' and p_to_status in ('offer', 'rejected'))
    ) then
        raise exception 'Illegal application transition: % -> %', v_from_status, p_to_status;
    end if;

    update applications
       set status = p_to_status
     where id = p_application_id
     returning * into v_application;

    insert into status_history (
        application_id,
        from_status,
        to_status,
        source,
        source_email_id
    ) values (
        p_application_id,
        v_from_status,
        p_to_status,
        'watcher',
        p_email_id
    );

    return v_application;
end;
$$;


-- Acknowledgements update activity without changing application status.
create or replace function bump_application_activity(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update applications
       set last_activity_at = now()
     where id = p_application_id;

    if not found then
        raise exception 'Application % was not found', p_application_id;
    end if;
end;
$$;


-- Matcher-ready application rows with company and role from the job record.
create view application_overview as
select
    a.id,
    a.job_id,
    j.company,
    j.role,
    a.status,
    a.applied_at,
    a.last_activity_at,
    j.score,
    (
        select count(*)
          from needs_attention na
         where na.candidate_application_id = a.id
           and na.resolved = false
    ) as open_flags
from applications a
join jobs j on j.id = a.job_id;


-- Service-role access is used by the FastAPI watcher. Grant RPC execution
-- explicitly; never expose the service-role key in the frontend.
revoke all on function apply_watcher_transition(uuid, uuid, application_status) from public;
revoke all on function bump_application_activity(uuid) from public;
grant execute on function apply_watcher_transition(uuid, uuid, application_status) to service_role;
grant execute on function bump_application_activity(uuid) to service_role;
