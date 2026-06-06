-- Agent documents — cloud storage (run in Supabase SQL Editor)
-- Requires existing public.profiles from supabase-setup.sql

-- ---------------------------------------------------------------------------
-- Metadata table
-- ---------------------------------------------------------------------------

create table if not exists public.agent_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  doc_id text not null,
  scope_id text not null,
  name text not null,
  description text default '',
  tags jsonb not null default '[]'::jsonb,
  storage_kind text not null,
  mime_type text default '',
  size bigint,
  row_count integer,
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_documents_user_doc_unique unique (user_id, doc_id)
);

create index if not exists agent_documents_user_scope_idx
  on public.agent_documents (user_id, scope_id);

create index if not exists agent_documents_updated_at_idx
  on public.agent_documents (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.agent_documents enable row level security;

create policy "Users can view own agent documents"
  on public.agent_documents
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own agent documents"
  on public.agent_documents
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own agent documents"
  on public.agent_documents
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own agent documents"
  on public.agent_documents
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage bucket (private — one folder per user)
-- ---------------------------------------------------------------------------

-- 25 MB per file (25 * 1024 * 1024 = 26214400 bytes)
insert into storage.buckets (id, name, public, file_size_limit)
values ('agent-documents', 'agent-documents', false, 26214400)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit;

-- If the bucket already exists, this also applies the limit:
update storage.buckets
set file_size_limit = 26214400
where id = 'agent-documents';

create policy "Users can read own agent document files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'agent-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload own agent document files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'agent-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own agent document files"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'agent-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'agent-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own agent document files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'agent-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
