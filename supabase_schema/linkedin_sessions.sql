-- Encrypted single-row store for the LinkedIn scraper session (Phase 2).
-- Run once in the Supabase SQL editor. Single-user: exactly one row (id='default').
create table if not exists linkedin_sessions (
    id          text primary key default 'default',
    cipher_text text not null,                 -- Fernet-encrypted storage_state JSON
    updated_at  timestamptz not null default now()
);
