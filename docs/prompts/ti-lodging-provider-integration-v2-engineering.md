# TI Lodging Provider Integration — Engineering Tasking v2

## Scope
Implement provider-based lodging in stages. Step boundaries are mandatory:
1) Foundation + `POST /api/lodging/search`  
2) availability + group request  
3) map UI  
4) handoff/reporting/scaffolds  

Keep `/api/lodging/search` Step 1 fully deterministic before moving forward.

## Step 1 locked acceptance
- Only these files/changes in Step 1:
  - provider contract + HotelPlanner search scaffolding
  - `POST /api/lodging/search`
  - migration for `lodging_search_session`
  - rate-limit guard for search
  - safe fallbacks + non-blocking telemetry writes
- Explicitly defer all checkout handoff, report-sync, and `lodging_partner_events` writes to Step 4.

## Step 1 implementation requirements

### 1) Persistence and migration
- Create/extend `lodging_search_session` table if absent with:
  - `id uuid primary key default gen_random_uuid()`
  - `provider text not null`
  - `search_query jsonb`
  - `correlation_id text not null`
  - `session_id text`
  - `response_snapshot jsonb`
  - `result_count int`
  - `endpoint text not null default '/api/lodging/search'`
  - `status text` (`started|succeeded|failed`)
  - `started_at timestamptz default now()`
  - `ended_at timestamptz`
  - `latency_ms int`
  - `client_ip text`
  - `user_agent text`
  - `error_code text`
  - `fallback_reason text`
  - `created_at timestamptz default now()`
  - `updated_at timestamptz default now()`
- Add index:
  - `create index lodging_search_session_client_ip_endpoint_created_at_idx on public.lodging_search_session (client_ip, endpoint, created_at desc);`
- Generate a single UUID per search request. Store it in both `correlation_id` and `session_id`, and return it as `sessionId` in the response.  

### 2) `/api/lodging/search` contract
- Build `POST /api/lodging/search` with strict validation for:
  - `venueId` (uuid)
  - optional `tournamentId`
  - optional `checkin`, `checkout`, `rooms`, `adults`
- Resolve provider server-side:
  - route reads provider from `getLodgingProviderName()` / `TI_LODGING_PROVIDER`
  - do not accept or trust any client-provided `provider` input
  - include resolved provider in response payload only
- Use `supabaseAdmin` for **all** DB reads/writes in this route (public, unauthenticated path).
- Resolve dates in this exact order:
  - explicit request dates
  - `tournamentId` lookup in `tournaments_search_public` using `start_date`, `end_date`
  - if unresolved -> safe fallback: `reason = "no_dates"` and return fallback payload without provider call
- If no usable venue coordinates are available:
  - if venue has city+state, construct destination string and use that as `destination`
  - if destination cannot be resolved from either coordinates or city/state, set fallback `reason = "no_venue_coordinates"`
- If `venueId` is provided but no venue row is found:
  - return `400` with a clear "venue not found" message (not silent fallback)
- Return response shape:
  - `sessionId`
  - `provider`
  - `hotels`
  - `fallback: { showBookingFallback, showVrboFallback, reason? }`
- Low inventory condition remains explicit: `< 3 usable hotels => fallback true` (unless Step 1 spec later changes).
- Never throw on data-quality issues that should degrade to fallback (invalid date, missing coordinates, partial tournament fields).
- For early-exit fallbacks (`no_dates`, `no_venue_coordinates`), return fallback payload without provider call and do **not** attempt provider invocation.

### 3) Rate limiting and session lifecycle (best-effort abuse guard)
- Use DB-backed rate limiting in `lodging_search_session` with key: `client_ip`, `user_agent`, endpoint.
- Use a rolling window for rate checks (not fixed buckets), e.g.:
  - `WHERE client_ip = $1 AND endpoint = $2 AND user_agent = $3 AND created_at > now() - interval '60 seconds'`
- Baseline tuneable values (not hard final prod commitments):
  - burst: `5 req / 5s`
  - sustained: `30 req / 60s`
- Flow sequence is required:
  1. Validate request payload (including `venueId` type/shape)
  2. Resolve dates and venue destination
  3. If early-fallback condition (`no_dates`/`no_venue_coordinates`), return fallback immediately; do not perform rate-limit insert (no session row should remain started)
  4. Check recent request count for this IP+UA+endpoint
  5. Insert session row with `status = 'started'` before provider call (claims the request slot)
  6. Call provider
  7. Update that same row to:
     - `status = 'succeeded'` when provider returns usable response
     - `status = 'failed'` when provider call errors
     - `latency_ms`, `result_count`, `response_snapshot`, `error_code`, `fallback_reason` as applicable
- If implementation inserts a session row before early-fallback checks (for any reason), that row must be updated to `status = 'failed'` with `fallback_reason` before returning.
  - MVP caveat: this is best-effort concurrency control; simultaneous requests may still both pass before insert in high-race windows, and that is acceptable for now
- Return `429` when limits are exceeded before provider invocation.
- `response_snapshot` should be written only when final status = `failed` (never on successful search responses).

### 4) Analytics/event persistence behavior for Step 1
- `lodging_api_search_started`, `lodging_api_search_succeeded`, `lodging_api_search_failed` are server-side lifecycle rows written in Step 1 directly to `lodging_search_session` via `supabaseAdmin`.
- Do **not** route these Step 1 server lifecycle events through `/api/analytics/route.ts`.
- On low-inventory result (`< 3 usable hotels`), set `fallback_reason = 'low_inventory'` on the session row and return fallback state.
- For low-inventory responses that otherwise succeed, session `status` should be `succeeded` (with `fallback_reason = 'low_inventory'`), not `failed`.
- No separate `lodging_low_inventory` event row is required in Step 1.
- Keep all DB telemetry writes best-effort:
  - wrap in `try/catch`
  - failures must not block search response

### 5) Provider wiring details
- Validate required env in config/init:
  - `TI_LODGING_PROVIDER`
  - `HOTELPLANNER_API_KEY`
  - `HOTELPLANNER_SECRET_KEY`
  - `HOTELPLANNER_ACCOUNT_ID`
  - `HOTELPLANNER_SITE_ID`
  - `HOTELPLANNER_BASE_URL`
  - `HOTELPLANNER_WHITE_LABEL_BASE_URL`
- Build HotelPlanner search input with:
  - `checkIn` / `checkOut` in `mm/dd/yyyy`
  - mapped counts (`roomCount`, `adultCount`, `childCount`)
  - pass extracted `client_ip` to `customerIPAddress` (required by provider telemetry contract)
  - pass request `User-Agent` to `customerUserAgent`
  - passthrough fields: `sc`, `keyword`, `jobCode`, `customField1..8`, `groupTypeCode`
- Enforce no-`reserve` policy in MVP (explicitly blocked).

### 6) Step 1 required errors
- `400` validation input
- `429` rate limit
- `502` HotelPlanner/API provider failures
- `500` only for unexpected execution exceptions

### 7) Step 1 tests
- Date resolution order test: request dates > tournament lookup from `tournaments_search_public` > fallback.
- No-dates and no-coordinates safe fallback payload tests.
- venueId missing/invalid behavior test (`400` when lookup returns no row).
- Concurrency/burst test validates insertion-before-provider control path and documents approximate-limiting behavior under simultaneous requests.
- `supabaseAdmin` required for route reads/writes test (no RLS/session dependency).
- DB write-failure resiliency test (session/event inserts must be ignored for response path).
- `client_ip` stored as text test for deterministic write behavior.
- Contract tests for request parsing and fallback reason semantics.

### Hard constraints (all steps)
- Preserve fallback UX in map/availability surfaces when provider fails/low inventory/timeout.
- Never surface payment collection or call reserve APIs through TI.

## Delivery track (overall, Step 2+)
2. Availability and group-request endpoints
- Implement `/api/lodging/availability`.
- Implement `/api/lodging/group-request` with `team_block_*` eventing and minimum 5 rooms.
- Defer partner-events persistence for group flow to Step 4.

3. Map UI
- Trigger search from map route and render lodging cards/pins in dedicated components.
- Fetch availability on card interaction only; render handoff/group CTA in card flow.
- Preserve Booking.com and VRBO fallback behavior.

4. Checkout handoff and provider reporting
- Add `POST /api/lodging/checkout-handoff`.
- Add protected `POST /api/lodging/report-sync` scaffold (admin/cron).

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

Note: `lodging_low_inventory` emission is client-side and is deferred to Step 3 (map UI rendering path).
