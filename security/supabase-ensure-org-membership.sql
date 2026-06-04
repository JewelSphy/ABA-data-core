-- One-click fix when clients save/load fail with RLS or "no workspace".
-- Run in Supabase SQL Editor after supabase-organizations.sql and supabase-clients-rls-onboarding.sql.
-- Safe to run multiple times.

alter table public.user_onboarding
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

create or replace function public.ensure_my_org_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role text := 'owner';
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
  else
    v_role := 'member';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_uid, v_role)
  on conflict (organization_id, user_id) do nothing;

  update public.user_onboarding
  set organization_id = v_org,
      updated_at = now()
  where user_id = v_uid
    and (organization_id is null or organization_id is distinct from v_org);

  return v_org;
end;
$$;

revoke all on function public.ensure_my_org_membership() from public;
grant execute on function public.ensure_my_org_membership() to authenticated;

do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
