# TI HotelPlanner group-request attribution phase 2B.1 — 2026-07-27

## Scope

Phase 2B.1 repaired TI-controlled group-request attribution and payload integrity only.

In scope:
- Book Travel team block
- Weekend Planner team block
- venue-map team block
- `/api/lodging/group-request` normalization and persistence
- HotelPlanner `createGroupRequest` payload construction
- duplicate-submission and retry token reuse behavior

Out of scope:
- HotelPlanner RFP report-return verification
- downstream HotelPlanner reporting behavior
- dashboard redesign

## Implementation plan

1. Reuse the Phase 2A canonical token contract for group requests.
2. Mint one `outbound_attribution_id` per accepted group-request journey and reuse it across retries.
3. Persist one canonical internal TI record in `lodging_search_session` for each token.
4. Replace ad hoc group-request `custom1/custom2` transport with the canonical TI-controlled field contract.
5. Persist the normalized request and the final TI-generated HotelPlanner payload for repeatable verification.
6. Short-circuit duplicate successful submissions by token.

## Files changed

- `apps/ti-web/lib/hotelPlannerAttribution.ts`
- `apps/ti-web/app/api/lodging/group-request/route.ts`
- `apps/ti-web/app/book-travel/BookTravelTeamBlockForm.tsx`
- `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapClient.tsx`
- `apps/ti-web/lib/hotelPlannerAttribution.test.ts`
- `apps/ti-web/lib/lodging/hotelPlannerProvider.ts`
- `apps/ti-web/lib/lodging/hotelPlannerProvider.test.ts`
- `supabase/migrations/20260727_ti_group_request_attribution_phase2b1.sql`
- `docs/reports/ti-hotel-group-request-attribution-phase2b1-2026-07-27.md`
- `docs/notes.md`
- `docs/notes-ti.md`

## Schema changes

Migration: `supabase/migrations/20260727_ti_group_request_attribution_phase2b1.sql`

Added to `lodging_search_session`:
- `outbound_attribution_id`
- `group_request_id`
- `source_page_type`
- `source_path`
- `job_code`
- `keyword`
- `partner_source_code`
- `custom_field1` … `custom_field8`
- `outbound_partner`
- `destination_type`
- `provider_request_snapshot`

Indexes:
- unique partial index on group-request `outbound_attribution_id`
- `source_page_type, created_at desc`
- `group_request_id, created_at desc`

## Token lifecycle rule

- A group-request token is minted client-side when the user begins a team-block journey.
- The same token is reused for retries from the same in-progress form.
- A successful repeated submission with the same token returns the already-succeeded TI record instead of creating a second canonical record.
- A new intentional request after success creates a new token.

## Canonical HotelPlanner-facing contract

- `sc = tournamentinsights`
- `jobCode = TI-TEAM-BLOCK`
- `keyword = Team hotel block`
- `Custom3 = attr:<outbound_attribution_id>`
- `Custom4 = srcp:<source_page_type>`
- `Custom5 = place:<cta_placement>`
- `Custom6 = plan:<planner_session_id>` when applicable
- `Custom1 = ven:<venue_id>` when available, otherwise `tour:<tournament_id>` when available
- `Custom2 = tour:<tournament_id>` when both venue and tournament are present
- `Custom8 = legacy human-readable destination label` when the caller already collected one

No personal information is placed into attribution custom fields.

## Field-mapping contract

| TI field | Collected where | Normalized field | HotelPlanner field | Required/optional | Final value | Status |
| --- | --- | --- | --- | --- | --- | --- |
| destination | form | `destination` | `itinerary[].destination` | required | preserved | transmitted correctly |
| check-in | form | `checkIn` | `checkIn` | required | preserved | transmitted correctly |
| check-out | form | `checkOut` | `checkOut` | required | preserved | transmitted correctly |
| rooms | form | `rooms` | `numRooms` | required | preserved as number | transmitted correctly |
| adults per room | form | `adultsPerRoom` | `adultsPerRoom` | required | preserved as number | transmitted correctly |
| children per room | form | `childrenPerRoom` | no dedicated top-level field | optional | retained in TI normalized request only | collected for internal use only |
| contact first name | form | `firstName` | `firstName` | required | preserved | transmitted correctly |
| contact last name | form | `lastName` | `lastName` | required | preserved | transmitted correctly |
| contact email | form | `email` | `email` | required | preserved | transmitted correctly |
| contact phone | form | `phone` | `phone` | optional | preserved when provided | transmitted correctly |
| team / group name | form | `groupName` | `groupName` | optional | preserved when provided | transmitted correctly |
| notes | form | `comments` | `comments` | optional | preserved | transmitted correctly |
| source page type | caller context | `source_page_type` | `customField4` | required for attribution | `srcp:*` | transmitted correctly |
| CTA placement | caller context | `cta_placement` | `customField5` | required for attribution | `place:*` | transmitted correctly |
| planner session | caller context | `planner_session_id` | `customField6` | conditional | `plan:*` | transmitted correctly |
| venue ID | caller context | `venue_id` | `customField1` | conditional | `ven:*` | transmitted correctly |
| tournament ID | caller context | `tournament_id` | `customField2` or `customField1` fallback | conditional | `tour:*` | transmitted correctly |
| canonical token | TI-generated | `outbound_attribution_id` | `customField3` | required | `attr:*` | transmitted correctly |
| partner source | TI constant | `sc` | query `sc` | required | `tournamentinsights` | transmitted correctly |
| keyword | TI constant | `keyword` | `keyword` | required | `Team hotel block` | transmitted correctly |
| job code | TI constant | `jobCode` | `jobCode` | required | `TI-TEAM-BLOCK` | transmitted correctly |

## Tests run

- `npx tsc -p apps/ti-web/tsconfig.json --noEmit`
- `node --import tsx --test apps/ti-web/lib/hotelPlannerAttribution.test.ts apps/ti-web/lib/lodging/hotelPlannerProvider.test.ts`

## Local verification evidence

Verified inside TI-controlled code:
- all three active flows now send `outbound_attribution_id`
- `/api/lodging/group-request` now normalizes to one canonical internal record shape
- the final TI-generated HotelPlanner payload is persisted in `provider_request_snapshot`
- duplicate successful submissions reuse the same canonical record by token
- provider payload uses canonical `Custom3/4/5/6` contract instead of the prior mixed `custom1/custom2` semantics

## What remains for Phase 2B.2

- controlled HotelPlanner `createGroupRequest` response verification in a production-equivalent environment
- confirmation that the HotelPlanner RFP/report row returns the canonical token unchanged
- confirmation of which HP report columns retain `Custom3`–`Custom8`
- external limitation analysis if HP reporting still leaves canonical custom fields blank

## Conclusion

`PARTIAL — internal repair implemented but external verification remains`
