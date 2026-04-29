# HIPAA beside this codebase (plain talk)

Tidying Javascript does not check every HIPAA checkbox by itself. You still need paperwork, workstation habits, audited Supabase setups, backups, BAAs wherever PHI flows, staffing training around minimum necessary exposure, breach response rehearsals. Think of HIPAA as choreography between legal folks, IT folks, clinicians, whoever signs vendor contracts.

This file only lists angles people forget while staring at repo files.

## What code cannot fix alone

Organizations need signed BAAs covering Supabase (on eligible HIPAA plans), email SMTP providers, backups, logging sinks, CDN layers, anything PHI touches casually.

Row Level Security in Postgres matters more than imagining nobody will guess your anon key.

Operational controls matter beyond repo contents: timeouts on unattended screens, restricting exports, honoring patient requests, auditing who viewed what server side when feasible.

Gilberto can store PHI only after counsel plus operations agree your stack qualifies.

## Habits teammates already intuit

Prefer HTTPS for every environment that handles real patient data.

Whitelist accurate redirect URLs inside Supabase so authentication emails land predictably without leaking redirects across environments.

Assume shared clinic PCs occasionally stay unlocked so encourage logout rituals plus avoid jotting PHI into browser consoles while debugging casually.

Treat **`info/SUPABASE_PROJECT_CHECKLIST.md`** as partner doc for sane auth emailing configuration (add that file under **`info/`** when you have one).

Nothing here substitutes legal counsel. When unsure escalate privacy officer or HIPAA counsel rather than debating git alone.
