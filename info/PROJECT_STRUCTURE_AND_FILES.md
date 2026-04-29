

## Folder layout snapshot

Everything the browser loads now lives inside **the `frontend/` folder**: all CRM `*.html`, the shared stylesheets (`style.css`, `dashboard.css`, `onboarding.css`), and the client scripts (`script.js`, `dashboard.js`, `onboarding.js`, `workspace-setup.js`, `supabaseConfig.js`, `supabaseClient.js`). The repo root keeps `package.json`, `node_modules`, core Supabase **`*.sql`** migrations (`supabase-onboarding.sql`, `supabase-organizations.sql`), and folders **`frontend/`** (browser app), **`backend/`** (reserved for future migrations or server glue), **`info/`** (general Markdown guides below), **`security/`** (HIPAA posture doc plus signup RLS diagnostics and fixes).

Markdown in **`info/`**: `PROJECT_STRUCTURE_AND_FILES.md`, `CALENDAR_PLAN.md`.

Compliance and hardened SQL snippets live in **`security/`**: **`HIPAA_CONSIDERATIONS.md`**, **`supabase-security.sql`**, **`supabase-fix-signup.sql`**, **`supabase-signup-diagnostics.sql`**.

If you add **`SUPABASE_PROJECT_CHECKLIST.md`**, tuck it under **`info/`** (operational onboarding for Supabase projects).

**How to run it.** Serve the workspace from the Gilberto CRM folder root, then browse to **`frontend/index.html`**, **or** set Live Server web root to **`frontend`** so `index.html` opens at `/`. Mirror that URL in **`frontend/supabaseConfig.js`** for `AUTH_REDIRECT_URL` (for example `http://127.0.0.1:5504/frontend/index.html`; match your actual port), and whitelist the same pattern under Supabase Authentication URL settings.


## What this actually is

CRM supports applied behavior analysis teams. Scheduling, session notes, rosters, behavior plans, and custom reporting surfaces each get their own HTML route. Repeated navigation chrome stays intentional so clinicians memorize layout once instead of fighting a new cockpit every navigation hop.


CDN tags load `@supabase/supabase-js`. Running `npm install` still drops that SDK beside `package.json` when tooling insists. Production setups still converge on CDN load, then `frontend/supabaseConfig.js`, then `frontend/supabaseClient.js`.

## How to picture the flow

Visitors start at `frontend/index.html` juggling signup versus signin plus optional remember email toggles. Lobby styling originates from `style.css` cooperating with `script.js`. Pretend tokens never existed until authenticated screens appear.

Beyond authentication orchestration settles inside `dashboard.js` emitting `gilbertoAuthFlow`. Half finished onboarding nudges coworkers through `workspace-setup.html` choosing joining existing footprints versus spawning fresh scaffolding. Sometimes `onboarding.html` executes afterward whenever wizard states remain pending. Comfortable teams inhabit `dashboard.html` daily thereafter.

Rough split between worlds:

Before login visuals belong to `style.css` cooperating with `script.js`.

Authenticated CRM visuals belong to `dashboard.css` cooperating with whichever route also attaches `dashboard.js`.

## Operational bootstrapping

Serve repository roots exposing HTTP pleasantly.

Tune `supabaseConfig.js` injecting Supabase project URL alongside anon credential plus optional `AUTH_REDIRECT_URL`.

Redirect targets genuinely match browser realities including fiddly localhost ports.

Inside Supabase Authentication URL settings whitelist whatever origins match that reality or verification mails stop working quietly.

Assume the anon credential is already exposed to browsers. Real protection sits in Row Level Security and careful policies, not secrecy around that string.

When you stand up an empty Postgres through Supabase, run SQL bundles roughly in this order:

**`security/supabase-security.sql`**

**`security/supabase-fix-signup.sql`** (when signup screams “database error saving new user”)

`supabase-onboarding.sql`

`supabase-organizations.sql` (after onboarding tables exist)

Use **`security/supabase-signup-diagnostics.sql`** whenever signup traces look gnarly in Postgres inspector.

Redirect checks, SMTP tips, signup smoke rituals, that whole routine already lives inside **`info/SUPABASE_PROJECT_CHECKLIST.md`** (when present) so this page does not repeat it.

Use `npm install` if you like a tidy tree. Ignore hand edits beneath `node_modules`.

Open `frontend/index.html`, authenticate, then let `gilbertoAuthFlow` send you where you belong.

## Repo root unpacked conversationally

`package.json` and `package-lock.json` nail JavaScript deps, mainly Supabase’s client SDK. The UI bundle lives under **`frontend/`** — see Folder layout snapshot.

Sometimes `.vscode` JSON nudges port defaults or browser launch helpers. Optional.

Inside **`frontend/`**, **`supabaseConfig.js`** attaches Supabase settings onto `window`.

**`supabaseClient.js`** creates `window.supabaseClient` after the CDN attaches `window.supabase`.

**`script.js`** is only wired into **`index.html`**. It swaps login versus signup panels, chats with Supabase auth, remembers an email checkbox if folks want it, prints errors people can parse.

**`dashboard.js`** is the kitchen sink bundle: onboarding routing via `gilbertoAuthFlow`, `goToPage`, `logout`, auth guards between refreshes, the dashboard connection tester callouts, workspace invite chips. Nearly every authenticated page imports it. **`color-schemes.html`** peels that import off since it paints mock themes rather than guarding PHI.

**`onboarding.js`** drives the onboarding wizard markup.

**`workspace-setup.js`** handles create versus join journeys, including whatever `join_organization` RPC expects.

CSS splits cleanly (still under **`frontend/`**):

**`style.css`** paints the foyer plus workspace picker.

**`dashboard.css`** owns the authenticated chrome.

**`onboarding.css`** keeps the onboarding wizard vibes contained.

Anything named like `supabase-*.sql` still runs inside Supabase’s SQL editor. Scripts focused on hardened auth or diagnostics sit under **`security/`** next to **`HIPAA_CONSIDERATIONS.md`**.

**More reading.** General guides in **`info/`**: optional `SUPABASE_PROJECT_CHECKLIST.md`, `PROJECT_STRUCTURE_AND_FILES.md`, `CALENDAR_PLAN.md`. Compliance framing lives at **`security/HIPAA_CONSIDERATIONS.md`**.

## Screens roughly grouped like your sidebar buckets

Usually each bundle loads CDN Supabase followed by `supabaseConfig.js`, `supabaseClient.js`, then `dashboard.js`, plus maybe a tiny chunk of inline fuss at bottom for quirks.

Auth onboarding cluster: `index.html`, `workspace-setup.html`, `onboarding.html`.

Day cluster: `dashboard.html`, `calendar.html`, `sessions.html`, `session-notes.html`, `revisions.html`, `caregiver-signatures.html`.

People cluster: `clients.html`, `staff.html`, `caregivers.html` (the nav jokingly borrows fantasy wording but those rows are still caregiver records), `providers.html`, `authorizations.html`, `documents.html`.

Behavior plan cluster: `skills.html`, `behaviors.html`, `replacement-behaviors.html`, `interventions.html`, `objectives.html`, `definitions.html`, `barriers.html`, `procedures.html`.

Reporting cluster: `assessments.html`, `monthly-reports.html`, `custom-reports.html`, `service-reports.html`, `supervision-logs.html`.

Data cluster: `library.html`, `graph-hub.html`, `data-collection-hub.html`, `stos-ltos.html`, `behavioral-analytics.html`.

Odd ducks: `profile.html`, `behavior-treatment-session.html`, `color-schemes.html` theme sandbox that only imports config plus Supabase client and deliberately skips the full `dashboard.js` bundle.

## When scripts feel out of order

Browser tags load CDN Supabase, then configuration, then instantiation, finally `dashboard.js` doing the heavy onboarding plus navigation housekeeping.

Lobby page `index.html` mixes `script.js` last so login boxes stay nimble yet still imports `dashboard.js` earlier whenever redirect juggling after OAuth tokens calls into `gilbertoAuthFlow`. If order ever confuses you, open lobby script and dashboard bundle side by side.

## Random tripwires coworkers mention

Copied sidebar anchors call `goToPage(...)` from one shared definition inside `dashboard.js`, which means navigation tweaks funnel through that file more than random HTML copies.

Whether onboarding clears depends on `gilbertoAuthFlow` plus whichever `user_onboarding` rows plus memberships exist once SQL migrations landed.

Signup dies with Postgres grumbling? Peek **`info/SUPABASE_PROJECT_CHECKLIST.md`**, skim **`security/supabase-signup-diagnostics.sql`**, escalate toward **`security/supabase-fix-signup.sql`**, politely staging on sandbox databases first.

These notes sketch intentions and maybe outdated placeholder stats in the nav. Real behavior mirrors whatever HTML plus Javascript your working tree currently holds.

