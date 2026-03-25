-- Supabase RLS and Storage policies for academic document browsing + authenticated downloads.
-- Run in Supabase SQL Editor.

-- 0) Create document metadata table if missing
create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  abstract text not null,
  author text not null,
  supervisor text not null,
  year int not null check (year >= 1900 and year <= 2100),
  level text not null check (level in ('undergraduate', 'postgrad')),
  department text not null,
  file_path text not null,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists documents_year_idx on public.documents (year);
create index if not exists documents_level_idx on public.documents (level);
create index if not exists documents_department_idx on public.documents (department);
create index if not exists documents_supervisor_idx on public.documents (supervisor);


create table if not exists public.saved_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, document_id)
);

create index if not exists saved_documents_user_idx on public.saved_documents (user_id, created_at desc);
create index if not exists saved_documents_document_idx on public.saved_documents (document_id);

-- 0b) Admin role assignment helpers (uses app_metadata.role; never user_metadata)
-- Bootstrap first admin manually in SQL editor (once):
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'admin@example.com';

create or replace function public.assign_admin_role(target_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role text;
begin
  caller_role := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  if caller_role <> 'admin' then
    raise exception 'Only admins can assign admin role';
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
  where lower(email) = lower(target_email);

  if not found then
    raise exception 'User with email % not found', target_email;
  end if;
end;
$$;

create or replace function public.revoke_admin_role(target_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role text;
begin
  caller_role := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  if caller_role <> 'admin' then
    raise exception 'Only admins can revoke admin role';
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
  where lower(email) = lower(target_email);

  if not found then
    raise exception 'User with email % not found', target_email;
  end if;
end;
$$;

revoke all on function public.assign_admin_role(text) from public;
grant execute on function public.assign_admin_role(text) to authenticated;
revoke all on function public.revoke_admin_role(text) from public;
grant execute on function public.revoke_admin_role(text) to authenticated;

-- 1) Document metadata table policies (publicly browseable)

alter table if exists public.documents enable row level security;

drop policy if exists "documents_public_read" on public.documents;
create policy "documents_public_read"
on public.documents
for select
to anon, authenticated
using (true);

drop policy if exists "documents_insert_admin_only" on public.documents;
create policy "documents_insert_admin_only"
on public.documents
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
);

drop policy if exists "documents_update_admin_only" on public.documents;
create policy "documents_update_admin_only"
on public.documents
for update
to authenticated
using (
  uploaded_by = auth.uid()
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
)
with check (
  uploaded_by = auth.uid()
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
);

drop policy if exists "documents_delete_admin_only" on public.documents;
create policy "documents_delete_admin_only"
on public.documents
for delete
to authenticated
using (
  uploaded_by = auth.uid()
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
);

alter table if exists public.saved_documents enable row level security;

drop policy if exists "saved_documents_owner_read" on public.saved_documents;
create policy "saved_documents_owner_read"
on public.saved_documents
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "saved_documents_owner_insert" on public.saved_documents;
create policy "saved_documents_owner_insert"
on public.saved_documents
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "saved_documents_owner_delete" on public.saved_documents;
create policy "saved_documents_owner_delete"
on public.saved_documents
for delete
to authenticated
using (user_id = auth.uid());

-- 2) Storage bucket for full downloadable documents
insert into storage.buckets (id, name, public)
values ('academic-docs', 'academic-docs', false)
on conflict (id) do nothing;

-- Authenticated users can download files from academic-docs bucket.
drop policy if exists "storage_download_authenticated" on storage.objects;
create policy "storage_download_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'academic-docs');

-- Optional: allow authenticated users to upload/manage only inside their own folder: <user_id>/...
drop policy if exists "storage_upload_admin_only" on storage.objects;
create policy "storage_upload_admin_only"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'academic-docs'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
);

drop policy if exists "storage_update_admin_only" on storage.objects;
create policy "storage_update_admin_only"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'academic-docs'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
)
with check (
  bucket_id = 'academic-docs'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
);

drop policy if exists "storage_delete_admin_only" on storage.objects;
create policy "storage_delete_admin_only"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'academic-docs'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
);
