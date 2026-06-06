-- Iron City Cargo — one-time Supabase setup
-- Run this entire file in: Supabase Dashboard → SQL Editor → New query → Run

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  agent text check (
    agent is null
    or agent in ('reid', 'leo', 'mason')
  ),
  content text not null,
  attachments jsonb,
  created_at timestamptz not null default now(),
  constraint messages_agent_role_check check (
    (role = 'user' and agent is null)
    or (role = 'assistant' and agent is not null)
  )
);

create table public.memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  agent text not null default 'shared' check (agent in ('shared')),
  fact text not null,
  category text default null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index chats_user_id_idx on public.chats (user_id);
create index chats_updated_at_idx on public.chats (updated_at desc);

create index messages_chat_id_idx on public.messages (chat_id);
create index messages_chat_id_created_at_idx on public.messages (chat_id, created_at);

create index memory_user_id_idx on public.memory (user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chats
  set updated_at = now()
  where id = new.chat_id;
  return new;
end;
$$;

create trigger on_message_created
  after insert on public.messages
  for each row
  execute function public.handle_new_message();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.memory enable row level security;

create policy "Users can view own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "Users can view own chats"
  on public.chats for select to authenticated
  using (user_id = auth.uid());

create policy "Users can create own chats"
  on public.chats for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own chats"
  on public.chats for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users can delete own chats"
  on public.chats for delete to authenticated
  using (user_id = auth.uid());

create policy "Users can view messages in own chats"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.chats
      where chats.id = messages.chat_id and chats.user_id = auth.uid()
    )
  );

create policy "Users can insert messages in own chats"
  on public.messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.chats
      where chats.id = messages.chat_id and chats.user_id = auth.uid()
    )
  );

create policy "Users can update messages in own chats"
  on public.messages for update to authenticated
  using (
    exists (
      select 1 from public.chats
      where chats.id = messages.chat_id and chats.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.chats
      where chats.id = messages.chat_id and chats.user_id = auth.uid()
    )
  );

create policy "Users can delete messages in own chats"
  on public.messages for delete to authenticated
  using (
    exists (
      select 1 from public.chats
      where chats.id = messages.chat_id and chats.user_id = auth.uid()
    )
  );

create policy "Users can view own memory"
  on public.memory for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own memory"
  on public.memory for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own memory"
  on public.memory for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users can delete own memory"
  on public.memory for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Backfill profiles for users who signed in before this script was run
-- ---------------------------------------------------------------------------

insert into public.profiles (id, email, full_name)
select
  id,
  email,
  coalesce(
    raw_user_meta_data ->> 'full_name',
    raw_user_meta_data ->> 'name',
    ''
  )
from auth.users
where id not in (select id from public.profiles);

-- ---------------------------------------------------------------------------
-- Existing project migration (run if messages already exists without attachments)
-- ---------------------------------------------------------------------------
-- alter table public.messages add column if not exists attachments jsonb;
