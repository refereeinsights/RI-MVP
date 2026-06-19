# HotelPlanner Integration Reference (MVP)

## Included HP methods
- `ping`
- `multiPropertySearch`
- `propertyAvailability`
- `createGroupRequest`

## Transport & auth (required)
- Base URL: `https://api.hotelplanner.com/hpapi/v2.3/`
- HTTP method: `POST` only
- Headers:
  - `Authorization: <base64(ApiKey)>.<base64Url(HMACSHA256(base64(ApiKey)|AccountId|Epoch), SecretKey)`
  - `x-hp-api-siteid: <site id>`
  - `content-type: application/json; charset=UTF-8`
  - `content-encoding: gzip` when accepted
- Query params:
  - `method`, `epoch`, `locale`, `currency`, `customerIPAddress`, `customerUserAgent`, `sc`
- Tokens appear to be short-lived (~30 seconds); include fresh epoch on each call.
- Required failure codes include `816` (missing customerIPAddress) and `817` (ip auth fail).

## Inputs/outputs to normalize for TI

### `searchHotels` -> `multiPropertySearch`
- destination: prefer lat/lng from venue; fallback to formatted venue address.
- checkIn/checkOut: `mm/dd/yyyy`.
- rooms: `roomCount`
- adultsPerRoom: `adultCount`
- childrenPerRoom: `childCount` (if available)
- tracking fields:
  - `sc`
  - `keyword`
  - `customField1-8`
  - `jobCode`

### `getHotelAvailability` -> `propertyAvailability`
- property ID returned by search: `hpHotelId` or API property id.
- include desired date range and room mix.
- keep roomRate/rate details for display and handoff.

### `createGroupRequest`
- send grouped-room request when user asks for 5+ rooms CTA.
- preserve same destination/date/guest/tracking context used in search.

## Guardrails to preserve
- Keep credentials server-side only.
- Do not expose any payment/reserve flow in TI for MVP.
- White-label checkout handoff only.
- Maintain Booking.com as fallback.
- VRBO stays separate CTA path.
- Do not call `getProfile` on SEO-indexed pages; defer partner detail calls to user-initiated interactions.
