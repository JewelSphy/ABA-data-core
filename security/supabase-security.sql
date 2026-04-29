-- Tight security baseline for Supabase Auth + app tables
-- Run in Supabase SQL editor.

-- 1) Profiles table (owned by auth user)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- 2) Sessions table (owned by auth user)
create table if not exists public.sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_name text not null,
  service_type text not null,
  session_date date not null,
  start_time time,
  duration text,
  pos text,
  provider_name text,
  notes text,
  status text not null default 'Pending',
  procedure_code text,
  time_range text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own"
on public.sessions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own"
on public.sessions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own"
on public.sessions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "sessions_delete_own" on public.sessions;
create policy "sessions_delete_own"
on public.sessions
for delete
to authenticated
using (user_id = auth.uid());

-- 3) Auto-create profile on signup (server-side, safer than trusting client)
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
    on conflict (id) do nothing;
  exception
    when others then
      -- Never block auth signup due to profile insert issues.
      raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 4) Optional hardening: keep anon role from writing unless policy allows.
revoke all on public.profiles from anon;
revoke all on public.sessions from anon;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;

