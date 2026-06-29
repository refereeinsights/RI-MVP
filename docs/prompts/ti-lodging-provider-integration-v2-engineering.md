# TI Lodging Provider Integration — Engineering Tasking v2

## Delivery track
1. Provider abstraction
- Create `apps/ti-web/lib/lodging/lodging-provider.ts` for normalized interfaces.
- Add `HotelPlannerProvider` under same folder with typed methods:
  - `ping`, `multiPropertySearch`, `propertyAvailability`, `createGroupRequest`.
- Add shared helper for auth token generation and request signing.
- Include request builder tests for:
  - base64url token generation (no `=` padding),
  - epoch propagation in URL/signature,
  - `Authorization` and `x-hp-api-siteid`,
  - `customerIPAddress` and `customerUserAgent` passthrough.
- Ensure required HotelPlanner env vars are validated at startup.
- Add a hard guard so `reserve` is not called or exposed in MVP client.
- Add date helpers:
  - infer check-in as one day before event start,
  - infer check-out as event end or +1 day,
  - normalize to `mm/dd/yyyy`,
  - handle `no_dates` safely.

2. Search and group request endpoints
- Implement `POST /api/lodging/search` with schema validation + auth/rate controls.
  - Normalize response to include explicit `fallback` block and provider field.
  - Return `lodging_api_search_started/succeeded/failed` and `lodging_low_inventory` events as applicable.
- Implement `/api/lodging/availability` with provider call + provider error normalization.
  - Emit `hotel_availability_requested/succeeded/failed`.
  - Ensure availability is triggered on hotel selection/click only.
- Implement `/api/lodging/group-request` with input validation and idempotency.
  - Enforce minimum 5 rooms.
  - Set default `groupTypeCode` to `143` when absent.
  - Emit `team_block_cta_click`, `team_block_rfp_start`, and `team_block_rfp_submit`.

3. Checkout handoff and provider reporting
- Add `POST /api/lodging/checkout-handoff`:
  - validate provider/session/hotel context,
  - build HotelPlanner-hosted handoff payload/URL,
  - attach return/failure URLs where supported,
  - emit `hotel_checkout_handoff`.
- Return only hosted partner checkout URL (no payment data passes through TI).
- Add protected `POST /api/lodging/report-sync` scaffold:
  - admin/cron-only access,
  - TODO marker for HotelPlanner `getReport` integration,
  - placeholder persistence mapping for future booking/commission sync tables.
- Add feature flag for provider selection (`TI_LODGING_PROVIDER`).

4. Data and tracking
- Add/extend `lodging_search_session` and `lodging_partner_events` persistence.
- Ensure all routes write correlation IDs and request latencies.
- Emit required event taxonomy (below) for search, card/pin impressions/clicks, availability, handoff, and group flow.
  - Include correlation to user/session/search IDs.
- Keep `fallback.showBookingFallback` and `fallback.showVrboFallback` output states in session record.

5. Frontend map integration
- Add lodging search trigger in relevant tournament/venue/map pages.
- Render hotel pins/cards next to venue context.
- Fetch availability on card open/selection.
- Render hotel list and map items as “From $X/night”.
- Show live room options only after availability is fetched.
- Build checkout handoff URL and open HotelPlanner-hosted flow.
- Implement group request path for “Need 5+ rooms?” and “Request a team hotel block” CTA.

6. Fallbacks and resilience
- Handle search/availability failures gracefully.
- Use Booking.com and VRBO fallback when provider fails/timeout/low inventory/no results.
- Record `lodging_api_search_failed` and `lodging_low_inventory` events with `fallback.reason`.
- Keep existing redirect/CTA logic so VRBO remains independent path.
- Keep Booking.com fallback as long-term default path.
- Never call reserved payment endpoints from TI.

7. Testing
- Unit tests: mapping/normalization/date formatting and event constants.
- Integration tests:
  - auth/signature helper behavior,
  - env-guard failures for missing HotelPlanner config,
  - search/availability/group-request contract tests.
- End-to-end smoke plan using staging dataset with explicit fallback/failed/low-inventory cases.

## Required event names
- `lodging_api_search_started`
- `lodging_api_search_succeeded`
- `lodging_api_search_failed`
- `lodging_low_inventory`
- `lodging_map_impression`
- `hotel_pin_impression`
- `hotel_card_view`
- `hotel_pin_click`
- `hotel_card_click`
- `hotel_availability_requested`
- `hotel_availability_succeeded`
- `hotel_availability_failed`
- `hotel_room_view`
- `hotel_checkout_handoff`
- `team_block_cta_click`
- `team_block_rfp_start`
- `team_block_rfp_submit`
- `partner_booking_reported`
- `partner_booking_cancelled`
- `lodging_commission_reported`
