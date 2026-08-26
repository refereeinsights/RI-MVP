# Corralio Slice 4.4D Stage 1 Audit — 2026-08-26

## Verdict

`SLICE 4.4D READY FOR DATABASE VERIFICATION`

The applied database was not mutated and existing events were not reprocessed.

## Repository facts

- Event geocoding was behind the household-home routing gate, so a household without a configured origin never reached event geocoding from This Weekend.
- The V1 matcher required locality and could not consider `Eagles Ice Arena (home ice)`.
- Address matching compared a complete normalized address string and did not safely converge the Plantes Ferry feed/canonical formatting.
- Both required locations already have canonical venue records. They are canonical-reuse regressions, not provisional-creation fixtures.
- No reusable Corralio canonical alias table or complete unique-name RPC existed.
- The current Overture implementation is bounded spatial enrichment around an established venue. It is not a global place-name search and was not expanded.

## Stage 1 design

- Bump the deterministic matcher to `corralio-v2`, invalidating old unmatched/insufficient decisions through the existing matcher-version contract.
- Strip only approved trailing annotations and sublocation markers.
- Match address-only inputs by exact normalized street identity inside exact city/state scope; never collapse different street numbers.
- Match name-only inputs only through a complete indexed canonical lookup returning exactly one row.
- Persist only aliases created after validated canonical/provisional resolution, with no household, event, source, child/team, note, URL, or origin fields.
- Preserve unresolved as the correct result for ambiguous names and unsupported incomplete locations.
- Move existing bounded event geocoding ahead of the optional-origin routing gate without changing provider, claims, quota, timeout, persistence, or logs.
- Provide bounded dry-run-first reprocessing, but do not invoke it during Stage 1.

## Required regression outcomes

| Input | Expected Stage 2 result |
| --- | --- |
| `12320 E Upriver Drive, Spokane Valley, WA 99206` | Existing canonical Plantes Ferry; no provisional duplicate |
| `Eagles Ice Arena (home ice)` | Existing unique canonical Eagles Ice Arena; no provisional duplicate |
| Different street number | Unmatched |
| Ambiguous exact normalized name | Unmatched |
| Household-origin equality | `private_skipped`; no shared alias/evidence |
| Unknown address-only location without public-place evidence | No shared provisional identity |

## Prepared database work

- `supabase/migrations/20260826_corralio_slice44d_incomplete_ics_venue_resolution.sql`
- `scripts/analysis/corralio_slice44d_catalog_verification.sql`
- `scripts/analysis/corralio_slice44d_behavioral_verification.sql`

These files are unapplied. Stage 2 order is human migration apply, catalog verifier, rollback-only behavioral verifier, cleanup confirmation, bounded dry-run, reviewed apply only after explicit approval, and product regression UAT.

## Repository verification

- Complete Corralio test suite: 210 passed.
- Corralio TypeScript: passed.
- Corralio lint: passed with zero warnings.
- Production builds: `corp-app`, `corralio-app`, `referee-app`, and `ti-web` all passed; RI/TI emitted only pre-existing warnings.
- Diff whitespace validation: passed.

## Usage and privacy

Stage 1 made zero database writes and zero Geocodio, OpenRouteService, or Overture requests. It added no global search, canonical creation, venue-directory behavior, background processing, push, or deployment. Household origins remain excluded from shared venue aliases and evidence.
