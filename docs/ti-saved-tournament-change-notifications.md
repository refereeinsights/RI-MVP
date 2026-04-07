# TI Saved Tournament Change Notifications (v1)

## What this is
User opt-in email notifications when **public** tournament details change for a tournament they saved.

## Database
Migration: `supabase/migrations/20260331_ti_saved_tournament_change_notifications.sql`

Adds columns on `public.ti_saved_tournaments`:
- `notify_on_changes` (user-controlled)
- `last_notified_at`, `last_notified_hash`, `last_notified_critical_hash` (job-controlled)
- `last_notified_snapshot` (job-controlled; used to summarize “what changed”)

RLS:
- Users can read/write only their own rows (`auth.uid() = user_id`).
- Update policy is required so users can toggle `notify_on_changes`.
- Postgres privileges are tightened so authenticated users can only update the `notify_on_changes` column.

## Public-field protections (v1)
Change detection hashes a “public snapshot” from `public.tournaments_public` using only:
- `id`, `slug`, `name`, `sport`, `city`, `state`, `start_date`, `end_date`, `official_website_url`

Explicitly excluded from triggering notifications in v1:
- venue link/discovery changes (e.g. `tournament_venues` rows)
- Owl’s Eye / Quick Check analytics updates
- internal/admin-only fields and enrichment metadata

## Spam controls (v1)
- Per-user cooldown: at most 1 email / 24h
- Per-tournament cooldown: at most 1 email / 7 days unless a “critical snapshot” changed
- Batched digest: up to 10 tournaments per email

Critical snapshot fields (bypass per-tournament cooldown):
- `slug`, `name`, `city`, `state`, `start_date`, `end_date`

## Scheduling
Approach: Vercel Cron → Next.js route handler → Resend.

- Cron route:
  - `apps/ti-web/app/api/cron/saved-tournament-changes/route.ts`
  - Protected by `CRON_SECRET` (query param `token` or header `x-cron-secret`)
  - Overlap guard via DB lock (`public.acquire_cron_job_lock`)

- Vercel cron config:
  - `apps/ti-web/vercel.json`

## Email delivery
- Uses TI Resend helper (`apps/ti-web/lib/email.ts`).
- Recipient email comes from `ti_users.email`.

## Env vars
Required:
- `RESEND_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
