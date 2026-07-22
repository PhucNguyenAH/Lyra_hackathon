-- Encrypted single-row store for the LinkedIn scraper session (Phase 2).
-- Run once in the Supabase SQL editor. Single-user: exactly one row (id='default').
create table if not exists linkedin_sessions (
    id          text primary key default 'default',
    cipher_text text not null,                 -- Fernet-encrypted storage_state JSON
    updated_at  timestamptz not null default now()
);

-- Keep updated_at fresh on re-login (upsert conflict → UPDATE).
create or replace function linkedin_sessions_set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_linkedin_sessions_updated_at on linkedin_sessions;
create trigger trg_linkedin_sessions_updated_at
    before update on linkedin_sessions
    for each row execute function linkedin_sessions_set_updated_at();
