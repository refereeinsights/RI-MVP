# TI Lodging Provider Integration — QA Checklist v2

## Functional acceptance
- [ ] Search returns normalized results using HotelPlanner when flag enabled.
- [ ] Map page/server data includes tournament `start_date` and `end_date` and passes through to lodging search triggers.
- [ ] Destination mapping works with both lat/lon and venue address.
- [ ] Dates are sent and displayed as `mm/dd/yyyy`.
- [ ] Defaults are safe for missing/invalid dates and missing venue coordinates.
- [ ] Search response includes fallback block with `showBookingFallback`, `showVrboFallback`, and reason when applicable.
- [ ] Provider failure/no usable hotels surfaces Booking.com and VRBO fallback CTAs with current link format intact.
- [ ] Hotel card renders name, distance, rating, reviewCount, thumbnail, from-price.
- [ ] Clicking card fetches availability and renders room options only after successful availability response.
- [ ] Checkout handoff flow uses HotelPlanner-hosted flow via HTML form POST (`bundle` field to checkout URL).
- [ ] Group request path enforces 5+ rooms and defaults `groupTypeCode = 143`.
- [ ] “Need 5+ rooms?” / “Request a team hotel block” CTA opens and submits flow with required payload fields.
- [ ] Existing `/go/hotels` and `/go/vrbo` redirect behavior is unchanged unless user clicks inside new HotelPlanner panel.
- [ ] Hotel lodging cards/panel render in a dedicated component (not inline in `TournamentVenueMapClient.tsx`) and appear in the selected venue detail panel.

## Event taxonomy acceptance
- [ ] Events are emitted with exact names:
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
- [ ] `hotel_checkout_handoff` includes session/hotel context and uses provider handoff URL.
- [ ] `lodging_api_search_failed` logs normalized error code/cause.
- [ ] `lodging_low_inventory` triggers when usable hotels < 3 or unusable payload.
- [ ] Event ingestion for lodging names is enabled in analytics allowlist and persisted via `apps/ti-web/app/api/analytics/route.ts`.

## Guardrail checks
- [ ] No HotelPlanner API credentials are present in client bundles/network payloads.
- [ ] `getProfile` is not called on SEO-indexed pages without interaction.
- [ ] No `reserve`/payment API calls from TI UI or API routes in MVP.
- [ ] VRBO remains independent CTA path.
- [ ] Booking.com fallback still reachable on HotelPlanner fallback conditions.
- [ ] Checkout handoff never collects or stores payment details.

## Reliability checks
- [ ] `ping` succeeds in deployment readiness checks.
- [ ] `authorization` token, epoch, `x-hp-api-siteid`, IP/user-agent headers are validated via tests.
- [ ] 30-second auth window handled (fresh epoch per request).
- [ ] Retry/backoff policy is scoped to transient transport failures only.
- [ ] Missing HotelPlanner environment variables fail closed with clear server error.
- [ ] Provider timeout/failures do not break map rendering.
- [ ] Low inventory and timeout cases set fallback reasons.
- [ ] `/api/lodging/search` and `/api/lodging/availability` remain responsive under concurrent requests with safe defaults.

## Reporting sync and security checks
- [ ] `POST /api/lodging/report-sync` is admin-only or cron-restricted (`x-cron-secret` + x-vercel-cron fallback path if used).
- [ ] Reporting endpoint contains explicit TODO/placeholder for future `getReport` sync.
- [ ] Schema support for booking and commission sync is scaffolded safely.
- [ ] `POST /api/lodging/checkout-handoff` rejects unauthorized calls and does not expose user/session data to non-owner.

## Analytics checks
- [ ] Required events are emitted with search/session correlation:
  - `lodging_api_search_started`
  - `lodging_api_search_succeeded` and `lodging_api_search_failed`
  - `lodging_low_inventory`
  - `hotel_pin_impression`
  - `hotel_card_click`
  - `hotel_availability_requested`
  - `hotel_availability_succeeded`
  - `hotel_checkout_handoff`
  - `team_block_rfp_submit`
- [ ] Fallback event logs when provider fails/no results.
- [ ] `hotel_pin_click`/`hotel_card_click` include venue/session/hotel IDs and provider name.

## Notes
- Use these docs to guide implementation and UAT for Stage 3.0 of lodging rollout.
