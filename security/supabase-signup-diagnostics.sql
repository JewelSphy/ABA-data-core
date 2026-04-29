-- Supabase signup diagnostics for:
-- "Database error saving new user" (500 unexpected_failure)
--
-- Run sections one-by-one in Supabase SQL Editor.
-- These are read-only checks until the final optional fix section.

-- =========================================================
-- 1) List all triggers on auth.users
-- =========================================================
select
  t.tgname as trigger_name,
  n.nspname as trigger_schema,
  c.relname as table_name,
  p.proname as function_name,
  pn.nspname as function_schema,
  pg_get_triggerdef(t.oid) as trigger_def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where not t.tgisinternal
  and n.nspname = 'auth'
  and c.relname = 'users'
order by t.tgname;

-- =========================================================
-- 2) Show definitions of functions used by auth.users triggers
-- =========================================================
with trigger_functions as (
  select distinct
    p.oid as proc_oid,
    pn.nspname as function_schema,
    p.proname as function_name
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
  where not t.tgisinternal
    and n.nspname = 'auth'
    and c.relname = 'users'
)
select
  function_schema,
  function_name,
  pg_get_functiondef(proc_oid) as function_def
from trigger_functions
order by function_schema, function_name;

-- =========================================================
-- 3) Confirm profiles table structure
-- =========================================================
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
order by ordinal_position;

-- =========================================================
-- 4) Check NOT NULL constraints in profiles that could fail inserts
-- =========================================================
select
  a.attname as column_name
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'profiles'
  and a.attnum > 0
  and not a.attisdropped
  and a.attnotnull
order by a.attname;

-- =========================================================
-- 5) Check unique constraints/indexes on profiles
-- =========================================================
select
  i.relname as index_name,
  ix.indisunique as is_unique,
  pg_get_indexdef(i.oid) as index_def
from pg_class t
join pg_namespace n on n.oid = t.relnamespace
join pg_index ix on t.oid = ix.indrelid
join pg_class i on i.oid = ix.indexrelid
where n.nspname = 'public'
  and t.relname = 'profiles'
order by i.relname;

-- =========================================================
-- 6) Check RLS status and policies on profiles
-- =========================================================
select
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'profiles';

select
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;

-- =========================================================
-- 7) Optional: replace signup trigger function with safe version
--    (only run if trigger function is missing/broken)
-- =========================================================
-- create or replace function public.handle_new_user()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   begin
--     insert into public.profiles (id, email, full_name)
--     values (
--       new.id,
--       new.email,
--       coalesce(new.raw_user_meta_data->>'full_name', '')
--     )
--     on conflict (id) do nothing;
--   exception
--     when others then
--       raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
--   end;
--   return new;
-- end;
-- $$;
--
-- drop trigger if exists on_auth_user_created on auth.users;
-- create trigger on_auth_user_created
-- after insert on auth.users
-- for each row execute procedure public.handle_new_user();
