# TournamentInsights — Past-Tournament Venue-Map Hotel Date Recovery

You are working inside the existing TournamentInsights / RefereeInsights / Corralio monorepo.

## Objective

Fix the narrow hotel-search dead end on a tournament venue map when the tournament dates are no longer usable.

Current production evidence:

- `/tournaments/florida-elite-invitational-2026/map` correctly waits for a venue selection before loading hotels.
- After selecting Earl Johnson Park or Chuck Rogers Park, the map calls the existing lodging-search boundary.
- The tournament ran August 15–16, 2026, so the server correctly returns the existing `no_dates` fallback without calling HotelPlanner.
- The selected-venue hotel panel then shows no hotel pins and no usable date editor because `Change dates` is rendered only when an initial resolved date-range label exists.
- The visitor therefore cannot recover by supplying valid future stay dates.
- Commit `7d5fb800` separately introduced the `/venues/{slug}/hotels` SEO pilot. That surface uses explicit dates before its `/go/hotels` handoff, but it does not change the tournament-map search or solve this in-place recovery case.

Preserve the valid past-date/provider guard. Fix only the missing recovery path.

## Product behavior

### No venue selected

Preserve current behavior:

- show tournament venues;
- do not automatically select a venue;
- do not request hotel results;
- do not show hotel pins;
- do not infer a venue or create tournament-wide hotel pins.

### Selected venue with valid upcoming tournament dates

Preserve current behavior:

- tournament dates remain the default hotel stay dates;
- the existing hotel search runs after venue selection;
- rates, hotel cards, hotel pins, property handoffs, team-block dates, and `View all nearby hotels` use the resolved dates;
- `Change dates` remains available.

### Selected venue without a usable date range

This includes a completed tournament, missing tournament dates, or another existing `no_dates` outcome.

The hotel panel must:

- clearly say that dates are needed to show nearby hotel rates;
- expose check-in and check-out inputs even though no initial date-range label exists;
- leave both inputs blank unless the visitor has already entered values during the current page session;
- never invent or silently infer replacement future dates;
- make no automatic HotelPlanner/provider search until the visitor submits a valid range with `Update hotels`;
- after a successful update, refresh the existing hotel pool, rates, cards, pins, property links, team-block dates, and `View all nearby hotels` link using those explicit dates.

Preserve the existing attributed, user-initiated broad HotelPlanner fallback. It remains a fail-open booking path; do not confuse that explicit outbound handoff with an automatic provider search.

Do not describe `no_dates` as limited hotel inventory or a provider failure.

Suggested bounded copy:

> Choose check-in and check-out dates to see nearby hotel rates.

Use the existing product voice if repository conventions support a clearer equivalent.

## Date validation

Use UTC calendar-date comparisons or the repository’s existing timezone-stable date helpers.

Require:

- valid ISO calendar dates from the native date controls;
- check-in is today or later;
- check-out is after check-in;
- both dates remain inside the existing HotelPlanner supported horizon.

Enforce provider-safety requirements at the trusted server boundary as well as in the UI. Manipulated requests containing past, invalid, reversed, or unsupported-horizon dates must not reach HotelPlanner.

Do not weaken the existing in-progress, past-tournament, horizon, rate-limit, or provider-failure guardrails.

## Attribution and routing invariants

Reuse the existing `/api/lodging/search`, `/go/hotels`, and `/go/hotels/property` boundaries.

Preserve:

- venue ID;
- tournament ID;
- venue coordinates with the existing city/state fallback;
- `source` / `sc`;
- `source_page_type` / page type;
- CTA placement;
- keyword and job code;
- HotelPlanner Custom fields;
- `outbound_attribution_id` / Custom3 reconciliation;
- lodging session and existing hotel measurement behavior;
- fail-open outbound booking behavior.

Do not add new analytics events, attribution identifiers, schemas, migrations, provider adapters, or commercial routing.

Tracking failure must never block a valid hotel handoff.

## Scope boundaries

Do not:

- restore automatic hotel pins for direct venue/SEO visits;
- load hotels before a tournament-map venue is selected;
- infer a nearest tournament or replacement dates;
- change tournament-to-venue navigation or SEO routing;
- change HotelPlanner property-page behavior;
- modify booking synchronization, reconciliation, commissions, or reporting;
- change group/team hotel architecture;
- modify RefereeInsights or Corralio;
- modify the `/venues/{slug}/hotels` SEO pilot, its eligibility/indexing rules, its analytics, or its current default-date behavior;
- add a new map, modal, search experience, or date library;
- push or deploy.

## Audit first

Before editing, inspect:

- the selected-venue hotel-loading effect;
- `resolveSearchWindow` and date-horizon enforcement;
- the current hotel-date control helpers;
- the date helpers introduced by `7d5fb800`, reusing or consolidating a pure helper only if practical without refactoring or changing the SEO pilot;
- the `no_dates`, provider-error, low-inventory, and unsupported-horizon UI branches;
- all existing consumers of resolved check-in/check-out dates;
- focused lodging/date-control tests and the September 4 venue-map date-control report.

Confirm the smallest implementation required. If the repository evidence contradicts the production diagnosis above, stop and report before changing behavior.

## Required tests

Add or update deterministic offline tests proving:

1. No venue selected produces no lodging search and no hotel pins.
2. A selected venue with valid upcoming tournament dates preserves the existing automatic dated search.
3. A selected venue with past tournament dates produces no automatic HotelPlanner call.
4. A `no_dates` result exposes usable blank date inputs.
5. `no_dates` copy is distinct from provider failure and limited inventory.
6. Editing inputs alone produces no lodging/provider request.
7. Valid explicit future dates produce exactly one lodging-search request when `Update hotels` is submitted.
8. Invalid, missing, equal, reversed, past, and unsupported-horizon dates are rejected before provider access.
9. A successful explicit search updates rates, pins, property handoffs, team-block dates, and `View all nearby hotels` dates.
10. Venue, tournament, source, placement, coordinates, keyword/job code, Custom fields, and attribution remain intact.
11. Direct venue/SEO behavior remains unchanged.
12. Tracking persistence failure cannot block the outbound hotel handoff.
13. The `/venues/{slug}/hotels` SEO pilot retains its current explicit-date handoff and analytics behavior.

Use an injected/fixed clock for relative `today` validation.

## Bounded UAT

Run local browser UAT against:

- the production-representative completed tournament `florida-elite-invitational-2026` using local application data if available; and
- one known future tournament with valid dates.

Before UAT, declare a maximum of two HotelPlanner search calls total:

1. one explicit-date recovery search for a selected venue on the completed tournament;
2. one existing automatic search for a selected venue on the future tournament.

Do not click a hotel property, submit a team block, or complete a booking.

Report:

- exact search-call count;
- whether completed-tournament selection made an automatic provider call;
- explicit dates used without exposing customer data;
- result and pin counts;
- whether updated handoff URLs retained the expected non-secret attribution fields;
- console/network errors;
- confirmation that direct venue behavior was unchanged.

## Verification

Run:

- focused offline tests;
- explicit TypeScript check for `apps/ti-web`;
- TI lint with zero warnings/errors;
- TI production build;
- the repository-required build matrix if shared files are changed;
- `git diff --check`.

Update the appropriate TI and repository notes only after implementation and verification.

## Final report

Return:

1. repository diagnosis;
2. exact behavior changed;
3. preserved behavior;
4. provider-call accounting;
5. tests/typecheck/lint/build/diff results;
6. files changed;
7. any remaining risk or unverified behavior.

Do not push or deploy. Do not commit unless separately authorized.

Use one final verdict:

`TI PAST-TOURNAMENT HOTEL DATE RECOVERY COMPLETE LOCALLY`

or

`TI PAST-TOURNAMENT HOTEL DATE RECOVERY BLOCKED`
