# Public Beta Smoke Test (TI + RI)

This smoke suite validates public-beta auth/join/tier-gating paths in ~60 minutes.

## Coverage

TI (`tests/smoke/ti-auth-join-gating.spec.ts`):

1. Logged-out `/venues/reviews` redirects to `/login?returnTo=/venues/reviews`.
2. Logged-in Explorer is gated from `/venues/reviews` and redirected to `/account?notice=...`.
3. Logged-in Insider can access `/venues/reviews` and sees the review flow headline.
4. `/join?code=...` preserves code through login and returns to `/join?code=...`.
5. `/join` (without code) renders a friendly missing-code state.

RI (`tests/smoke/ri-auth-join-gating.spec.ts`):

1. Logged-out `/account` shows login prompt.
2. Logged-in user can access `/account`.

## Prerequisites

1. Start local servers (or point to deployed environments):
   - TI at `PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:3001`)
   - RI at `PLAYWRIGHT_RI_BASE_URL` (default `http://127.0.0.1:3000`)
2. Copy `.env.local.example` values into your local env.
3. Ensure Supabase service role vars are available for seeding.

## Seed deterministic test users

```bash
TI_SMOKE_SEED_ALLOW=true npm run seed:smoke:users
```

This creates/updates:

- `explorer_test@example.com` (Explorer)
- `insider_test@example.com` (Insider)
- `weekendpro_test@example.com` (Weekend Pro)

All are created with confirmed email so tests never depend on external email verification.

## Run smoke tests

Headless:

```bash
npm run test:smoke
```

Headed:

```bash
npm run test:smoke:ui
```

## Required env vars

- `PLAYWRIGHT_BASE_URL`
- `PLAYWRIGHT_RI_BASE_URL`
- `TI_SMOKE_EXPLORER_PASSWORD`
- `TI_SMOKE_INSIDER_PASSWORD`
- `TI_SMOKE_WEEKENDPRO_PASSWORD`
- `TI_SMOKE_JOIN_CODE` (optional, defaults to `VALID`)
- `RI_SMOKE_EMAIL` and `RI_SMOKE_PASSWORD` when RI auth is on a different Supabase project than TI

For user seeding:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TI_SMOKE_SEED_ALLOW=true`

## Expected output

- Playwright reports `7 passed` (5 TI + 2 RI) when all flows are healthy.
- Failing assertions point to exact route/redirect regressions.
