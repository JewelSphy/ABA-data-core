-- EMERGENCY FIX: Run this when client counts, saving clients, or admin access break
-- after running admin/session SQL migrations.
--
-- Root cause: RLS policies that query organization_members from inside other tables
-- can trigger infinite recursion when org_members admin policy also queries org_members.
--
-- Safe to run multiple times.

create or replace function public.gilberto_is_org_member(p_org_id uuid)
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
  );
$$;

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

revoke all on function public.gilberto_is_org_member(uuid) from public;
grant execute on function public.gilberto_is_org_member(uuid) to authenticated;
revoke all on function public.gilberto_is_org_admin(uuid) from public;
grant execute on function public.gilberto_is_org_admin(uuid) to authenticated;

-- organization_members: admin visibility without recursion
drop policy if exists "org_members_select_org_admins" on public.organization_members;
create policy "org_members_select_org_admins"
  on public.organization_members for select to authenticated
  using (public.gilberto_is_org_admin(organization_id));

-- organizations
drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
  on public.organizations for select to authenticated
  using (public.gilberto_is_org_member(id));

drop policy if exists "organizations_update_owner" on public.organizations;
create policy "organizations_update_owner"
  on public.organizations for update to authenticated
  using (public.gilberto_is_org_admin(id))
  with check (public.gilberto_is_org_admin(id));

-- clients
drop policy if exists "clients_select_member" on public.clients;
drop policy if exists "clients_insert_member" on public.clients;
drop policy if exists "clients_update_member" on public.clients;
drop policy if exists "clients_delete_member" on public.clients;

create policy "clients_select_member"
  on public.clients for select to authenticated
  using (public.gilberto_is_org_member(org_id));

create policy "clients_insert_member"
  on public.clients for insert to authenticated
  with check (public.gilberto_is_org_member(org_id));

create policy "clients_update_member"
  on public.clients for update to authenticated
  using (public.gilberto_is_org_member(org_id))
  with check (public.gilberto_is_org_member(org_id));

create policy "clients_delete_member"
  on public.clients for delete to authenticated
  using (public.gilberto_is_org_member(org_id));

-- staff
drop policy if exists "staff_select_member" on public.staff;
drop policy if exists "staff_insert_member" on public.staff;
drop policy if exists "staff_update_member" on public.staff;
drop policy if exists "staff_delete_member" on public.staff;

create policy "staff_select_member"
  on public.staff for select to authenticated
  using (public.gilberto_is_org_member(org_id));

create policy "staff_insert_member"
  on public.staff for insert to authenticated
  with check (public.gilberto_is_org_member(org_id));

create policy "staff_update_member"
  on public.staff for update to authenticated
  using (public.gilberto_is_org_member(org_id))
  with check (public.gilberto_is_org_member(org_id));

create policy "staff_delete_member"
  on public.staff for delete to authenticated
  using (public.gilberto_is_org_member(org_id));

-- workspace presence
drop policy if exists "presence_select_workspace_members" on public.workspace_user_presence;
drop policy if exists "presence_insert_self" on public.workspace_user_presence;

create policy "presence_select_workspace_members"
  on public.workspace_user_presence for select to authenticated
  using (
    public.gilberto_is_org_member(org_id)
    or exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = workspace_user_presence.org_id
    )
  );

create policy "presence_insert_self"
  on public.workspace_user_presence for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      public.gilberto_is_org_member(org_id)
      or exists (
        select 1 from public.user_onboarding u
        where u.user_id = auth.uid() and u.organization_id = workspace_user_presence.org_id
      )
    )
  );

-- workspace sessions
drop policy if exists "workspace_sessions_select_org_members" on public.workspace_user_sessions;
drop policy if exists "workspace_sessions_insert_self" on public.workspace_user_sessions;

create policy "workspace_sessions_select_org_members"
  on public.workspace_user_sessions for select to authenticated
  using (
    public.gilberto_is_org_member(org_id)
    or exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = workspace_user_sessions.org_id
    )
  );

create policy "workspace_sessions_insert_self"
  on public.workspace_user_sessions for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      public.gilberto_is_org_member(org_id)
      or exists (
        select 1 from public.user_onboarding u
        where u.user_id = auth.uid() and u.organization_id = workspace_user_sessions.org_id
      )
    )
  );

-- repair membership row for signed-in user
create or replace function public.ensure_my_org_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role text := 'member';
begin
  if v_uid is null then
    return null;
  end if;

  select u.organization_id into v_org
  from public.user_onboarding u
  where u.user_id = v_uid
  limit 1;

  if v_org is null then
    select o.id into v_org
    from public.organizations o
    where o.created_by = v_uid
    order by o.created_at desc
    limit 1;
  end if;

  if v_org is null then
    select m.organization_id into v_org
    from public.organization_members m
    where m.user_id = v_uid
    order by m.organization_id
    limit 1;
  end if;

  if v_org is null then
    return null;
  end if;

  if exists (
    select 1 from public.organizations o
    where o.id = v_org and o.created_by = v_uid
  ) then
    v_role := 'owner';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_uid, v_role)
  on conflict (organization_id, user_id) do update
    set role = case
      when organization_members.role = 'owner' then organization_members.role
      else excluded.role
    end;

  update public.user_onboarding
  set organization_id = v_org, updated_at = now()
  where user_id = v_uid
    and (organization_id is null or organization_id is distinct from v_org);

  return v_org;
end;
$$;

revoke all on function public.ensure_my_org_membership() from public;
grant execute on function public.ensure_my_org_membership() to authenticated;

do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
