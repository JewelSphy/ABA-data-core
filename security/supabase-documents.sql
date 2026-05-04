-- Client documents + file attachments (Gilberto CRM). Run in Supabase SQL Editor after organizations + clients exist.
-- Mirrors Java/MySQL documents usage from the static frontend.

create table if not exists public.documents (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  client_id        uuid references public.clients (id) on delete set null,
  requirement_key  text,
  provider_id      uuid,
  doc_name         text not null,
  doc_type         text,
  linked_name      text,
  upload_date      date,
  expiry_date      date,
  status           text not null default 'active',
  content_text     text,
  attachment_mime  text,
  attachment_filename text,
  attachment_base64 text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists documents_org_idx on public.documents (org_id);
create index if not exists documents_client_idx on public.documents (org_id, client_id);

alter table public.documents enable row level security;

drop policy if exists "documents_select_member" on public.documents;
drop policy if exists "documents_insert_member" on public.documents;
drop policy if exists "documents_update_member" on public.documents;
drop policy if exists "documents_delete_member" on public.documents;

create policy "documents_select_member"
  on public.documents for select to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = documents.org_id and m.user_id = auth.uid()
    )
  );

create policy "documents_insert_member"
  on public.documents for insert to authenticated
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = documents.org_id and m.user_id = auth.uid()
    )
  );

create policy "documents_update_member"
  on public.documents for update to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = documents.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = documents.org_id and m.user_id = auth.uid()
    )
  );

create policy "documents_delete_member"
  on public.documents for delete to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = documents.org_id and m.user_id = auth.uid()
    )
  );

revoke all on public.documents from anon;
grant select, insert, update, delete on public.documents to authenticated;

do $$ begin
  notify pgrst, 'reload schema';
exception when others then
  null;
end $$;
