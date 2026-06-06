-- Cloud memory — per-user, per-module scope (run in Supabase SQL Editor)
-- Requires public.memory from supabase-setup.sql

alter table public.memory
  add column if not exists scope_id text;

update public.memory
set scope_id = 'council'
where scope_id is null;

alter table public.memory
  alter column scope_id set not null;

create index if not exists memory_user_scope_idx
  on public.memory (user_id, scope_id);

create index if not exists memory_scope_created_idx
  on public.memory (user_id, scope_id, created_at);
