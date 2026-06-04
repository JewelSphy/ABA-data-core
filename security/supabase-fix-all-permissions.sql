-- One-time fix: run this in Supabase SQL Editor to unblock clients, documents, and authorizations.
-- Safe to run multiple times.

-- 1. Fix client-staff_assignments permission error (legacy table)
alter table if exists public."client-staff_assignments" enable row level security;
drop policy if exists "csa_select_authenticated" on public."client-staff_assignments";
create policy "csa_select_authenticated"
  on public."client-staff_assignments" for select to authenticated using (true);
revoke all on public."client-staff_assignments" from anon;
grant select on public."client-staff_assignments" to authenticated;

-- 2. Documents table (if not already created)
create table if not exists public.documents (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  client_id           uuid references public.clients (id) on delete set null,
  requirement_key     text,
  provider_id         uuid,
  doc_name            text not null,
  doc_type            text,
  linked_name         text,
  upload_date         date,
  expiry_date         date,
  status              text not null default 'active',
  content_text        text,
  attachment_mime     text,
  attachment_filename text,
  attachment_base64   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists documents_org_idx    on public.documents (org_id);
create index if not exists documents_client_idx on public.documents (org_id, client_id);
alter table public.documents enable row level security;

drop policy if exists "documents_select_member" on public.documents;
drop policy if exists "documents_insert_member" on public.documents;
drop policy if exists "documents_update_member" on public.documents;
drop policy if exists "documents_delete_member" on public.documents;
drop policy if exists "documents_select_onboarding" on public.documents;
drop policy if exists "documents_insert_onboarding" on public.documents;

create policy "documents_select_member" on public.documents for select to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = documents.org_id and m.user_id = auth.uid()));
create policy "documents_insert_member" on public.documents for insert to authenticated
  with check (exists (select 1 from public.organization_members m where m.organization_id = documents.org_id and m.user_id = auth.uid()));
create policy "documents_update_member" on public.documents for update to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = documents.org_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.organization_members m where m.organization_id = documents.org_id and m.user_id = auth.uid()));
create policy "documents_delete_member" on public.documents for delete to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = documents.org_id and m.user_id = auth.uid()));

-- Also allow via user_onboarding (same pattern as clients)
create policy "documents_select_onboarding" on public.documents for select to authenticated
  using (exists (select 1 from public.user_onboarding u where u.user_id = auth.uid() and u.organization_id = documents.org_id));
create policy "documents_insert_onboarding" on public.documents for insert to authenticated
  with check (exists (select 1 from public.user_onboarding u where u.user_id = auth.uid() and u.organization_id = documents.org_id));

revoke all on public.documents from anon;
grant select, insert, update, delete on public.documents to authenticated;

-- 3. Insurance authorizations table (if not already created)
create table if not exists public.insurance_authorizations (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid references public.organizations (id) on delete cascade,
  client_id          uuid references public.clients (id) on delete cascade,
  auth_number        text not null,
  service_type       text not null,
  start_date         date,
  end_date           date,
  units_authorized   integer default 0,
  units_used         integer default 0,
  insurance_provider text,
  status             text default 'active',
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists ins_auth_org_idx    on public.insurance_authorizations (org_id);
create index if not exists ins_auth_client_idx on public.insurance_authorizations (client_id);
alter table public.insurance_authorizations enable row level security;

drop policy if exists "ins_auth_select" on public.insurance_authorizations;
drop policy if exists "ins_auth_insert" on public.insurance_authorizations;
drop policy if exists "ins_auth_update" on public.insurance_authorizations;
drop policy if exists "ins_auth_delete" on public.insurance_authorizations;
drop policy if exists "ins_auth_select_onboarding" on public.insurance_authorizations;
drop policy if exists "ins_auth_insert_onboarding" on public.insurance_authorizations;

create policy "ins_auth_select" on public.insurance_authorizations for select to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = insurance_authorizations.org_id and m.user_id = auth.uid()));
create policy "ins_auth_insert" on public.insurance_authorizations for insert to authenticated
  with check (exists (select 1 from public.organization_members m where m.organization_id = insurance_authorizations.org_id and m.user_id = auth.uid()));
create policy "ins_auth_update" on public.insurance_authorizations for update to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = insurance_authorizations.org_id and m.user_id = auth.uid()));
create policy "ins_auth_delete" on public.insurance_authorizations for delete to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = insurance_authorizations.org_id and m.user_id = auth.uid()));

create policy "ins_auth_select_onboarding" on public.insurance_authorizations for select to authenticated
  using (exists (select 1 from public.user_onboarding u where u.user_id = auth.uid() and u.organization_id = insurance_authorizations.org_id));
create policy "ins_auth_insert_onboarding" on public.insurance_authorizations for insert to authenticated
  with check (exists (select 1 from public.user_onboarding u where u.user_id = auth.uid() and u.organization_id = insurance_authorizations.org_id));

revoke all on public.insurance_authorizations from anon;
grant select, insert, update, delete on public.insurance_authorizations to authenticated;

-- 4. Workspace online users / presence
create table if not exists public.workspace_user_presence (
  org_id       uuid not null references public.organizations (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  email        text,
  full_name    text,
  current_page text,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists workspace_presence_org_seen_idx
  on public.workspace_user_presence (org_id, last_seen_at desc);

alter table public.workspace_user_presence enable row level security;

drop policy if exists "presence_select_workspace_members" on public.workspace_user_presence;
drop policy if exists "presence_insert_self" on public.workspace_user_presence;
drop policy if exists "presence_update_self" on public.workspace_user_presence;
drop policy if exists "presence_delete_self" on public.workspace_user_presence;

create policy "presence_select_workspace_members"
  on public.workspace_user_presence for select to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = workspace_user_presence.org_id
        and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid()
        and u.organization_id = workspace_user_presence.org_id
    )
  );

create policy "presence_insert_self"
  on public.workspace_user_presence for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.organization_members m
        where m.organization_id = workspace_user_presence.org_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.user_onboarding u
        where u.user_id = auth.uid()
          and u.organization_id = workspace_user_presence.org_id
      )
    )
  );

create policy "presence_update_self"
  on public.workspace_user_presence for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "presence_delete_self"
  on public.workspace_user_presence for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.workspace_user_presence from anon;
grant select, insert, update, delete on public.workspace_user_presence to authenticated;

-- Reload PostgREST schema cache
do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
