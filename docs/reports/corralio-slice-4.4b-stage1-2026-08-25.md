# Corralio Slice 4.4B Stage 1

## Verdict

`SLICE 4.4B READY AFTER MIGRATION AND STAGE 2 VERIFICATION`

No migration was applied, no production or historical data was processed, and no external provider call was made during Stage 1.

## Audit and decisions

- The former source-classification prerequisite is intentionally retired. V1 accepts only successfully persisted `origin_type='ics'` events; manual events remain ineligible. Generic ICS is low-trust preliminary evidence and cannot authorize canonical/public data.
- `public.venues` and `venues_public` are public/canonical contracts, so provisional records use the new service-only `corralio_provisional_venues` table. The existing private `corralio_event_venue_matches` row gains a mutually exclusive `provisional_venue_id` state.
- Slice 4.4's exact household-origin/privacy result remains the hard upstream gate. Slice 4.4B additionally requires a successful persisted Slice 4.3 geocode and a conservatively parsed named place. Bare addresses, logistics, home/away markers, and orphan field/court labels remain usable events but create no shared identity.
- The shared row contains a bounded parsed place name, normalized identity components, coordinates, lifecycle/provenance tokens, and timestamps. It contains no household/event/source identifier, raw complete event location, schedule URL, credential, field instruction, note, child, or team data.
- Identity normalization is versioned. A SHA-256 identity key plus a broader normalized-name/locality advisory lock serializes concurrent observations. The transactional RPC verifies ICS origin, persisted coordinate equality, canonical-first unresolved state, an exact canonical race check, suppression, complete provisional candidates, and association coherence before creating/reusing.
- Suppression is service-only and retains the identity-key row as a durable tombstone. It detaches provisional associations without modifying family events. Zero-association shared rows remain available for controlled 4.4C cleanup/revalidation.
- The post-geocode hook reuses existing coordinates and is separately caught. The run is bounded to 200 event IDs and creates zero incremental Geocodio, OpenRouteService, Mapbox, Overture, or other provider calls.

## Prepared Stage 2 artifacts

- Migration: `supabase/migrations/20260825_corralio_slice44b_shared_provisional_venues.sql`
- Catalog verifier: `scripts/analysis/corralio_slice44b_catalog_verification.sql`
- Rollback-only behavioral verifier: `scripts/analysis/corralio_slice44b_behavioral_verification.sql`
- Aggregate-only report: `scripts/analysis/corralio_slice44b_venue_identity_coverage.ts`

Stage 2 must follow human migration application and must include the catalog verifier, rollback-only behavior, disposable cross-household concurrency and canonical-reconciliation UAT, browser regression, aggregate report, and cleanup-zero verification. No backfill, cron, deployment, push, or canonical promotion is authorized.

## ADR reconciliation proposed before canonical edits

The canonical ADR file already has unrelated uncommitted work in the working tree, so Stage 1 does not modify it. Apply these exact amendments after review:

### ADR-008 — append to Decision

> Corralio may create and reuse low-trust provisional place identities only in a structurally separate, service-only domain that cannot enter `public.venues`, `venues_public`, public search, SEO, sitemaps, or canonical exports. This provisional identity is preliminary reusable intelligence, not canonical venue truth.

### ADR-008 — append to Consequences

> Successfully persisted ICS event evidence may create an isolated provisional identity after privacy exclusion, existing geocode reuse, conservative named-place parsing, canonical-first matching, atomic duplicate checks, and durable suppression. Canonical/public promotion still requires stronger independently validated evidence and trusted controls.

### ADR-030 — replace the provider restriction in Consequences

> TI's existing Mapbox presentation and stored canonical venue context remain reusable assets, but they do not require Corralio to use Mapbox for geocoding, routing, or new place corroboration. Corralio uses independently swappable, server-side providers under their applicable persistence terms: Geocodio for persisted geocoding, OpenRouteService/HeiGIT as the V1 baseline-routing implementation, and Overture as the planned reusable place-intelligence source. New providers still require a documented need, privacy review, usage controls, and compatible storage terms.

### ADR-033 — replace the coordinate-overwrite sentence in Consequences

> Slice 4.3 geocodes event locations directly through Geocodio and preserves those accepted event coordinates. Slice 4.4 canonical matching and Slice 4.4B provisional association enrich identity without silently overwriting the event's persisted Geocodio coordinates. Canonical and provisional venue coordinates remain separate facts.

### ADR-033 — append to Decision

> Schedule matching alone never creates canonical venues. A separately isolated provisional pipeline may automatically create preliminary shared identities from low-trust successfully persisted ICS events; those identities remain server-only and require stronger validation before canonical/public promotion.

ADR-021 requires no change: validated automation remains compatible with this staged identity model.

## Usage and security

- Incremental external calls: **0**.
- New recurring/scheduled work: **none**.
- Automatic historical processing: **none**.
- Client access to provisional storage/RPCs: **none**, subject to the Stage 2 catalog verifier.
- Shared sensitive/raw schedule content: **none by schema and adapter contract**.
