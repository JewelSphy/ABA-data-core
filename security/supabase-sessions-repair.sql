-- Repair: add missing columns on legacy public.sessions without rolling back on later errors.
-- Run this ALONE in SQL Editor if you still get "user_id does not exist" / PostgREST column errors.
-- Each statement commits on its own (no outer BEGIN/COMMIT).

-- 1) Confirm you are on the right table
select tablename
from pg_tables
where schemaname = 'public' and tablename ilike '%session%';

-- 2) Add columns (safe if already present)
alter table public.sessions
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade;

alter table public.sessions
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.sessions alter column user_id drop not null;

-- Optional denormalized display columns — add if you see "column … not in schema cache" for client/date/type/…
alter table public.sessions add column if not exists date text;
alter table public.sessions add column if not exists client text;
alter table public.sessions add column if not exists type text;
alter table public.sessions add column if not exists provider text;
alter table public.sessions add column if not exists location text;
alter table public.sessions add column if not exists procedure text;
alter table public.sessions add column if not exists time_range text;

-- 3) Prove columns exist in Postgres (PostgREST reads this after reload)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'sessions'
order by ordinal_position;

-- 4) Tell PostgREST to reload its schema cache
notify pgrst, 'reload schema';
