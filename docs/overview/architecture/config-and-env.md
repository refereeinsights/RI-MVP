# Config & Environment

## Next.js configs
- `apps/referee/next.config.js`: default export `{}` (no custom config noted).
- `apps/corp/next.config.js`: default.
- `apps/ti-web/next.config.js`: default.
- `apps/referee/middleware.ts`: Supabase middleware wiring (injects client).
- `apps/referee/vercel.json`: present; review for deploy-specific overrides (not parsed here).

## Headers/redirects
- None defined in code reviewed (no custom headers/redirects found in next.config.js).

## Deployment assumptions
- Each app is deployed as its own Vercel project with root directories:
  - `apps/referee`
  - `apps/corp`
  - `apps/ti-web`
- Build: `npm run build`; Output: `.next`; Install: `npm install`.

## Environment variables (names only)

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL` (scripts)

### Auth/session
- `NEXT_PUBLIC_SITE_URL` (used in logout redirect)

### Monitoring / analytics
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_TRACES_SAMPLE_RATE`
- `SENTRY_REPLAYS_SESSION_SAMPLE_RATE`
- `SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`

### Google services
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_TAB_NAME`

### Email
- `RESEND_API_KEY`
- `REVIEW_ALERT_FROM`
- `REVIEW_ALERT_EMAILS`

### Feedback / GitHub
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`

### Cron / scripts
- `CRON_SECRET`
- `RI_CRON_SECRET`
- `RI_API_BASE_URL`
- `DRY_RUN`
- `REVIEW_MIGRATION_BATCH`
- `SEED_REVIEW_USER_ID`

### Admin / credentials (tests/scripts)
- `RI_ADMIN_EMAIL`
- `RI_ADMIN_PASSWORD`
- `RI_TARGET_URL` (smoke)
- `SAMPLE_URL` (scripts)
