# Corralio Slice 4.5 — Stage 1 Audit and Implementation Report

Date: 2026-08-25

## Verdict

`SLICE 4.5 STAGE 1 COMPLETE LOCALLY; STAGE 2 REQUIRED`

The canonical prompt was patched with the 11 authoritative corrections before implementation. The repository and current upstream contract expose no material specification blocker.

## Repository findings

- Slices 4.4, 4.4B, and 4.4C are recorded complete in `apps/corralio/notes.md`.
- 4.4C production evidence is currently constrained to `ics_observation`; its pure eligibility rule already reserves `overture_place_match` as strong.
- 4.4C stores `active`, `merged`, `reconciled`, and `suppressed` states but exposes no general enrichment resolver. Slice 4.5 adds the minimum service-only resolver.
- `venues_public` exposes no coordinates. Canonical coordinates remain in `public.venues`; Slice 4.5 adds a minimal service-only coordinate RPC and does not change authenticated grants or the public view.
- No Overture dependency/helper was present. No DuckDB CLI was available locally.

## Current Overture contract

Sources checked:

- [Places guide](https://docs.overturemaps.org/guides/places/)
- [Place schema](https://docs.overturemaps.org/schema/reference/places/place/)
- [Attribution and licensing](https://docs.overturemaps.org/attribution/)

Findings:

- The live schema defines `id` as a feature ID that is a GERS ID only when the feature participates in GERS. Corralio stores it as `overture_feature_id` and records GERS confirmation separately.
- Feature `version` and the dated dataset release are different values and are stored separately.
- Overture `confidence` is a 0–1 place-existence signal, not venue-match confidence. Corralio names it `overture_existence_confidence`.
- The August 2026 schema includes `basic_category` and `taxonomy`; the legacy `categories` property is scheduled for removal. V1 selection uses the current taxonomy fields.
- Source records can be multiple and property-scoped. Corralio normalizes provenance rather than collapsing it to one license.
- Foursquare-sourced data is excluded unless a later human-approved Apache-2.0/NOTICE plan explicitly authorizes it.

## Implemented boundary

- Pure deterministic Food/Coffee classification, 3-mile filtering, provisional 0.70 existence floor, provisional 15-per-category storage cap, distance ordering, feature-ID deduplication, and conservative venue matching.
- Food/Coffee filtering governs the Nearby pool. The distinct corroboration matcher may inspect a tightly bounded venue-like Overture candidate so a sports venue can actually be corroborated; it never stores that candidate as an additional Nearby category.
- Match rule `corralio-overture-match-v1` requires exact normalized name/locality, exact normalized address when the shared venue has one, and no more than 250 meters. One match succeeds; ambiguity or disagreement writes no evidence.
- Strong evidence, its typed detail, and all provenance commit atomically through one narrow service-only RPC.
- Candidate relationships use separate canonical/provisional columns with exactly-one integrity and a real provisional FK.
- Lifecycle resolution is exact: active self, merged one-hop active survivor, reconciled canonical, suppressed no target.
- Refresh scopes explicitly represent Food and Coffee even when the result is empty. Staging plus atomic activation lets an empty complete result replace stale data while a failed refresh leaves the old active pool intact.
- New tables are forced-RLS and service-only. Candidate reads remain service-only.
- The existing aggregate quality report now includes Food fill, event-weighted Food coverage, Coffee fill, zero/partial/full distributions, duplicates, enrichment success/failure, and active count. It contains no feasibility calculation or row-level private output.
- The operations CLI is dry-run by default and requires `--apply --confirm-apply` for mutation.

## Hard bounds

- venues/run: 10
- boxes/cells/run: 10
- downloaded/scanned bytes: 64 MiB
- candidates examined: 10,000
- stored candidates/category/venue: 15
- execution duration: 60 seconds
- concurrency: 1

These cap and confidence values are provisional. A live Stage 1 sample was not run because no audited local Overture extraction tool was present to enforce/report the byte boundary. The prompt explicitly permits deferring final thresholds to bounded Stage 2 UAT.

## Validation

- Corralio library tests: 133 passed, including 11 new Slice 4.5 tests.
- Corralio TypeScript: passed.
- Operations/report TypeScript: passed.
- Corralio lint: passed with zero warnings/errors.
- Production builds: `corp-app`, `corralio-app`, `referee-app`, and `ti-web` all passed. Existing unrelated TI/RI warnings remain.
- `git diff --check`: passed.

## Usage and mutations

- Overture calls/downloads: 0
- Geocodio calls: 0
- OpenRouteService calls: 0
- Mapbox calls: 0
- Database writes: 0
- Migration applications: 0
- Canonical venue writes/fixtures: 0
- Pushes/deployments/crons: 0

## Stage 2 handoff

1. Human applies `supabase/migrations/20260825_corralio_slice45_overture_nearby_foundation.sql`.
2. For databases where the base migration was applied before the verifier repair, apply `supabase/migrations/20260825_corralio_slice45_activation_completeness_fix.sql`. It replaces only the activation RPC and preserves existing data.
3. Run `scripts/analysis/corralio_slice45_catalog_verification.sql`.
4. Run `scripts/analysis/corralio_slice45_behavioral_verification.sql`; it is rollback-only.
5. Prepare a small Overture extract around eligible non-private venues within the declared bounds.
6. Run the refresh CLI dry-run, finalize cap/floor if warranted, then explicitly authorize any apply UAT.
7. Run the aggregate quality report and independently verify cleanup zero.

The first catalog-verifier attempt after base migration application failed read-only because PostgreSQL's `pg_tables` view does not expose `forcerowsecurity`. The repaired verifier reads `pg_class.relforcerowsecurity`. The accompanying audit also made activation fail closed for missing candidate provenance or an over-cap pool and corrected the rollback verifier to recognize that evidence provenance is already written atomically by the evidence RPC.

The first behavioral-verifier attempt then exposed an assertion-order bug: it invoked the mutating activation RPC and queried active state inside one Boolean expression, whose evaluation order PostgreSQL does not guarantee. The corrected verifier assigns the activation result first and checks state in a following statement. The failed run remained inside its transaction and retained no fixture.
