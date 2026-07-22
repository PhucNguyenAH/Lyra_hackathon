-- =====================================================================
-- Profile layer: master profile, source CV uploads, and tailored variants
-- Requires public.applications from job_pipeline.sql.
-- =====================================================================

create table if not exists public.profiles (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid,
    master     jsonb not null default '{}'::jsonb,
    version    integer not null default 1 check (version >= 1),
    updated_at timestamptz not null default now()
);

-- PostgreSQL permits multiple nulls here; every identified user gets one profile.
create unique index if not exists idx_profiles_user_unique
    on public.profiles(user_id);


create table if not exists public.cv_uploads (
    id         uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    raw_text   text not null,
    label      text,
    extracted  jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_cv_uploads_profile
    on public.cv_uploads(profile_id, created_at desc);


create table if not exists public.cv_variants (
    id              uuid primary key default gen_random_uuid(),
    application_id  uuid not null references public.applications(id) on delete cascade,
    profile_version integer not null check (profile_version >= 1),
    content         jsonb not null,
    rationale       jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists idx_cv_variants_application
    on public.cv_variants(application_id, created_at desc);


create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_profile_updated_at on public.profiles;

create trigger trg_profile_updated_at
    before update on public.profiles
    for each row
    execute function public.touch_profile_updated_at();


-- The backend service-role client bypasses RLS; browser roles receive no policies.
alter table public.profiles enable row level security;
alter table public.cv_uploads enable row level security;
alter table public.cv_variants enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.cv_uploads from anon, authenticated;
revoke all on public.cv_variants from anon, authenticated;


-- Upgrade an earlier cv_variants definition that predates staleness tracking.
alter table public.cv_variants
    add column if not exists profile_version integer not null default 1;

alter table public.cv_variants
    drop constraint if exists cv_variants_profile_version_check;

alter table public.cv_variants
    add constraint cv_variants_profile_version_check
    check (profile_version >= 1);
