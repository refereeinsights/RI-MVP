# TournamentInsights Weekend Planner Activation Repair

Date: 2026-07-24  
Scope: Phase 2 implementation from `docs/reports/ti-weekend-planner-activation-phase1-audit-2026-07-23.md`

Update: 2026-07-27
- Follow-up patch added a canonical redirect on `/weekend/[slug]` so the visible entry-route URL always includes `planner_session_id`.
- This closes the browser verification gap where the planner session was generated and propagated downstream but was not visible on the entry-route address bar.

## Executive summary

- Implemented a narrow planner activation repair centered on one stable `planner_session_id`
- Canonical entry route is `/weekend/[slug]`
- Canonical loaded planner route is `/weekend-planner`
- Tournament and venue context now survive the tournament-detail → auth → planner handoff
- Planner-origin lodging and group-request writes now preserve original source context instead of collapsing it into `sc=tournamentinsights`
- Legacy events remain in place; new canonical events were added alongside them

## Root causes proven

- `weekend_planner_viewed` previously measured route exposure rather than true planner entry
- Auth links collapsed to `returnTo=/weekend-planner`, dropping tournament/venue context
- Planner acquisition context was lost or rewritten during analytics persistence
- Planner-origin lodging and group-request writes overwrote source with `sc=tournamentinsights`

## Exact implementation scope

- Added shared planner session/context helpers
- Added canonical planner funnel events
- Preserved planner context through auth return URLs
- Normalized planner event persistence to use current page type separately from entry page type
- Propagated planner attribution into `/api/lodging/search` and `/api/lodging/group-request`
- Added repeatable SQL and focused helper tests

## Files modified

- `apps/ti-web/app/tournaments/[slug]/TournamentPlanningCtasClient.tsx:1`
- `apps/ti-web/app/tournaments/SoftPlannerCtaClient.tsx:1`
- `apps/ti-web/app/weekend/[slug]/page.tsx:1`
- `apps/ti-web/app/weekend/[slug]/SaveWeekendPlanClient.tsx:1`
- `apps/ti-web/app/weekend/[slug]/WeekendPlanViewTracker.tsx:1`
- `apps/ti-web/app/weekend-planner/page.tsx:1`
- `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx:1`
- `apps/ti-web/app/weekend-planner/WeekendPlannerEntryCtas.tsx:1`
- `apps/ti-web/app/_components/planner/PlannerClient.tsx:1`
- `apps/ti-web/app/book-travel/BookTravelTeamBlockForm.tsx:1`
- `apps/ti-web/app/api/analytics/route.ts:1`
- `apps/ti-web/app/api/lodging/search/route.ts:1`
- `apps/ti-web/app/api/lodging/group-request/route.ts:1`
- `apps/ti-web/lib/tiAnalyticsEvents.ts:1`

## New files

- `apps/ti-web/lib/planner/plannerSession.ts:1`
- `apps/ti-web/lib/planner/plannerPageContext.ts:1`
- `apps/ti-web/lib/planner/plannerSession.test.ts:1`
- `apps/ti-web/lib/planner/plannerPageContext.test.ts:1`
- `apps/ti-web/lib/returnTo.test.ts:1`
- `scripts/analysis/ti_weekend_planner_activation_funnel.sql:1`
- `supabase/migrations/20260724_ti_weekend_planner_activation_phase2.sql:1`

## Migrations created

- `supabase/migrations/20260724_ti_weekend_planner_activation_phase2.sql`
  - adds `planner_session_id`
  - adds entry/current planner attribution fields to `lodging_search_session`
  - adds planner-session and entry-page indexes

## Canonical event definitions

- `weekend_planner_entry_viewed`
  - fires on `/weekend/[slug]`
  - marks the canonical start of the repaired funnel
- `weekend_planner_auth_gate_viewed`
  - fires when planner-flow auth is required
- `weekend_planner_auth_started`
  - fires on real auth-start clicks
- `weekend_planner_auth_completed`
  - fires once when the authenticated planner resumes with the same planner session
- `weekend_planner_loaded`
  - remains the canonical real planner initialization event on `/weekend-planner`
- `weekend_planner_first_action`
  - fires once per planner session on the first meaningful existing action

## Canonical storage rules

- Client funnel events persist through `/api/analytics` into `ti_map_events`
- Planner-origin lodging and group-request starts persist through `lodging_search_session`
- Legacy events remain for compatibility
- Reporting should use canonical planner events for the repaired funnel and avoid double-counting legacy compatibility events

## `planner_session_id` lifecycle

1. created or preserved on `/weekend/[slug]`
2. embedded into planner hub and auth return URLs
3. preserved through sign-in/sign-up flows via `returnTo`
4. observed again on `/weekend-planner`
5. propagated into planner-origin lodging and group-request calls

## Acquisition-context model

- Preserves:
  - `entry_source`
  - `entry_page_type`
  - `entry_path`
  - `entry_placement`
  - `current_page_type`
  - `current_page_path`
- `sc` remains available for compatibility but is no longer treated as the canonical original source

## Page-type model

- `tournament`
- `planner_entry`
- `planner`
- `auth`
- `other`

Persistence now prefers `current_page_type` instead of rewriting everything to `weekend_planner`.

## Auth-return behavior

- Planner-flow auth links now return to a planner-resume URL carrying:
  - `planner_session_id`
  - tournament context
  - venue context
  - planner auth completion flag
- This preserves the original tournament-detail intent through auth

## First-run behavior

- `/weekend/[slug]` remains the rich tournament-aware entry surface
- `/weekend-planner` receives preserved tournament context after auth
- For eligible saved-planning users, the planner hub ensures the weekend plan exists for the resumed tournament context

## First-action definition

Current implemented first-action triggers:

- `save_weekend_plan`
- `manual_event_created`
- `team_hotel_clicked`
- `view_toggle`

`view_toggle` remains the weakest fallback and should be replaced by a stronger planner-native action if future product changes make that practical.

## Deduplication rules

- canonical entry: once per `planner_session_id`
- canonical auth gate: once per `planner_session_id`
- canonical auth completed: once per `planner_session_id`
- canonical first action: once per `planner_session_id`
- dedupe is implemented with stable session-scoped client markers instead of timestamp-only matching

## Tests run

- `npx tsc -p apps/ti-web/tsconfig.json --noEmit` → pass
- `node --import tsx --test apps/ti-web/lib/planner/plannerSession.test.ts apps/ti-web/lib/planner/plannerPageContext.test.ts apps/ti-web/lib/returnTo.test.ts` → pass

## Local verification results

Verified locally:

- helper round-trip for planner session context
- canonical page-type classification
- safe `returnTo` preservation for planner-resume URLs
- project typecheck

Not fully verified locally:

- end-to-end auth completion through browser
- controlled tournament-detail click → auth → planner load trace
- production analytics rows

## SQL created

- `scripts/analysis/ti_weekend_planner_activation_funnel.sql`
  - funnel counts and rates
  - full chain by `planner_session_id`
  - duplicate diagnostics
  - missing-context diagnostics
  - planner-origin lodging/group source-preservation diagnostics

## Deployment order

1. apply `supabase/migrations/20260724_ti_weekend_planner_activation_phase2.sql`
2. deploy application code
3. run local/browser verification
4. run `scripts/analysis/ti_weekend_planner_activation_funnel.sql` against post-deploy traffic

## Rollback steps

1. roll back application code
2. leave additive schema columns in place
3. stop using canonical planner events in reporting if the app rollback reverts the flow

## Remaining limitations

- `weekend_planner_first_action` still uses `view_toggle` as a fallback when stronger actions do not occur
- planner-origin hotel outbounds are still limited by the current client-side direct-detail flow
- no production controlled trace was completed in this implementation pass
- bare `/weekend-planner` navigation still behaves like a generic planner load rather than a resumed tournament flow; that is acceptable in this narrow repair because the canonical funnel depends on the preserved query-string handoff

## Production verification still required

- one controlled tournament-detail → auth → `/weekend-planner` journey
- confirmation that `weekend_planner_auth_completed`, `weekend_planner_loaded`, and `weekend_planner_first_action` join on the same `planner_session_id`
- confirmation that planner-origin lodging/group rows retain preserved source context in production
