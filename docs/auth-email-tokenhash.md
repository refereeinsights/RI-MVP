# Auth Email TokenHash Flow (TI + RI)

TournamentInsights and RefereeInsights auth email templates use Supabase TokenHash links instead of direct confirmation URLs.

## Why TokenHash

- Keeps email links explicit and consistent by auth action type.
- Routes all auth-link verification through app-controlled handling.
- Allows safe redirect handling (`next`) and consistent failure UX.

## App Routes

- TI:
  - Handler: `apps/ti-web/app/auth/confirm/route.ts`
  - Error page: `apps/ti-web/app/auth/error/page.tsx`
- RI:
  - Handler: `apps/referee/app/auth/confirm/route.ts`
  - Error page: `apps/referee/app/auth/error/page.tsx`

`/auth/confirm` reads:

- `token_hash` (required)
- `type` (required)
- `next` (optional)

Supported `type` values:

- `email`
- `magiclink`
- `recovery`
- `email_change`

The route verifies with Supabase:

```ts
supabase.auth.verifyOtp({ type, token_hash })
```

Success redirects:

- default: `/account`
- `recovery`: `/account/reset-password` (unless a valid `next` is provided)

Failure redirects:

- `/auth/error?notice=auth_link_invalid`
- `/auth/error?notice=auth_link_expired`

`next` is accepted only when it is a safe relative path (`/...`, not `//...`).

## Single Supabase Project, Two Domains

If one Supabase project serves both apps, prefer `{{ .RedirectTo }}` in templates so each app can set its own target domain via `emailRedirectTo`/`redirectTo`:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email&next=/account
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=magiclink&next=/account
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery&next=/account/reset-password
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email_change&next=/account
```

Notes:

- `next` is optional.
- Keep `next` app-relative.
- App code should set redirect targets to:
  - TI: `https://www.tournamentinsights.com/auth/confirm`
  - RI: `https://www.refereeinsights.com/auth/confirm`
- Add both callback URLs to Supabase redirect allowlist.
