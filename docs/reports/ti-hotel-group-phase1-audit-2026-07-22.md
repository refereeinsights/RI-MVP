# TournamentInsights Hotel and Group-Booking Analytics Phase 1 Audit

Date: 2026-07-22  
Scope: Phase 1 audit only. No application behavior was modified in this phase.

## Phase 1 prompt

```text
Phase 1 — Audit before implementation

Before modifying code:

1. Map the current hotel and group-booking event flows from UI action through persistence.
2. Identify every component, API route, redirect route, database table, event name, and reporting query involved.
3. Determine the cause of the HotelPlanner outbound-click discrepancy using code evidence and available production data.
4. Classify each finding as:
   - proven
   - highly likely
   - unresolved
5. Propose the smallest implementation plan and list the exact files, migrations, and tests expected to change.

Do not modify code until the Phase 1 findings and implementation plan have been written to the report.

Identifier model

- Create a `cta_instance_id` when a CTA instance is rendered.
- Persist `cta_instance_id` on the CTA impression and CTA click events.
- Create a separate `cta_interaction_id` when a user clicks the CTA.
- Propagate `cta_interaction_id` through downstream lodging or group-booking events.
- Do not create a `cta_interaction_id` for impressions that never receive an interaction.

Event authority

- Define one authoritative persisted event for each user action.
- Prefer server-side persistence for outbound redirects and successful submissions.
- Do not count both client-side and server-side records as separate conversions.
- Use idempotency keys or documented deduplication rules for server-side events.

Deployment safety

- All schema changes must be backward compatible.
- Deploy schema additions before application code that depends on them.
- Do not remove or rename existing events, columns, or tables in the same deployment.
- Include rollback steps and any temporary compatibility behavior.
```

## Date ranges and data used

- Post-launch comparison window used for evidence: `2026-07-13` through `2026-07-21`
- Equal-length baseline window used for evidence: `2026-07-04` through `2026-07-12`
- Production data sources queried:
  - `ti_map_events`
  - `ti_outbound_clicks`
  - `lodging_search_session`
  - `ti_affiliate_daily_metrics`
- Git history reviewed through local repository history.

## Launch dates identified

- Group-booking CTA UI launch: `2026-07-02`
- Group-booking analytics hardening: `2026-07-09`
- New TI-native hotel CTA/results launch: `2026-07-13`
- Legacy venue hotel redirect tracking existed earlier: `2026-04-20`

Key commits reviewed:

- `75f52bf6` — TI-native book-travel hotel results
- `91b43463` — hotel results handoff improvements
- `dddd34f3` — hotel CTA gate fix
- `8a3d3bae` / `68456ff5` — group/team-block CTA surfacing
- `82bb25b9` — group CTA analytics hardening
- `9d24bca6` — hotel redirect tracking and admin reporting

## Current flow map

### Hotel CTA flow

1. Venue and tournament surfaces render hotel CTAs.
2. Client analytics may emit CTA-view/click events to `/api/analytics`.
3. Some hotel flows start a search through `/api/lodging/search`.
4. Hotel outbound navigation uses `/go/hotels`.
5. `/go/hotels` persists redirect records to `ti_outbound_clicks`.
6. Reporting reads mixed client and server datasets without a stable join key.

Relevant code:

- `apps/ti-web/components/venues/VenueCard.tsx`
- `apps/ti-web/components/venues/OwlsEyeVenueCard.tsx`
- `apps/ti-web/components/venues/HotelBookingCta.tsx`
- `apps/ti-web/app/tournaments/[slug]/TournamentDetailHotelCtaClient.tsx`
- `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- `apps/ti-web/app/api/analytics/route.ts`
- `apps/ti-web/app/api/lodging/search/route.ts`
- `apps/ti-web/app/go/hotels/route.ts`

### Group-booking CTA flow

1. Tournament and planning surfaces render a team-hotel/group-booking CTA.
2. Client analytics may emit viewed/clicked events to `/api/analytics`.
3. Group form lives in `BookTravelTeamBlockForm`.
4. Start is only tracked after first meaningful input, not on form open.
5. Submission posts to `/api/lodging/group-request`.
6. Successful submission emits client analytics, but server persistence is not producing production rows in the measured window.

Relevant code:

- `apps/ti-web/app/tournaments/[slug]/TournamentPlanningCtasClient.tsx`
- `apps/ti-web/app/book-travel/BookTravelTeamBlockForm.tsx`
- `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- `apps/ti-web/app/api/analytics/route.ts`
- `apps/ti-web/app/api/lodging/group-request/route.ts`

## Persistence and reporting inventory

### Components and routes

- `apps/ti-web/components/venues/VenueCard.tsx`
- `apps/ti-web/components/venues/OwlsEyeVenueCard.tsx`
- `apps/ti-web/components/venues/HotelBookingCta.tsx`
- `apps/ti-web/app/tournaments/[slug]/TournamentDetailHotelCtaClient.tsx`
- `apps/ti-web/app/tournaments/[slug]/TournamentPlanningCtasClient.tsx`
- `apps/ti-web/app/book-travel/BookTravelTeamBlockForm.tsx`
- `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- `apps/ti-web/app/api/analytics/route.ts`
- `apps/ti-web/app/go/hotels/route.ts`
- `apps/ti-web/app/go/hotels/checkout/route.ts`
- `apps/ti-web/app/api/lodging/search/route.ts`
- `apps/ti-web/app/api/lodging/group-request/route.ts`

### Analytics helpers

- `apps/ti-web/lib/analytics.ts`
- `apps/ti-web/lib/tiAnalyticsClient.ts`
- `apps/ti-web/lib/tiAnalyticsEvents.ts`

### Tables and views

- `ti_map_events`
- `ti_outbound_clicks`
- `lodging_search_session`
- `ti_affiliate_daily_metrics`

### Migrations already involved

- `supabase/migrations/20260409_ti_map_analytics_events.sql`
- `supabase/migrations/20260412_ti_outbound_clicks.sql`
- `supabase/migrations/20260420_ti_outbound_clicks_hotels.sql`
- `supabase/migrations/20260503_ti_affiliate_daily_metrics.sql`
- `supabase/migrations/20260629_lodging_search_session.sql`

### Reporting and prior analysis

- `apps/referee/app/admin/ti/clicks/page.tsx`
- `apps/ti-web/app/api/cron/admin-dashboard-email/route.ts`
- `scripts/analysis/ti_hotel_group_cta_report.mjs`

## Production evidence snapshot

### Post-launch window (`2026-07-13` to `2026-07-21`)

- `ti_outbound_clicks` hotel rows: `12490`
- `team_hotel_cta_viewed`: `12336`
- `team_hotel_cta_clicked`: `8`
- `book_travel_hotels_clicked`: `49`
- `tournament_detail_hotel_cta_clicked`: `14`
- `venue_hotels_cta_clicked`: `0`
- `team_hotel_request_started`: `0`
- `team_hotel_request_submitted`: `0`
- `lodging_search_session` rows for `/api/lodging/search`: `889`
- `lodging_search_session` rows for `/api/lodging/group-request`: `0`
- `ti_affiliate_daily_metrics` rows: `0`

### Baseline window (`2026-07-04` to `2026-07-12`)

- `ti_outbound_clicks` hotel rows: `10808`
- `team_hotel_cta_viewed`: `6341`
- `team_hotel_cta_clicked`: `5`
- `venue_hotels_cta_clicked`: `6`
- `tournament_detail_hotel_cta_clicked`: `5`
- `team_hotel_request_started`: `1`
- `team_hotel_request_submitted`: `0`

### Additional evidence

- All post-launch hotel outbound rows observed were persisted with `source_surface = 'venue_page'`.
- `source_path` is null on `5821` post-launch hotel outbound rows.
- Probable duplicate outbound hotel rows within 60 seconds: `516`.
- Bot-like hotel outbound rows by user-agent heuristic: `320`.
- Post-launch `team_hotel_cta_viewed` rows persist `page_type = 'weekend_planner'` for most tournament-origin impressions.
- The same rows still carry `properties.source_page_type = 'tournament'`.

## Findings

### Proven

1. The major HotelPlanner discrepancy is real and primarily caused by comparing two different funnels.
   - `12490` hotel outbound rows are mostly legacy venue-page server redirect traffic in `ti_outbound_clicks`.
   - `63` post-launch hotel CTA click rows are newer planner/tournament client analytics (`49` + `14`).

2. Venue-page hotel links in `apps/ti-web/components/venues/VenueCard.tsx` create server-side outbound rows without matching client CTA click tracking.

3. `venue_hotels_cta_clicked` is effectively not firing in the post-launch window even though hotel outbound traffic continues at scale.

4. Group-booking `page_type` is persisted incorrectly for tournament-origin CTA events.
   - Persisted `page_type` is commonly `weekend_planner`.
   - Source properties still indicate tournament origin.

5. The group-booking funnel is not measurable past click in production for the measured post-launch window.
   - `team_hotel_request_started = 0`
   - `team_hotel_request_submitted = 0`
   - `/api/lodging/group-request` session rows = `0`

6. `lodging_search_session` cannot be reliably joined back to CTA placement, device, traffic source, or specific rendered CTA instance.

7. New-versus-returning visitor segmentation is not currently measurable in a defensible way for this funnel.

8. Duplicate and bot-like records exist, but they do not explain the order-of-magnitude discrepancy between outbound hotel rows and CTA click events.

9. A large share of hotel outbound records lacks `source_path`, which weakens placement and page-level attribution.

### Highly likely

1. Group-booking “start” tracking is too narrow because opening the form via CTA/hash navigation does not itself emit a viewed or started event.

2. Null `source_path` on outbound hotel rows is a mixed bucket of direct navigation, stripped referrer cases, and incomplete propagation.

### Unresolved

1. Whether browser prefetch, crawler behavior, or link-preview traffic contributes materially beyond the bot-like and near-duplicate rows already observed.

## Root-cause summary

The current reporting mixes incompatible event authorities:

- client-side CTA analytics from selected planner/tournament surfaces
- server-side redirect persistence from broader legacy venue-page traffic

There is no stable shared identifier across impression, click, search, redirect, and submission events. Because of that, the current funnel cannot distinguish:

- which rendered CTA produced a downstream action
- which page placement drove the action
- whether multiple records represent one user action or several

The immediate discrepancy is not one bug. It is a measurement model problem plus missing instrumentation on the highest-volume venue flow.

## Smallest implementation plan

Implement only the minimum needed to establish one authoritative funnel per action and make downstream joins possible.

1. Add `cta_instance_id` at render time for hotel and group CTAs.
2. Persist `cta_instance_id` on impression and click events.
3. Add `cta_interaction_id` only on CTA click.
4. Propagate `cta_interaction_id` through hotel search, hotel outbound redirect, and group form submit flows.
5. Define one authoritative persisted event per action:
   - impression
   - click
   - lodging search start
   - hotel outbound click
   - group form viewed
   - group form started
   - group form submitted
6. Fix authoritative page-type/placement derivation so tournament, venue, planner, and travel contexts persist consistently.
7. Add explicit deduplication or idempotency rules for server-side redirect and submission persistence.

## Exact files expected to change in Phase 2

- `apps/ti-web/components/venues/VenueCard.tsx`
- `apps/ti-web/components/venues/HotelBookingCta.tsx`
- `apps/ti-web/components/venues/OwlsEyeVenueCard.tsx`
- `apps/ti-web/app/tournaments/[slug]/TournamentDetailHotelCtaClient.tsx`
- `apps/ti-web/app/tournaments/[slug]/TournamentPlanningCtasClient.tsx`
- `apps/ti-web/app/book-travel/BookTravelTeamBlockForm.tsx`
- `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- `apps/ti-web/lib/analytics.ts`
- `apps/ti-web/lib/tiAnalyticsClient.ts`
- `apps/ti-web/lib/tiAnalyticsEvents.ts`
- `apps/ti-web/app/api/analytics/route.ts`
- `apps/ti-web/app/go/hotels/route.ts`
- `apps/ti-web/app/api/lodging/search/route.ts`
- `apps/ti-web/app/api/lodging/group-request/route.ts`

Likely supporting additions:

- a shared helper for authoritative page-context mapping
- a shared helper for CTA identifier generation/propagation

Likely reporting/query follow-up changes:

- `apps/referee/app/admin/ti/clicks/page.tsx`
- `apps/ti-web/app/api/cron/admin-dashboard-email/route.ts`
- `scripts/analysis/ti_hotel_group_cta_report.mjs`

## Expected migrations in Phase 2

Backward-compatible additions only:

1. Extend analytics persistence with canonical CTA identifiers and context fields.
2. Extend `lodging_search_session` with join fields and attribution context.
3. Extend `ti_outbound_clicks` with join fields and attribution context.
4. If necessary, add a lightweight canonical funnel table or view rather than renaming/removing existing structures.

No existing table, column, or event name should be removed in the same deployment.

## Expected tests in Phase 2

- Tournament vs venue vs planner page-type persistence
- Venue hotel CTA click tracking coverage
- CTA impression deduplication behavior
- `cta_instance_id` persistence on impression/click
- `cta_interaction_id` propagation through search/redirect/submit flows
- Group form viewed/start/submitted instrumentation
- `/go/hotels` redirect persistence idempotency
- `/api/lodging/search` persistence attribution fields
- `/api/lodging/group-request` persistence attribution fields

## Deployment order and rollback constraints

1. Deploy schema additions first.
2. Deploy application code that writes the new fields second.
3. Keep existing events and reports operational during transition.
4. Backfill or dual-write only if needed for continuity.
5. Rollback path must allow application code to continue working against the older schema shape.

## Commands and queries used

Representative commands:

- `git log --oneline -- apps/ti-web`
- `rg "team_hotel|hotel_cta|book_travel_hotels|venue_hotels|tournament_detail_hotel" apps/ti-web`
- `rg "ti_outbound_clicks|lodging_search_session|ti_map_events|ti_affiliate_daily_metrics" -n`
- `node scripts/analysis/ti_hotel_group_cta_report.mjs`

Representative SQL used during the audit:

```sql
select count(*)
from ti_outbound_clicks
where created_at >= '2026-07-13'
  and created_at < '2026-07-22'
  and vertical = 'hotels';
```

```sql
select event_name, count(*)
from ti_map_events
where created_at >= '2026-07-13'
  and created_at < '2026-07-22'
  and event_name in (
    'team_hotel_cta_viewed',
    'team_hotel_cta_clicked',
    'team_hotel_request_started',
    'team_hotel_request_submitted',
    'book_travel_hotels_clicked',
    'tournament_detail_hotel_cta_clicked',
    'venue_hotels_cta_clicked'
  )
group by 1
order by 1;
```

```sql
select endpoint, count(*)
from lodging_search_session
where created_at >= '2026-07-13'
  and created_at < '2026-07-22'
group by 1
order by 1;
```

```sql
select count(*)
from ti_affiliate_daily_metrics
where day >= '2026-07-13'
  and day < '2026-07-22';
```

## Phase 1 deliverable status

- Audit completed
- Findings classified
- Minimum implementation plan defined
- No production code behavior changed in this phase
