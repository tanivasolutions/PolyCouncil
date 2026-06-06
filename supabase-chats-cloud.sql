-- Cloud chat history — per-user, per-module scope (run in Supabase SQL Editor)
-- Requires public.chats and public.messages from supabase-setup.sql

-- ---------------------------------------------------------------------------
-- Chats: module scope + metadata
-- ---------------------------------------------------------------------------

alter table public.chats
  add column if not exists scope_id text;

alter table public.chats
  add column if not exists module_id text;

alter table public.chats
  add column if not exists module_type text;

alter table public.chats
  add column if not exists module_name text;

alter table public.chats
  add column if not exists business_id text;

update public.chats
set scope_id = coalesce(module_id, 'iron-city-cargo')
where scope_id is null;

alter table public.chats
  alter column scope_id set not null;

create index if not exists chats_user_scope_idx
  on public.chats (user_id, scope_id);

create index if not exists chats_user_scope_updated_idx
  on public.chats (user_id, scope_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Messages: all agent keys + optional flags/attachments
-- ---------------------------------------------------------------------------

alter table public.messages
  add column if not exists flagged_by jsonb;

alter table public.messages
  drop constraint if exists messages_agent_check;

alter table public.messages
  drop constraint if exists messages_agent_role_check;

alter table public.messages
  add constraint messages_agent_role_check check (
    (role = 'user' and agent is null)
    or (role = 'assistant')
  );
