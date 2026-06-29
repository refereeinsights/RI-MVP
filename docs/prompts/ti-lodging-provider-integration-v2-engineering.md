# TI Lodging Provider Integration — Engineering Tasking v2

## Delivery track
1. Provider abstraction
- Create `apps/ti-web/lib/lodging/lodging-provider.ts` for normalized interfaces.
- Add `HotelPlannerProvider` under same folder with typed methods:
  - `ping`, `multiPropertySearch`, `propertyAvailability`, `createGroupRequest`.
- Add a minimal provider factory and guard that uses `TI_LODGING_PROVIDER` to select active provider.
- Add shared helper for auth token generation and request signing.
- Use shared constants/enums for provider names:
  - `hotelplanner`, `fallback` (future providers are supported but not implemented).
- Include request builder tests for:
  - base64url token generation (no `=` padding),
  - epoch propagation in URL/signature,
  - `Authorization` and `x-hp-api-siteid`,
  - `customerIPAddress` and `customerUserAgent` passthrough.
- Validate required HotelPlanner env vars during route/config initialization.
- Add a hard guard so `reserve` is never called or exposed in MVP client/server code path.
- Add date helpers:
  - infer check-in as one day before event start,
  - infer check-out as event end or +1 day,
  - normalize to `mm/dd/yyyy`,
  - handle `no_dates` safely.
- Add request helpers for `sc`, `keyword`, `jobCode`, `customField1`..`customField8`, and `groupTypeCode` passthrough.

2. Search and group-request endpoints
- Implement `POST /api/lodging/search` with schema validation + auth/rate controls.
  - Date input is required for meaningful availability; pass `tournament_start_date` and `tournament_end_date` through from server-rendered map data.
  - Normalize response to include explicit `fallback` block and provider field.
  - Return `lodging_api_search_started/succeeded/failed` and `lodging_low_inventory` events as applicable.
- Implement `/api/lodging/availability` with provider call + provider error normalization.
  - Emit `hotel_availability_requested/succeeded/failed`.
  - Ensure availability is triggered on hotel selection/click only.
  - Apply rate limits with concrete in-app control (e.g. `apps/ti-web/lib/rateLimit.ts` equivalent or explicit Supabase table-backed counter) for unauthenticated calls:
    - one request per IP+UA+path per 10 seconds minimum,
    - burst <= 6 per minute.
- Implement `/api/lodging/group-request` with input validation and idempotency.
  - Enforce minimum 5 rooms.
  - Set default `groupTypeCode` to `143` when absent.
  - Emit `team_block_cta_click`, `team_block_rfp_start`, and `team_block_rfp_submit`.
  - Required fields include:
    - `firstName`, `lastName`, `email`, `split`, `rating`, `roomTypeCode`, `comments`, `targetRate`, `minRate`, `itinerary`.
  - Group request flow must collect required provider fields and pass them unchanged:
    - `split`, `rating`, `roomTypeCode`, `comments`, `targetRate`, `minRate`, `itinerary`.

3. Checkout handoff and provider reporting
- Add `POST /api/lodging/checkout-handoff`:
  - validate provider/session/hotel context,
  - build HotelPlanner-hosted handoff payload/URL with `checkoutUrl`, `bundleFormValue`, and optional `returnUrl`/`failureUrl`,
  - return payload so frontend performs form POST to `checkoutUrl` with `bundle` form param,
  - emit `hotel_checkout_handoff`.
  - Checkout route does not call `verifyBundle`; document that the HotelPlanner-hosted handoff flow handles any final bundle validation required for checkout UX.
- Return only hosted partner checkout data (no payment fields, pricing tokens, or card data through TI).
- Add protected `POST /api/lodging/report-sync` scaffold:
  - admin/cron-only access (mirror existing `x-cron-secret` / `x-vercel-cron: 1` pattern in repo),
  - TODO marker for HotelPlanner `getReport` integration,
  - placeholder persistence mapping for future booking/commission sync tables.
- Add explicit feature flag docs for provider selection (`TI_LODGING_PROVIDER`).

4. Data and tracking
- Add/extend `lodging_search_session` and `lodging_partner_events` persistence.
- Ensure all routes write correlation IDs, request latencies, and provider names.
- Emit required event taxonomy (below) for search, map/pin/card impressions/clicks, availability, handoff, and group flow.
  - Include correlation to user/session/search IDs.
- Keep `fallback.showBookingFallback` and `fallback.showVrboFallback` output states in session record.
- Add allowlist update in `apps/ti-web/app/api/analytics/route.ts`:
  - add lodging event set
  - route events into `ti_map_events` with page_type = `lodging` and property-preserving fields.
- Add a dedicated write path for structured partner events:
  - `apps/ti-web/app/api/lodging/events` (or equivalent helper) -> `lodging_partner_events`.

5. Frontend map integration
- Add lodging search trigger in:
  - `apps/ti-web/app/tournaments/[slug]/map/page.tsx`
  - `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapShellClient.tsx`
  - `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapClient.tsx`
  - and any other venue detail screens you explicitly scope in v1 of map integration.
- In `page.tsx`, pass tournament dates (`start_date`, `end_date`) and tournament name/sport/state into shell/client props so lodging date inference can function.
- Render hotel pins/cards in a contained lodging component (new file/component), not inline in the 2k+ line `TournamentVenueMapClient.tsx`:
  - `TournamentVenueMapClient.tsx` should stay orchestration-only and pass narrow lodging props/callbacks.
  - Render `LodgingMapCards` in the selected venue detail panel, **below the existing `stayBlock` action row** (where current `View nearby hotels` / `Rentals nearby` CTAs live), unless `go/hotels` redirect path is already selected by user.
- Fetch availability on hotel card open/selection only, and show room detail only after availability payload arrives.
- Render hotel list and map items as “From $X/night”.
- Build checkout handoff URL and open HotelPlanner-hosted flow.
- Implement group-request path for:
  - CTA copy: “Need 5+ rooms?”
  - secondary CTA: “Request a team hotel block”.
- Preserve existing Booking.com and VRBO links; no replacement behavior in v2.

6. Fallbacks and resilience
- Handle search/availability failures gracefully.
- Use Booking.com and VRBO fallback when provider fails/timeout/low inventory/no results.
- Record `lodging_api_search_failed` and `lodging_low_inventory` events with `fallback.reason`.
- Keep existing redirect/CTA logic so VRBO remains independent path.
- Keep Booking.com fallback as long-term default path.
- Never call reserved payment endpoints from TI.
- In map mode, maintain current hotel tile behavior when provider call fails (no blank map state).

7. Testing
- Unit tests: mapping/normalization/date formatting and event constants.
- Integration tests:
  - auth/signature helper behavior,
  - env-guard failures for missing HotelPlanner config,
  - search/availability/group-request contract tests.
- End-to-end smoke plan using staging dataset with explicit fallback/failed/low-inventory cases.
- Add auth checks for `/api/lodging/report-sync` and `/api/lodging/checkout-handoff` endpoints (401/403 expected for unauthorized).

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
