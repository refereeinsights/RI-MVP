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

## Input mapping to HotelPlanner fields
- Destination: prefer `latitude,longitude` then fallback to venue address.
- Date format: `mm/dd/yyyy` for `checkIn` and `checkOut`.
- `rooms` / `roomCount` → `roomCount`.
- `adultsPerRoom` / `adultCount` → `adultCount`.
- `childrenPerRoom` / `childCount` → `childCount`.
- Tracking passthrough:
  - `sc`
  - `keyword`
  - `jobCode`
  - `customField1` through `customField8`

## Provider client requirements
HotelPlanner client must:
- Generate HMAC SHA256 auth token.
- Send `Authorization` and `x-hp-api-siteid` headers.
- Use HTTPS POST for all methods to `https://api.hotelplanner.com/hpapi/v2.3/`.
- Include URL params on each call: `method`, `epoch`, `customerIPAddress`, `customerUserAgent`, optional `locale/currency/sc`.
- Implement methods: `ping`, `multiPropertySearch`, `propertyAvailability`, `createGroupRequest`.

## API layer expectations
- `/api/lodging/search` accepts search input and returns normalized results.
- `/api/lodging/availability` accepts selected property + stay/guest context and returns normalized room options.
- `/api/lodging/group-request` sends group request payload to provider and records result.

## Data model
Track a per-search row and partner events:
- `lodging_search_session`
- `lodging_partner_events`

Mandatory event names:
- `lodging_search_started`
- `lodging_search_completed`
- `lodging_search_failed`
- `lodging_impression`
- `lodging_click`
- `lodging_availability_requested`
- `lodging_checkout_handoff`
- `lodging_group_request_submitted`

## UI requirements
Map views should show hotel cards/pins with:
- hotel name
- distance from venue
- rating and review count
- thumbnail
- from-price and currency
- on click: availability flow (room options + handoff)
- 5+ rooms CTA opens group request flow
