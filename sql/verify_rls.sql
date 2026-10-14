-- Run in Supabase SQL Editor AFTER schema.sql to confirm the security setup.

-- 1) Row Level Security must be ON (rowsecurity = true) for both tables
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('backups', 'backup_versions');

-- 2) Policies that exist
select schemaname, tablename, policyname, cmd
from pg_policies
where (schemaname = 'public' and tablename in ('backups', 'backup_versions'))
   or (schemaname = 'storage' and policyname like 'backups_%')
order by schemaname, tablename, policyname;

-- 3) The bucket must be private (public = false) with limits set
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'backups';

-- 4) Anonymous (not logged-in) users must NOT be able to call the functions
select
  has_function_privilege('anon', 'public.start_upload(uuid,text,bigint,text)', 'execute')          as anon_can_call,
  has_function_privilege('authenticated', 'public.start_upload(uuid,text,bigint,text)', 'execute') as signed_in_can_call;
-- expected: anon_can_call = false, signed_in_can_call = true
