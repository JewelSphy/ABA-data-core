# Calendar plan (HIPAA minded)

This doc tracks how we intend to ship real calendar and session data behind Supabase, strip placeholder UI where those screens hook up to the backend, keep emoji friendly inputs when creating sessions, and stay as HIPAA conscious as the stack allows. Legal BAAs and your privacy officer still own final compliance signoff.

Related docs: **`info/PROJECT_STRUCTURE_AND_FILES.md`**, **`security/HIPAA_CONSIDERATIONS.md`** (compliance framing).

---

## What “backend” means here

Gilberto has no bundled Node API in this repo. Postgres, Auth, and optional Edge Functions inside Supabase are the backend. Browser code lives under `frontend/` and talks through `frontend/supabaseConfig.js` and `frontend/supabaseClient.js`.

If you later add a separate API server (for example a `backend/` folder), contractually treat it like any vendor that touches PHI: BAA, logging discipline, HTTPS for calls.

---

## HIPAA minded guardrails (technical)

1. **Business Associate Agreement** with Supabase on an eligible plan before storing real PHI. Same for email SMTP, hosting, backups, anything that stores or routes patient data.
2. **HTTPS** for every environment that handles real patients. Match `AUTH_REDIRECT_URL` and Supabase Auth URL allow lists to real origins (`frontend/supabaseConfig.js`).
3. **Row Level Security** on every PHI capable table. Policies tied to `auth.uid()` and/or `organization_id` in line with your org membership SQL. No wide open `anon` reads on clinical rows.
4. **Least privilege** Prefer explicit column lists over `select('*')` in CRM code once things stabilize.
5. **Errors** Short user facing messages. Do not paste row contents into `console.log` on shared clinic machines; use humane copy and server side audit logging where you control it.
6. **Folders** Putting SQL or a future server under `backend/` does not break Supabase. URLs and keys still come from browser config.

---

## Product goals for this slice

1. **Calendar first:** `frontend/calendar.html` loads real session or event rows for the visible date range (however day/week/month is built today).

2. **Sessions aligned:** `frontend/sessions.html` list plus create flows use the same underlying table so you never fork “truth”.

3. **Placeholders retired** Demo stats or fake sidebar counts go away only after wires exist. Calendar plus sessions area first before the rest of the CRM.

4. **Emoji preserved** Free text stays UTF‑8 end to end. Do not strip surrogate pairs in JS before insert. Postgres `text` carries emoji fine.

5. **Errors caught** Network, RLS, validation map to safe strings for users. Developer detail without echoing PHI in browser logs.

---

## Suggested data shape (illustrative)

One table (name to taste), for example `sessions` or `calendar_events`, with at least:

- **Who:** `user_id`, optional `organization_id` for multi tenant scoping.
- **When:** `session_date`, `start_time` (or a single timestamptz if you normalize).
- **What:** client, service, location, status, procedure, notes fields as your UI already implies.

Index for calendar range queries, for example on `(organization_id, session_date)` or `(user_id, session_date)`.

Check in SQL alongside your existing `supabase-*.sql` style, or under `backend/migrations` if you standardize that later.

---

## Implementation order

1. Draft migration: table, indexes, RLS. Dry run in a dev Supabase project.
2. Smoke test RLS: two users, two orgs; cross tenant reads must fail closed.
3. Wire `sessions.html` list and create against the table; preserve modal UX and emoji behavior.
4. Wire `calendar.html`: query by visible range; replace hardcoded filler content in that view.
5. Add a thin friendly error helper for Supabase responses on those pages.

---

## Testing checklist before production PHI

- Create, read, update session flows under real test accounts.

- Calendar month or week churn does not run unbounded `select('*')` without a date window.

- Emoji string survives save and reload.

- When RLS denies access, UI shows a clear generic message, not raw Postgres payloads.

---

## Out of scope for this slice

- Migrating every placeholder screen in one go.

- Legal HIPAA paperwork (see **`security/HIPAA_CONSIDERATIONS.md`** for mindset).

- Building a separate Node backend unless you add a later phase for it.

---

When you execute this plan, treat this file as the living checklist and revise it when decisions land.
