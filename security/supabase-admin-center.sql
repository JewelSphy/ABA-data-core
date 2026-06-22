-- Administration center tables + RPC for Gilberto CRM.
-- Run in Supabase SQL Editor after supabase-organizations.sql and supabase-workspace-presence.sql.

-- Allow owners/admins to list all members in their organization
drop policy if exists "org_members_select_org_admins" on public.organization_members;
create policy "org_members_select_org_admins"
  on public.organization_members
  for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organization_members.organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_name text,
  actor_email text,
  action text not null,
  area text,
  affected_user text,
  old_value text,
  new_value text,
  status text default 'Success',
  risk text default 'Medium',
  details text,
  module text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_org_idx on public.admin_audit_logs (org_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "admin_audit_select_org_admins" on public.admin_audit_logs;
create policy "admin_audit_select_org_admins"
  on public.admin_audit_logs for select to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = admin_audit_logs.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "admin_audit_insert_org_admins" on public.admin_audit_logs;
create policy "admin_audit_insert_org_admins"
  on public.admin_audit_logs for insert to authenticated
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = admin_audit_logs.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

grant select, insert on public.admin_audit_logs to authenticated;

create or replace function public.admin_list_org_members(p_org_id uuid)
returns table (
  user_id uuid,
  role text,
  email text,
  full_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  ) then
    return;
  end if;

  return query
  select
    m.user_id,
    m.role,
    coalesce(
      nullif(trim(pres.email), ''),
      nullif(trim(p.email), ''),
      nullif(trim(au.email::text), ''),
      ''
    ) as email,
    coalesce(
      nullif(trim(pres.full_name), ''),
      nullif(trim(p.full_name), ''),
      nullif(trim(au.email::text), ''),
      'Workspace member'
    ) as full_name
  from public.organization_members m
  left join public.profiles p on p.id = m.user_id
  left join public.workspace_user_presence pres
    on pres.org_id = m.organization_id and pres.user_id = m.user_id
  left join auth.users au on au.id = m.user_id
  where m.organization_id = p_org_id
  order by m.role desc, full_name nulls last;
end;
$$;

revoke all on function public.admin_list_org_members(uuid) from public;
grant execute on function public.admin_list_org_members(uuid) to authenticated;

do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
