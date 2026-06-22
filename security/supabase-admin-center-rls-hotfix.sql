-- HOTFIX: Run this immediately if clients won't save or Administration disappeared
-- after running supabase-admin-center.sql.
--
-- Cause: org_members_select_org_admins queried organization_members inside its own
-- RLS policy, causing infinite recursion that broke clients, org boot, and admin access.

create or replace function public.gilberto_is_org_admin(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.gilberto_is_org_admin(uuid) from public;
grant execute on function public.gilberto_is_org_admin(uuid) to authenticated;

drop policy if exists "org_members_select_org_admins" on public.organization_members;
create policy "org_members_select_org_admins"
  on public.organization_members
  for select
  to authenticated
  using (public.gilberto_is_org_admin(organization_id));

drop policy if exists "admin_audit_select_org_admins" on public.admin_audit_logs;
create policy "admin_audit_select_org_admins"
  on public.admin_audit_logs for select to authenticated
  using (public.gilberto_is_org_admin(org_id));

drop policy if exists "admin_audit_insert_org_admins" on public.admin_audit_logs;
create policy "admin_audit_insert_org_admins"
  on public.admin_audit_logs for insert to authenticated
  with check (public.gilberto_is_org_admin(org_id));

create or replace function public.admin_list_org_members(p_org_id uuid)
returns table (
  user_id uuid,
  role text,
  email text,
  full_name text,
  contact_first_name text,
  contact_last_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    return;
  end if;

  if not public.gilberto_is_org_admin(p_org_id) then
    return;
  end if;

  return query
  select
    m.user_id,
    m.role,
    coalesce(
      nullif(trim(au.email::text), ''),
      nullif(trim(pres.email), ''),
      nullif(trim(onb.contact_email), ''),
      nullif(trim(p.email), ''),
      ''
    ) as email,
    coalesce(
      nullif(trim(pres.full_name), ''),
      nullif(trim(p.full_name), ''),
      nullif(trim(onb.contact_name), ''),
      nullif(trim(concat_ws(' ', onb.contact_first_name, onb.contact_last_name)), ''),
      nullif(trim(au.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(au.email::text), ''),
      'Workspace member'
    ) as full_name,
    onb.contact_first_name,
    onb.contact_last_name
  from public.organization_members m
  left join public.profiles p on p.id = m.user_id
  left join public.workspace_user_presence pres
    on pres.org_id = m.organization_id and pres.user_id = m.user_id
  left join public.user_onboarding onb on onb.user_id = m.user_id
  left join auth.users au on au.id = m.user_id
  where m.organization_id = p_org_id
  order by m.role desc, full_name nulls last;
end;
$$;

revoke all on function public.admin_list_org_members(uuid) from public;
grant execute on function public.admin_list_org_members(uuid) to authenticated;

do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
