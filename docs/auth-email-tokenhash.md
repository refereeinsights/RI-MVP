# Shared Auth Email TokenHash + RedirectTo Contract

TournamentInsights, RefereeInsights, and Corralio share one Supabase Auth project and therefore share its global email templates. The templates are configured manually in the Supabase dashboard; this repository owns the callback URLs and handlers, not the deployed template settings.

## Confirm Signup and Magic Link invariant

Every application-supplied `RedirectTo` used for Confirm Signup or Magic Link must already contain at least one query parameter. The shared templates can then append token parameters consistently with `&` instead of guessing whether the separator should be `?` or `&`.

Current presentation/sentinel parameters are:

- Corralio: `?brand=corralio`
- RI clean signup/admin-resend callbacks: `?auth_callback=1`
- TI and existing resend/claim flows: their existing safe `?next=...` parameter

`brand` and `auth_callback` are non-authoritative. They must never control authorization, identity, ownership, entitlements, or privileged behavior. Application-created redirect URLs must never contain `token_hash`, `code`, or another authentication secret.

This invariant is scoped to Confirm Signup and Magic Link. Corralio Recovery has the separate query-bearing contract below. Invitation, email-change, and OAuth flows retain their existing contracts.

## Required template fallback

Supabase may invoke a template without a custom `RedirectTo`. Both shared templates must default to the trusted `.ConfirmationURL` and construct a custom token-hash callback only when `.RedirectTo` is present.

Confirm Signup:

```gotemplate
{{ $redirectTo := .RedirectTo }}
{{ $confirmUrl := .ConfirmationURL }}

{{ if $redirectTo }}
  {{ $confirmUrl = printf "%s&token_hash=%s&type=email" $redirectTo .TokenHash }}
{{ end }}
```

Magic Link:

```gotemplate
{{ $redirectTo := .RedirectTo }}
{{ $signInUrl := .ConfirmationURL }}

{{ if $redirectTo }}
  {{ $signInUrl = printf "%s&token_hash=%s&type=email" $redirectTo .TokenHash }}
{{ end }}
```

Both token-hash templates use `type=email`. The handlers retain compatibility with existing `magiclink` values, but new shared Confirm Signup and Magic Link templates should emit `email` consistently.

Do not append a hard-coded `next` in a template. The application-supplied `RedirectTo` owns any safe relative post-auth destination.

## Corralio branding detection

The global templates use exact equality, not a nonstandard `contains` helper:

```gotemplate
{{ $isCorralio := or
  (eq $redirectTo "http://localhost:3002/auth/confirm?brand=corralio")
  (eq $redirectTo "https://corralio.com/auth/confirm?brand=corralio")
}}
```

Add a `https://www.corralio.com/auth/confirm?brand=corralio` equality branch only while that hostname is an intentionally supported auth origin.

The global subjects are neutral because Supabase applies one subject per template:

- Confirm Signup: `Confirm your account`
- Magic Link: `Your secure sign-in link`

The body may render Corralio content when `$isCorralio` is true and the existing shared TI/RI fallback otherwise.

Complete dashboard-ready reference bodies are stored at:

- `docs/templates/supabase-confirm-signup-shared.html`
- `docs/templates/supabase-magic-link-shared.html`

These are manual configuration references, not automatically deployed Supabase configuration.

## Corralio Recovery contract

Corralio password recovery is requested by the server with a trusted, server-only `CORRALIO_SITE_URL`. The application passes this callback to Supabase:

```text
{CORRALIO_SITE_URL}/auth/confirm?brand=corralio&flow=recovery
```

`CORRALIO_SITE_URL` must be an absolute HTTP(S) origin with no path, query, fragment, or credentials. It is never derived from `request.url`, `Host`, forwarded-host headers, browser input, or a `NEXT_PUBLIC_*` variable. Missing or invalid configuration fails closed instead of falling back to TI, RI, Supabase Site URL, or `0.0.0.0`.

The shared Recovery template appends `&token_hash=...&type=recovery` only when `RedirectTo` exists and otherwise retains `.ConfirmationURL`. It identifies Corralio only through exact equality with the local and canonical production callbacks above. The `brand` and `flow` values are non-authoritative; the token and authenticated recovery session provide authorization.

The complete manual dashboard reference is `docs/templates/supabase-recovery-shared.html`. Use the neutral global Recovery subject `Reset your password`. The non-Corralio branch preserves the existing TI behavior. RI currently sends its own product-branded recovery email through its existing server route and does not depend on this global Recovery body; that path must remain unchanged.

## Application handlers

Callback routes:

- TI: `apps/ti-web/app/auth/confirm/route.ts`
- RI: `apps/referee/app/auth/confirm/route.ts`
- Corralio: `apps/corralio/app/auth/confirm/route.ts`

They read their supported `code` or `token_hash`/`type` values and ignore the presentation/sentinel parameters. TI and RI preserve safe-relative `next` validation; Corralio returns to its app root. Unknown harmless query parameters do not grant access or change verification semantics.

## Supabase manual configuration

Repository changes do not update the Supabase dashboard. After deploying compatible application callbacks, manually update the applicable global templates and verify that the redirect allowlist covers the intended callback paths, including:

- `http://localhost:3002/auth/confirm`
- `https://corralio.com/auth/confirm`
- the existing TI and RI callback entries
- `https://www.corralio.com/auth/confirm` only if that hostname remains supported

Path or wildcard allowlist entries normally cover query-string variants; do not add query-specific entries without evidence that the project configuration requires them.

## Manual regression checks

After code and dashboard templates are both live, exercise:

- Corralio new-account confirmation and existing-account Magic Link
- TI signup confirmation, resend, Magic Link, and `next` preservation
- RI signup confirmation and admin resend
- Corralio password recovery and same-origin reset-page handoff
- TI password recovery fallback
- missing, invalid, expired, and already-used links
- a no-`RedirectTo` template invocation, which must continue through `.ConfirmationURL`

No branding or sentinel parameter may change authorization behavior.
