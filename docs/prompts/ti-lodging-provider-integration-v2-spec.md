# TI Lodging Provider Integration — Spec v2

## Scope
Implement a provider-based lodging integration in TournamentInsights with HotelPlanner as the first provider.

## Non-Negotiables
- HotelPlanner credentials must remain server-side only.
- No TI-owned payment collection.
- Do not call `reserve` in MVP.
- Use HotelPlanner white-label checkout handoff only.
- Do not use HotelPlanner `getProfile` on SEO-indexed pages.
- Keep VRBO separate as vacation-rental CTA.
- Keep Booking.com as fallback unless conversion data supports replacement.

## Provider contract
Normalized interface:
- `searchHotels(input: SearchHotelsInput): Promise<SearchHotelsResult>`
- `getHotelAvailability(input: HotelAvailabilityInput): Promise<HotelAvailabilityResult>`
- `createGroupRequest(input: GroupRequestInput): Promise<GroupRequestResult>`

## Day-1 task ordering (locked)
1. Foundation: provider contracts/types and date/event constants.
2. HotelPlanner client: auth + request builder + methods.
3. API routes: search, availability, group request.
4. Tracking/event persistence and fallback responses.
5. Frontend hotel cards/pins + availability drawer.
6. Checkout handoff + team-block CTA path.
7. QA/smoke and hardening notes.

## Environment requirements
- `TI_LODGING_PROVIDER`
- `HOTELPLANNER_API_KEY`
- `HOTELPLANNER_SECRET_KEY`
- `HOTELPLANNER_ACCOUNT_ID`
- `HOTELPLANNER_SITE_ID`
- `HOTELPLANNER_BASE_URL`
- `HOTELPLANNER_WHITE_LABEL_BASE_URL`

## Input mapping to HotelPlanner fields
- Destination: prefer `latitude,longitude` then fallback to venue address.
- Date format: `mm/dd/yyyy` for `checkIn` and `checkOut`.
- Date source (map integration): tournament or venue-context `start_date` + `end_date` must be passed to lodging search payload; if missing, return safe `fallback.reason = no_dates`.
- `rooms` / `roomCount` → `roomCount`.
- `adultsPerRoom` / `adultCount` → `adultCount`.
- `childrenPerRoom` / `childCount` → `childCount`.
- `checkIn` default: day before tournament start.
- `checkOut` default: tournament end date (or +1 day if same as checkIn).
- Tracking passthrough:
  - `sc`
  - `keyword`
  - `jobCode`
  - `customField1` through `customField8`
  - `groupTypeCode`

Group-request provider fields (required by HotelPlanner createGroupRequest):
- `firstName`, `lastName`, `email`
- `split`, `rating`, `roomTypeCode`
- `comments`, `targetRate`, `minRate`, `itinerary`

Search response mapping note:
- `multiPropertySearch` response returns `hotels` and `availabilities` keyed separately; map join by hotel key/id before normalizing.

Date/geo safety:
- Missing/invalid venue dates or coordinates must return a safe search fallback response, not throw.
- If no usable venue coordinates and no fallback address, mark `fallback.reason = no_venue_coordinates`.
- Return safe fallback if there are insufficient valid dates (`no_dates`).

## Provider client requirements
HotelPlanner client must:
- Generate HMAC SHA256 auth token.
- Send `Authorization` and `x-hp-api-siteid` headers.
- Use HTTPS POST for all methods to `https://api.hotelplanner.com/hpapi/v2.3/`.
- Include URL params on each call: `method`, `epoch`, `customerIPAddress`, `customerUserAgent`, optional `locale/currency/sc`.
- Implement methods: `ping`, `multiPropertySearch`, `propertyAvailability`, `createGroupRequest`.
- Authorization token must use base64url (no padding) and include epoch in signature.
- Request signing must be testable in unit/integration tests.
- `reserve` is intentionally not implemented in MVP.
- Support optional `locale`, `currency`, and `sc` fields.
- Decide explicitly whether to call `verifyBundle` in handoff phase (`true` recommended if provider call is added).

## API layer expectations
- `/api/lodging/search` accepts search input and returns normalized results.
- `/api/lodging/availability` accepts selected property + stay/guest context and returns normalized room options.
- `/api/lodging/group-request` sends group request payload to provider and records result.
- Add checkout handoff endpoint:
  - `POST /api/lodging/checkout-handoff` accepts selected property/session bundle,
  - validates provider/session context,
  - logs `hotel_checkout_handoff`,
  - returns HotelPlanner hosted checkout handoff payload:
    - `checkoutUrl`
    - `bundleFormValue`
    - optional `returnUrl` and/or `failureUrl`
  - frontend must submit a form POST to `checkoutUrl` with `bundle` + return/failure fields.
- Add an explicit `report-sync` auth pattern:
  - require valid `x-cron-secret` and/or `x-vercel-cron: 1`; if absent, return 401/403.
- Add explicit `search/availability` unauthenticated throttle policy:
  - shared limiter keyed by IP+UA+endpoint, minimum 10-second spacing + burst control.

## Fallback behavior
- On provider failure, timeout, no usable hotels, or fewer than 3 usable hotels:
  - return `fallback.showBookingFallback = true`
  - return `fallback.showVrboFallback = true`
  - set `fallback.reason` when determinable: `provider_error`, `timeout`, `low_inventory`, `no_dates`, `no_venue_coordinates`.

Suggested response contract:
```ts
type LodgingSearchResponse = {
  sessionId: string;
  provider: "hotelplanner";
  hotels: LodgingMapHotel[];
  fallback: {
    showBookingFallback: boolean;
    showVrboFallback: boolean;
    reason?: "provider_error" | "timeout" | "low_inventory" | "no_dates" | "no_venue_coordinates";
  };
};
```

## Event taxonomy
Use explicit lodging/partner events:
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

## Data model
Track a per-search row and partner events:
- `lodging_search_session`
- `lodging_partner_events`

Suggested minimum schema fields for `lodging_partner_events`:
- `id uuid primary key`
- `session_id uuid nullable`
- `correlation_id text nullable`
- `event_name text`
- `partner text`
- `hotel_id text nullable`
- `hotel_name text nullable`
- `outbound_url text nullable`
- `price_before_tax numeric nullable`
- `price_after_tax numeric nullable`
- `currency text nullable`
- `distance_miles numeric nullable`
- `room_count int nullable`
- `latency_ms int nullable`
- `status text nullable`
- `error_code text nullable`
- `fallback_reason text nullable`
- `metadata jsonb nullable`
- `created_at timestamptz default now()`

Canonical analytics persistence allowlist:
- update `apps/ti-web/app/api/analytics/route.ts` to include all listed canonical lodging events in the allowlist set used for persistence.

## UI requirements
Map views should show hotel cards/pins with:
- hotel name
- distance from venue
- rating and review count
- thumbnail
- from-price and currency (list cards are from-price only)
- on click: availability flow (room options + handoff)
- 5+ rooms CTA opens group request flow.

## Group-request rules
- `createGroupRequest` should enforce minimum 5 rooms for Day-1.
- Add and persist explicit default `groupTypeCode = 143` (Sports-Youth) unless override is required later.

## Reporting sync
- Add reporting sync scaffold: `POST /api/lodging/report-sync`.
- Endpoint should be protected (admin/cron only), not public.
- Body should include TODO notes for future `getReport` integration and eventual schema sync updates.
