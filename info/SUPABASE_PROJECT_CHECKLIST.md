# Supabase New Project Checklist (Gilberto CRM)

Use this right after creating a new Supabase project.

## 1) Project identity (do first)

- Project name: `Gilberto CRM`
- Confirm you are in the correct project before changing auth settings.

## 2) Auth URL configuration

In `Authentication -> URL Configuration`:

- Site URL: your real app URL (or local URL while developing)
- Add Redirect URLs you actually use (for local + production)
- Remove old/unrelated URLs from previous projects

Example local URL:

- `http://127.0.0.1:5500`

## 3) Email auth behavior

In `Authentication -> Providers -> Email`:

- Decide if `Confirm email` is ON or OFF
- ON = users must click email link before login
- OFF = users can login immediately after signup

## 4) Email branding (prevent wrong sender names)

In `Authentication -> SMTP Settings`:

- From name: `Gilberto CRM`
- From email: `no-reply@yourdomain.com` (or your verified sender)
- Use your own SMTP provider for production

In `Authentication -> Email Templates -> Confirm signup`:

- Subject: `Confirm your Gilberto CRM account`
- Replace any old organization name in the template body

Suggested template:

```html
<h2>Confirm your email</h2>
<p>Welcome to Gilberto CRM.</p>
<p>Click below to confirm your account:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm my account</a></p>
<p>If you did not request this, you can ignore this email.</p>
```

## 5) Database baseline

Run your SQL baseline script in SQL Editor:

- Table(s): `public.users_profile` (or `public.profiles`, pick one and stay consistent)
- Trigger function: `public.handle_new_user()`
- Trigger: `on_auth_user_created` on `auth.users`

Important:

- Do NOT leave cleanup statements that drop your trigger/function at the end.

## 6) Security checks

- Enable RLS on app tables
- Add policies for `authenticated` users
- Keep `anon` minimal permissions

## 7) Smoke test before inviting real users

1. Create test signup with a new email.
2. Verify row appears in `auth.users`.
3. Verify matching row appears in profile table.
4. Confirm email template/sender branding is correct.
5. Login test after confirmation (or immediate if confirmation OFF).

## 8) Naming consistency rule

Pick one profile table name and keep it everywhere:

- Option A: `public.users_profile`
- Option B: `public.profiles`

Do not mix both in functions, triggers, and app queries.
