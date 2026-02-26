# Auth Email TokenHash + RedirectTo Strategy

We migrated all Supabase Auth email templates to use the TokenHash + `RedirectTo` strategy instead of `.ConfirmationURL`.

This gives:

- no visible `supabase.co` URLs
- fully branded links
- environment-aware redirects
- single-project compatibility for RI + TI
- production-grade auth UX

## Core Link Format

All templates use:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=<type>&next=<path>
```

Where:

- `{{ .RedirectTo }}` is provided by the frontend auth call
- `{{ .TokenHash }}` is the Supabase OTP token hash
- `type` selects verification flow
- `next` controls post-verification destination

## Template Link Mappings

Confirm signup:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email&next=/account
```

Magic link:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=magiclink&next=/account
```

Reset password:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery&next=/account/reset-password
```

Change email:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email_change&next=/account
```

## Required Frontend Configuration

All auth calls that trigger email must include redirect target:

- `emailRedirectTo: "https://www.tournamentinsights.com/auth/confirm"` (TI)
- `emailRedirectTo: "https://www.refereeinsights.com/auth/confirm"` (RI)

Or equivalent `redirectTo` option when that API expects it.

If omitted, `{{ .RedirectTo }}` can be empty and links will break.

## Application Route Requirement

Each app must implement `/auth/confirm`:

- TI: `apps/ti-web/app/auth/confirm/route.ts`
- RI: `apps/referee/app/auth/confirm/route.ts`

Route responsibilities:

- read `token_hash`, `type`, optional `next`
- call `supabase.auth.verifyOtp({ token_hash, type })`
- redirect rules:
  - default: `/account`
  - `type=recovery`: `/account/reset-password`
  - if safe `next` provided: redirect to `next`

Error UX routes:

- TI: `apps/ti-web/app/auth/error/page.tsx`
- RI: `apps/referee/app/auth/error/page.tsx`

## Email Infrastructure

- sender: `noreply@mail.tournamentinsights.com`
- SMTP: Resend (custom SMTP enabled in Supabase)
- logo: `https://www.tournamentinsights.com/brand/ti-email-logo.png`
- HTML: minimal
- no tracking pixels
- no external fonts
- optimized for deliverability

## Why TokenHash + RedirectTo

- removes exposed Supabase URLs
- keeps auth flow branded end-to-end
- supports preview and production environments
- supports RI + TI under one Supabase project
- provides full redirect control
- scales better long-term

## Future Consideration

If RI and TI move to separate Supabase projects:

- templates can diverge per brand
- sender identities can be fully independent
- auth config becomes fully isolated

Not required during beta.
