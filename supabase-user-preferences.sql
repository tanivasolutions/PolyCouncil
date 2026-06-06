-- User UI preferences — cross-device sync (run in Supabase SQL Editor)
-- Requires public.profiles from supabase-setup.sql

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists user_preferences_updated_idx
  on public.user_preferences (updated_at desc);

alter table public.user_preferences enable row level security;

create policy "Users can view own preferences"
  on public.user_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own preferences"
  on public.user_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own preferences"
  on public.user_preferences
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
