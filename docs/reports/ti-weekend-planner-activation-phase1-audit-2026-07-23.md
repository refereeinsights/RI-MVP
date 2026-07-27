# TournamentInsights Weekend Planner Activation Phase 1 Audit

Date: 2026-07-23  
Scope: Phase 1 audit only. No application behavior was modified in this phase.

## Phase 1 prompt

```text
Phase 1 — Audit before implementation

Before modifying code:

1. Map the current tournament-detail-to-planner flow.
2. Identify:
   - the tournament CTA component
   - destination URL and query parameters
   - auth-gate logic
   - post-auth redirect handling
   - planner loading logic
   - tournament and venue context propagation
   - analytics events
   - API routes
   - persistence tables
3. Determine why only 5 of 221 measured planner entries reached `weekend_planner_loaded`.
4. Classify the causes as:
   - proven
   - highly likely
   - unresolved
5. Document the smallest implementation plan and exact files expected to change.

Do not modify code until this flow map and implementation plan are written to a concise report.
```

## Evidence used

- Existing production usage analysis: `docs/reports/ti-weekend-planner-usage-analysis-2026-07-23.md`
- Current code paths in:
  - `apps/ti-web/app/tournaments/[slug]/TournamentPlanningCtasClient.tsx`
  - `apps/ti-web/app/tournaments/SoftPlannerCtaClient.tsx`
  - `apps/ti-web/app/weekend/[slug]/page.tsx`
  - `apps/ti-web/app/weekend/[slug]/SaveWeekendPlanClient.tsx`
  - `apps/ti-web/app/weekend/[slug]/WeekendPlanViewTracker.tsx`
  - `apps/ti-web/app/weekend-planner/page.tsx`
  - `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
  - `apps/ti-web/app/weekend-planner/WeekendPlannerEntryCtas.tsx`
  - `apps/ti-web/app/_components/planner/PlannerClient.tsx`
  - `apps/ti-web/app/login/page.tsx`
  - `apps/ti-web/app/signup/page.tsx`
  - `apps/ti-web/app/verify-email/page.tsx`
  - `apps/ti-web/app/verify-email/VerifyCodeExchange.tsx`
  - `apps/ti-web/app/auth/confirm/route.ts`
  - `apps/ti-web/app/api/analytics/route.ts`
  - `apps/ti-web/app/api/lodging/search/route.ts`
  - `apps/ti-web/app/api/lodging/group-request/route.ts`
  - `apps/ti-web/lib/returnTo.ts`
  - `apps/ti-web/lib/tiAnalyticsEvents.ts`

## Current measured result

- Primary analysis window: `2026-06-23T00:00:00Z` through `2026-07-23T00:00:00Z`
- `weekend_planner_viewed`: `221`
- `weekend_planner_auth_required_viewed`: `216`
- `weekend_planner_loaded`: `5`
- Measured load activation rate: `2.3%`
- Additional evidence from the same analysis:
  - planner-origin `team_hotel_cta_viewed`: `221`
  - planner-origin `team_hotel_cta_clicked`: `0`
  - planner-origin `planner_manual_event_created`: `0`
  - planner-origin `planner_guest_share_created`: `0`
  - planner-origin `planner_calendar_feed_created`: `0`

## Executive summary

The current tournament-to-planner flow is split across two products:

1. the tournament page CTA sends users to `/weekend/[slug]`
2. the save/auth links on that route then send users to `/weekend-planner`

That split drops acquisition context, drops tournament and venue context at critical transitions, and measures route exposure as planner entry. The `221 → 5` drop is mostly explained by a hard auth gate, not by planner load failures. The measured planner route is acting primarily as a signed-out landing page, while the real tournament-specific planning context lives on `/weekend/[slug]`.

## Current flow map

### A. Tournament-detail entry

1. Tournament detail page renders `TournamentPlanningCtasClient`.
2. Primary planner CTA points to:
   - `/weekend/${slug}?venue=${primaryVenueId?}&source=tournament_detail`
3. Tournament-directory beta CTA in `SoftPlannerCtaClient` points to:
   - `/weekend-planner`
4. Upstream analytics on the tournament surfaces:
   - `weekend_planner_contextual_cta_viewed`
   - `weekend_planner_contextual_cta_clicked`
   - compatibility event `tournament_detail_weekend_plan_clicked`

### B. Tournament-specific weekend page

1. `/weekend/[slug]` loads tournament and venue context server-side.
2. It auto-selects a primary or first venue when possible.
3. It emits `weekend_plan_page_viewed` through `WeekendPlanViewTracker`.
4. It renders `SaveWeekendPlanClient`.
5. `SaveWeekendPlanClient` uses `plannerHref="/weekend-planner"` for:
   - signed-out login
   - signed-out signup
   - “View in Weekend Planner”
   - “Edit in Weekend Planner”

Result: the tournament-specific page has the best context, but the next hop to the planner hub drops that context.

### C. Auth-gated planner hub

1. `/weekend-planner` renders `WeekendPlannerClient mode="planner_beta"`.
2. `WeekendPlannerClient` emits `weekend_planner_viewed` on route mount.
3. Signed-out users see `WeekendPlannerEntryCtas`, which emits:
   - `weekend_planner_auth_required_viewed`
4. The auth CTAs use:
   - `/login?returnTo=%2Fweekend-planner`
   - `/signup?returnTo=%2Fweekend-planner`

Result: auth starts from the planner route do not preserve tournament slug, venue, or original source.

### D. Post-auth redirect

1. `login/page.tsx` sanitizes `returnTo` and redirects to it after success.
2. `signup/page.tsx` sends email-confirmation flows to `/auth/confirm?next=...`.
3. `verify-email/page.tsx` and `VerifyCodeExchange.tsx` also honor `returnTo`.
4. `auth/confirm/route.ts` sanitizes `next` and redirects there after auth completes.

Result: the auth system can preserve querystrings in `returnTo`, but the planner flow is currently only passing `/weekend-planner`, so the useful context is lost before auth even starts.

### E. Actual planner load

1. The real planner behavior lives in `PlannerClient`.
2. `PlannerClient` emits:
   - `weekend_planner_auth_required_viewed` when access is gated in-product
   - `weekend_planner_loaded` only after verified auth and initial load settles
3. Loaded-event payload includes only bucketed planner state:
   - `loaded_event_count_bucket`
   - `feed_count_bucket`
   - `child_team_count_bucket`
4. Existing measured loaded rows all showed zeroed buckets in the earlier usage analysis.

Result: `weekend_planner_loaded` is much closer to real activation than `weekend_planner_viewed`, but it is not connected to a stable entry identifier.

## Analytics, API, and persistence inventory

### Client-side events in scope

- Upstream entry:
  - `weekend_planner_contextual_cta_viewed`
  - `weekend_planner_contextual_cta_clicked`
  - `tournament_detail_weekend_plan_clicked`
- Tournament-specific weekend page:
  - `weekend_plan_page_viewed`
  - `weekend_plan_save_clicked`
  - `weekend_plan_saved`
- Planner hub:
  - `weekend_planner_viewed`
  - `weekend_planner_auth_required_viewed`
  - `weekend_planner_loaded`
- Downstream planner actions:
  - `planner_view_toggle_clicked`
  - `planner_manual_event_created`
  - `planner_guest_share_created`
  - `planner_calendar_feed_created`
  - `team_hotel_cta_viewed`
  - `team_hotel_cta_clicked`

### API routes in scope

- `apps/ti-web/app/api/analytics/route.ts`
- `apps/ti-web/app/api/lodging/search/route.ts`
- `apps/ti-web/app/api/lodging/group-request/route.ts`
- `apps/ti-web/app/auth/confirm/route.ts`

### Persistence tables in scope

- `ti_map_events`
- `lodging_search_session`

No dedicated planner-session table exists today.

## Why only 5 of 221 measured planner entries reached `weekend_planner_loaded`

### Proven

1. `weekend_planner_viewed` is not a true planner-load event.
   - It fires in `WeekendPlannerClient` when `/weekend-planner` mounts.
   - It includes signed-out route visits that never reach the actual planner.

2. The measured drop is mostly the auth gate.
   - Production analysis already showed `216 / 221` planner-view rows also fired `weekend_planner_auth_required_viewed`.
   - `221 - 216 = 5`, which matches the `weekend_planner_loaded` count exactly.

3. The planner route is currently functioning as a signed-out landing page, not as a preserved continuation of tournament intent.
   - Signed-out CTAs on `/weekend-planner` only carry `returnTo=/weekend-planner`.
   - Signed-out CTAs on `/weekend/[slug]` also ultimately target `plannerHref="/weekend-planner"`.

4. Tournament and venue context are dropped before auth.
   - The entry CTA to `/weekend/[slug]` includes tournament context.
   - The transition from `/weekend/[slug]` to `/weekend-planner` removes it.

5. Acquisition context is dropped or rewritten in persistence.
   - `weekend_planner_viewed` does not preserve the original entry source.
   - `api/analytics` persists many planner-family events as `page_type='weekend_planner'` unless `source_page_type === 'book_travel'`.
   - Tournament-origin `team_hotel_*` events therefore persist with misleading planner page type.

### Highly likely

1. Users who do authenticate are returning to a generic empty planner, not to the intended tournament planning state.
   - The five measured loads were all empty-state loads in the prior usage analysis.
   - The current auth handoff does not preserve tournament slug or venue.

2. The existing activation funnel overstates “planner entry” and understates real user intent.
   - Upstream tournament-detail CTA clicks were far higher than measured `/weekend-planner` views.
   - This implies the system is mixing at least two entry surfaces and only one is being treated as the planner funnel.

3. Planner-origin downstream lodging and group attribution is not trustworthy.
   - Both `/api/lodging/search` and `/api/lodging/group-request` prefer `sc` over `source`.
   - Current planner requests therefore persist `search_query.source = 'tournamentinsights'`.

### Unresolved

1. The exact behavioral drop-off between auth-gate view and auth-start is not measurable today.
   - There is no canonical `weekend_planner_auth_started`.

2. The exact auth-completion rate for planner-origin users is not measurable today.
   - There is no canonical `weekend_planner_auth_completed`.

3. The best canonical “first meaningful planner action” is not yet implemented.
   - `weekend_plan_saved` on `/weekend/[slug]` is meaningful but not in the actual planner hub.
   - `planner_view_toggle_clicked` exists but is too weak to represent activation quality.

## Root-cause classification

### Proven

- Funnel entry is split between `/weekend/[slug]` and `/weekend-planner`.
- `weekend_planner_viewed` measures route exposure, not actual planner initialization.
- The `221 → 5` gap is primarily explained by `216` auth-gated views.
- Current auth links discard tournament/venue context by using `/weekend-planner` as the sole return target.
- Analytics persistence rewrites or collapses source/page context in ways that make planner attribution unreliable.
- Lodging and group-request source persistence overwrites original planner source with `sc=tournamentinsights`.

### Highly likely

- Authenticated users who do return are landing in a generic, under-populated planner state.
- The current product flow forces users to reconstruct intent after auth.
- Real planner activation is lower than upstream tournament-detail interest because the current handoff breaks continuity.

### Unresolved

- Exact auth-start rate
- Exact auth-completion rate
- Exact first meaningful planner action definition
- Exact proportion of users who abandon on `/weekend/[slug]` versus on `/weekend-planner`

## Smallest implementation plan

1. Define one stable `planner_session_id` at planner-entry start.
2. Preserve that ID and tournament context from the tournament CTA through auth completion and planner load.
3. Separate entry context from current page context in analytics payloads and persistence.
4. Introduce canonical planner funnel events without removing legacy events.
5. Make `weekend_planner_loaded` fire only for real planner initialization, tied to the same planner session.
6. Choose one existing meaningful planner action and emit `weekend_planner_first_action` once per planner session.
7. Propagate planner session and original entry context into planner-origin lodging and group-request calls.

## Exact files expected to change in implementation

### Existing files

- `apps/ti-web/app/tournaments/[slug]/TournamentPlanningCtasClient.tsx`
- `apps/ti-web/app/tournaments/SoftPlannerCtaClient.tsx`
- `apps/ti-web/app/weekend/[slug]/page.tsx`
- `apps/ti-web/app/weekend/[slug]/SaveWeekendPlanClient.tsx`
- `apps/ti-web/app/weekend/[slug]/WeekendPlanViewTracker.tsx`
- `apps/ti-web/app/weekend-planner/page.tsx`
- `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- `apps/ti-web/app/weekend-planner/WeekendPlannerEntryCtas.tsx`
- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/login/page.tsx`
- `apps/ti-web/app/signup/page.tsx`
- `apps/ti-web/app/verify-email/page.tsx`
- `apps/ti-web/app/verify-email/VerifyCodeExchange.tsx`
- `apps/ti-web/app/auth/confirm/route.ts`
- `apps/ti-web/app/api/analytics/route.ts`
- `apps/ti-web/app/api/lodging/search/route.ts`
- `apps/ti-web/app/api/lodging/group-request/route.ts`
- `apps/ti-web/lib/returnTo.ts`
- `apps/ti-web/lib/tiAnalyticsEvents.ts`

### Likely new helpers

- `apps/ti-web/lib/planner/plannerSession.ts`
- `apps/ti-web/lib/planner/plannerPageContext.ts`

### Likely new analysis artifact

- `scripts/analysis/ti_weekend_planner_activation_funnel.sql`

## Expected migration scope

Smallest likely database change:

- one additive migration on `lodging_search_session` to support planner-origin attribution fields such as:
  - `planner_session_id`
  - `entry_source`
  - `entry_page_type`
  - `entry_path`
  - `entry_placement`
  - `current_page_type`
  - `current_page_path`

Expected non-changes:

- no new analytics platform
- no rename or removal of existing columns
- no removal of legacy events
- no backfill requirement in this pass

`ti_map_events` likely does not need schema changes if canonical planner-funnel properties remain in the existing JSON payload model.

## Expected automated tests

### Likely new tests

- `apps/ti-web/lib/planner/plannerSession.test.ts`
- `apps/ti-web/lib/planner/plannerPageContext.test.ts`
- `apps/ti-web/lib/returnTo.test.ts`
- `apps/ti-web/app/api/lodging/search/route.test.ts`
- `apps/ti-web/app/api/lodging/group-request/route.test.ts`
- `apps/ti-web/app/api/analytics/route.test.ts`

### Expected coverage

- tournament CTA creates or preserves `planner_session_id`
- tournament and venue context survive auth redirects
- auth-gate view is emitted once
- auth-start requires a real click
- auth-completed does not duplicate on callback rerender
- planner load only fires for real planner initialization
- first-action emits once per planner session
- planner-origin lodging/group records preserve original source context
- tournament-origin `team_hotel_*` events do not get rewritten as planner-origin page type

## Phase 1 deliverable status

Completed in this audit:

- current flow map
- current event and persistence map
- root-cause classification
- smallest implementation scope
- exact expected file list
- expected migration scope
- expected test scope

Not yet completed in this audit:

- code changes
- migration creation
- canonical event implementation
- controlled local verification
- SQL funnel report implementation

## Hand-off conclusion

Phase 1 is complete. The implementation should stay narrow:

- do not redesign the planner
- do not rebuild auth
- do not broaden hotel or group-booking work beyond source/session propagation

The core repair is to make the tournament-detail-to-planner journey one joinable session that survives auth and arrives at a pre-populated planner state.
