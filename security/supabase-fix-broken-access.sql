-- EMERGENCY FIX: Run this when client counts, saving clients, or admin access break
-- after running admin/session SQL migrations.
--
-- Creates workspace_user_presence / workspace_user_sessions if missing.
-- Safe to run multiple times even if you have not run other session SQL files yet.

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

-- staff (skip if table not created yet)
do $$
begin
  if to_regclass('public.staff') is not null then
    execute 'drop policy if exists "staff_select_member" on public.staff';
    execute 'drop policy if exists "staff_insert_member" on public.staff';
    execute 'drop policy if exists "staff_update_member" on public.staff';
    execute 'drop policy if exists "staff_delete_member" on public.staff';
    execute $p$
      create policy "staff_select_member"
        on public.staff for select to authenticated
        using (public.gilberto_is_org_member(org_id))
    $p$;
    execute $p$
      create policy "staff_insert_member"
        on public.staff for insert to authenticated
        with check (public.gilberto_is_org_member(org_id))
    $p$;
    execute $p$
      create policy "staff_update_member"
        on public.staff for update to authenticated
        using (public.gilberto_is_org_member(org_id))
        with check (public.gilberto_is_org_member(org_id))
    $p$;
    execute $p$
      create policy "staff_delete_member"
        on public.staff for delete to authenticated
        using (public.gilberto_is_org_member(org_id))
    $p$;
  end if;
end $$;

-- workspace presence (create table if missing, then safe RLS)
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

create policy "presence_update_self"
  on public.workspace_user_presence for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "presence_delete_self"
  on public.workspace_user_presence for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.workspace_user_presence from anon;
grant select, insert, update, delete on public.workspace_user_presence to authenticated;

-- workspace sessions (create table if missing, then safe RLS)
create table if not exists public.workspace_user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text,
  full_name text,
  role text,
  login_time timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  logout_time timestamptz,
  status text not null default 'online' check (status in ('online', 'idle', 'offline')),
  device text,
  browser text,
  ip_address text,
  current_page text,
  created_at timestamptz not null default now()
);

create index if not exists workspace_user_sessions_org_activity_idx
  on public.workspace_user_sessions (org_id, last_activity_at desc);

create index if not exists workspace_user_sessions_user_org_idx
  on public.workspace_user_sessions (user_id, org_id, login_time desc);

alter table public.workspace_user_sessions enable row level security;

drop policy if exists "workspace_sessions_select_org_members" on public.workspace_user_sessions;
drop policy if exists "workspace_sessions_insert_self" on public.workspace_user_sessions;
drop policy if exists "workspace_sessions_update_self" on public.workspace_user_sessions;

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

create policy "workspace_sessions_update_self"
  on public.workspace_user_sessions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.workspace_user_sessions from anon;
grant select, insert, update on public.workspace_user_sessions to authenticated;

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

-- Role changes from Administration → Users must update organization_members (not local storage only).
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

do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
