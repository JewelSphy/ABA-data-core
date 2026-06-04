-- Insurance authorizations (replaces demo/placeholder rows in authorizations.html)
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.insurance_authorizations (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid references public.organizations (id) on delete cascade,
  client_id          uuid references public.clients (id) on delete cascade,
  auth_number        text not null,
  service_type       text not null,
  start_date         date,
  end_date           date,
  units_authorized   integer not null default 0 check (units_authorized >= 0),
  units_used         integer not null default 0 check (units_used >= 0),
  insurance_provider text,
  notes              text,
  status             text not null default 'active'
    check (status in ('active', 'expiring', 'expired')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists insurance_authorizations_org_idx on public.insurance_authorizations (org_id);
create index if not exists insurance_authorizations_client_idx on public.insurance_authorizations (client_id);

alter table public.insurance_authorizations enable row level security;

drop policy if exists "insurance_authorizations_select_member" on public.insurance_authorizations;
drop policy if exists "insurance_authorizations_insert_member" on public.insurance_authorizations;
drop policy if exists "insurance_authorizations_update_member" on public.insurance_authorizations;
drop policy if exists "insurance_authorizations_delete_member" on public.insurance_authorizations;

create policy "insurance_authorizations_select_member"
  on public.insurance_authorizations for select to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = insurance_authorizations.org_id and m.user_id = auth.uid()
    )
  );

create policy "insurance_authorizations_insert_member"
  on public.insurance_authorizations for insert to authenticated
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = insurance_authorizations.org_id and m.user_id = auth.uid()
    )
  );

create policy "insurance_authorizations_update_member"
  on public.insurance_authorizations for update to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = insurance_authorizations.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = insurance_authorizations.org_id and m.user_id = auth.uid()
    )
  );

create policy "insurance_authorizations_delete_member"
  on public.insurance_authorizations for delete to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = insurance_authorizations.org_id and m.user_id = auth.uid()
    )
  );

revoke all on public.insurance_authorizations from anon;
grant select, insert, update, delete on public.insurance_authorizations to authenticated;

do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
