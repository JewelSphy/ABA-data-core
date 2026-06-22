-- Administration center tables + RPC for Gilberto CRM.
-- Run in Supabase SQL Editor after supabase-organizations.sql and supabase-workspace-presence.sql.
--
-- If clients stop saving or Administration disappears after running this file,
-- run security/supabase-admin-center-rls-hotfix.sql (fixes RLS recursion).

-- Helper avoids infinite recursion when org_members policies reference organization_members.
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

-- Allow owners/admins to list all members in their organization
drop policy if exists "org_members_select_org_admins" on public.organization_members;
create policy "org_members_select_org_admins"
  on public.organization_members
  for select
  to authenticated
  using (public.gilberto_is_org_admin(organization_id));

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
  using (public.gilberto_is_org_admin(org_id));

drop policy if exists "admin_audit_insert_org_admins" on public.admin_audit_logs;
create policy "admin_audit_insert_org_admins"
  on public.admin_audit_logs for insert to authenticated
  with check (public.gilberto_is_org_admin(org_id));

grant select, insert on public.admin_audit_logs to authenticated;

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
      nullif(trim(sess.email), ''),
      nullif(trim(pres.email), ''),
      nullif(trim(onb.contact_email), ''),
      nullif(trim(p.email), ''),
      ''
    ) as email,
    coalesce(
      nullif(trim(sess.full_name), ''),
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
  left join lateral (
    select s.email, s.full_name
    from public.workspace_user_sessions s
    where s.org_id = m.organization_id
      and s.user_id = m.user_id
      and coalesce(nullif(trim(s.email), ''), nullif(trim(s.full_name), '')) is not null
    order by s.last_activity_at desc nulls last
    limit 1
  ) sess on true
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

-- Apply workspace membership role when an owner/admin changes a user in Administration.
create or replace function public.admin_set_org_member_role(
  p_org_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_caller_role text;
begin
  if p_org_id is null or p_user_id is null then
    raise exception 'org_id and user_id are required';
  end if;

  v_role := lower(trim(coalesce(p_role, '')));
  if v_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid role %', v_role;
  end if;

  if not public.gilberto_is_org_admin(p_org_id) then
    raise exception 'not authorized';
  end if;

  select m.role into v_caller_role
  from public.organization_members m
  where m.organization_id = p_org_id
    and m.user_id = auth.uid();

  if coalesce(v_caller_role, '') <> 'owner' and v_role = 'owner' then
    raise exception 'only the workspace owner can assign the owner role';
  end if;

  if exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = p_user_id
      and m.role = 'owner'
  ) and v_role <> 'owner' and coalesce(v_caller_role, '') <> 'owner' then
    raise exception 'only the workspace owner can change the owner role';
  end if;

  update public.organization_members
  set role = v_role
  where organization_id = p_org_id
    and user_id = p_user_id;

  if not found then
    raise exception 'workspace member not found';
  end if;
end;
$$;

revoke all on function public.admin_set_org_member_role(uuid, uuid, text) from public;
grant execute on function public.admin_set_org_member_role(uuid, uuid, text) to authenticated;

create or replace function public.admin_set_org_member_role_by_email(
  p_org_id uuid,
  p_email text,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'email is required';
  end if;

  select m.user_id into v_user_id
  from public.organization_members m
  inner join auth.users au on au.id = m.user_id
  where m.organization_id = p_org_id
    and lower(trim(au.email::text)) = v_email
  limit 1;

  if v_user_id is null then
    select onb.user_id into v_user_id
    from public.user_onboarding onb
    inner join public.organization_members m
      on m.organization_id = p_org_id
     and m.user_id = onb.user_id
    where lower(trim(coalesce(onb.contact_email, ''))) = v_email
    limit 1;
  end if;

  if v_user_id is null then
    raise exception 'workspace member not found for email %', p_email;
  end if;

  perform public.admin_set_org_member_role(p_org_id, v_user_id, p_role);
  return v_user_id;
end;
$$;

revoke all on function public.admin_set_org_member_role_by_email(uuid, text, text) from public;
grant execute on function public.admin_set_org_member_role_by_email(uuid, text, text) to authenticated;

create or replace function public.get_my_org_role(p_org_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = p_org_id
    and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.get_my_org_memberships()
returns table (
  organization_id uuid,
  role text
)
language sql
security definer
set search_path = public
stable
as $$
  select m.organization_id, m.role
  from public.organization_members m
  where m.user_id = auth.uid();
$$;

revoke all on function public.get_my_org_role(uuid) from public;
grant execute on function public.get_my_org_role(uuid) to authenticated;
revoke all on function public.get_my_org_memberships() from public;
grant execute on function public.get_my_org_memberships() to authenticated;

do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
