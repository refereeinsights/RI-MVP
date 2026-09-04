# TI Direct-Venue Map Context Correction — 2026-09-04

## Outcome

A direct canonical/SEO venue visit no longer turns a click on the static venue map into a silently inferred tournament-planning session. Without an explicit valid `?tournament=` selection, the preview remains a neutral location image and the existing venue directions and attributed broad hotel-search actions remain available. The hotel handoff contains the venue anchor but no inferred tournament ID or dates.

## Repository evidence

The canonical venue route and sitemap point search traffic to `/venues/{seo_slug}` without tournament context. The venue page correctly resolved `selectedTournament` only from an explicit query parameter, but separately populated the map link from the first upcoming or merely linked tournament. That fallback changed a venue-address visitor's context without a selection and exposed tournament dates and dated hotel pins.

## Behavior

- Direct venue/SEO entry: no inferred tournament map link, tournament ID, or tournament dates in the venue hotel journey.
- Explicit valid `?tournament=` entry: preserve the tournament map link with the venue preselected.
- Named upcoming tournament links: unchanged.
- Venue directions and attributed `Find hotels near this venue`: unchanged.
- Tournament pages and tournament-originated venue maps: unchanged.

## Scope

No HotelPlanner provider request, attribution field, commercial routing, schema, migration, analytics vocabulary, RefereeInsights, or Corralio behavior changed. No booking was initiated or completed.

## Verification

- Focused venue hotel/map-entry tests: passed.
- TI TypeScript: passed.
- TI lint: passed.
- Local port-3001 browser UAT: direct venue remained venue-neutral; explicit tournament context retained the tournament map link; no hotel search or booking was initiated.
- `git diff --check`: passed.
