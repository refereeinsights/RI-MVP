# TournamentInsights Venue Hotel Funnel Phase 2

Date: 2026-07-22

## Root cause addressed

- High-volume venue hotel outbound traffic was being persisted in `ti_outbound_clicks` without matching canonical venue CTA impression/click tracking.
- Impression, click, search, and outbound records did not share stable identifiers.
- Existing reporting mixed incompatible client and server event authorities.

## Implementation summary

- Added a centralized venue hotel funnel helper with canonical placement, flow-type, and identifier handling.
- Replaced high-volume venue hotel links with a shared client CTA component that emits:
  - `hotel_cta_impression`
  - `hotel_cta_clicked`
- Preserved legacy `venue_hotels_cta_clicked` as a secondary compatibility event.
- Propagated `cta_instance_id`, `cta_interaction_id`, and related attribution fields into `/go/hotels`.
- Added optional support for the same identifiers in `/api/lodging/search` persistence.
- Added additive schema columns and an outbound idempotency key backed by a nullable-column unique index compatible with `/go/hotels` conflict handling.

## Canonical values

### Page types

- `venue`
- `tournament`
- `planner`
- `other`

### Venue CTA placements

- `venue_directory_text_link`
- `venue_directory_planning_link`
- `venue_directory_card_link`
- `venue_details_booking_cta`

### Flow types

- `direct_outbound`
- `search_then_outbound`

Current venue placements in this pass use `direct_outbound`.

## Event authority rules

- `hotel_cta_impression` → authoritative client event in `ti_map_events`
- `hotel_cta_clicked` → authoritative client event in `ti_map_events`
- `lodging_search_started` → authoritative server row in `lodging_search_session`
- `hotel_outbound_clicked` → authoritative server row in `ti_outbound_clicks`

Compatibility rule:

- `venue_hotels_cta_clicked` is still written as a secondary legacy event and must not be counted as a separate canonical conversion.

## Identifier lifecycle

- `cta_instance_id` is created once per rendered CTA instance and reused for impression and click.
- `cta_interaction_id` is created only when a click is accepted.
- `outbound_request_id` is created per accepted outbound navigation attempt and used for outbound idempotency.
- `lodging_search_session.id` remains the authoritative lodging-search identifier; `ti_outbound_clicks.lodging_search_id` can link downstream outbound rows to that search when applicable.

## Deduplication and idempotency

- Impression: once per `cta_instance_id` per page lifecycle
- Click: once per accepted `cta_interaction_id`
- Search: once per authoritative `lodging_search_session.id`
- Outbound: once per `outbound_request_id`

## Migration compatibility note

- `/go/hotels` persists authoritative outbound rows through `upsert(..., { onConflict: "outbound_request_id" })`.
- The migration therefore must provide a conflict-inferable unique index on `ti_outbound_clicks(outbound_request_id)`.
- The local pre-push verification updated the migration to use a nullable-column unique index without a partial predicate so the idempotency key is compatible with the deployed write path while remaining backward compatible for historical `NULL` rows.

## Deployment order

1. Apply `supabase/migrations/20260722_ti_venue_hotel_funnel_phase2.sql`
2. Deploy application code that writes the new fields
3. Verify canonical venue funnel joins with the SQL in `scripts/analysis/ti_venue_hotel_funnel_queries.sql`

## Rollback steps

1. Roll back application code first
2. Leave additive schema columns in place
3. Stop reading the new canonical fields and identifiers until the code is reapplied

## Verification artifacts

- Query file: `scripts/analysis/ti_venue_hotel_funnel_queries.sql`
- Phase 1 audit baseline: `docs/reports/ti-hotel-group-phase1-audit-2026-07-22.md`

## Production verification status

- Automated local validation completed for helper logic and TypeScript compilation.
- Controlled production or production-equivalent end-to-end verification was not run in this implementation pass from this environment.

## Unresolved risks

- Production confirmation is still required for impression timing and `/go/hotels` identifier propagation under real browser navigation.
- Existing dashboards and reports must use canonical event rules to avoid double counting the legacy `venue_hotels_cta_clicked` event.
