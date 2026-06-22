-- Simple Administration menu access (run in Supabase SQL Editor).
-- One table + a few RPCs. Owner toggles who sees the Administration sidebar.

create table if not exists public.workspace_admin_access (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists workspace_admin_access_user_idx
  on public.workspace_admin_access (user_id);

alter table public.workspace_admin_access enable row level security;

drop policy if exists "workspace_admin_access_select_self" on public.workspace_admin_access;
create policy "workspace_admin_access_select_self"
  on public.workspace_admin_access for select to authenticated
  using (user_id = auth.uid());

-- Uses gilberto_is_org_admin from supabase-fix-broken-access.sql / supabase-admin-center.sql
create or replace function public.get_my_workspace_access(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_org_id is null then
    return 'none';
  end if;

  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id and m.user_id = auth.uid()
  ) then
    return 'none';
  end if;

  if exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    return 'owner';
  end if;

  if exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id and m.user_id = auth.uid() and m.role = 'admin'
  ) then
    return 'admin';
  end if;

  if exists (
    select 1 from public.workspace_admin_access w
    where w.org_id = p_org_id and w.user_id = auth.uid()
  ) then
    return 'admin';
  end if;

  return 'member';
end;
$$;

create or replace function public.set_workspace_admin_access(
  p_org_id uuid,
  p_target_user_id uuid,
  p_enabled boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null or p_target_user_id is null then
    raise exception 'org_id and user_id are required';
  end if;

  if not public.gilberto_is_org_admin(p_org_id) then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id and m.user_id = p_target_user_id
  ) then
    raise exception 'user is not a member of this workspace';
  end if;

  if exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id and m.user_id = p_target_user_id and m.role = 'owner'
  ) then
    return 'owner';
  end if;

  if coalesce(p_enabled, false) then
    insert into public.workspace_admin_access (org_id, user_id, granted_by)
    values (p_org_id, p_target_user_id, auth.uid())
    on conflict (org_id, user_id) do update
      set granted_by = excluded.granted_by, created_at = now();

    update public.organization_members
    set role = 'admin'
    where organization_id = p_org_id
      and user_id = p_target_user_id
      and role <> 'owner';

    return 'admin';
  end if;

  delete from public.workspace_admin_access
  where org_id = p_org_id and user_id = p_target_user_id;

  update public.organization_members
  set role = 'member'
  where organization_id = p_org_id
    and user_id = p_target_user_id
    and role <> 'owner';

  return 'member';
end;
$$;

create or replace function public.set_workspace_admin_access_by_email(
  p_org_id uuid,
  p_email text,
  p_enabled boolean
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
    raise exception 'workspace member not found for email %', p_email;
  end if;

  perform public.set_workspace_admin_access(p_org_id, v_user_id, p_enabled);
  return v_user_id;
end;
$$;

create or replace function public.list_workspace_member_access(p_org_id uuid)
returns table (
  user_id uuid,
  email text,
  member_role text,
  admin_menu boolean
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
    coalesce(nullif(trim(au.email::text), ''), '') as email,
    m.role as member_role,
    (
      m.role in ('owner', 'admin')
      or exists (
        select 1 from public.workspace_admin_access w
        where w.org_id = p_org_id and w.user_id = m.user_id
      )
    ) as admin_menu
  from public.organization_members m
  left join auth.users au on au.id = m.user_id
  where m.organization_id = p_org_id
  order by m.role desc, email nulls last;
end;
$$;

revoke all on public.workspace_admin_access from public;
grant select on public.workspace_admin_access to authenticated;

revoke all on function public.get_my_workspace_access(uuid) from public;
grant execute on function public.get_my_workspace_access(uuid) to authenticated;
revoke all on function public.set_workspace_admin_access(uuid, uuid, boolean) from public;
grant execute on function public.set_workspace_admin_access(uuid, uuid, boolean) to authenticated;
revoke all on function public.set_workspace_admin_access_by_email(uuid, text, boolean) from public;
grant execute on function public.set_workspace_admin_access_by_email(uuid, text, boolean) to authenticated;
revoke all on function public.list_workspace_member_access(uuid) from public;
grant execute on function public.list_workspace_member_access(uuid) to authenticated;

do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
