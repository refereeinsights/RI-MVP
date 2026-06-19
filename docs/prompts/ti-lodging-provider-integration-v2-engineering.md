# TI Lodging Provider Integration — Engineering Tasking v2

## Delivery track
1. Provider abstraction
- Create `apps/ti-web/lib/lodging/lodging-provider.ts` for normalized interfaces.
- Add `HotelPlannerProvider` under same folder with typed methods:
  - `ping`, `multiPropertySearch`, `propertyAvailability`, `createGroupRequest`.
- Add shared helper for auth token generation and request signing.

2. API routes
- Implement `GET/POST /api/lodging/search` with schema validation + auth/rate controls.
- Implement `/api/lodging/availability` with provider call + provider error normalization.
- Implement `/api/lodging/group-request` with idempotent submission and partner response passthrough.
- Add feature flag for provider selection (`TI_LODGING_PROVIDER`).

3. Data and tracking
- Add/extend `lodging_search_session` and `lodging_partner_events` persistence.
- Ensure all routes write correlation IDs and request latencies.
- Emit required events for search, click, availability, handoff, group request.

4. Frontend map integration
- Add lodging search trigger in relevant tournament/venue/map pages.
- Render hotel pins/cards next to venue context.
- Fetch availability on card open/selection.
- Build checkout handoff URL and open TI-to-provider flow.
- Implement group request path for 5+ rooms CTA.

5. Fallbacks and resilience
- Handle search/availability failures gracefully.
- Use Booking.com fallback path and/or existing VRBO path.
- Record `fallback_used` events on provider failures.
- Never call reserved payment endpoints from TI.

6. Testing
- Unit tests: mapping/normalization/date formatting.
- Integration tests: auth/signature helper and API route contracts.
- End-to-end smoke plan using staging dataset.
