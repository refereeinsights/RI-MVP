# TI Tournament Hotels Phase 1 — Canonical Tournament Lodging Hub

Please implement Phase 1 of the TournamentInsights Tournament Hotels architecture.

Create a permanent tournament-level lodging page at:

`/tournaments/[slug]/hotels`

This page becomes the canonical destination for tournament-level hotel discovery, SEO traffic, and future tournament-director distribution. It must not become a mandatory intermediate page for existing high-intent hotel flows that already send users directly to HotelPlanner.

## Implementation principle

This is additive architecture. Existing revenue-producing hotel funnels are protected behavior, not refactoring opportunities. When in doubt, add rather than modify.

## Authoritative routing allowlist

Only these general tournament-level discovery paths change:

| Existing path | New destination |
| --- | --- |
| Tournament detail “Find tournament hotels” | `/tournaments/[slug]/hotels` |
| Tournament map-teaser Hotels action | `/tournaments/[slug]/hotels` |
| Tournament mobile sticky Hotels action | `/tournaments/[slug]/hotels` |
| Any existing tournament-level Hotels navigation action | `/tournaments/[slug]/hotels` |
| SEO/direct traffic | `/tournaments/[slug]/hotels` |
| Future director-shared links | `/tournaments/[slug]/hotels` |

The following paths must remain direct and unchanged:

| Protected path | Required behavior |
| --- | --- |
| Tournament venue map → HotelPlanner | Direct and unchanged |
| Venue detail → HotelPlanner | Direct and unchanged |
| Book Travel → HotelPlanner | Direct and unchanged |
| Weekend Planner → HotelPlanner | Direct and unchanged |
| RI venue detail → HotelPlanner | Direct and unchanged |
| Existing hotel property cards → HotelPlanner | Direct and unchanged |
| Team Hotels flow | Unchanged |

Do not reroute a protected path through `/tournaments/[slug]/hotels`.

## Shared API and redirect-route protection

### `/api/lodging/search` — consumer only

The new page consumes the existing API. Do not modify its response semantics, provider selection, source behavior, caching, rate limiting, date resolution, or fallback behavior.

Any unavoidable backward-compatible change must be explicitly regression-tested against the tournament venue map and all other existing consumers.

### `/go/hotels`, `/go/hotels/property`, and `/go/hotels/checkout`

Do not refactor their existing routing, fallback, URL construction, or output. Phase 1 may make only the minimum additive changes needed to:

- Accept `tournament_hotels` as a source/page type.
- Preserve Tournament Hotels attribution parameters.
- Pass sanitized tournament name as Custom8 when supplied.
- Default the new source to job code `TI-TOURNAMENT-HOTELS`.

All behavior for existing sources must remain identical.

## Regression baseline — required before implementation

Capture the baseline using deterministic tests or localhost redirect inspection. Do not require production affiliate clicks.

For each protected revenue path, freeze and compare:

- Final HotelPlanner destination URL.
- `jobCode`.
- Custom1–Custom8.
- `source` and `source_page_type`.
- Placement.
- Effective dates.
- Venue ID.
- Tournament ID and slug.
- Outbound attribution behavior.

Capture these paths:

- Book Travel → HotelPlanner.
- Tournament venue map → HotelPlanner.
- Venue detail → HotelPlanner.
- Weekend Planner → HotelPlanner.
- RI venue detail → HotelPlanner.

Normalize only intentionally generated request values such as fresh UUIDs. Do not normalize attribution semantics. Add automated regression fixtures. UAT supplements these tests; it does not replace them.

Report the pre-implementation baseline and post-implementation comparison as named deliverables.

## 1. Canonical route

Create `/tournaments/[slug]/hotels`. The public URL must remain permanently stable. Future tournament-support enrollment must not change it.

## 2. Tournament data

Load the published tournament by slug using the existing public tournament surface where practical. Load available:

- ID, slug, and name.
- Sport.
- Start and end dates.
- City and state.
- Publication context.

If the prompt’s earlier “stay-to-play/housing context” does not map to an existing authoritative field, omit it from Phase 1 rather than inventing data or copy.

Call `notFound()` when the published tournament does not exist.

## 3. Confirmed tournament venues

A legitimate Phase 1 relationship means:

- `tournament_venues.tournament_id` equals the current tournament ID.
- `tournament_venues.is_inferred = false`.
- The joined venue exists.

`tournament_venues.is_inferred` is an existing production schema dependency: it was introduced by `20260402_tournament_venues_inferred_flag.sql` and is already used by the tournament detail, tournament map, Weekend Planner, and other TI production queries. Verify the expected migration is present in the target environment during deployment readiness. Do not silently omit or fall open on this filter; if the column is unexpectedly absent, stop and report the schema drift rather than including inferred venues.

Load all confirmed linked venues, including where available:

- Venue ID and name.
- Address, city, state, and ZIP.
- Latitude and longitude.
- Timezone.
- Primary and stable ordering metadata.

Do not assume only the primary venue matters.

Expose two distinct counts:

- `venue_count`: all confirmed linked venues.
- `searchable_venue_count`: confirmed linked venues that pass coordinate validation.

Show all confirmed venues as tournament context. Only searchable venues may drive a live hotel search.

## 4. Valid hotel-search coordinates

A venue is searchable only when:

- Latitude and longitude are both non-null.
- Neither value is zero; `(0, 0)` is a known artifact.
- Both values are finite numbers.
- Latitude is between −90 and 90.
- Longitude is between −180 and 180.

Apply one shared validation helper consistently to venue selection, SEO eligibility, sitemap eligibility, and tests.

Do not invent coordinates from city/state. If no venue qualifies, use the no-coordinate fallback.

## 5. Initial venue and single-venue behavior

Choose the initial searchable venue deterministically:

1. Confirmed primary searchable venue.
2. Otherwise, the first searchable venue in stable relationship order.

If exactly one searchable venue exists:

- Select it automatically.
- Do not show selection friction.
- Load results as soon as valid booking dates are available.

This remains true when other confirmed, non-searchable venues are shown as context.

## 6. Multiple searchable venues

If multiple searchable venues exist, show an accessible selector headed:

`Where are you playing?`

Each option identifies venue name and city/state. Preselect the deterministic initial venue and load its results immediately when dates are valid.

Changing the venue must:

- Refresh live results.
- Preserve the current effective dates.
- Preserve the selected venue through every HotelPlanner handoff and outbound-attribution row.
- Use the unified request-cancellation behavior in Section 8 so a stale request for the previous venue cannot win.

## 7. Tournament dates and booking-safe defaults

Treat tournament dates as local calendar dates and avoid UTC date shifting.

For a future tournament:

- Check-in = `start_date`.
- Check-out = `end_date + 1 day`.
- If `end_date` is null, check-out = `start_date + 1 day`.
- `date_source = "tournament"`.

For an in-progress tournament:

- Use the existing booking-safe date behavior returned by `/api/lodging/search`.
- Display the actual resolved dates returned by the API.
- Use `date_source = "booking_safe_fallback"` unless the user changes a date.

For a past tournament:

- Show historical tournament dates as tournament context.
- Never submit historical dates as lodging-search dates.
- Initialize lodging controls with the existing booking-safe fallback window when available.
- Explain briefly that hotel searches require future stay dates.
- Use `date_source = "booking_safe_fallback"`.

If neither tournament dates nor a booking-safe default are available:

- Leave both controls blank.
- Do not search.
- Ask the user to select future lodging dates.
- Use `date_source = "unavailable"`.

The existing `/api/lodging/search` response already includes `resolvedCheckIn` and `resolvedCheckOut` across its current success and fallback paths, and existing TI clients consume those fields. Treat them as part of the existing response contract; do not modify the API to add or rename them. The displayed controls must always match those effective resolved dates when they are non-null. If they differ from submitted dates, update the controls and date source accordingly.

## 8. Adjustable dates

Use compact native `<input type="date">` controls for Check-in and Check-out. Do not add a date-picker dependency.

Copy:

`Showing hotels for your tournament weekend — adjust dates if needed.`

Rules:

- Check-out must be after check-in.
- Check-in must be booking-safe under the existing lodging API.
- Effective dates drive searches, property handoffs, View All, and Team Hotels.
- Changing either date sets `date_source = "user_adjusted"`.
- Wait 400ms after a valid change before searching.
- Use one unified `AbortController` or equivalent request-generation guard for both venue changes and date changes.
- Before issuing any new search caused by a venue or date change, cancel the current in-flight request.
- Only the response associated with the latest selected venue and effective date pair may update loading, error, fallback, resolved-date, or hotel-result state.
- An aborted or older response must never render an error or overwrite the latest venue/date selection.

## 9. Live HotelPlanner results

Consume `/api/lodging/search` using:

- Selected venue ID and coordinates as already supported by the API.
- Tournament ID.
- Effective check-in and check-out.
- Tournament Hotels attribution.

Do not modify the API to support this page.

## 10. Hotel option presentation

Display live HotelPlanner options directly on the canonical page as a responsive single-column list.

Each card may show only information returned by `multiPropertySearch` through `/api/lodging/search`:

- Hotel image when available.
- Hotel name.
- City/state or street address.
- Distance from the selected venue when available.
- Star rating and review count when available.
- “From” nightly price and currency when available.
- Primary `View hotel` or `Check availability` action.

The primary action must route through `/go/hotels/property` with the selected venue, effective dates, tournament context, and `tournament_hotels_property` attribution.

The page order should be:

1. Tournament name and tournament-date context.
2. Venue/location context.
3. Venue selector when multiple searchable venues exist.
4. Check-in and check-out controls.
5. Empty Phase 2 support-notice slot.
6. Live hotel-result cards.
7. View All Hotels.
8. Secondary Team Hotels action.
9. Affiliate disclosure.

## 11. Hotel-card implementation boundary

Reuse existing normalization, formatting, attribution helpers, disclosure treatment, and visual conventions where practical.

Do not refactor the production venue-map or Weekend Planner components merely to extract a shared card. A page-scoped Tournament Hotels card is acceptable.

It must:

- Use only `multiPropertySearch` data returned by `/api/lodging/search`.
- Never call `getProfile` or `propertyAvailability` merely to render.
- Route property actions through `/go/hotels/property`.
- Preserve effective venue, dates, and Tournament Hotels attribution through checkout.
- Be regression-tested against the handoff contract.

No component rendered by this route may call HotelPlanner `getProfile`.

## 12. Search and fallback states

Distinguish these states truthfully:

- Loading: accessible live status while the current request is running.
- Zero results: no live results returned for the selected venue/dates; offer attributed View All and Team Hotels where valid.
- Rate limited: ask the user to retry later; do not label this as zero inventory.
- Provider/API failure: temporary-unavailable message plus attributed View All fallback; do not expose internal errors.
- Stale/aborted request: render no error and ignore its result.
- Invalid or unavailable dates: show guidance and do not search.
- No searchable venue: use the explicit fallback behavior in Sections 13 and 15; do not call the search API and do not invent coordinates.

## 13. View All Hotels

Provide a primary `View all hotels` CTA through `/go/hotels`, using the selected venue, effective dates, tournament context, Tournament Hotels attribution, and no raw HotelPlanner URL.

When no searchable venue exists:

- If tournament city/state produces a non-empty destination, keep View All available through `/go/hotels` using that city/state as the existing `ss` destination text.
- Omit `venueId`, latitude, and longitude rather than inventing venue context.
- Preserve tournament ID/slug, effective dates when available, `source=tournament_hotels`, `page_type=tournament_hotels`, `cta_placement=tournament_hotels_view_all`, job code, and Custom8.
- Do not call `/api/lodging/search` for this fallback.
- If no usable city/state destination exists, omit the View All handoff and show the existing `/book-travel` path instead.

## 14. Tournament Hotels attribution

Add `"tournament_hotels"` to `HOTEL_PLANNER_SOURCE_PAGE_TYPES` and recognize it additively in `deriveHotelPlannerSourcePageType` from explicit source/page-type inputs before the general `/tournaments/` path mapping.

Add placement constants to the existing attribution objects:

- `tournamentHotelsProperty = "tournament_hotels_property"`.
- `tournamentHotelsViewAll = "tournament_hotels_view_all"`.
- `tournamentHotelsTeamBlock = "tournament_hotels_team_block"`.

Use default job code `TI-TOURNAMENT-HOTELS` for this source.

Use the existing route parameter names:

- `source=tournament_hotels`.
- `page_type=tournament_hotels`.
- `venueId=<selected venue UUID>`.
- `tournamentId=<tournament UUID>`.
- `tournament_slug=<canonical slug>`.
- `cta_placement=<placement>`.
- `jobCode=TI-TOURNAMENT-HOTELS`.
- `custom8=<sanitized tournament name>`.

Continue preserving outbound attribution ID, session ID, tournament ID/slug, selected venue ID, source surface, placement, job code, and Custom1–Custom8 through `ti_outbound_clicks`. Do not add another outbound table.

Custom8 is the existing sanitized tournament name, limited to 128 characters. It must survive search, property handoff, View All, checkout, and outbound persistence. It is human-readable reporting context, not the authoritative reconciliation key.

Custom3/outbound attribution ID and the machine tournament/venue fields remain authoritative. Do not change Custom1–Custom7 semantics for existing sources.

## 15. Team Hotels secondary path

Show a visually secondary action:

`Need 5+ rooms? Request a team hotel block`

Use `buildTeamHotelBookingHref()` and prefill available tournament ID, slug, name, sport, selected venue, destination, effective dates, and:

- `entry_source=tournament_hotels`.
- `entry_page_type=tournament_hotels`.
- `entry_placement=tournament_hotels_team_block`.

When no searchable venue exists, Team Hotels remains available:

- Build destination from tournament city/state when available.
- Omit venue ID and venue name.
- Preserve tournament ID, slug, name, sport, effective dates when available, and the Tournament Hotels entry attribution above.
- If no destination is available, still link to Team Hotels with the available tournament context and let the existing form collect destination details.

Do not embed another Team Hotels form. Individual lodging remains primary.

## 16. Tournament navigation

Update only the general tournament-level discovery actions in the routing allowlist.

Because `/tournaments/[slug]/hotels` is internal:

- Do not open it in a new tab.
- Do not use sponsored/noopener attributes on the internal link.
- Match the adjacent Map action’s visual hierarchy in each existing location.
- Keep Hotels as a peer of Map where both appear.

Do not introduce a new global tab system in Phase 1. Do not change venue-specific “Hotels near this venue” links.

## 17. SEO metadata

For qualified pages:

- Canonical: `/tournaments/[slug]/hotels`.
- Title: `Hotels near {Tournament Name} | TournamentInsights`.
- H1: `Hotels for {Tournament Name}`.
- Description: `Find hotels near the tournament venues for {Tournament Name}. Compare lodging near where games are played and plan your tournament weekend.`

Respect the existing title-template behavior and avoid duplicate branding or keyword stuffing.

## 18. Shared SEO eligibility

Create one shared pure eligibility predicate for a tournament and its confirmed linked venues.

A page qualifies when:

- The tournament is published. Existence in `tournaments_public` may satisfy this for public loading.
- `start_date` is non-null and in the future or within the previous 12 months using a UTC cutoff.
- Name is non-empty.
- At least one of city/state is non-empty.
- At least one confirmed venue passes coordinate validation.

A qualified page is index/follow, self-canonical, and sitemap eligible. An unqualified published page still renders but is noindex/follow and excluded from the Tournament Hotels sitemap.

## 19. Dedicated sitemap

Add `/sitemaps/tournament-hotels-N.xml` through the existing dynamic sitemap handler and register it in `/sitemap.xml`.

Add `TOURNAMENT_HOTELS_SITEMAP_PAGE_SIZE`.

Implement a bulk server-side query or RPC that:

- Uses the same eligibility rules as the shared predicate.
- Uses confirmed venue relationships only.
- Applies the exact coordinate validation.
- Returns eligible count for the sitemap index.
- Returns slug and `updated_at` for a sitemap page.
- Orders deterministically before pagination.
- Avoids one venue query per tournament.

Do not add these URLs to `tournaments-N.xml`.

Test equivalence for future, boundary-age, expired, unpublished, missing-context, no-venue, inferred-only, null-coordinate, `(0, 0)`, out-of-bounds, and valid-venue cases.

## 20. Phase 2 trusted extension point

Create:

```ts
// apps/ti-web/lib/lodging/tournamentHotelProgram.ts

export type TournamentHotelProgramType = "standard";
// Phase 2 will extend to: "standard" | "support_5" | "support_10"

export type TournamentHotelProgram = {
  programType: TournamentHotelProgramType;
  // Phase 2 will add trusted server-side routing configuration.
};

export async function getTournamentHotelProgram(
  tournamentId: string
): Promise<TournamentHotelProgram> {
  // Phase 2: resolve enrollment and HotelPlanner configuration
  // from trusted database/configuration state.
  return { programType: "standard" };
}
```

The page server component calls this with the database-resolved tournament ID.

In Phase 1:

- Use it only for server-rendered state and the empty support-notice slot.
- Do not change the global HotelPlanner base URL.
- Do not send a client-controlled program or URL override.
- Do not modify redirect-route URL selection.

In Phase 2, redirect routes will independently resolve trusted program configuration from tournament ID. Browser-provided program type, support level, or white-label URL must never control routing.

## 21. Phase 2 support-notice slot

Reserve a server-controlled layout slot between the venue/date controls and hotel results.

Future copy:

`Bookings through this tournament hotel page help support the tournament.`

It is always empty for the Phase 1 `standard` program. Do not render support claims on standard tournaments.

## 22. Analytics

Use:

```ts
type TournamentHotelsDateSource =
  | "tournament"
  | "booking_safe_fallback"
  | "unavailable"
  | "user_adjusted";
```

Authoritative mapping:

| Action | Measurement |
| --- | --- |
| Page rendered | New TI event `tournament_hotels_page_viewed`, once per page load |
| Search success/failure | Preserve existing `/api/lodging/search` server-side session/success/failure measurement; do not duplicate it |
| Property selected | Existing lodging event `hotel_card_click` |
| View All selected | Existing TI event `hotel_cta_clicked` with `cta_placement=tournament_hotels_view_all` |
| Team block selected | Existing TI event `team_hotel_cta_clicked` with `cta_placement=tournament_hotels_team_block` |

`hotel_cta_clicked` is already present in `TiAnalyticsEventName`, `TiAnalyticsEventPropertiesByName`, and the `/api/analytics` map-event allowlist. Reuse it for View All; it is not another new event.

Its current typed contract assumes a venue-backed CTA. Extend that contract additively for this surface:

- Permit `page_type = "tournament_hotels"`.
- Add `source_page_type?: "tournament_hotels"` without changing existing callers.
- Permit `venue_id` to be null only for the documented no-searchable-venue city/state fallback.
- Add optional `tournament_slug` and `date_source` fields.
- Continue supplying the existing CTA interaction identity, flow, page URL, device, traffic, tournament ID, referrer, and outbound-request fields rather than bypassing the typed contract with casts.

The `/api/analytics` map-event persistence path already retains the privacy-safe properties object. Add tests proving the new values persist and that existing `hotel_cta_clicked` payloads remain accepted unchanged.

Page-view payload:

- `tournament_id`.
- `tournament_slug`.
- `sport`.
- `venue_count`.
- `searchable_venue_count`.
- `has_valid_venues`.
- `initial_date_source`.

Interaction payloads include relevant tournament ID/slug, selected venue ID, current `date_source`, `source_page_type=tournament_hotels`, and placement.

The page view records initial date source only. Later interactions use the current value.

Add the new event to the typed event name/property contracts, `/api/analytics` allowlist and sanitizer, and tests. Extend Team Hotels surface/source unions additively for `tournament_hotels`.

Do not include tournament name, venue name, hotel name, exact dates, or PII in TI analytics payloads.

## 23. Mobile and accessibility

Verify at 375–390px:

- Header is readable.
- Venue selector and native dates are usable.
- Cards are single-column.
- No horizontal overflow.
- Hotel action remains primary.
- Team Hotels remains secondary.

Verify keyboard operation, labels, focus states, loading/error live regions, and date-validation messages.

## 24. Explicitly out of scope

Do not implement:

- Tournament-director enrollment.
- $5/$10 selectors or economics.
- Payout recipients, reporting, ledger, or automation.
- Director dashboard changes.
- Support-program financial reconciliation.
- New lodging API or HotelPlanner iframe.
- A global hotel-card refactor.
- Team Hotels redesign.
- Camping/RV expansion.
- Changes to protected direct funnels.
- `getProfile` calls from this page.
- `/api/lodging/search` behavior changes.
- HotelPlanner base-URL selection changes.
- Client-controlled HotelPlanner program configuration.

## Validation

Run:

```bash
npm run lint --workspace ti-web
npx tsc -p apps/ti-web/tsconfig.json --noEmit
npm run build --workspace ti-web
```

Also run focused attribution, analytics, sitemap, SEO-eligibility, date, stale-request, and component tests.

Verify:

- All five protected paths are attribution-identical to baseline.
- General tournament discovery routes internally to `/hotels` without a new tab.
- Venue-specific hotel actions remain direct.
- Single searchable venue loads without selection friction.
- Multiple searchable venues use an explicit selector and stable initial selection.
- Date changes debounce for 400ms and stale responses cannot win.
- Historical pages never submit past lodging dates.
- Displayed dates equal effective API dates.
- Cards display live multiPropertySearch results without `getProfile`.
- Property, View All, and Team Hotels handoffs preserve selected venue and dates.
- Qualified pages are indexable and appear only in `tournament-hotels-N.xml`.
- Unqualified pages are noindex and absent from all Tournament Hotels sitemaps.
- Mobile and accessibility requirements pass.

Do not complete a live HotelPlanner reservation.

## Required deliverables

1. Named pre-implementation attribution baseline.
2. Named post-implementation attribution comparison.
3. New Tournament Hotels page and hotel-option presentation summary.
4. Exact tournament-level routing changes.
5. Explicit protected direct paths confirmation.
6. Attribution source, placements, job code, Custom8, and persistence summary.
7. Single/multi-venue behavior summary.
8. SEO predicate and dedicated sitemap summary.
9. Phase 2 stub and empty notice-slot confirmation.
10. Validation results limited to checks actually performed.

## Acceptance criteria

Phase 1 is complete when:

- The baseline and post-change comparison prove all protected paths are attribution-identical.
- Qualified tournaments have useful `/tournaments/[slug]/hotels` pages.
- Hotel options render as live, mobile-friendly cards using only multiPropertySearch data.
- `tournament_hotels` is added to attribution mapping without altering existing mappings.
- Only allowlisted tournament-level discovery routes change.
- `/api/lodging/search` behavior is unchanged.
- Redirect routes change only for minimum additive attribution passthrough.
- Single and multi-venue behavior matches this prompt.
- Historical pages never submit past dates.
- Effective dates survive every handoff.
- Stale searches cannot overwrite current results.
- Analytics contracts and allowlists accept the new surface.
- `Custom8` carries sanitized tournament name while machine fields remain authoritative.
- No `getProfile` request occurs.
- Sitemap pagination uses deterministic bulk eligibility.
- Team Hotels is present and secondary.
- The no-searchable-venue page offers an attributed city/state View All handoff when a destination exists, falls back to `/book-travel` when it does not, and keeps Team Hotels available without invented venue data.
- Phase 1 does not change HotelPlanner base-URL selection.
- The support notice is empty and no unsupported economics are claimed.

## Final rule

Tournament-level hotel discovery goes to the permanent canonical Tournament Hotels page. Specific venue/property intent remains on the existing direct HotelPlanner path. Existing revenue funnels are protected behavior.
