# TI Weekend Planner — Production-Safe UAT (Production-Only DB)

TournamentInsights currently has a **production-only** Supabase database environment (no staging). This document defines a safe UAT approach for validating TI Weekend Planner™ features **without polluting or damaging real production data**.

This is **not** a feature spec. It is a **UAT framework**: accounts, naming conventions, fixtures, hosted URLs, and cleanup.

## Rules (non-negotiable)

- Use **dedicated UAT accounts** only.
- UAT data must be owned by those UAT user IDs.
- Cleanup must be **scoped by UAT user UUIDs** (not by name/prefix matching).
- Do **not** insert fake venues or tournaments into production.
- Do **not** add production bypass routes or dev-only fixture endpoints in production.
- Do **not** weaken ICS URL validation (no `file://`, no localhost/private ranges).

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

Additional production-only checks to add during UAT:
- Cross-user isolation using UAT User B (User A data must not be visible).
- Cleanup run only against UAT user UUIDs.
