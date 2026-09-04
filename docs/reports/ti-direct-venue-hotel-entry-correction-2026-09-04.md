# TI Direct-Venue Hotel Entry Correction — 2026-09-04

## Outcome

Direct venue visits no longer enter the dated hotel-pin map merely because the venue has an upcoming linked tournament. The map remains available when the visitor supplies explicit linked-tournament context. Otherwise, the primary venue hotel CTA uses the existing attributed broad HotelPlanner search so dates and multiple properties are easier to compare.

## Repository evidence

Commit `7d5f0212` made the direct venue CTA prefer the tournament map for either an explicitly selected tournament or the earliest upcoming linked tournament. That map automatically loads a dated HotelPlanner pool and its markers open a specific property.

A bounded inspection of the supplied HotelPlanner property page confirmed that date fields and an Update Search action exist, but they are less prominent than on broad results; switching to all nearby hotels is also placed after a long room inventory. A separate inspection of the supplied broad-results page confirmed prominent destination/date controls, immediate multi-property comparison, and USD display. No hotel was selected and no booking was submitted.

The broad TI route retains deterministic attribution. It continues through `/go/hotels` with the existing venue/tournament context and produces the existing HotelPlanner `Custom3=attr:{token}` handoff. This correction does not trade attribution for usability.

## Behavior

- Explicit valid `?tournament=` context with usable current/upcoming dates: keep `See hotels & rates on map`, the existing tournament map, hotel pins, and property handoffs.
- No explicit tournament context: show `Find hotels near this venue` and use the existing attributed broad `/go/hotels` flow.
- The existing earliest-upcoming tournament remains available to the broad route for location/date context, but it no longer silently activates the property-first map experience.
- Tournament pages, tournament-map entry, hotel marker behavior, HotelPlanner parameters, attribution, Hotel Program selection, and commercial routing are unchanged.

## Scope

No schema, migration, provider adapter, analytics vocabulary, RefereeInsights, or Corralio behavior changed. Nothing was pushed or deployed.

## Verification

- Focused direct-venue coverage: 3 tests passed.
- TI TypeScript check: passed.
- TI lint: passed with no errors.
- Production builds: Corporate, Corralio, RefereeInsights, and TournamentInsights passed.
- `git diff --check`: passed.
