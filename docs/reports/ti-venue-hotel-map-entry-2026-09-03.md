# TI Venue Hotel Map Entry — 2026-09-03

## Outcome

Venue-detail hotel planning now prefers TournamentInsights' populated venue-map experience whenever the venue has a usable explicit or earliest-upcoming linked tournament. The selected venue is carried into the existing tournament map, which automatically loads one HotelPlanner pool using the tournament date resolver and displays hotel names, ratings, and rates.

## Behavior

- Explicit linked tournament context remains highest priority.
- Otherwise, the venue page retains its existing earliest-upcoming linked-tournament selection.
- A current/upcoming context with a tournament slug routes the primary `See hotels & rates on map` CTA to the existing map with `venue` preselected.
- The map loads hotels for that selected venue only.
- Individual property and `View all nearby hotels` actions retain the existing attributed HotelPlanner handoffs.
- Without usable tournament context, the primary CTA retains the existing attributed `/go/hotels` fallback; it does not label fallback dates as tournament rates.

## Preserved boundaries

- No HotelPlanner adapter or response-shape change.
- No new date-selection rule.
- No database migration or schema change.
- No attribution, Hotel Program, fee, or commercial-routing change.
- No automatic search for every venue on a multi-venue map.
- No RefereeInsights or Corralio change.

## Verification

- Focused venue-map entry contract: 3/3 passed.
- TI TypeScript: passed.
- TI lint: passed with zero warnings under the workspace lint command.
- TI production build: passed; reported warnings are pre-existing and unrelated.
- `git diff --check`: passed.

Before implementation, one bounded live diagnostic on a current public tournament selected Fremont Central Park and confirmed the existing production map searched `09/04/2026`–`09/07/2026`, returned 117 hotels, and rendered 10 priced hotel pins. No booking was completed.
