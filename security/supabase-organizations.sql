-- Multi-tenant companies: one row per org, many users via organization_members.
-- Run in Supabase SQL Editor AFTER `supabase-onboarding.sql` (needs public.user_onboarding).

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  company_legal_name text,
  company_display_name text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_idx on public.organization_members (user_id);
create index if not exists organization_members_org_idx on public.organization_members (organization_id);

alter table public.user_onboarding
  drop constraint if exists user_onboarding_organization_id_fkey;
alter table public.user_onboarding
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

create index if not exists user_onboarding_org_idx on public.user_onboarding (organization_id);

-- RLS
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
  on public.organizations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "organizations_insert_creator" on public.organizations;
create policy "organizations_insert_creator"
  on public.organizations
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "organizations_update_owner" on public.organizations;
create policy "organizations_update_owner"
  on public.organizations
  for update
  to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "org_members_select_self" on public.organization_members;
create policy "org_members_select_self"
  on public.organization_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- Can add yourself as a member if you created the org (onboarding) or you are already admin/owner
drop policy if exists "org_members_insert" on public.organization_members;
create policy "org_members_insert"
  on public.organization_members
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.organizations o
      where o.id = organization_id
        and o.created_by = auth.uid()
    )
  );

revoke all on public.organizations from anon;
revoke all on public.organization_members from anon;
grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;

-- Invite link: 8-char code on each org (set when company is created in app)
alter table public.organizations add column if not exists join_code text;
create unique index if not exists organizations_join_code_uq
  on public.organizations (join_code)
  where join_code is not null;

-- Join with code: adds auth.uid() as member (bypasses normal insert policy)
create or replace function public.join_organization(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_norm text;
begin
  v_norm := upper(trim(p_code));
  if v_norm is null or length(v_norm) < 4 then
    return null;
  end if;
  select id into v_org from public.organizations where join_code = v_norm limit 1;
  if v_org is null then
    return null;
  end if;
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, auth.uid(), 'member')
  on conflict (organization_id, user_id) do nothing;
  return v_org;
end;
$$;

grant execute on function public.join_organization(text) to authenticated;

do $$ begin
  notify pgrst, 'reload schema';
exception when others then
  null;
end $$;
