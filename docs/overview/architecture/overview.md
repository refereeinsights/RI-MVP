# Architecture Overview

## System summary
- Monorepo using Next.js App Router (Next 14.2.x, React 18) with multiple apps under `apps/`.
- Primary apps:
  - `apps/referee` (RefereeInsights: UI + API for referee and tournament flows)
  - `apps/corp` (Tournyx corporate site)
  - `apps/ti-web` (TournamentInsights holding page)
- Shared data services: Supabase (auth, DB, admin SDK usage). Client-side analytics and error monitoring via PostHog and Sentry. Optional GitHub issue creation from feedback.

## Module responsibilities
- `apps/referee/app`: Pages and API routes for auth, tournaments, schools, reviews, feedback, admin login, gear, policies.
- `apps/referee/lib`: Supabase clients (server, client, admin), email (Resend), Google Places/Sheets helpers, tournament ingestion utilities.
- `apps/referee/providers`: Analytics providers (PostHog).
- `apps/referee/middleware.ts`: Supabase middleware wiring.
- `apps/corp/app`: Static marketing page for Tournyx.
- `apps/ti-web/app`: Static “coming soon”/overview page for TournamentInsights.
- `apps/*/public`: Logos and static assets per site.

## Data flow (high level)
- Client (pages in `/app`) → API routes in `/app/api` (feedback, reviews, search, cron) → Supabase (service role for writes, anon for reads where applicable). Some feedback also optionally raised as GitHub issues.
- Analytics: client events via PostHog; errors via Sentry (DSN + sampling envs).
- Email: Resend for review alerts (configured in `lib/email.ts`).
- External data: Google Places (location autocomplete) and Google Sheets (legacy/scripts) used from server scripts/helpers.

## Homepage/content locations
- RefereeInsights: `apps/referee/app/page.tsx` (+ tournament/school insights pages).
- Tournyx corp: `apps/corp/app/page.tsx`.
- TournamentInsights holding page: `apps/ti-web/app/page.tsx`.

## Local development (per app)
- RefereeInsights: `npm run dev --workspace referee-app`
- Corp: from `apps/corp`: `npm run dev`
- TI: from `apps/ti-web`: `npm run dev`

## Known gaps / TODOs
- Permissions/role requirements for many routes are inferred; enforce/verify RLS in Supabase.
- Legacy Google Sheets helpers remain; confirm deprecation if Supabase-only.
- DS_Store files should stay out of git (gitignore clean-up).
