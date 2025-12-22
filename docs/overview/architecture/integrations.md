# Integrations

## Supabase
- Purpose: Auth/session, database reads/writes, admin service operations.
- Config: `apps/referee/lib/supabaseServer.ts`, `lib/supabaseClient.ts`, `lib/supabaseAdmin.ts`, `middleware.ts`.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` (scripts).

## Sentry
- Purpose: Error monitoring/tracing.
- Config: `apps/referee/instrumentation.*.ts`, `@sentry/nextjs`.
- Env: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, `SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`.

## PostHog
- Purpose: Client analytics.
- Config: `apps/referee/providers/PostHogProvider.tsx`.
- Env: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.

## Google Places
- Purpose: Location autocomplete/search (schools/tournaments).
- Usage: `apps/referee/lib/googlePlaces.ts`.
- Env: `GOOGLE_PLACES_API_KEY`.

## Google Sheets (legacy/scripts)
- Purpose: Sheet access for feedback/scripts.
- Usage: `apps/referee/lib/googleSheets.ts`, `scripts/createFeedbackSheet.ts`.
- Env: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_TAB_NAME`.

## Email (Resend)
- Purpose: Review alerts/notifications.
- Usage: `apps/referee/lib/email.ts`.
- Env: `RESEND_API_KEY`, `REVIEW_ALERT_FROM`, `REVIEW_ALERT_EMAILS`.

## GitHub Issues (optional feedback)
- Purpose: Create issues from feedback.
- Usage: `apps/referee/app/api/feedback/route.ts`.
- Env: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`.

## Cron/Tasks
- Purpose: Protected cron endpoints.
- Usage: `apps/referee/app/api/cron/whistles/route.ts`.
- Env: `CRON_SECRET` (or `RI_CRON_SECRET` used in scripts).
