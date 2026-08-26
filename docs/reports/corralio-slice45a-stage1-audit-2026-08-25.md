# Corralio Slice 4.5A Stage 1 audit and dry-run — 2026-08-25

## Verdict

**SLICE 4.5A STAGE 1 COMPLETE LOCALLY; MIGRATION AND ATOMIC REPLACEMENT UAT REQUIRED**

The generalized quality rule materially removes the initial contamination while preserving full Food coverage, full quick-option coverage, full Coffee availability, local/non-chain candidates, and the existing 15-row broad-category caps. No production database write was performed in Stage 1.

## Audit findings

- The existing broad `category = food | coffee` field is load-bearing for scopes, caps, and atomic replacement. 4.5A therefore adds a separate intent field rather than changing the broad contract.
- The confirmed false positives carried plausible Food taxonomy. Taxonomy and existence confidence alone cannot be acceptance gates.
- The August 2026 Places data exposes optional `operating_status` with property-scoped `overture-signals` provenance. 4.5A accepts that source only for `/properties/operating_status` when the record explicitly declares `CDLA-Permissive-2.0`; missing/mismatched declarations fail closed.
- Mixed Foursquare records remain entirely excluded. No Apache/NOTICE approval was inferred.
- The original Starbucks results represent distinct addresses except for raw same-address aliases. The conservative deduper merges only same feature identity or exact normalized address plus alias-equivalent name within 150 meters.
- Existing active rows need a deploy-safe backfill before the new columns become NOT NULL. The migration maps Coffee to Coffee intent and legacy Food to `other_food`, explicitly marks their quality/dedupe rules `legacy-v0`, and makes V1 the default only for later inserts. The next atomic refresh replaces that transitional logical pool; activation accepts only explicitly V1-classified staged rows.

## Generalized rule

The versioned `corralio-overture-candidate-quality-v1` rule rejects:

- excluded or incomplete provenance;
- missing/below-floor existence confidence;
- confirmed closed/inactive places;
- structured bar/pub/liquor/lounge/nightclub and other non-target categories;
- generalized contradictory healthcare, real-estate, senior-care, government, liquor/gas, and legal-entity identity indicators;
- low-confidence records with no address; and
- status-unknown breweries below a higher 0.80 existence threshold.

It does not contain the UAT business names, feature IDs, or addresses. Positive fixtures cover independent local pizza, sandwich, café, quick-service, brewery, and other-Food identities.

The versioned `corralio-overture-dedupe-v1` rule chooses a stable winner by permitted provenance strength, confirmed-open evidence, confidence, identity completeness, then feature ID. Cross-venue reuse remains valid.

Food selection preserves the 15-row total cap and anchors each available quick intent plus up to three `other_food` and one `brewery` candidate before filling remaining slots with quick options first.

## Same-data dry-run

The original retained bounded extraction was replayed; this is not a changed-data comparison.

- Release: `2026-08-19.0`
- Venues: 3
- Boxes: 3
- Radius: 3 miles / 4,828 meters
- Downloaded payload: 16,764,451 bytes
- Unique raw features: 6,713
- Relevant venue-scope candidates examined by the refresh: 819
- Extraction elapsed time: approximately 13 seconds
- Concurrency: 1
- Added routing/geocoding calls: 0
- Database mutations: 0

### Before and after

| Metric | Initial 4.5 | 4.5A dry-run |
|---|---:|---:|
| Stored/selected rows | 51 | 87 |
| Food | 45 | 45 |
| Coffee | 6 | 42 |
| Confirmed invalid | 10 | 0 |
| Confirmed contamination | 19.61% | 0% |
| Original questionable rows retained | 2 | 0 |
| Review-needed rows | 2 | 3 |
| Potential contamination rate | 3.92% | 3.45% |
| Food availability | 3/3 | 3/3 |
| Quick-option availability | not typed | 3/3 |
| Coffee availability | 3/3 | 3/3 |

Intent distribution: 20 quick service, 5 pizza, 8 sandwiches, 3 brewery, 9 other Food, and 42 Coffee.

Operating-status distribution: 78 confirmed open and 9 status unknown. No confirmed-closed row is selected.

Three selected café/coffee identities remain appropriate for manual consumer-suitability review because their names are not self-explanatory (`Fresh Vibes Nutrition`, `Make Good Choices`, and `Antonio's Place`). They have permitted provenance, structured café/coffee evidence, public addresses, confirmed-open status, and qualifying confidence; they are reported as review-needed rather than declared invalid.

### Exclusion impact

The venue-scope decision report recorded:

- 137 excluded-provenance occurrences, including all Foursquare-bearing records;
- 36 structured non-target category exclusions;
- 32 contradictory-identity exclusions;
- 75 below-floor confidence exclusions;
- 3 confirmed-closed exclusions;
- 2 uncertain-brewery exclusions;
- 1 insufficient-address/identity exclusion; and
- 31 non-Food/Coffee records included only for bounded venue corroboration.

Counts are decision occurrences across overlapping venue scopes, not unique physical places, and must not be summed as a global unique-place count.

Accepting strictly validated `overture-signals` materially improved Coffee coverage and made operating status explicit. It did not admit any mixed Foursquare record.

## Prepared implementation

- Canonical 4.5A prompt with the audit stop gate and exact scope.
- Pure versioned acceptance, intent, status, provenance, deduplication, and diversity logic.
- Service adapter persistence of intent/status/rule versions.
- Deploy-safe unapplied migration and hardened activation contract.
- Read-only catalog verifier and rollback-only database behavioral verifier.
- Updated aggregate quality report fields.
- Deterministic generalized regression and positive local-business fixtures.

## Local verification

- 144 Corralio library and schedule tests passed.
- The focused 4.5/4.5A suite passed 22 tests, including classification, provenance, operating-status, intent, deduplication, diversity, semantic replay idempotency, privacy-boundary, schema, and atomic-refresh architecture checks.
- `npx tsc --noEmit -p apps/corralio/tsconfig.json` passed.
- `npm run lint --workspace corralio-app` passed with zero warnings or errors.
- `git diff --check` passed.
- Production builds passed for `corp-app`, `corralio-app`, `referee-app`, and `ti-web`. Referee and TI retained pre-existing warnings but produced successful builds; no scoped Corralio warning was introduced.
- The catalog and rollback-only behavioral SQL verifiers are prepared but intentionally not executed because the migration remains behind the required human-application gate.

Usage for this implementation was zero new Overture downloads, provider calls, routing/geocoding calls, database mutations, backfills, cron executions, pushes, or deployments. The quality comparison replayed the already-retained bounded Overture payload locally.

## Stage 2 gate

1. A human applies `supabase/migrations/20260825_corralio_slice45a_candidate_quality_hardening.sql`.
2. Run `scripts/analysis/corralio_slice45a_catalog_verification.sql`.
3. Run `scripts/analysis/corralio_slice45a_behavioral_verification.sql`; it rolls back.
4. Replay the bounded dry-run against the applied schema.
5. Only after review, run the confirmed atomic refresh to replace the current 51-row active pool.
6. Verify the previous pool was replaced completely, all candidates have provenance, no canonical/provisional/evidence rows changed, and the failed-refresh path preserves the new complete pool.

No migration apply, production candidate replacement, push, deployment, cron, canonical/provisional mutation, promotion, routing call, or geocoding call is authorized by Stage 1.
