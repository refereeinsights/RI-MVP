# TournamentInsights HotelPlanner Attribution Phase 2A

Date: Monday, July 27, 2026  
Scope: hotel-booking attribution only

## Executive summary

- Phase 2A implements one canonical outbound booking token for HotelPlanner-bound hotel handoffs without changing booking UX.
- The canonical token is `outbound_attribution_id`, persisted internally and forwarded to HotelPlanner as `Custom3 = attr:<token>`.
- Legacy `Custom1` and `Custom2` behavior remains intact for backward compatibility.
- `/go/hotels` no longer collapses Book Travel into Weekend Planner defaults.
- Direct HotelPlanner property links now route through a TI-controlled handoff so one authoritative outbound record is persisted before redirect.
- Local typecheck passed, and focused TI unit tests passed.
- HotelPlanner booking-report return is still unverified in this implementation pass.

## Binding audit findings

- The binding audit is `docs/reports/ti-hotel-booking-attribution-audit-2026-07-27.md`.
- Proven defects addressed in this phase:
  - `/go/hotels` defaulting could overwrite richer caller attribution.
  - generic Book Travel white-label traffic could collapse into `weekend_planner`.
  - direct property links bypassed TI outbound persistence entirely.
  - no canonical machine token existed across repaired booking flows.

## Exact implementation scope

- Included:
  - `/go/hotels` booking redirects
  - direct HotelPlanner property handoffs from Book Travel and venue map
  - search-to-handoff attribution context for Book Travel and venue map
  - additive internal outbound attribution persistence
- Excluded:
  - group-request payload mapping and RFP verification
  - dashboard rebuilds
  - historical backfill
  - booking UX redesign

## Files modified

- `apps/ti-web/app/go/hotels/route.ts`
- `apps/ti-web/app/go/hotels/property/route.ts`
- `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapClient.tsx`
- `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- `apps/ti-web/lib/hotelPlannerAttribution.ts`
- `apps/ti-web/lib/hotelPlannerAttribution.test.ts`
- `supabase/migrations/20260727_ti_hotel_booking_attribution_phase2a.sql`
- `scripts/analysis/ti_hotel_booking_attribution_reconciliation.sql`

## Migration status

- Additive migration required: `supabase/migrations/20260727_ti_hotel_booking_attribution_phase2a.sql`
- Added to `ti_outbound_clicks`:
  - `outbound_attribution_id`
  - `source_page_type`
  - `job_code`
  - `keyword`
  - `partner_source_code`
  - `custom_field1` through `custom_field8`
- Added indexes:
  - unique partial index on non-null `outbound_attribution_id`
  - `source_page_type, created_at desc`

## Canonical field contract

- `sc = tournamentinsights`
- `jobCode`
  - `TI-HOTELS`
  - `TI-BOOK-TRAVEL`
  - `TI-VENUE-MAP`
- `kw = Tournament weekend stay`
- `Custom3 = attr:<outbound_attribution_id>` canonical token field
- `Custom4 = srcp:<canonical_source_page_type>`
- `Custom5 = place:<canonical_cta_placement>`
- `Custom1` / `Custom2` remain legacy compatibility fields

## Chosen token field

- Chosen canonical token field: `Custom3`
- Reason:
  - `Custom1` and `Custom2` already carry active legacy meanings in current HotelPlanner reporting.
  - `Custom3` is additive, consistent, and does not overwrite known legacy dependencies.

## Token format

- Internal token: 32-character lowercase hex string
- External HotelPlanner token: `attr:<32-char-lowercase-hex>`

## Token lifecycle

- One accepted outbound hotel handoff creates one `outbound_attribution_id`.
- The same token is reused through downstream steps for that accepted handoff.
- Passive HotelPlanner API searches do not create final outbound tokens.
- Direct property-card clicks and `/go/hotels` handoffs create canonical outbound tokens.
- Where `outbound_request_id` is already present, the same token is derived deterministically from it for retry stability.

## Token-length decision

- Chosen external token length: `37` characters including `attr:`
- Rationale:
  - materially shorter than a verbose payload
  - opaque
  - safe for HotelPlanner custom-field transport in the absence of stricter repo-local documented limits

## Token collision and retry rules

- Token uniqueness is enforced internally with a unique partial index on non-null `outbound_attribution_id`.
- Existing `outbound_request_id` remains the retry/idempotency key where present.
- When `outbound_request_id` exists, token derivation is deterministic.
- When it does not exist, a new random token is created per accepted handoff.

## Internal attribution model

- Canonical storage remains `ti_outbound_clicks` for hotel outbound handoffs.
- Canonical booking attribution fields are persisted on the authoritative outbound row.
- Supporting search-context rows may still exist in `lodging_search_session`, but they do not replace the canonical outbound record.

## Shared builder behavior

- New helper: `apps/ti-web/lib/hotelPlannerAttribution.ts`
- Responsibilities:
  - canonical source-page typing
  - token generation/validation
  - legacy field preservation
  - canonical `Custom3` / `Custom4` / `Custom5` assignment
  - default `jobCode` selection without collapsing Book Travel into Weekend Planner

## Flow-by-flow implementation

### `/go/hotels`

- Now derives canonical source page type from explicit source, page type, and safe source-path fallbacks.
- Preserves richer caller attribution instead of defaulting generic Book Travel traffic into `weekend_planner`.
- Persists `outbound_attribution_id` and raw HotelPlanner-facing custom-field values on the outbound row.
- Sends canonical token through `Custom3`.

### Book Travel versus Weekend Planner separation

- Book Travel generic hotel search now preserves `source_page_type = book_travel`.
- Weekend Planner generic hotel search now preserves `source_page_type = weekend_planner`.
- Both still use `TI-BOOK-TRAVEL`, but no longer collapse into the same generic source default.

### Direct property behavior

- Direct property links no longer bypass TI persistence.
- New route: `apps/ti-web/app/go/hotels/property/route.ts`
- This route:
  - accepts property/date/tracking inputs
  - persists one canonical outbound row
  - forwards the same token to HotelPlanner
  - redirects to the same HotelPlanner property page

### Search behavior

- Book Travel and venue-map search requests now pass canonical source-page and placement context in custom fields.
- Search requests still do not create final outbound tokens.
- Final outbound token creation remains at the accepted external handoff boundary.

## Legacy compatibility

- Preserved:
  - `sc`
  - `jobCode`
  - existing `Custom1`
  - existing `Custom2`
- Added:
  - `Custom3` token
  - `Custom4` source page type
  - `Custom5` placement

## `/go/hotels` repair

- Replaced source-surface collapsing logic with canonical source-page derivation.
- Preserved caller-supplied richer tracking values when valid.
- Added canonical outbound token persistence and forwarding.

## Direct property behavior

- Venue-map and Book Travel property card clicks now use a TI-controlled property handoff route.
- Booking navigation behavior remains a new-tab handoff initiated from TI.

## Search behavior

- Search payloads now include canonical source-page and placement context where the caller knows them.
- Search remains non-authoritative for final booking attribution.

## Checkout behavior

- No new checkout token contract was introduced.
- Checkout remains dependent on prior handoff/session state.
- This phase does not create a second token at checkout.

## Privacy and URL controls

- No personal information is added to attribution custom fields.
- The canonical token is opaque.
- Raw session/auth values are not forwarded as custom attribution fields.

## Persistence failure behavior

- Outbound persistence remains best-effort.
- Booking navigation is not blocked if attribution persistence fails.
- No replacement orphan token is created without a persisted row.

## Deduplication and idempotency

- `outbound_request_id` remains the primary retry/idempotency key where available.
- `outbound_attribution_id` provides canonical reporting joinability.

## Tests run

- `node --import tsx --test apps/ti-web/lib/hotelPlannerAttribution.test.ts apps/ti-web/lib/venueHotelFunnel.test.ts apps/ti-web/lib/hotelPlannerProvider.test.ts apps/ti-web/lib/booking/venueBooking.test.ts`
- `npx tsc -p apps/ti-web/tsconfig.json --noEmit`

## Controlled verification

- Local controlled verification covered:
  - Book Travel property handoff URL generation
  - venue-map property handoff URL generation
  - `/go/hotels` canonical attribution generation
  - type-safe persistence wiring
- No production booking was created in this phase.

## HotelPlanner booking-report verification

- Status: unverified in this implementation pass
- Required follow-up:
  - create one controlled booking or equivalent non-production booking report check
  - confirm `Custom3` returns unchanged
  - confirm deterministic join back to one `ti_outbound_clicks` row by `outbound_attribution_id`

## SQL created

- `scripts/analysis/ti_hotel_booking_attribution_reconciliation.sql`

## Deployment order

1. Apply `supabase/migrations/20260727_ti_hotel_booking_attribution_phase2a.sql`
2. Deploy application code
3. Run one controlled post-deploy outbound verification
4. Run booking-report reconciliation when HotelPlanner reporting is available

## Rollback steps

- Application rollback is safe after the additive migration.
- Do not remove the additive columns or indexes in the same rollback unless a separate migration is prepared.
- Old code remains compatible with the additive schema.

## Remaining limitations

- HotelPlanner booking-report return of `Custom3` is not yet proven.
- Venue-directory and tournament-detail static `/go/hotels` links can still rely on route-time token generation when no prebuilt outbound token is present.
- Checkout continuation is not independently re-tokenized and still depends on prior handoff state.

## Production behavior still unverified

- Actual HotelPlanner booking-report return of `Custom3`
- Production retry behavior for non-`outbound_request_id` flows
- Production duplicate protection for direct property handoffs under repeated rapid clicks

## Final verdict

`PASS WITH LIMITATIONS — internal booking contract works but HotelPlanner report return remains unverified`
