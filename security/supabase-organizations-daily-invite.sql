-- Daily-rotating org invite codes (UTC calendar day), salt not exposed to org members.
-- Run in Supabase SQL Editor AFTER `supabase-organizations.sql`.
--
-- * Invite salt lives in `organization_invite_secrets` (RLS: no policies for authenticated = members cannot read).
-- * `organization_todays_invite_code`, `join_organization`, and `organization_rotate_invite_salt` are SECURITY DEFINER.
-- * Today's code = first 8 hex chars of SHA256(salt || org_id || YYYYMMDD UTC). Accepts today + yesterday UTC.
-- * Legacy static `organizations.join_code` still works for joins until you clear it.

create extension if not exists pgcrypto;

-- One secret row per org; not readable by normal members (no RLS policy for authenticated).
create table if not exists public.organization_invite_secrets (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  salt text not null
);

alter table public.organization_invite_secrets enable row level security;

revoke all on public.organization_invite_secrets from anon;
revoke all on public.organization_invite_secrets from authenticated;

grant select, insert, update, delete on public.organization_invite_secrets to service_role;

-- Optional: keep column briefly for one-time backfill from older drafts (safe to run multiple times)
alter table public.organizations add column if not exists join_code_salt text;

insert into public.organization_invite_secrets (organization_id, salt)
select o.id, coalesce(nullif(trim(o.join_code_salt), ''), gen_random_uuid()::text)
from public.organizations o
where not exists (
  select 1 from public.organization_invite_secrets s where s.organization_id = o.id
);

alter table public.organizations drop column if exists join_code_salt;

-- New orgs: auto-create secret (trigger runs as definer, bypasses RLS on secrets)
create or replace function public.organizations_bootstrap_invite_secret()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_invite_secrets (organization_id, salt)
  values (new.id, gen_random_uuid()::text)
  on conflict (organization_id) do nothing;
  return NEW;
end;
$$;

drop trigger if exists organizations_ai_bootstrap_invite_secret on public.organizations;
create trigger organizations_ai_bootstrap_invite_secret
  after insert on public.organizations
  for each row
  execute function public.organizations_bootstrap_invite_secret();

create or replace function public._invite_code_for_day(p_salt text, p_org uuid, p_day date)
returns text
language sql
immutable
parallel safe
as $$
  select upper(substring(
    encode(
      digest(coalesce(p_salt, '') || p_org::text || to_char(p_day, 'YYYYMMDD'), 'sha256'),
      'hex'
    ),
    1,
    8
  ));
$$;

create or replace function public.organization_todays_invite_code(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salt text;
  v_static text;
begin
  if p_org_id is null then
    return null;
  end if;
  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  ) then
    return null;
  end if;

  select s.salt into v_salt
  from public.organization_invite_secrets s
  where s.organization_id = p_org_id
  limit 1;

  select o.join_code into v_static
  from public.organizations o
  where o.id = p_org_id
  limit 1;

  if v_salt is not null and length(trim(v_salt)) > 0 then
    return public._invite_code_for_day(v_salt, p_org_id, (timezone('utc', now()))::date);
  end if;

  return v_static;
end;
$$;

grant execute on function public.organization_todays_invite_code(uuid) to authenticated;

create or replace function public.organization_rotate_invite_salt(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    return;
  end if;
  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'not allowed';
  end if;

  insert into public.organization_invite_secrets (organization_id, salt)
  values (p_org_id, gen_random_uuid()::text)
  on conflict (organization_id) do update set salt = excluded.salt;

  update public.organizations
  set join_code = null, updated_at = now()
  where id = p_org_id;
end;
$$;

grant execute on function public.organization_rotate_invite_salt(uuid) to authenticated;

create or replace function public.join_organization(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_norm text;
  v_today date;
  v_yest date;
begin
  v_norm := upper(regexp_replace(trim(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g'));
  if v_norm is null or length(v_norm) < 4 then
    return null;
  end if;

  v_today := (timezone('utc', now()))::date;
  v_yest := v_today - 1;

  select o.id into v_org
  from public.organizations o
  where o.join_code is not null and upper(trim(o.join_code)) = v_norm
  limit 1;

  if v_org is null then
    select o.id into v_org
    from public.organizations o
    inner join public.organization_invite_secrets s on s.organization_id = o.id
    where trim(s.salt) <> ''
      and (
        public._invite_code_for_day(s.salt, o.id, v_today) = v_norm
        or public._invite_code_for_day(s.salt, o.id, v_yest) = v_norm
      )
    limit 1;
  end if;

  if v_org is null then
    return null;
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, auth.uid(), 'member')
  on conflict (organization_id, user_id) do nothing;

  return v_org;
end;
$$;

do $$ begin
  notify pgrst, 'reload schema';
exception when others then
  null;
end $$;
