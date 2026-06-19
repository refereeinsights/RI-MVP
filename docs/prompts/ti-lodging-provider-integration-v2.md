# Implementation Prompt v2: Provider-Based Lodging API Layer (HotelPlanner MVP)

## Objective
Implement a production-safe lodging search/availability layer in TournamentInsights with HotelPlanner as the first provider, while preserving existing Booking.com/VRBO experiences and keeping credentials secure.

## Hard Constraints / Guardrails
- Never expose HotelPlanner credentials to client.
- No TI-owned payment collection.
- Do not call `reserve` in MVP.
- Use HotelPlanner white-label checkout handoff only.
- Do not use HotelPlanner `getProfile` on SEO-indexed pages.
- Keep VRBO as separate vacation rental CTA.
- Keep Booking.com path as fallback until HotelPlanner proves conversion.
- All external calls must happen server-side.

## Reference Inputs
- Use sanitized provider docs:
  - `docs/reference/hotelplanner-api-docs.md`
  - `docs/reference/ti-hotelplanner-implementation-notes.md`

## Deliverables (File scope)
1. Provider abstraction layer under `apps/ti-web/lib/lodging/`
2. API endpoints under:
   - `GET/POST /api/lodging/search`
   - `POST /api/lodging/availability`
   - `POST /api/lodging/group-request`
3. Tracking writes to:
   - `lodging_search_session`
   - `lodging_partner_events`
4. Frontend integration in existing map/event views:
   - map pins/cards + room panel flow
5. Tests + docs updates + smoke UAT checklist in docs

---

## Part A — Provider Client

Create a HotelPlanner provider client with:
- HMAC SHA256 auth token generation:
  - `Authorization = base64UrlEncode(apiKey) + "." + base64UrlEncode(HMAC_SHA256(signatureKey, secretKey))`
  - `signatureKey = base64UrlEncode(apiKey) + "|" + accountId + "|" + epoch`
- `x-hp-api-siteid` header support
- HTTP POST helper to HotelPlanner base URL:
  - `https://api.hotelplanner.com/hpapi/v2.3/`
- Required URL/query params on every request:
  - `method`, `epoch`, `customerIPAddress`, `customerUserAgent`, optional `locale`, `currency`, `sc`
- Implement methods:
  - `ping()`
  - `multiPropertySearch()`
  - `propertyAvailability()`
  - `createGroupRequest()`

### Required behavior
- Use fresh epoch per request.
- Return structured typed errors from HotelPlanner headers/body.
- Retry only for transient network failures (no blind auth retries).

---

## Part B — Normalized Lodging Provider Interface

Define provider-agnostic contract:

```ts
type SearchHotelsInput = {
  destination: {
    venueAddress?: string
    latitude?: number
    longitude?: number
  }
  checkIn: string // mm/dd/yyyy
  checkOut: string // mm/dd/yyyy
  roomCount: number
  adultCount: number
  childCount?: number
  roomOccupancy?: Array<{ adults: number; children?: number }>
  tracking: {
    sc?: string
    keyword?: string
    jobCode?: string
    customField1?: string
    customField2?: string
    customField3?: string
    customField4?: string
    customField5?: string
    customField6?: string
    customField7?: string
    customField8?: string
  }
  currency?: string
  locale?: string
}

type SearchHotelsResult = {
  sessionToken?: string
  properties: Array<{
    providerHotelId: string
    name: string
    address: string
    city: string
    latitude: number
    longitude: number
    rating?: number
    reviewCount?: number
    thumbnailUrl?: string
    fromPrice?: number
    currency?: string
    distanceFromVenueMiles?: number
  }>
}

type HotelAvailabilityInput = {
  providerHotelId: string
  checkIn: string
  checkOut: string
  roomCount: number
  adultCount: number
  childCount?: number
  tracking: SearchHotelsInput["tracking"]
}

type GroupRequestInput = {
  providerHotelId: string
  checkIn: string
  checkOut: string
  roomCount: number
  adultCount: number
  childCount?: number
  contact: { name: string; email: string; phone?: string }
  notes?: string
  tracking: SearchHotelsInput["tracking"]
}
```

Mapped from normalized interface to HotelPlanner args:
- `destination`: use `latitude,longitude` when present; else formatted venue address.
- `rooms`/`roomCount` -> `roomCount`
- `adultsPerRoom` -> `adultCount`
- `checkIn`/`checkOut` -> `mm/dd/yyyy`
- `tracking` fields to `sc`, `customField1-8`, `jobCode`, `keyword`.

---

## Part C — API Routes

### 1) `/api/lodging/search`
- POST only.
- Validates input schema and auth/rate limits.
- Creates search session and logs search attempt.
- Calls normalized provider `searchHotels`.
- Response is normalized, provider-neutral payload.

### 2) `/api/lodging/availability`
- POST only.
- Input includes selected property + dates/guests.
- Calls `getHotelAvailability`.
- Returns room options with prices and booking params for handoff.
- Logs `availability` event.

### 3) `/api/lodging/group-request`
- POST only.
- Calls `createGroupRequest`.
- Returns partner handoff or confirmation payload.
- Logs `group_request` event.

### Security + auth
- Decide auth policy for anonymous users:
  - Recommended: allow limited anonymous search only with strict rate limit + abuse controls.
  - Logged-in users get full search + group request with user attribution.
- Rate limit key: userId if present else IP.

---

## Part D — Tracking & Data Model

Create/extend logging with correlation:
- `lodging_search_session`
  - `id`, `user_id`, `session_key`, `provider`, `request_payload`, `result_count`, `request_time_ms`, timestamps
- `lodging_partner_events`
  - `id`, `session_id`, `event_name`, `provider`, `source` (`map`,`api`,`fallback`), `status`, `latency_ms`, `error_code`, `raw_tracking`, `request_id` (provider correlation id), timestamps

Mandatory events:
- `lodging_search_started`
- `lodging_search_completed` / `lodging_search_failed`
- `lodging_impression`
- `lodging_click`
- `lodging_availability_requested`
- `lodging_checkout_handoff`
- `lodging_group_request_submitted`

---

## Part E — Frontend (Map Integration)

Implement in existing map/tournament/venue pages:
1. Add lodging pins/cards near venue context.
2. Card must display:
   - name
   - distance from venue
   - rating + reviewCount
   - thumbnail
   - from-price + currency
3. Click card -> fetch `/api/lodging/availability`
   - show room options with rate summary and policy flags.
4. On room select -> create white-label handoff URL; redirect user to HotelPlanner checkout-hosted flow (no TI payment API).
5. If roomCount >= 5, show:
   - **Need 5+ rooms?** CTA opens group request modal/flow, posts to `/api/lodging/group-request`.

---

## Part F — Fallback behavior
- If HotelPlanner fails or returns no results:
  - fall back to existing Booking.com/VRBO pathway where existing.
  - still log `fallback_used` event.
- No fallback leakage on SEO pages unless interaction-triggered.

---

## Part G — Testing & UAT
- Unit tests for interface mapping and date/locale formatting.
- Integration tests for provider request signing and route validation.
- API contract tests for error handling and event writes.
- Staging smoke checklist:
  - search returns normalized results
  - availability loads for selected hotel
  - click handoff URL is HotelPlanner checkout-hosted
  - group request submits successfully
  - no credentials in client/network inspect
  - no `getProfile` calls on normal SEO page load
  - all required events recorded with session correlation

## Non-negotiables for PR acceptance
- No sensitive keys hardcoded or committed.
- No reserve/payment collection in UI or server.
- All three required routes exist and are typed, validated, and logged.
- Feature flag recommended: `TI_LODGING_PROVIDER=hotelplanner`.
