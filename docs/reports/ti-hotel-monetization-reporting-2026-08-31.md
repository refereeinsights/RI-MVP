# TI Hotel Monetization — Revenue-Safe Reporting

Date: 2026-08-31

## Verdict

`PASS — AUGUST DRY RUN COMPLETED; REVIEW VARIANCE BEFORE PERSISTENCE`

Downstream HotelPlanner synchronization and reporting were hardened without changing any customer-facing acquisition, search, handoff, redirect, attribution-generation, fee, fallback, or commercial-routing path.

## Post-implementation validation

The corrected post-implementation validation was completed offline after the implementation diff was finalized.

- `REVENUE PATH UNCHANGED: YES`
- `REPORTING SEMANTICS: PASS`
- `CANCELLATION REFRESH: PASS`
- `DOWNLOAD HARDENING: PASS`
- `AUGUST BACKFILL READINESS: READY`
- `SEPTEMBER SCORECARD: READY` for the existing daily delivery of a rolling seven-day scorecard

This validation made zero HotelPlanner calls, zero production database reads, and zero production writes. It used repository inspection, deterministic tests, and the previously completed aggregate-only cancellation diagnostic. It did not add a weekly snapshot, cron, reporting table, analytics store, or customer-facing behavior.

The subsequently authorized August dry run is recorded separately below; it made the five planned read-only provider calls and still made zero database writes.

## Stage A gate

PASS. The work needs no customer-facing handoff change, exact provider Source normalization is safe, unknown statuses remain unguessed, and the separately authorized cancellation diagnostic established the minimum account behavior needed for an independent status refresh.

Commercial Source is exactly:

```text
trim(Source).toLowerCase() === "tournamentinsights"
```

Null, blank, partial, and other Source values are excluded from TI commercial totals.

Status mappings are deliberately narrow:

- `Confirmed` (case/whitespace normalized exact match) → confirmed;
- `Cancelled` (case/whitespace normalized exact match) → cancelled;
- any other nonblank status → other;
- null/blank → unknown.

No broader HotelPlanner status vocabulary has been proven, so none is inferred.

## Cancellation diagnostic

Exactly one authorized, read-only HotelPlanner `getReport` request covered 2026-08-25 through 2026-08-31 using only `cancelledDateStart`, `cancelledDateEnd`, and `includeCancelled`.

Aggregate evidence:

- request accepted;
- 8 report rows returned;
- all 8 had exact `Cancelled` status;
- all 8 had normalized TournamentInsights Source;
- all 8 included a cancellation date, purchase date, and itinerary key;
- the audited download host was `hotelplanner.s3.amazonaws.com`;
- compressed size was 8,816 bytes and expanded size was 44,337 bytes.

No returned booking row, customer PII, itinerary identifier, signed URL, query parameter, or report payload was printed or retained. There was no HotelPlanner write and no database write. No further provider call was made.

Result: `CANCELLATION REFRESH IMPLEMENTED` as a separate seven-calendar-day report call. It reuses the parser and itinerary-key upsert but updates only status, cancellation date, and sync timestamp. `defaultToNull: false` prevents absent cancellation-report fields from erasing existing Source or economics. A cancellation-query failure is isolated from the purchased-date refresh.

## Hotel entry-path audit

| Entry path | HP destination | source/sc | Custom3 at TI exit | Deterministic ID | Fallback |
| --- | --- | --- | --- | --- | --- |
| Generic TI search / Book Travel | white-label `/Search/` through `/go/hotels` | bounded page source; `sc=tournamentinsights` | yes, `attr:{outbound_attribution_id}` | yes | bounded generic destination/date fallback inside `/go/hotels` |
| Tournament and tournament-hotel search | white-label `/Search/` through `/go/hotels` | tournament/tournament_hotels; `sc=tournamentinsights` | yes | yes | Standard target when fee target is unavailable or persistence does not authorize fee routing |
| Venue and venue-map search | white-label `/Search/` through `/go/hotels` | venue/venue_map; `sc=tournamentinsights` | yes | yes | Standard target under existing program-selection rules |
| TI property cards | white-label `/Hotel/HotelRoomTypes.htm` through `/go/hotels/property` | canonical page source; `sc=tournamentinsights` | yes | yes | Standard property target under existing fail-open rules |
| RI venue and RI Travel property cards | TI `/go/hotels/property`, then white-label property page | `referee` / `referee_travel`; `sc=tournamentinsights`; `Custom8=app:refereeinsights` | yes, minted/persisted by TI boundary | yes | existing RI travel/fallback surface |
| Checkout | white-label `/Accept/CheckOut.htm` POST through `/go/hotels/checkout` | attribution is persisted at TI boundary | not explicitly reposted; provider `bundle` continuity is opaque | TI row has an ID, but provider return is unproven | returns to attributed hotel-results path when bundle/config is missing |
| Fee-program handoff | configured fee-domain equivalent of search/property/checkout | same canonical attribution fields | yes for search/property; checkout caveat above | yes at TI boundary | existing Standard routing selection |
| Direct generic HP links | none found in live TI/RI application code | n/a | n/a | n/a | all audited live links use TI boundaries |

Conclusion: search and property handoffs explicitly contain valid Custom3 when TI relinquishes control. Checkout does not explicitly repost Custom3 and depends on opaque HotelPlanner bundle/session continuity. That is an attribution evidence gap, not changed under this task's revenue freeze.

## Reporting behavior

The existing TI admin email remains the only scorecard surface. It now reports:

- confirmed, cancelled, other, and unknown TI-source status cohorts;
- confirmed booking value only for confirmed TI-source rows;
- confirmed expected commission only for confirmed TI-source rows;
- `Provider-reported paid commission — all provider statuses` across every normalized TI-source row in the purchased-date reporting window;
- room nights as `UNPROVEN`;
- HotelPlanner arrival as `UNOBSERVABLE`;
- deterministically matched, internally unmatched, and attribution coverage for confirmed TI-source rows only;
- attribution values as unavailable when the outbound lookup fails, while commercial totals remain available;
- a compact count of non-TI Source rows.

Booking value is not called revenue. Expected commission is not called paid revenue. Cancelled economics do not enter confirmed economics.

## Historical backfill

The operator utility is `scripts/ops/backfill-hotelplanner-bookings.ts`.

The prepared August dry-run plan is exactly:

| Call | Purchased-date chunk |
| --- | --- |
| 1 | 2026-08-01 through 2026-08-07 |
| 2 | 2026-08-08 through 2026-08-14 |
| 3 | 2026-08-15 through 2026-08-21 |
| 4 | 2026-08-22 through 2026-08-28 |
| 5 | 2026-08-29 through 2026-08-31 |

The dry run affects no database table. A later, separately authorized apply may upsert only `ti_hotel_bookings` using `itinerary_number`; it does not alter `ti_outbound_clicks`, commercial snapshots, or HotelPlanner. The same itinerary can be imported repeatedly without multiplying rows. Any provider request, download, parser, or persistence failure stops the sequential run immediately, with no automatic retry.

Dry-run example (authorized provider access is still required; do not execute casually):

```bash
TSX_TSCONFIG_PATH=apps/referee/tsconfig.json node --env-file=.env.local --env-file=apps/ti-web/.env.local --import tsx scripts/ops/backfill-hotelplanner-bookings.ts --start 2026-08-01 --end 2026-08-31
```

Only after separately reviewing that dry-run and separately authorizing production persistence:

```bash
TSX_TSCONFIG_PATH=apps/referee/tsconfig.json node --env-file=.env.local --env-file=apps/ti-web/.env.local --import tsx scripts/ops/backfill-hotelplanner-bookings.ts --start 2026-08-01 --end 2026-08-31 --apply --confirm-dry-run
```

The implementation enforces 31 purchased-date days maximum, sequential chunks of at most seven days, five calls maximum, no concurrency, no retry, aggregate-only output, dry-run by default, explicit prior-dry-run confirmation for apply, and immediate stop on the first provider/download/parser/persistence failure.

The founder-authorized dry run was executed on 2026-09-01. Its aggregate result was:

```text
mode: dry-run
chunks: 5
provider calls: 5
parsed rows: 35
persisted rows: 0
errors: 0
```

The first attempt made zero provider calls because the operator wrapper's top-level `await` was incompatible with the repository's CommonJS transform. The wrapper was corrected to use an async `main()` with a constant, payload-free failure message, after which the authorized run completed successfully.

The 35 current provider rows differ from the previously captured 40-row August baseline. The dry run intentionally exposed no row-level data, so the cause is not established. It may reflect later provider reservation-state corrections or report-cohort behavior, but that must not be inferred. No production backfill was executed, and persistence should remain unauthorized until the aggregate variance is reviewed.

## September scorecard readiness

The existing TI admin email is scheduled daily and loads a rolling seven-day reporting window. It can now report confirmed, cancelled, other, and unknown TI-source bookings; confirmed booking value; confirmed expected commission; separately labeled provider-reported paid commission; matched and internally unmatched confirmed bookings; and deterministic attribution coverage. A distinct persisted weekly artifact is not implemented or needed for the current monitoring requirement.

The August figures in this report are a previously captured provider-purchase-date baseline, not an immutable reconstruction requirement. A later backfill may differ if HotelPlanner subsequently changed cancellation or reservation state; any variance must be reported rather than forced or used to rewrite the captured baseline.

## Provider-download safeguards

- report request timeout: 20 seconds;
- download timeout: 30 seconds;
- HTTPS only;
- exact audited hostname plus optional server-only exact-host allowlist;
- redirects rejected;
- signed URL and query never logged;
- compressed response maximum: 20 MB, checked from declared length and streaming bytes;
- ZIP central-directory preflight before extraction;
- expanded archive maximum: 50 MB;
- archive entry maximum: 64;
- unsafe paths and missing expected `xl/worksheets/sheet1.xml` rejected;
- parsed booking-row maximum: 10,000;
- report payload never logged.

The 10,000-row ceiling is conservative against observed volumes (8 rows in the bounded cancellation diagnostic and the existing 32-row monthly baseline) while creating a hard parser-memory bound.

## Verification

- HotelPlanner-focused and revenue-path regression tests: 134 passed (including 18 new/updated synchronization and reconciliation checks);
- Referee TypeScript: passed;
- Referee zero-warning lint command: passed;
- Referee production build: passed (pre-existing repository warnings remain in the build output);
- `git diff --check`: passed;
- final revenue-path diff: no customer-facing hotel file changed.

## Restrictions observed

- no schema or migration;
- no production historical backfill;
- no cron change;
- no deployment;
- no push;
- unrelated working-tree changes preserved.

Next decision: review the aggregate 35-versus-40 baseline variance before authorizing August persistence. If persistence is later authorized, the existing `--apply --confirm-dry-run` boundary will upsert only `ti_hotel_bookings`. If checkout attribution coverage remains materially weaker than search/property coverage, prepare a separate attribution-only audit/patch; do not combine it with commercial routing.
