# TI Campspot Camping + RV Affiliate MVP

Date: 2026-08-10
Scope: TournamentInsights only
Status: implemented, verified locally, committed locally after review

## Outcome

TI now offers a small secondary camping/RV affiliate option without displacing HotelPlanner as the primary lodging path.

- Venue detail: directly below the hero hotel/share/team action row and before upcoming tournaments.
- Tournament venue map: inside the selected-venue panel, directly below the existing action row and before the team-hotel hint/form.
- Eligibility: the venue must have a city, state, and finite latitude/longitude within normal bounds.
- Copy: `Camping or bringing an RV?` followed by `Find campgrounds & RV parks near this venue →`.

No Campspot CTA was added to RI, the tournament directory, generic travel search, or unrelated venue cards.

## Redirect and attribution

`/go/camping` is the server-owned redirect boundary. It reads canonical venue context instead of trusting client-provided geography, optionally loads the selected public tournament, and produces:

1. A direct `https://www.campspot.com/search` target containing location, coordinates, and the existing 2-adult/0-child/0-pet defaults.
2. An Awin wrapper using `awinmid=22326`, `awinaffid=2854179`, `ued=<exact Campspot URL>`, and `clickref=<canonical attribution ID>`.

The attribution ID is a lowercase 32-character UUID-derived token and is identical in Awin `clickref` and `ti_outbound_clicks.outbound_attribution_id`.

Tournament dates are included only as a complete valid pair. Upcoming events use tournament start through the day after tournament end; in-progress events use today through the day after end. Past, incomplete, invalid, zero-night, and greater-than-14-night ranges omit both date parameters.

## Persistence behavior

Eligible non-local, non-bot requests attempt a `ti_outbound_clicks` insert with:

- `destination_type = camping`
- `partner = campspot`
- `outbound_partner = campspot`
- `source_surface = venue_detail | venue_map`
- `cta_placement = venue_detail_camping | venue_map_camping`
- canonical venue/tournament fields
- direct Campspot `target_url`
- wrapped Awin `redirect_url`
- shared lodging `session_id`
- request, page, device, referer, host, and user-agent context

Returned and thrown persistence errors are logged with bounded metadata and still return the affiliate 302. Localhost and detected preview bots skip the insert.

## Measurement

Eligible CTA visibility emits `camping_cta_impression` after at least 500 ms at 50% visibility. The event uses the existing TI analytics endpoint and persists through `ti_map_events` in production. Both Campspot and existing direct hotel CTAs now reuse the same session-storage lodging session helper.

The TI daily admin email has a separate failure-isolated `Campspot Camping + RV Experiment` section with uncapped pagination and:

- yesterday and trailing-seven-day impressions/clicks
- impression and outbound unique sessions
- click/impression CTR
- yesterday source and placement breakdowns
- missing outbound attribution, session, and venue counts

If any Campspot query fails, only this section shows `Metrics unavailable`; the rest of the TI email continues normally.

## Database and RI impact

No migration is required. The production constraint inspection supplied before implementation confirmed `ti_outbound_clicks` no longer has the obsolete hotel-only venue check, and the remaining checks permit `destination_type=camping` while preserving the tournament-official invariant.

No RI application, RI analytics, RI email, or shared RI presentation code changed.

## Verification

- `node --env-file=.env.local --import tsx --test lib/affiliates/campspot.test.ts app/go/camping/route.test.ts` from `apps/ti-web`: 7/7 passed.
- `npx tsc -p apps/ti-web/tsconfig.json --noEmit`: passed.
- `npm run lint --workspace ti-web`: passed with no warnings/errors.
- `npm run build --workspace ti-web`: passed; `/go/camping` appears in the route manifest. Existing repository warnings remained, plus two non-fatal Supabase DNS failures during restricted-network static generation.
- `git diff --check`: passed.
- Read-only fixture lookup identified Harry & David Field, Medford, OR and its linked tournament.
- Local Playwright UAT (no booking): homepage, venue detail, and tournament venue map returned 200; no console errors or framework overlays appeared.
- Venue link attribution: `source_surface=venue_detail`, `cta_placement=venue_detail_camping`.
- Map link attribution: `source_surface=venue_map`, `cta_placement=venue_map_camping`, with the canonical tournament ID.
- Visual inspection confirmed the Campspot treatment is subordinate to HotelPlanner on both desktop surfaces.

The unavailable `agent-browser` CLI was replaced with the repository's installed Playwright runtime for the browser pass.
