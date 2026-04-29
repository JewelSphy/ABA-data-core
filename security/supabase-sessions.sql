-- Sessions table for calendar / sessions list UI.
-- Run in Supabase SQL Editor on DEV first, AFTER:
--   security/supabase-onboarding.sql (if you use user_onboarding)
--   security/supabase-organizations.sql (organizations + organization_members — required for FK)
--
-- No outer BEGIN/COMMIT: if a later statement fails, earlier DDL (ADD COLUMN) is not rolled back.
-- If anything fails mid-file, run security/supabase-sessions-repair.sql then rerun from the failed line.
-- If PostgREST says "<column> not in schema cache" but Postgres has the column, run security/postgrest-reload-schema.sql
--
-- Idempotent policies: DROP + CREATE by name.

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,

  client_name text,
  service_type text,
  session_date date not null,
  start_time text,
  duration text,
  pos text,
  provider_name text,
  notes text,
  status text default 'Pending',
  procedure_code text,

  date text,
  client text,
  type text,
  provider text,
  location text,
  procedure text,
  time_range text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sessions
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade;

alter table public.sessions
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- Let API omit user_id; trigger fills it. Drop NOT NULL if an older migration created the column as required.
alter table public.sessions alter column user_id drop not null;

-- Server sets creator — clients can omit user_id so PostgREST never rejects unknown/blocked columns while cache catches up.
create or replace function public.sessions_set_creator()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists sessions_set_creator on public.sessions;
create trigger sessions_set_creator
  before insert on public.sessions
  for each row
  execute procedure public.sessions_set_creator();

alter table public.sessions enable row level security;

create index if not exists sessions_org_date_idx on public.sessions (organization_id, session_date desc);
create index if not exists sessions_user_idx on public.sessions (user_id);
create index if not exists sessions_org_id_idx on public.sessions (organization_id);

drop policy if exists "sessions_select_member" on public.sessions;
create policy "sessions_select_member"
  on public.sessions for select to authenticated using (
    (sessions.organization_id is not null and exists (
      select 1 from public.organization_members m
      where m.organization_id = sessions.organization_id and m.user_id = auth.uid()
    ))
    or (sessions.organization_id is null and sessions.user_id = auth.uid())
  );

drop policy if exists "sessions_insert_authenticated" on public.sessions;
create policy "sessions_insert_authenticated"
  on public.sessions for insert to authenticated with check (
    sessions.user_id = auth.uid() and (
      (sessions.organization_id is not null and exists (
        select 1 from public.organization_members m
        where m.organization_id = sessions.organization_id and m.user_id = auth.uid()
      )) or sessions.organization_id is null
    )
  );

drop policy if exists "sessions_update_member" on public.sessions;
create policy "sessions_update_member"
  on public.sessions for update to authenticated using (
    (sessions.organization_id is not null and exists (
      select 1 from public.organization_members m
      where m.organization_id = sessions.organization_id and m.user_id = auth.uid()
    ))
    or (sessions.organization_id is null and sessions.user_id = auth.uid())
  ) with check (
    sessions.user_id = auth.uid() and (
      (sessions.organization_id is not null and exists (
        select 1 from public.organization_members m
        where m.organization_id = sessions.organization_id and m.user_id = auth.uid()
      )) or sessions.organization_id is null
    )
  );

drop policy if exists "sessions_delete_member" on public.sessions;
create policy "sessions_delete_member"
  on public.sessions for delete to authenticated using (
    (sessions.organization_id is not null and exists (
      select 1 from public.organization_members m
      where m.organization_id = sessions.organization_id and m.user_id = auth.uid()
    ))
    or (sessions.organization_id is null and sessions.user_id = auth.uid())
  );

revoke all on public.sessions from anon;
grant select, insert, update, delete on public.sessions to authenticated;

do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
