-- Fix for Supabase Auth signup error:
-- "Database error saving new user" (500 unexpected_failure)
--
-- Run this in Supabase SQL Editor.
-- It safely recreates profiles + a non-blocking auth trigger.

begin;

-- 1) Ensure target table exists with expected columns
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Replace signup trigger function with a safe, non-blocking version
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, email, full_name)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', '')
    )
    on conflict (id) do update
      set email = excluded.email,
          full_name = excluded.full_name,
          updated_at = now();
  exception
    when others then
      -- Never block auth signup if profile sync fails.
      raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- 3) Recreate expected trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 4) Keep RLS strict but valid for signed-in users
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles
for delete
to authenticated
using (id = auth.uid());

grant select, insert, update, delete on public.profiles to authenticated;
revoke all on public.profiles from anon;

commit;
