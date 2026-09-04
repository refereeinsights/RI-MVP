# TI Venue-Map Hotel Date Controls — 2026-09-04

## Outcome

The tournament venue-map hotel panel now makes its active stay dates visible and lets a visitor explicitly change them without leaving the map. Tournament-derived dates remain the default. Editing inputs alone makes no provider request; `Update hotels` validates the range and then refreshes the existing HotelPlanner pool, map pins, rates, property handoffs, team-block dates, and `View all nearby hotels` link.

This does not restore inferred hotel pins for direct venue visits. A direct venue visit without explicit tournament context still uses the attributed broad `/go/hotels` path implemented in `4a731931`.

## Implementation

- Added a visible `Stay` date range and a bounded `Change dates` disclosure.
- Added native check-in/check-out date inputs and an explicit `Update hotels` action.
- Required valid calendar dates and checkout after check-in before refresh.
- Reused the existing `/api/lodging/search` endpoint and its server-side date/provider guardrails.
- Passed the successfully resolved dates into existing HotelPlanner property and broad-results handoffs.
- Added deterministic conversion, validation, and timezone-stable display helpers.
- Added no schema, migration, analytics event, provider adapter, or commercial-routing change.

## Local UAT

Using the Autumn Ambush tournament and 1 Woodlands Pkwy venue:

- Default HotelPlanner search: September 26–28, 2026; 71 results; 10 pins.
- Invalid September 29–29 range: rejected with `Check-out must be after check-in`; no refresh was initiated.
- Valid September 27–29 update: 72 results; 10 pins; prices refreshed.
- `View all nearby hotels` changed to `checkin=2026-09-27&checkout=2026-09-29` while retaining venue, tournament, source, page type, placement, and coordinate context. The existing `/go/hotels` boundary continues generating the HotelPlanner attribution fields.
- Hotel property clicks: 0.
- Booking pages opened: 0.
- Bookings submitted: 0.
- HotelPlanner searches: 2 total (one default and one explicit update).
- Browser errors: 0; only normal local-development notices appeared.

## Verification

- Focused tests: 7 passed.
- TI TypeScript: passed.
- TI lint: passed with no warnings or errors.
- Corporate, Corralio, RefereeInsights, and TournamentInsights production builds: passed. The first TI build attempts collided with an already-running dev server's generated `.next` output; after stopping that server and clearing only the disposable TI build cache, the clean TI build passed.
- `git diff --check`: passed.

No push or deployment occurred.
