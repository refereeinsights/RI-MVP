# TI Past-Tournament Hotel Date Recovery — 2026-09-04

## Outcome

Completed tournament venue maps no longer strand a visitor in a date-less hotel state. After a venue is selected and the trusted lodging boundary returns `no_dates`, the hotel panel now shows blank check-in/check-out controls and asks the visitor to choose dates. It does not invent replacement tournament dates or automatically call HotelPlanner. A valid explicit update refreshes the existing rates, hotel pool, map pins, property handoffs, team-block dates, and attributed broad-results link.

The existing user-initiated broad HotelPlanner fallback remains available as a fail-open booking path. No venue selection still means no hotel search and no hotel pins. Upcoming tournament behavior, direct venue behavior, and the `/venues/{slug}/hotels` SEO pilot remain unchanged.

## Safety and validation

- Native controls now expose the current UTC date and existing 730-day hotel horizon as minimum/maximum bounds.
- Client validation rejects missing, invalid, equal, reversed, past, and unsupported-horizon ranges.
- The trusted `/api/lodging/search` resolver also rejects an explicit past check-in before provider access.
- Existing rate limiting, provider error handling, attribution, Custom fields, coordinate-first venue targeting, and city fallback remain unchanged.
- No schema, migration, analytics event, attribution identifier, provider adapter, or commercial-routing change was added.

## SEO pilot build repair

The first production build exposed an existing one-line import error in commit `7d5fb800`: the new `/venues/{slug}/hotels` page referenced `tournaments.css` from the wrong relative directory. The import path was corrected without changing the SEO pilot's behavior, eligibility, indexing, analytics, or default-date policy. The route then compiled successfully and an eligible local page rendered its existing explicit-date form without making a lodging request.

## Bounded local UAT

UAT used the two-call HotelPlanner cap and completed no property handoff, team-block request, or booking.

### Completed tournament

- Route: `/tournaments/florida-elite-invitational-2026/map`
- Tournament dates: August 15–16, 2026 (completed)
- Selected venue: Earl Johnson Park
- Initial selected-venue endpoint result: `no_dates`; HotelPlanner provider calls: 0
- Recovery controls: visible with blank values
- Explicit range: September 18–20, 2026
- Explicit HotelPlanner searches: 1
- Result: 115 hotels, 10 pins on map
- Updated `View all nearby hotels`: retained venue ID, tournament ID, explicit dates, coordinates, `source=venue_map`, `page_type=venue_map`, and the existing CTA placement

### Upcoming tournament

- Route: Autumn Ambush tournament map with 1 Woodlands Pkwy preselected
- Existing automatic range: September 26–28, 2026
- HotelPlanner searches: 1
- Result: 71 hotels, 10 pins on map
- Existing visible stay range and `Change dates` behavior remained intact

### Other regression evidence

- Before venue selection, the completed-tournament page made no lodging request.
- Eligible SEO pilot route `/venues/harry-and-david-field-medford-or/hotels` rendered its existing date form and made no lodging request without submission.
- Browser console contained no application error. Local-only React DevTools and analytics-development notices were expected.

Provider accounting: 2 HotelPlanner searches total. The completed-tournament initial `no_dates` resolution made one Corralio lodging-endpoint request but did not invoke HotelPlanner.

## Verification

- Focused tests: 19 passed.
- TI TypeScript: passed.
- TI lint: passed with zero warnings/errors.
- TI production build: passed after repairing the pre-existing SEO pilot stylesheet import; the build displayed only the repository's existing warning backlog.
- `git diff --check`: passed.

No database mutation, property click, team-block request, booking, deployment, or push occurred.

Verdict: `TI PAST-TOURNAMENT HOTEL DATE RECOVERY COMPLETE LOCALLY`
