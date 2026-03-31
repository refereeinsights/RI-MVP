# TI Scheduled Tournament Alerts (v1)

## What this is
User-configurable scheduled email alerts for upcoming tournaments near a ZIP code.

## Lead time model (v1)
- Fixed planning offset: `21` days
- Match window (UTC dates):
  - `start_date BETWEEN (utc_today + 21 days) AND (utc_today + 21 + days_ahead days)`
- `start_offset_days` is **not** exposed in the UI for v1.

## Database
Migration: `supabase/migrations/20260331_ti_user_tournament_alerts.sql`
Migration: `supabase/migrations/20260331_ti_tournament_alert_send_logs.sql`

Tables:
- `public.user_tournament_alerts`
  - RLS: users can read/write only their own rows (`auth.uid() = user_id`)
  - Constraints:
    - `radius_miles > 0`
    - `days_ahead > 0`
    - `cadence in ('weekly','daily')`
  - `updated_at` is maintained via `public.set_updated_at()` trigger (if present)

Support:
- Uses `public.zip_centroids` to look up ZIP → (lat,lng) (no external geocoding at send time).
- Uses `public.tournaments_public` as the canonical tournament listing surface.
- `public.ti_tournament_alert_send_logs` stores `sent`/`error` outcomes for admin KPIs and debugging, including `recipient_email` and an `error_message` when applicable.

## Entitlements (v1)
Tier resolution comes from TI’s existing helpers (`apps/ti-web/lib/entitlements*.ts`).

- Insider:
  - 1 active alert
  - weekly cadence only
  - radius ≤ 50 miles
  - `days_ahead ≤ 14` (effective window: 21 → 35 days)
- Weekend Pro:
  - up to 5 active alerts
  - weekly or daily cadence
  - radius ≤ 250 miles
  - `days_ahead ≤ 60` (effective window: 21 → 81 days)

## UI
- Embedded under TI account:
  - `/account` links to `/account/alerts`
  - Page: `apps/ti-web/app/account/alerts/page.tsx`

## Sending + scheduling
Approach: Vercel Cron → Next.js route handler → Resend.

- Cron route:
  - `apps/ti-web/app/api/cron/tournament-alerts/route.ts`
  - Protected by `CRON_SECRET` (query param `token` or header `x-cron-secret`)

- Vercel cron config:
  - `apps/ti-web/vercel.json`
  - The `path` includes a long token value; set `CRON_SECRET` to the same value in the TI Vercel project env.

### Overlapping runs
To prevent overlapping cron runs, the job acquires a lightweight DB lock:
- Table: `public.cron_job_locks`
- RPC: `public.acquire_cron_job_lock(p_key, p_ttl_seconds)` / `public.release_cron_job_lock(p_key)`
- Only `service_role` can execute these RPCs.

## Email delivery
- Resend is used via `apps/ti-web/lib/email.ts` (`RESEND_API_KEY`).
- Recipient email is always the user’s Supabase auth email (no separate email field in v1).
- Sends up to 10 tournaments ordered by soonest `start_date`.
- Due logic (UTC):
  - `daily`: due if `last_sent_at` is null or older than 24 hours
  - `weekly`: due if `last_sent_at` is null or older than 7 days (rolling; no fixed weekday in v1)
- If a tournament lacks a valid slug, it’s skipped in v1.
- If results are unchanged (hash match), sending is skipped and `last_sent_at` is **not** updated.

## Env vars
Required:
- `RESEND_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (must match the token included in `apps/ti-web/vercel.json`)

Optional (existing defaults are used if not set):
- `TI_OUTREACH_FROM`, `REVIEW_ALERT_FROM`, `EMAIL_REPLY_TO`

## Admin KPIs
- TI admin surface: `apps/referee/app/admin/ti/page.tsx`
- KPIs pull from:
  - `public.user_tournament_alerts` (configured alerts)
  - `public.ti_tournament_alert_send_logs` (sent/error counts; includes recipient email on errors)
