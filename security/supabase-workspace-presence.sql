-- Workspace-scoped online users.
-- Run in Supabase SQL Editor. Safe to run more than once.

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
    exists (
      select 1 from public.organization_members m
      where m.organization_id = workspace_user_presence.org_id
        and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid()
        and u.organization_id = workspace_user_presence.org_id
    )
  );

create policy "presence_insert_self"
  on public.workspace_user_presence for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.organization_members m
        where m.organization_id = workspace_user_presence.org_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.user_onboarding u
        where u.user_id = auth.uid()
          and u.organization_id = workspace_user_presence.org_id
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

do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
