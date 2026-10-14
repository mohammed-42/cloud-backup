-- =====================================================================
-- Vaultline: Cloud Backup and Recovery - database + storage setup
-- Run this whole file once in: Supabase Dashboard -> SQL Editor -> New query
-- It is safe to run again (uses IF NOT EXISTS / DROP IF EXISTS).
-- =====================================================================

-- ---------- 1. Tables ------------------------------------------------
create table if not exists public.backups (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  filename        text not null check (char_length(filename) between 1 and 255),
  current_version integer not null default 0 check (current_version >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.backup_versions (
  id             uuid primary key default gen_random_uuid(),
  backup_id      uuid not null references public.backups(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  storage_path   text not null unique,
  file_size      bigint not null check (file_size > 0 and file_size <= 10485760),
  mime_type      text not null,
  status         text not null default 'pending' check (status in ('pending', 'ready')),
  created_at     timestamptz not null default now(),
  unique (backup_id, version_number)
);

create index if not exists idx_backups_owner on public.backups (owner_id, updated_at desc);
create index if not exists idx_versions_backup on public.backup_versions (backup_id, version_number desc);
create index if not exists idx_versions_owner on public.backup_versions (owner_id);

-- ---------- 2. Row Level Security -----------------------------------
-- Users may only READ their own rows. All writes go through the
-- SECURITY DEFINER functions below, which use auth.uid() (never a
-- user id sent by the browser).
alter table public.backups enable row level security;
alter table public.backup_versions enable row level security;

drop policy if exists "backups_select_own" on public.backups;
create policy "backups_select_own" on public.backups
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "versions_select_own" on public.backup_versions;
create policy "versions_select_own" on public.backup_versions
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on table public.backups from anon, authenticated;
revoke all on table public.backup_versions from anon, authenticated;
grant select on table public.backups to authenticated;
grant select on table public.backup_versions to authenticated;

-- ---------- 3. Functions (transactional writes) ----------------------

-- Reserve a new version. Creates the backup row too when p_backup_id is null.
-- The version number is calculated here, inside a row lock, so two uploads
-- can never get the same number.
create or replace function public.start_upload(
  p_backup_id uuid, p_filename text, p_size bigint, p_mime text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_backup_id uuid;
  v_next integer;
  v_version_id uuid := gen_random_uuid();
  v_path text;
  v_name text := btrim(coalesce(p_filename, ''));
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 255 then
    raise exception 'File name must be 1-255 characters';
  end if;
  if position('/' in v_name) > 0 or position(E'\\' in v_name) > 0 then
    raise exception 'File name must not contain slashes';
  end if;
  if p_size is null or p_size <= 0 or p_size > 10485760 then
    raise exception 'File size must be between 1 byte and 10 MB';
  end if;

  if p_backup_id is null then
    insert into backups (owner_id, filename) values (v_uid, v_name)
      returning id into v_backup_id;
  else
    select id into v_backup_id from backups
      where id = p_backup_id and owner_id = v_uid for update;
    if not found then raise exception 'Backup not found'; end if;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from backup_versions where backup_id = v_backup_id;

  v_path := v_uid::text || '/' || v_backup_id::text || '/v' || v_next::text;

  insert into backup_versions
    (id, backup_id, owner_id, version_number, storage_path, file_size, mime_type, status)
  values
    (v_version_id, v_backup_id, v_uid, v_next, v_path, p_size, coalesce(p_mime, ''), 'pending');

  return jsonb_build_object(
    'backup_id', v_backup_id,
    'version_id', v_version_id,
    'version_number', v_next,
    'storage_path', v_path
  );
end $$;

-- Mark a version ready (after its file reached Storage) and make it current.
create or replace function public.finalize_upload(p_version_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ver backup_versions%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_ver from backup_versions
    where id = p_version_id and owner_id = v_uid and status = 'pending' for update;
  if not found then raise exception 'Pending upload not found'; end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'backups' and o.name = v_ver.storage_path
  ) then
    raise exception 'The file was not found in cloud storage';
  end if;

  update backup_versions set status = 'ready' where id = v_ver.id;
  update backups set current_version = v_ver.version_number, updated_at = now()
    where id = v_ver.backup_id;
end $$;

-- Undo a reservation when the upload failed.
create or replace function public.abort_upload(p_version_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_backup_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from backup_versions
    where id = p_version_id and owner_id = v_uid and status = 'pending'
    returning backup_id into v_backup_id;
  if v_backup_id is not null and not exists (
    select 1 from backup_versions where backup_id = v_backup_id
  ) then
    delete from backups where id = v_backup_id and owner_id = v_uid;
  end if;
end $$;

-- Restore = point "current" at an older version. No version is copied or deleted.
create or replace function public.restore_version(p_backup_id uuid, p_version_number integer)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from backup_versions
    where backup_id = p_backup_id and owner_id = v_uid
      and version_number = p_version_number and status = 'ready'
  ) then
    raise exception 'Version not found';
  end if;
  update backups set current_version = p_version_number, updated_at = now()
    where id = p_backup_id and owner_id = v_uid;
end $$;

-- Delete the backup and all its version rows (the app removes the files first).
create or replace function public.delete_backup(p_backup_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from backups where id = p_backup_id and owner_id = v_uid;
  if not found then raise exception 'Backup not found'; end if;
end $$;

-- Only signed-in users may call these functions.
revoke all on function public.start_upload(uuid, text, bigint, text) from public, anon;
revoke all on function public.finalize_upload(uuid) from public, anon;
revoke all on function public.abort_upload(uuid) from public, anon;
revoke all on function public.restore_version(uuid, integer) from public, anon;
revoke all on function public.delete_backup(uuid) from public, anon;
grant execute on function public.start_upload(uuid, text, bigint, text) to authenticated;
grant execute on function public.finalize_upload(uuid) to authenticated;
grant execute on function public.abort_upload(uuid) to authenticated;
grant execute on function public.restore_version(uuid, integer) to authenticated;
grant execute on function public.delete_backup(uuid) to authenticated;

-- ---------- 4. Private Storage bucket --------------------------------
-- Limits are enforced by Supabase itself, not only by the React code.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'backups', 'backups', false, 10485760,
  array[
    'text/plain', 'text/csv', 'text/markdown', 'application/json',
    'application/pdf',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------- 5. Storage policies --------------------------------------
-- Object path is  {user_id}/{backup_id}/v{n}
-- so the first folder must equal the signed-in user's id.
drop policy if exists "backups_read_own" on storage.objects;
create policy "backups_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Uploads are allowed only to a path reserved by start_upload (a pending row).
drop policy if exists "backups_insert_reserved" on storage.objects;
create policy "backups_insert_reserved" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'backups'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.backup_versions v
      where v.storage_path = name and v.owner_id = (select auth.uid()) and v.status = 'pending'
    )
  );

drop policy if exists "backups_delete_own" on storage.objects;
create policy "backups_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- No UPDATE policy on purpose: stored versions can never be overwritten.
