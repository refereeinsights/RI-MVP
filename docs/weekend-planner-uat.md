# TI Weekend Planner — Production-Safe UAT (Production-Only DB)

TournamentInsights currently has a **production-only** Supabase database environment (no staging). This document defines a safe UAT approach for validating TI Weekend Planner™ features **without polluting or damaging real production data**.

This is **not** a feature spec. It is a **UAT framework**: accounts, naming conventions, fixtures, hosted URLs, and cleanup.

Primary automated UAT runner: `CLAUDE.md` (Claude Desktop). Keep `CLAUDE.md` and this doc aligned.
Current product snapshot (post Stage 2.7): `docs/weekend-planner-current-state.md`.
Stage 2.9A prompt (docs-first): `docs/prompts/ti-planner-stage-2.9a-ics-source-identity-audit-sports-family-uat-prep.md`.

## Rules (non-negotiable)

- Use **dedicated UAT accounts** only.
- UAT data must be owned by those UAT user IDs.
- Cleanup must be **scoped by UAT user UUIDs** (not by name/prefix matching).
- Do **not** insert fake venues or tournaments into production.
- Do **not** add production bypass routes or dev-only fixture endpoints in production.
- Do **not** weaken ICS URL validation (no `file://`, no localhost/private ranges).

## Quick start (Smoke UAT)

Use the **Smoke UAT (fast pass)** checklist in `CLAUDE.md` first. If Smoke UAT fails, stop and fix regressions before running deeper UAT.

## UAT accounts

Recommended UAT accounts:

- `uat+planner-a@tournamentinsights.com` (normal usage validation)
- `uat+planner-b@tournamentinsights.com` (cross-user isolation validation)

Create these users **manually** via the existing Supabase/Auth/admin process (do not create via migrations).

Store credentials in the team’s secure credential manager. Do not use personal or customer accounts for UAT.

## UAT naming convention (human visibility only)

Use the prefix:

`[UAT Planner]`

Examples:
- `[UAT Planner] Saturday Game 1`
- `[UAT Planner] 12U Tigers Calendar`

This prefix is **not** used for cleanup. Cleanup is user-id scoped only.

## Stage 2.9 — Sports Family benchmark (real-platform UAT prep)

Stage 2.9 is the real-world ICS compatibility pass. Stage 2.9A is docs-only scaffolding; Stage 2.9B is where you run real platform calendar feed tests.

Compatibility matrix shell (fill in during Stage 2.9B):
- `docs/qa/ti-planner-ics-uat.md`

### Account requirement (important)

If you plan to connect **more than 1** calendar feed (example: 12 team schedules), you need a **verified `weekend_pro`** UAT account.

Why:
- `insider` is enforced at **1** ICS source on the import route (`calendar_feed_limit_reached`).
- `explorer` cannot connect calendars (and unverified explorers are blocked).

### Sports Family checklist (Stage 2.9B)

PII-safe setup conventions:
- Team names start with `TI Test ...`
- Event titles start with `TI Feed Test ...`
- People use last name `Sports` only

Test pattern per team schedule:
1) Add **Practice A** (baseline create)
2) Add **Game B** (control)
3) Add **Team Event C** (used for cancel/delete validation)

Steps:
1) Create platform accounts/teams/schedules using dedicated UAT identities only.
2) Capture the calendar subscription/export link (ICS/webcal/https) for each schedule.
3) Import each feed into Weekend Planner as a private connected calendar source.
4) Validate baseline import (events present, “Synced from calendar” labeling, no raw source identifiers in UI).
5) Update Practice A (move by ~30 minutes; change location/field if available).
6) Refresh feed and document upsert/update behavior.
7) Cancel/delete Team Event C in the source platform.
8) Refresh feed and document canceled/missing behavior (must not hard-delete source-linked events).
9) Add local overlays in Weekend Planner:
   - notes
   - venue link
   - suppressions / keep-separate dismissals
   - merges where appropriate
10) Refresh again and confirm overlays survive.
11) Fill in the platform compatibility matrix rows in `docs/qa/ti-planner-ics-uat.md`.

Reminder constraints:
- Do not use OAuth.
- Do not store platform credentials in the product.
- Do not scrape.
- Use public/subscription calendar links only.

## ICS fixtures (repo + hosting)

Repo fixtures live under:

- `apps/ti-web/lib/planner/__fixtures__/test-calendar-initial.ics`
- `apps/ti-web/lib/planner/__fixtures__/test-calendar-updated.ics`
- `apps/ti-web/lib/planner/__fixtures__/test-calendar-invalid.ics`
- `apps/ti-web/lib/planner/__fixtures__/not-a-calendar.txt`

Notes:
- Fixture events are fake and prefixed with `[UAT Planner]`.
- The import window is implemented in `apps/ti-web/lib/planner/ics-import.ts` (past/future day cutoffs).
- Because `.ics` fixtures use static dates, they will drift out of the import window over time.

Fixture authored: **2026-05-27** (America/Los_Angeles). If the “past window” event drifts, update the fixture dates and re-host.

### Hosted fixture URLs (REQUIRED before production UAT)

Production import only accepts **HTTP/HTTPS URLs**, so UAT needs hosted fixture files.

Decide one controlled hosting location and record the exact URLs here before running UAT:

- Initial fixture: `https://www.tournamentinsights.com/uat-fixtures/planner/test-calendar-initial.ics`
- Updated fixture: `https://www.tournamentinsights.com/uat-fixtures/planner/test-calendar-updated.ics`
- Invalid fixture: `https://www.tournamentinsights.com/uat-fixtures/planner/test-calendar-invalid.ics`
- Not-a-calendar text: `https://www.tournamentinsights.com/uat-fixtures/planner/not-a-calendar.txt`

Preferred options:
- TI production site static hosting (e.g. `https://www.tournamentinsights.com/uat-fixtures/planner/...`) if available, or
- a controlled S3/CloudFront bucket dedicated to UAT fixtures, or
- a controlled Vercel static deployment that hosts only fixture files.

Do not add production API routes to serve fixtures.

## Production rollout checklist (REQUIRED before running UAT)

Because UAT runs against **production**, confirm these are true before running the planner ICS import/refresh tests:

1) **Canonical route**: `/weekend-planner` is the canonical planner entrypoint.
2) **Compatibility redirect**: `/planner` **redirects** to `/weekend-planner` (query params preserved where practical).
3) **Stage 2 migrations applied in prod** (or ICS import may 500):
   - `supabase/migrations/20260526_ti_planner_stage2_sources_unique_url.sql`
   - `supabase/migrations/20260526_ti_planner_stage2_ics_unique_uid.sql`
4) **Planner search surfaces applied in prod** (or venue/tournament search may return empty):
   - `supabase/migrations/20260527_ti_planner_public_search_surfaces.sql`
5) **Hosted fixtures reachable over HTTPS**:
   - Initial: `https://www.tournamentinsights.com/uat-fixtures/planner/test-calendar-initial.ics`
   - Updated: `https://www.tournamentinsights.com/uat-fixtures/planner/test-calendar-updated.ics`
   - Invalid: `https://www.tournamentinsights.com/uat-fixtures/planner/test-calendar-invalid.ics`
   - Not-a-calendar: `https://www.tournamentinsights.com/uat-fixtures/planner/not-a-calendar.txt`

## Cleanup (production-safe SQL templates)

Cleanup must target the UAT users’ auth UUIDs only.

Safe process:
1. Look up UAT user IDs in `auth.users` by email.
2. Confirm the IDs match the UAT accounts.
3. Delete planner-owned records for those IDs only.
4. Do not delete venues, tournaments, profiles, or auth users.

SQL template (replace UUID placeholders only after verification):

```sql
begin;

-- REQUIRED: verify the IDs before substituting them below
select id, email
from auth.users
where email in (
  'uat+planner-a@tournamentinsights.com',
  'uat+planner-b@tournamentinsights.com'
);

-- Replace these with actual verified UUIDs:
-- '<UAT_USER_A_UUID>'::uuid
-- '<UAT_USER_B_UUID>'::uuid

delete from planner_event_venue_matches
where event_id in (
  select id
  from planner_events
  where user_id in (
    '<UAT_USER_A_UUID>'::uuid,
    '<UAT_USER_B_UUID>'::uuid
  )
);

delete from planner_events
where user_id in (
  '<UAT_USER_A_UUID>'::uuid,
  '<UAT_USER_B_UUID>'::uuid
);

delete from planner_event_sources
where user_id in (
  '<UAT_USER_A_UUID>'::uuid,
  '<UAT_USER_B_UUID>'::uuid
);

delete from planner_calendar_feeds
where user_id in (
  '<UAT_USER_A_UUID>'::uuid,
  '<UAT_USER_B_UUID>'::uuid
);

delete from planner_user_preferences
where user_id in (
  '<UAT_USER_A_UUID>'::uuid,
  '<UAT_USER_B_UUID>'::uuid
);

delete from planner_weekends
where user_id in (
  '<UAT_USER_A_UUID>'::uuid,
  '<UAT_USER_B_UUID>'::uuid
);

commit;
```

## Manual UAT checklists

- Stage 2 ICS checklist: `docs/qa/ti-planner-ics-uat.md`
- Stage 2.1 polish: verify “Find venue” works for events without a linked venue and that ICS refresh preserves user-linked `venue_id` (see the venue-linking steps in the Stage 2 checklist).
- Route note: `/weekend-planner` is the canonical planner entrypoint; `/planner` should redirect to `/weekend-planner` during consolidation.

## Stage 2.4C (UAT) — Duplicate suggestions + Keep separate (no merge yet)

Use existing hosted fixtures as the overlap stand-in:
- Initial fixture: `https://www.tournamentinsights.com/uat-fixtures/planner/test-calendar-initial.ics`
- Updated fixture: `https://www.tournamentinsights.com/uat-fixtures/planner/test-calendar-updated.ics`

Checklist:
- Import both fixtures as separate sources (two synced calendars).
- In the planner list, confirm “Possible duplicate from another calendar” suggestions appear only within the selected lens/range (Weekend vs Season).
- High-confidence suggestions show a disabled “Merge (Recommended)” placeholder; low confidence shows disabled “Merge…”.
- Click “Keep separate” for a suggestion; it should disappear immediately.
- Reload `/weekend-planner`; confirm the dismissed suggestion does not reappear.
- Confirm both events remain visible (Keep separate dismisses only; it does not hide events).

## Stage 2.4E (UAT) — Merge confirmation UI (no one-click merge)

Prereq: Use the same overlap stand-in fixtures from Stage 2.4C.

Checklist:
- In the planner list, find a “Possible duplicate from another calendar” suggestion.
- Click **Merge (Recommended)** or **Review merge…**.
- Confirm a **Review duplicate merge** modal opens.
- Modal must not display raw IDs, source URLs, or `source_event_uid`.
- If there are conflicting fields (title/time/location/notes), confirm winner selectors appear.
- Click **Cancel**:
  - modal closes
  - no events are hidden
  - no new manual event is created
- Re-open the modal and confirm any winner selections were cleared/reset.
- Click **Create merged event**:
  - merge does not happen until confirmation
  - after success, the planner list refreshes
  - a new **manual** event appears (canonical merged event)
  - eligible imported originals are hidden (suppressed via `merged_duplicate`; source rows are not deleted)
  - any API warnings are displayed safely (manual originals may remain visible)
- Verify Keep separate still works and does not call merge.
- If the planner shows a truncation disclosure (showing only first N events), confirm it remains visible and the modal shows the loaded-only reminder.

Additional production-only checks to add during UAT:
- Cross-user isolation using UAT User B (User A data must not be visible).
- Cleanup run only against UAT user UUIDs.

## Stage 2.5 (UAT) — Season pagination + loaded-only disclosure

Goal: confirm Season view is bounded, supports **Load more**, and duplicate suggestions remain honest about loaded scope.

Checklist:
- Switch to **Season** lens and choose a wide range (6mo or 12mo).
- If there are more events than the page limit:
  - Confirm the disclosure appears:
    - `Showing {loadedCount} loaded events in this range. Duplicate suggestions only consider loaded events. Load more to check additional events.`
  - Confirm a **Load more events** button appears.
- Click **Load more events**:
  - Events append (no duplicates).
  - Sort order remains stable (by start time).
  - Duplicate suggestions refresh based on the newly loaded set.
- When all events for the selected range are loaded:
  - Confirm the disclosure switches to:
    - `All events in this range are loaded. Duplicate suggestions consider all events in this range.`
- Regression:
  - Keep separate still dismisses suggestions only.
  - Merge still requires explicit confirmation.
  - Suppressed merged ICS originals remain hidden after refresh.
