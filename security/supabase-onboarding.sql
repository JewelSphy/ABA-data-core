-- Optional: store onboarding + approval per user. Run in Supabase SQL Editor.
-- If this table is missing, the app still saves completion in localStorage.

create table if not exists public.user_onboarding (
  user_id uuid primary key references auth.users (id) on delete cascade,
  company_legal_name text,
  company_display_name text,
  contact_first_name text,
  contact_last_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  company_address text,
  team_size text,
  compliance_ack boolean not null default false,
  notes text,
  onboarding_completed boolean not null default false,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If you created this table before first/last columns existed, run these:
alter table public.user_onboarding add column if not exists contact_first_name text;
alter table public.user_onboarding add column if not exists contact_last_name text;

create index if not exists user_onboarding_approval_idx on public.user_onboarding (approval_status);

alter table public.user_onboarding enable row level security;

drop policy if exists "user_onboarding_select_own" on public.user_onboarding;
create policy "user_onboarding_select_own"
  on public.user_onboarding
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_onboarding_insert_own" on public.user_onboarding;
create policy "user_onboarding_insert_own"
  on public.user_onboarding
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_onboarding_update_own" on public.user_onboarding;
create policy "user_onboarding_update_own"
  on public.user_onboarding
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.user_onboarding from anon;
grant select, insert, update, delete on public.user_onboarding to authenticated;

-- Nudge API schema cache (optional; ignored if not allowed)
DO $$ BEGIN
  NOTIFY pgrst, 'reload schema';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
