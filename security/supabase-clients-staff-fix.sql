-- Fix 403 errors on clients and session_notes tables.
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor).
-- Safe to run multiple times (idempotent).

-- ============================================================
-- CLIENTS TABLE
-- ============================================================

create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations (id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  status      text not null default 'active' check (status in ('active', 'inactive', 'discharged')),
  dob         date,
  email       text,
  phone       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists clients_org_id_idx on public.clients (org_id);
create index if not exists clients_status_idx on public.clients (org_id, status);

alter table public.clients enable row level security;

drop policy if exists "clients_select_member"  on public.clients;
drop policy if exists "clients_insert_member"  on public.clients;
drop policy if exists "clients_update_member"  on public.clients;
drop policy if exists "clients_delete_member"  on public.clients;

create policy "clients_select_member"
  on public.clients for select to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = clients.org_id and m.user_id = auth.uid()
    )
  );

create policy "clients_insert_member"
  on public.clients for insert to authenticated
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = clients.org_id and m.user_id = auth.uid()
    )
  );

create policy "clients_update_member"
  on public.clients for update to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = clients.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = clients.org_id and m.user_id = auth.uid()
    )
  );

create policy "clients_delete_member"
  on public.clients for delete to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = clients.org_id and m.user_id = auth.uid()
    )
  );

revoke all on public.clients from anon;
grant select, insert, update, delete on public.clients to authenticated;


-- ============================================================
-- STAFF TABLE
-- ============================================================

create table if not exists public.staff (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations (id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  role        text,
  email       text,
  phone       text,
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Safe column additions — no-op if the column already exists
alter table public.staff add column if not exists org_id     uuid references public.organizations (id) on delete cascade;
alter table public.staff add column if not exists first_name text;
alter table public.staff add column if not exists last_name  text;
alter table public.staff add column if not exists role       text;
alter table public.staff add column if not exists email      text;
alter table public.staff add column if not exists phone      text;
alter table public.staff add column if not exists status     text default 'active';
alter table public.staff add column if not exists created_at timestamptz default now();
alter table public.staff add column if not exists updated_at timestamptz default now();

create index if not exists staff_org_id_idx on public.staff (org_id);

alter table public.staff enable row level security;

drop policy if exists "staff_select_member"  on public.staff;
drop policy if exists "staff_insert_member"  on public.staff;
drop policy if exists "staff_update_member"  on public.staff;
drop policy if exists "staff_delete_member"  on public.staff;

create policy "staff_select_member"
  on public.staff for select to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = staff.org_id and m.user_id = auth.uid()
    )
  );

create policy "staff_insert_member"
  on public.staff for insert to authenticated
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = staff.org_id and m.user_id = auth.uid()
    )
  );

create policy "staff_update_member"
  on public.staff for update to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = staff.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = staff.org_id and m.user_id = auth.uid()
    )
  );

create policy "staff_delete_member"
  on public.staff for delete to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = staff.org_id and m.user_id = auth.uid()
    )
  );

revoke all on public.staff from anon;
grant select, insert, update, delete on public.staff to authenticated;


-- ============================================================
-- SESSION_NOTES TABLE
-- ============================================================

create table if not exists public.session_notes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid references public.organizations (id) on delete cascade,
  session_id      uuid references public.sessions (id) on delete cascade,
  client_id       uuid references public.clients (id) on delete set null,
  staff_id        uuid references public.staff (id) on delete set null,
  status          text not null default 'draft'
                    check (status in ('draft', 'pending_review', 'approved', 'rejected')),
  note_text       text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists session_notes_org_idx    on public.session_notes (org_id);
create index if not exists session_notes_status_idx on public.session_notes (org_id, status);

alter table public.session_notes enable row level security;

drop policy if exists "session_notes_select_member"  on public.session_notes;
drop policy if exists "session_notes_insert_member"  on public.session_notes;
drop policy if exists "session_notes_update_member"  on public.session_notes;
drop policy if exists "session_notes_delete_member"  on public.session_notes;

create policy "session_notes_select_member"
  on public.session_notes for select to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = session_notes.org_id and m.user_id = auth.uid()
    )
  );

create policy "session_notes_insert_member"
  on public.session_notes for insert to authenticated
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = session_notes.org_id and m.user_id = auth.uid()
    )
  );

create policy "session_notes_update_member"
  on public.session_notes for update to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = session_notes.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = session_notes.org_id and m.user_id = auth.uid()
    )
  );

create policy "session_notes_delete_member"
  on public.session_notes for delete to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = session_notes.org_id and m.user_id = auth.uid()
    )
  );

revoke all on public.session_notes from anon;
grant select, insert, update, delete on public.session_notes to authenticated;


-- ============================================================
-- Make sure sessions table uses org_id (not organization_id)
-- ============================================================

alter table public.sessions add column if not exists org_id uuid references public.organizations (id) on delete cascade;
alter table public.sessions add column if not exists client_id uuid references public.clients (id) on delete set null;
alter table public.sessions add column if not exists staff_id  uuid references public.staff  (id) on delete set null;

-- If sessions already had data in organization_id column, copy it to org_id
update public.sessions set org_id = organization_id where org_id is null and organization_id is not null;

create index if not exists sessions_org_id_new_idx on public.sessions (org_id);

-- Add RLS policy for the new org_id column (replaces old organization_id policy)
drop policy if exists "sessions_select_org"    on public.sessions;
drop policy if exists "sessions_insert_org"    on public.sessions;
drop policy if exists "sessions_update_org"    on public.sessions;
drop policy if exists "sessions_delete_org"    on public.sessions;

create policy "sessions_select_org"
  on public.sessions for select to authenticated
  using (
    (org_id is not null and exists (
      select 1 from public.organization_members m
      where m.organization_id = sessions.org_id and m.user_id = auth.uid()
    ))
    or (org_id is null and user_id = auth.uid())
  );

create policy "sessions_insert_org"
  on public.sessions for insert to authenticated
  with check (
    (org_id is not null and exists (
      select 1 from public.organization_members m
      where m.organization_id = sessions.org_id and m.user_id = auth.uid()
    ))
    or org_id is null
  );

create policy "sessions_update_org"
  on public.sessions for update to authenticated
  using (
    (org_id is not null and exists (
      select 1 from public.organization_members m
      where m.organization_id = sessions.org_id and m.user_id = auth.uid()
    ))
    or (org_id is null and user_id = auth.uid())
  );

create policy "sessions_delete_org"
  on public.sessions for delete to authenticated
  using (
    (org_id is not null and exists (
      select 1 from public.organization_members m
      where m.organization_id = sessions.org_id and m.user_id = auth.uid()
    ))
    or (org_id is null and user_id = auth.uid())
  );

-- ============================================================
-- Add extended columns to clients (diagnosis, staff FKs, etc.)
-- ============================================================

alter table public.clients add column if not exists diagnosis          text;
alter table public.clients add column if not exists assigned_rbt_id    uuid references public.staff (id) on delete set null;
alter table public.clients add column if not exists assigned_bcba_id   uuid references public.staff (id) on delete set null;
alter table public.clients add column if not exists insurance_provider text;
alter table public.clients add column if not exists auth_status        text default 'active'
  check (auth_status in ('active', 'expiring', 'pending', 'inactive'));
alter table public.clients add column if not exists email              text;
alter table public.clients add column if not exists phone              text;

create index if not exists clients_assigned_rbt_idx  on public.clients (assigned_rbt_id);
create index if not exists clients_assigned_bcba_idx on public.clients (assigned_bcba_id);

-- Reload PostgREST schema cache
do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
