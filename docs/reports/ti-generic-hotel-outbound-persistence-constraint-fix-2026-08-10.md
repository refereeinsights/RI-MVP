# TI Generic Hotel Outbound Persistence Constraint Fix

Date: 2026-08-10

## Root cause

The application and database contracts disagreed. `/go/hotels` legitimately records generic or location-based hotel searches with `destination_type = 'hotels'` and `venue_id = null`, but `supabase/migrations/20260420_ti_outbound_clicks_hotels.sql` added `ti_outbound_clicks_destination_type_hotels_requires_venue_id`, which rejected those rows with PostgreSQL `23514`.

The original migration extended a tournament-centric table for venue-level hotel redirects, so the constraint reflected that narrower initial use case. Current Book Travel, Weekend Planner, and tournament location-only fallback behavior is broader. A fake venue would corrupt attribution and is not an acceptable workaround.

## Migration

`supabase/migrations/20260810_ti_outbound_clicks_allow_generic_hotels.sql` drops `ti_outbound_clicks_destination_type_hotels_requires_venue_id` with `ALTER TABLE IF EXISTS ... DROP CONSTRAINT IF EXISTS`.

This is an idempotent, forward, no-rewrite schema change:

- existing rows are unchanged;
- venue foreign-key behavior remains intact;
- the tournament-official constraint remains intact;
- venue-backed hotel rows can continue storing real venue IDs; and
- no replacement constraint or fake venue requirement was introduced.

Re-adding the old constraint is not an automatically safe rollback once legitimate null-venue rows exist. Any recovery should be a forward corrective migration. A rollback proposal would first need to inspect existing null-venue hotel rows and must not delete or fabricate data without separate authorization.

## Downstream assumptions

| Consumer | Finding | Adjustment |
| --- | --- | --- |
| `apps/ti-web/app/go/hotels/route.ts` | Venue is already optional; the route persists `null` when no valid venue exists and preserves available tournament, attribution, session, placement, device, and Custom-field context. | None. |
| TI admin dashboard email hotel handoffs | Groups HotelPlanner rows by `source_surface` and makes no venue assumption. | None. |
| RI admin TI clicks/revenue/outbound totals | Counts `destination_type = 'hotels'` without requiring a venue. | None. |
| `list_ti_outbound_clicks_hotels_top_venues_v1` | Explicitly requires non-null `venue_id` and joins venues because its stated purpose is a top-venues ranking. Generic rows should not appear there. | None; intentionally venue-only. |
| Hotel funnel and attribution reconciliation SQL | Selects or groups hotel rows without requiring a venue; venue is optional output context. | None. |
| RI venue merge route | Reassigns `ti_outbound_clicks.venue_id` before deleting a merged source venue. This remains valid and preserves venue context. The relaxed check also makes the declared `ON DELETE SET NULL` foreign-key behavior internally consistent. | None. |
| TI and RI venue-detail hotel links | Continue supplying real venue IDs; relaxing the check does not alter their URL or persistence contract. | None. |

## Generic-flow validation

Added `scripts/analysis/ti_generic_hotel_outbound_constraint_validation.sql`. Inside one transaction it checks that the obsolete constraint is absent, inserts representative rows, asserts stored fields, and rolls back.

Prepared cases:

- Book Travel with null venue, canonical attribution token, session, placement, source-page fields, Custom3–Custom5, and device context;
- Weekend Planner with null venue plus `custom_field6 = plan:{plannerSessionId}`;
- tournament location-only fallback with real tournament ID/slug and no fake venue.

Actual transactional insert result: **not performed**. The local Supabase runtime could not be reached because Docker was not running, and `psql` was unavailable. No production or partner system was used as a substitute.

## Venue-backed regression validation

The same rollback-safe script prepares venue-detail, venue-map, and RI venue-detail rows using a temporary real venue fixture. It asserts that each stored venue ID matches the fixture and that attribution/session/placement fields remain intact. The venue-map case also retains a real tournament ID and slug.

Actual transactional insert result: **not performed** for the same local database availability reason. Compatibility was inspected in schema and application code, but no database insert is reported as passing.

## Production observability

Production migration/deployment was not authorized and was **not performed**. No production validation rows or HotelPlanner traffic were created, and no post-migration production observation window exists yet.

After an explicitly authorized production application, verify read-only that the named constraint is absent, watch for new matching `23514` failures after the migration timestamp, confirm venue-backed rows continue arriving, and wait for organic generic traffic. If no organic Book Travel or Weekend Planner traffic occurs, report insufficient production evidence rather than creating traffic.

## Validation

- Migration/schema inspection: passed. The forward migration only drops the named constraint; historical migrations and unrelated integrity rules are unchanged.
- Transactional database validation: not performed; local Supabase reported that it could not connect to the Docker daemon.
- Focused tests: passed, 4/4 in `apps/ti-web/lib/hotelPlannerAttribution.test.ts`.
- Typecheck: passed with `npx tsc -p apps/ti-web/tsconfig.json --noEmit`.
- Lint: not run; no linted application source changed.
- Build: not run; no application bundle changed.
- Diff whitespace validation: passed with `git diff --check`.
- Production read-only inspection after migration: not performed because production application was not authorized.
