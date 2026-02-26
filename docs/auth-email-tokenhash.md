# Auth Email TokenHash Flow (TI)

TournamentInsights auth email templates use Supabase TokenHash links instead of direct confirmation URLs.

## Why TokenHash

- Keeps email links explicit and consistent by auth action type.
- Routes all auth-link verification through app-controlled handling.
- Allows safe redirect handling (`next`) and consistent failure UX.

## App Route

- Handler: `apps/ti-web/app/auth/confirm/route.ts`
- Error page: `apps/ti-web/app/auth/error/page.tsx`

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

## Recommended Supabase Template Links

Use this pattern in Supabase Auth templates:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/account
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/account
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/reset-password
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/account
```

Notes:

- `next` is optional.
- Keep `next` app-relative.
- For production TI links, `{{ .SiteURL }}` should resolve to `https://www.tournamentinsights.com`.

