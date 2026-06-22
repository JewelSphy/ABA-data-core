-- Shared workspace session tracking for Online Users + Administration identity.
-- Run after supabase-organizations.sql and supabase-workspace-presence.sql.
-- Safe to run multiple times.

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
create policy "workspace_sessions_select_org_members"
  on public.workspace_user_sessions for select to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = workspace_user_sessions.org_id
        and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid()
        and u.organization_id = workspace_user_sessions.org_id
    )
  );

drop policy if exists "workspace_sessions_insert_self" on public.workspace_user_sessions;
create policy "workspace_sessions_insert_self"
  on public.workspace_user_sessions for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.organization_members m
        where m.organization_id = workspace_user_sessions.org_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.user_onboarding u
        where u.user_id = auth.uid()
          and u.organization_id = workspace_user_sessions.org_id
      )
    )
  );

drop policy if exists "workspace_sessions_update_self" on public.workspace_user_sessions;
create policy "workspace_sessions_update_self"
  on public.workspace_user_sessions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.workspace_user_sessions from anon;
grant select, insert, update on public.workspace_user_sessions to authenticated;

create or replace function public.workspace_session_heartbeat(
  p_session_id uuid,
  p_current_page text default null,
  p_email text default null,
  p_full_name text default null,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_id is null then
    return;
  end if;

  update public.workspace_user_sessions s
  set
    last_activity_at = now(),
    status = 'online',
    current_page = coalesce(nullif(trim(p_current_page), ''), s.current_page),
    email = coalesce(nullif(trim(p_email), ''), s.email),
    full_name = coalesce(nullif(trim(p_full_name), ''), s.full_name),
    role = coalesce(nullif(trim(p_role), ''), s.role)
  where s.id = p_session_id
    and s.user_id = auth.uid()
    and s.logout_time is null;
end;
$$;

create or replace function public.workspace_session_logout(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_user uuid;
begin
  if p_session_id is null then
    return;
  end if;

  update public.workspace_user_sessions s
  set
    logout_time = now(),
    status = 'offline',
    last_activity_at = now()
  where s.id = p_session_id
    and s.user_id = auth.uid()
    and s.logout_time is null
  returning s.org_id, s.user_id into v_org, v_user;

  if v_org is not null and v_user is not null then
    delete from public.workspace_user_presence pres
    where pres.org_id = v_org and pres.user_id = v_user;
  end if;
end;
$$;

create or replace function public.workspace_end_all_my_sessions(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    return;
  end if;

  update public.workspace_user_sessions s
  set
    logout_time = now(),
    status = 'offline',
    last_activity_at = now()
  where s.org_id = p_org_id
    and s.user_id = auth.uid()
    and s.logout_time is null;

  delete from public.workspace_user_presence pres
  where pres.org_id = p_org_id and pres.user_id = auth.uid();
end;
$$;

create or replace function public.admin_list_workspace_online_users(p_org_id uuid)
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  role text,
  login_time timestamptz,
  last_activity_at timestamptz,
  status text,
  device text,
  browser text,
  current_page text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    return;
  end if;

  if not public.gilberto_is_org_admin(p_org_id)
     and not exists (
       select 1 from public.organization_members m
       where m.organization_id = p_org_id and m.user_id = auth.uid()
     )
     and not exists (
       select 1 from public.user_onboarding u
       where u.organization_id = p_org_id and u.user_id = auth.uid()
     ) then
    return;
  end if;

  return query
  select
    s.id,
    s.user_id,
    s.email,
    s.full_name,
    s.role,
    s.login_time,
    s.last_activity_at,
    case
      when s.logout_time is not null then 'offline'
      when s.last_activity_at >= now() - interval '2 minutes' then 'online'
      when s.last_activity_at >= now() - interval '5 minutes' then 'idle'
      else 'offline'
    end as status,
    s.device,
    s.browser,
    s.current_page
  from public.workspace_user_sessions s
  where s.org_id = p_org_id
    and s.logout_time is null
    and s.last_activity_at >= now() - interval '5 minutes'
  order by s.last_activity_at desc;
end;
$$;

create or replace function public.admin_list_workspace_identities(p_org_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  last_activity_at timestamptz,
  current_page text
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
  select distinct on (s.user_id)
    s.user_id,
    s.email,
    s.full_name,
    s.role,
    s.last_activity_at,
    s.current_page
  from public.workspace_user_sessions s
  where s.org_id = p_org_id
    and coalesce(nullif(trim(s.email), ''), nullif(trim(s.full_name), '')) is not null
  order by s.user_id, s.last_activity_at desc nulls last;
end;
$$;

revoke all on function public.workspace_session_heartbeat(uuid, text, text, text, text) from public;
grant execute on function public.workspace_session_heartbeat(uuid, text, text, text, text) to authenticated;

revoke all on function public.workspace_session_logout(uuid) from public;
grant execute on function public.workspace_session_logout(uuid) to authenticated;

revoke all on function public.workspace_end_all_my_sessions(uuid) from public;
grant execute on function public.workspace_end_all_my_sessions(uuid) to authenticated;

create or replace function public.admin_force_logout_user(p_org_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null or p_user_id is null then
    return;
  end if;

  if not public.gilberto_is_org_admin(p_org_id) then
    return;
  end if;

  update public.workspace_user_sessions s
  set
    logout_time = now(),
    status = 'offline',
    last_activity_at = now()
  where s.org_id = p_org_id
    and s.user_id = p_user_id
    and s.logout_time is null;

  delete from public.workspace_user_presence pres
  where pres.org_id = p_org_id and pres.user_id = p_user_id;
end;
$$;

revoke all on function public.admin_force_logout_user(uuid, uuid) from public;
grant execute on function public.admin_force_logout_user(uuid, uuid) to authenticated;

revoke all on function public.admin_list_workspace_online_users(uuid) from public;
grant execute on function public.admin_list_workspace_online_users(uuid) to authenticated;

revoke all on function public.admin_list_workspace_identities(uuid) from public;
grant execute on function public.admin_list_workspace_identities(uuid) to authenticated;

do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
