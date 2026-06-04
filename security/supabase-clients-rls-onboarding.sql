-- Let users who completed onboarding (user_onboarding.organization_id) read/write clients & staff
-- even if organization_members row is missing. Run after supabase-organizations.sql and supabase-clients-staff-fix.sql.

-- CLIENTS: extend policies for onboarding org
drop policy if exists "clients_select_onboarding" on public.clients;
create policy "clients_select_onboarding"
  on public.clients for select to authenticated
  using (
    exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = clients.org_id
    )
  );

drop policy if exists "clients_insert_onboarding" on public.clients;
create policy "clients_insert_onboarding"
  on public.clients for insert to authenticated
  with check (
    exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = clients.org_id
    )
  );

drop policy if exists "clients_update_onboarding" on public.clients;
create policy "clients_update_onboarding"
  on public.clients for update to authenticated
  using (
    exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = clients.org_id
    )
  )
  with check (
    exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = clients.org_id
    )
  );

drop policy if exists "clients_delete_onboarding" on public.clients;
create policy "clients_delete_onboarding"
  on public.clients for delete to authenticated
  using (
    exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = clients.org_id
    )
  );

-- STAFF: same for staff table
drop policy if exists "staff_select_onboarding" on public.staff;
create policy "staff_select_onboarding"
  on public.staff for select to authenticated
  using (
    exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = staff.org_id
    )
  );

drop policy if exists "staff_insert_onboarding" on public.staff;
create policy "staff_insert_onboarding"
  on public.staff for insert to authenticated
  with check (
    exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = staff.org_id
    )
  );

drop policy if exists "staff_update_onboarding" on public.staff;
create policy "staff_update_onboarding"
  on public.staff for update to authenticated
  using (
    exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = staff.org_id
    )
  )
  with check (
    exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = staff.org_id
    )
  );

drop policy if exists "staff_delete_onboarding" on public.staff;
create policy "staff_delete_onboarding"
  on public.staff for delete to authenticated
  using (
    exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = staff.org_id
    )
  );

-- organization_members: allow reading own org via onboarding (fixes permission errors in app boot)
drop policy if exists "org_members_select_onboarding" on public.organization_members;
create policy "org_members_select_onboarding"
  on public.organization_members for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.user_onboarding u
      where u.user_id = auth.uid() and u.organization_id = organization_members.organization_id
    )
  );

do $$ begin notify pgrst, 'reload schema'; exception when others then null; end $$;
