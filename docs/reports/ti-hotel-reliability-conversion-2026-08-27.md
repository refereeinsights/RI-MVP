# TI Hotel Reliability & Conversion — Stage 1 Report

Date: 2026-08-27
Verdict: **TI HOTEL RELIABILITY & CONVERSION REQUIRES APPROVED PROVIDER UAT**

## Stage 1 reliability audit

Inspected the TI homepage/navigation, canonical `/book-travel` page, tournament
hotel page, venue/tournament hotel CTAs, `/go/hotels` family of handoffs,
lodging search route, HotelPlanner provider adapter and response normalizers,
attribution helpers, measurement helpers, fallback states, and focused tests.

Repository facts confirmed:

- `/book-travel` remains the only canonical generic sports-travel route.
- Valid tournament hotel context is handed to `/go/hotels` with tournament,
  venue, dates, source, placement, and existing Custom attribution.
- The typed attribution vocabulary is unchanged.
- Hotel access and team-hotel requests are not Weekend Pro gated.
- `lodging_search_session` records request lifecycle status, result count,
  latency, fallback reason, bounded attribution/context columns, and previously
  recorded an error response snapshot.
- `TI_LODGING_DEBUG` can expose provider status/code/message/detail only when
  explicitly enabled. It was not enabled or changed.
- No hotel-result cache exists in the audited search path. `CACHE_FAILURE` is
  therefore not applicable, and this task added no cache.

## Production diagnostic evidence

One authorized read-only inspection covered 2026-07-28 through 2026-08-27 and
selected at most the 500 most recent `/api/lodging/search` records. Only status,
fallback reason, error code, result count, latency, safe typed source/page
categories, and created time were selected. Results were aggregated in memory;
no row-level records or identifiers were printed.

- Sessions inspected: 500
- Succeeded with results: 492 (98.4%)
- Succeeded with zero results: 0
- Failed: 8 (1.6%)
- Fallback reasons: none 488; `low_inventory` 4; `provider_error` 8
- Error codes: none 492; `200` 7; `provider_error` 1
- Page types: `referee` 473; `tournament_hotels` 17; `venue_map` 10
- Request sources: `referee_venue_detail` 473; `tournament_hotels` 17;
  `venue_map` 10
- Latency: 443 at 1.5–4.999s; 28 at 5s+; 22 at 0.5–1.499s; 7 below
  0.5s

Production evidence supports a generally successful integration, eight
provider-path failures, and four successful low-inventory fallbacks. Seven
failed rows carried a `200` error code, consistent with an HTTP-success response
that the provider adapter rejected semantically. The safe aggregate fields do
not prove which response property caused those failures or which source/page
owned them; that remains provider-UAT work rather than an inferred diagnosis.

The read selected no search query, destination/address, IP, user agent,
referrer, page URL/path, provider URL/payload, hotel list, authorization data,
token/secret, raw error body, exception detail, or customer PII. It performed
no write, RPC, configuration change, HotelPlanner call, or booking attempt.

## Proven defects and changes

### UI-state failure

The tournament hotel page rendered negative unavailable/no-results error copy
even though a valid attributed HotelPlanner handoff remained usable. It now
leads with a positive recovery state and `Find Hotels Near the Venue`, while
keeping the existing `/go/hotels` attribution. Insufficient context continues
to use `/book-travel` and `Find Hotels`. The 5+ room action is visibly distinct
as `Request Team Hotel Options`.

### Diagnostic classification and privacy

The route previously collapsed provider failures into numeric/dynamic error
codes and persisted a provider-derived message in `response_snapshot`. It now
records bounded categories for malformed responses, HTTP-success semantic
rejections, authentication, rate limiting, timeout, transport/provider, server
configuration, and unknown failures. Search failures no longer persist provider
messages or response bodies. Client responses use constant safe messages.

### Conversion clarity

- Added a secondary homepage sports-travel module linking to `/book-travel`;
  tournament discovery and the map remain first.
- Clarified `/book-travel` as hotels and rentals for sports travel and made the
  1–4 room versus 5+ room distinction explicit.
- Preserved the `Book Travel` navigation label; any rename remains report-only.

No attribution enum, commercial routing, Hotel Program decision, fee,
beneficiary, provider, auth, schema, cache, Corralio, or RefereeInsights logic
changed.

## Offline verification

- Focused hotel/reliability/attribution/measurement/context tests: 99/99 passed.
  One pre-existing Team Hotel reporting fixture received an explicit test clock
  so its future-date assertion no longer changes with wall-clock time; product
  logic was unchanged.
- TI TypeScript: passed.
- TI lint: passed with zero warnings under the workspace lint command.
- TI production build: passed; repository-wide pre-existing build warnings
  remain unrelated.
- Desktop browser: 1440×1000 homepage, `/book-travel`, and contextual Starfire
  hotel fallback rendered without framework/page errors.
- Mobile browser: 390×844 homepage rendered without horizontal overflow or
  framework/page errors.
- The contextual lodging endpoint was intercepted before navigation with a
  deterministic zero-result/provider-fallback fixture.
- Captured—not followed—the contextual action. It resolved locally to
  `/go/hotels` and preserved `source=tournament_hotels`, page type, tournament
  ID/slug, venue ID, check-in/out, placement, `sc`, keyword, job code, and
  Custom1/2/4/5/8.
- Generic homepage CTA navigated to `/book-travel`; team CTA remained distinct;
  no Pro gate appeared.
- Browser request inspection recorded zero HotelPlanner/provider requests.

## Remaining provider UAT

The seven aggregate `200` semantic failures cannot be diagnosed safely from the
approved fields. If the user approves Stage 2, use at most three HotelPlanner
search calls: one known tournament/venue/date case, one generic `/book-travel`
city case, and one controlled date/context variant. Inspect only response shape,
status classification, result counts, and bounded diagnostics; complete no
booking and retain no provider payload. Until then, the implementation and
positive fallback are locally verified, but the provider-specific root cause
remains open.
