-- Migrate per-agent memory to shared knowledge base.
-- Run once in Supabase SQL Editor.

alter table public.memory
  alter column agent set default 'shared';

update public.memory set agent = 'shared';

alter table public.memory
  drop constraint if exists memory_agent_check;

alter table public.memory
  add constraint memory_agent_check
  check (length(agent) > 0);

alter table public.memory
  add column if not exists category text default null;

create index if not exists memory_user_id_idx on public.memory (user_id);
