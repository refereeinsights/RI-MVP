# TI Lodging Provider Integration — QA Checklist v2

## Functional acceptance
- [ ] Search returns normalized results using HotelPlanner when flag enabled.
- [ ] Destination mapping works with both lat/lon and venue address.
- [ ] Dates are sent and displayed as `mm/dd/yyyy`.
- [ ] Hotel card renders name, distance, rating, reviewCount, thumbnail, from-price.
- [ ] Clicking card fetches availability and renders room options.
- [ ] Checkout flow uses HotelPlanner white-label handoff URL.
- [ ] "Need 5+ rooms?" opens group request and submits successfully.

## Guardrail checks
- [ ] No HotelPlanner API credentials are present in client bundles/network payloads.
- [ ] `getProfile` is not called on SEO-indexed pages without interaction.
- [ ] No `reserve`/payment API calls from TI UI or API routes in MVP.
- [ ] VRBO remains independent CTA path.
- [ ] Booking.com fallback still reachable on HotelPlanner fallback conditions.

## Reliability checks
- [ ] `ping` succeeds in deployment readiness checks.
- [ ] 30-second auth window handled (fresh epoch per request).
- [ ] Retry/backoff policy is scoped to transient transport failures only.
- [ ] Provider timeout/failures do not break map rendering.

## Analytics checks
- [ ] Required events are emitted with session correlation:
  - `lodging_search_started`
  - `lodging_search_completed` and `lodging_search_failed`
  - `lodging_impression`
  - `lodging_click`
  - `lodging_availability_requested`
  - `lodging_checkout_handoff`
  - `lodging_group_request_submitted`
- [ ] Fallback event logs when provider fails/no results.

## Notes
- Use these docs to guide implementation and UAT for Stage 3.0 of lodging rollout.
