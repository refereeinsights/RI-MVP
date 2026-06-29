# TI Lodging Provider Integration — Step 3 (Map UI) Implementation Prompt

You are implementing **Step 3** of `ti-lodging-provider-integration-v2`.

## Scope boundary
- Step 1 (search API), Step 2 (availability/group-request) are complete.
- Step 3 = map UI only (dynamic pin discovery + click-to-availability).
- Step 4 (checkout handoff, reporting, partner events persistence) is explicitly deferred.
- No checkout/payment collection and no `reserve` usage.

## Required source-of-truth
`/api/lodging/search` and `/api/lodging/availability` calls should drive map hotel discovery and details.

## Mandatory date fix (blocking)
`/api/lodging/availability` requires `checkin` + `checkout`, but tournament map page does not expose date fields.

- Extend `apps/ti-web/app/api/lodging/search/route.ts` response payload (handler-level only) to include:
  - `resolvedCheckIn: string | null`
  - `resolvedCheckOut: string | null`

These are resolved server-side from `tournamentId`.

## 3A) New Step-3 housing components
Create:
- `apps/ti-web/app/tournaments/[slug]/map/components/LodgingHotelPanel.tsx`
- `apps/ti-web/app/tournaments/[slug]/map/components/LodgingHotelPins.tsx` (optional)

Keep `TournamentVenueMapClient.tsx` as orchestration glue; avoid adding large hotel logic there.

## 3B) Search-driven hotels (replace static hotpins)
When a venue is selected, call:
- `POST /api/lodging/search`
- payload: `{ venueId, tournamentId }`

Do not pass date context from the map page itself.

Use the response hotels as the source for hotel pin rendering. Remove Owl’s Eye static hotel category as the primary hotel discovery source.

## 3C) Pin model and normalization
Pin fields (Step 3 only):
- `propertyId: string`
- `name: string`
- `addressLine1?: string`
- `city?: string`
- `state?: string`
- `distanceMiles?: number`
- `rating?: number`
- `reviewCount?: number`
- `thumbnailUrl?: string`
- `fromPrice?: number | null`
- `currency?: string | null`
- `latitude?: number`
- `longitude?: number`
- `resolvedCheckIn?: string | null`
- `resolvedCheckOut?: string | null`
- `raw?: unknown` (optional forward-compat; Step 4 can consume it)

Important: `addressLine1/city/state` are separate source fields; compute any combined address string in rendering only.

When normalizing search results, copy the top-level `resolvedCheckIn` / `resolvedCheckOut` into each pin object.

## 3D) Pin selection / visibility rules
- Desktop cap: 10
- Mobile cap: 6

Render with this priority:
1) nearest distance, 2) lowest `fromPrice`.

Deduplicate by `propertyId`.

SSR-safe cap behavior:
- default to desktop cap **10** during SSR/hydration,
- switch to mobile cap **6** only after mount using an existing responsive hook pattern.

## 3E) Marker placement rules
If a hotel has no coordinates:
- include it in list/panel,
- skip map marker creation,
- do not count it toward the marker cap.

## 3F) Handoff URL behavior (single canonical pattern)
Use this existing map CTA pattern everywhere in Step 3:
`/go/hotels?provider=hotelplanner&venueId=<venueId>&tournamentId=<tournamentId>&source=venue_map`

Do **not** introduce `ss` unless it is already produced upstream in existing logic.

On all fallback states, use this exact same format.

## 3G) Availability on demand
On hotel marker/card interaction:
1. If `resolvedCheckIn` or `resolvedCheckOut` is `null`, skip the availability call and show fallback state immediately.
2. Else call `POST /api/lodging/availability` with:
   - `propertyId`
   - `checkin: resolvedCheckIn`
   - `checkout: resolvedCheckOut`
   - `rooms/adults` defaults from search defaults.
3. Render loading state.
4. Render room/rate options on success.
5. On failure/no-rates, render fallback + hotel handoff CTA.

## 3H) Stale request protection
Use a `useRef` guard with request nonce:
- generate a request id per click,
- store in ref,
- apply response only if ids match.

## 3I) Fallback and error behavior
Show fallback state (with handoff link) when:
- search returns no hotels **or** `fallback.showBookingFallback === true`,
- search availability errors,
- no resolved dates,
- `/api/lodging/search` returns `429`.

On `429`, show non-blocking rate-limit message; do not block venue switching/map interactions.

## 3J) Tracking (Step 3)
Emit:
- `lodging_map_impression` (map-level lodging context)
- `hotel_pin_impression` (one event per render batch with `count`)
- `hotel_pin_click` on marker click
- `hotel_card_click` when card open/expand is distinct
- `hotel_availability_requested`
- `hotel_availability_succeeded`
- `hotel_availability_failed`
- `hotel_room_view` when rates/options render

`team_block_*` events are deferred to Step 4.

## Acceptance criteria
- Map hotel discovery uses `POST /api/lodging/search`.
- `resolvedCheckIn`/`resolvedCheckOut` are passed to availability where available.
- Hotels with no coords are list-only and not capped as markers.
- `hotel_pin_impression` is batched, not per-pin.
- Handoff remains `/go/hotels` URL redirect form.

## Manual UAT
1. Open map, select venue.
2. Confirm hotel markers render from search and cap is applied (desktop 10/mobile 6).
3. Confirm zero-hotel result or booking-fallback shows fallback panel + `/go/hotels` CTA.
4. Click hotel: verify availability fetch occurs only on click with resolved dates.
5. For null resolved dates, verify no availability request and immediate fallback handoff.
6. Verify no map blocker on search `429` and rates/marker failures.
7. Confirm event firing set above, including batch pin impression count.
