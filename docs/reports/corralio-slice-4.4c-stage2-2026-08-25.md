# Corralio Slice 4.4C Stage 2

## Verdict

`SLICE 4.4C COMPLETE LOCALLY`

The production migration, additive function repair, database verification, aggregate reporting, signed-in browser regression, usage verification, and cleanup-zero verification are complete. No push, deployment, provider call, canonical venue write, evidence backfill, cron, or production bulk lifecycle operation occurred.

## Migration and repair

The user applied `20260825_corralio_slice44c_provisional_lifecycle_evidence.sql`. The first rollback-only behavioral run exposed an ambiguous PL/pgSQL column-list conflict target in the V2 create/reuse function: its `provisional_venue_id` output variable shared the evidence table column's name. The base migration now uses the named unique constraint, and the user applied the additive, data-neutral `20260825_corralio_slice44c_provisional_lifecycle_evidence_fix.sql` repair.

Exact repair result:

`SLICE 4.4C EVIDENCE CONFLICT REPAIR PASSED`

## Database verification

The strengthened owner-level catalog verifier passed the exact table ownership, forced-RLS/no-policy boundaries, grants, read-only service table access, ICS-only evidence vocabulary, observation uniqueness, lifecycle coherence, function ownership/security/search paths, narrow execution grants, public-view isolation, and named conflict target.

Exact result:

`SLICE 4.4C CATALOG VERIFICATION PASSED`

The network-free behavioral verifier completed inside an explicit transaction ending in `ROLLBACK`. It passed repeated-observation idempotency, same- versus distinct-source-scope counting, generic-ICS ineligibility, unsupported-evidence rejection, exact and trusted merge authority, merge idempotency, one-hop flattening, evidence preservation, association repointing, forced-transition-failure atomicity, suppression, existing-canonical reconciliation without canonical mutation, event-geocode preservation, anonymized evidence retention after source deletion, authenticated denial, service direct-write denial, and independent cleanup zero.

Exact result:

`SLICE 4.4C BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO`

Concurrent duplicate safety is enforced by the database unique constraint on provisional identity plus observation fingerprint and the V2 writer's named-constraint `ON CONFLICT DO NOTHING`. Catalog verification asserts that exact contract, while behavioral verification proves repeated execution converges to one observation. A separate committed two-session fixture was deliberately not created because the production service role cannot delete lifecycle/evidence history by design; manufacturing such a tombstone would conflict with cleanup-zero. Merge operations retain their deterministic advisory/row-lock discipline from the verified migration.

## Aggregate quality report

The read-only aggregate report returned:

- successfully geocoded ICS events: 0
- eligible named locations: 0
- canonical associations: 0
- provisional associations: 0
- unresolved eligible locations: 0
- active/suppressed/merged/reconciled provisional venues: 0/0/0/0
- zero-association provisional venues: 0
- potential duplicates: 0
- raw-observation and distinct-source-scope distributions: empty
- strong-evidence types: none
- eligibility rule: `corralio-promotion-eligibility-v1`
- promotion-eligible provisional venues: 0

This is the correct clean pre-launch state. Quick-check remains excluded as unaudited strong evidence, production evidence remains `ics_observation` only, and zero promotion eligibility is expected until a separately audited strong source is implemented.

## Independent browser regression

Claude independently exercised the already-signed-in local smoke identity on port 3002 without entering credentials.

- **This Weekend:** four schedules rendered with sport, time, title, location, directions, and the existing correctly classified conflict. No leave-by line rendered because the household origin field was empty; this is the intended conditional behavior, not a regression.
- **Family:** three children and their teams rendered with correct sports, the empty private household-origin control and “never used as venue evidence” copy, and the private server-only calendar-link connection copy.
- **Upcoming:** retained its intentional placeholder.
- No provisional venue, lifecycle, evidence, or promotion UI appeared.
- All three routes had no application console error, exception, failed UI state, or framework overlay. The only console item was the ordinary React DevTools development notice.

This proves the Section 30 consumer regression boundary: event/conflict rendering, conditional estimated leave-by behavior, family/schedule controls, and product-surface isolation remain intact.

## Usage and cleanup

An independent aggregate read returned zero `corralio_external_api_calls`, zero provider/operation groups, zero `corralio_external_call_daily_quota` rows, and zero reserved calls. Stage 2 therefore added no Geocodio, OpenRouteService, Mapbox, Overture, source-feed, or other provider usage and had no effect on the Slice 4.3 household quota.

Independent post-verification counts returned:

- `corralio_provisional_venues`: 0
- `corralio_provisional_venue_evidence`: 0
- `corralio_provisional_venue_transitions`: 0

The behavioral transaction also independently reported rollback cleanup zero. No disposable Auth identity or retained lifecycle fixture was created for the browser pass.

## Final state and deferrals

4.4C now provides durable ICS observation evidence, anonymized source-scope independence, coherent suppression/merge/reconciliation lifecycle state, immutable transition history, one-hop redirects, existing-canonical reconciliation, and deterministic strong-evidence eligibility while correctly exposing no production strong-evidence writer.

Overture evidence, Nearby candidates, canonical creation/promotion, quick-check evidence ingestion, generic trusted evidence insertion, evidence backfill, retention cleanup, lifecycle UI, cron, routing changes, and provider changes remain deferred. Slice 4.5 may now begin its audit against the shipped 4.4C contract.
