# Corralio Slice 4.5 — Overture Venue Corroboration & Nearby Data Foundation

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

Slices 4.3, 4.4, 4.4B, and 4.4C must be complete locally and verified before this slice starts. Slice 4.4C established typed evidence and provisional-venue lifecycle state. This slice adds the reserved `overture_place_match` evidence type and creates the separate durable Food/Coffee candidate foundation that Slice 4.6 will read.

The governing principle remains:

# Capture broadly. Enrich automatically. Publish conservatively.

This slice does two separate things:

1. **Corroboration** — write typed `overture_place_match` evidence only after a deterministic, versioned provisional-to-Overture venue match succeeds.
2. **Nearby foundation** — store a bounded shared Food/Coffee candidate pool attached to a canonical or provisional venue identity. Candidate storage is not evidence and does not affect promotion eligibility.

This slice does not promote or create canonical venues, build UI, compute schedule/travel feasibility, or create household-specific POI copies.

---

## 0. Repository Prerequisite Gate

Before editing:

- Confirm `apps/corralio/notes.md` contains `SLICE 4.4C COMPLETE LOCALLY` or an equivalent fully passed Stage 2 verdict.
- Confirm the 4.4C migration is applied to the target database with a live read-only probe of its evidence and lifecycle schema.
- Reconfirm the completed 4.4B and 4.4 baselines.

If a baseline is absent or conflicting, stop and report it rather than inventing policy.

---

## 1. Audit First — Repository Reality Wins

Audit before implementing:

- Inspect 4.4C's final evidence schema, allowed types, fingerprint/idempotency contract, eligibility rule, and narrowly authorized ICS writer. The Overture writer must have equally narrow authority.
- Inspect provisional lifecycle storage and any trusted resolver. The required resolution contract is:
  - `active` → enrich itself;
  - `merged` → resolve to its one-hop active surviving provisional;
  - `reconciled` → resolve to its canonical target;
  - `suppressed` → no enrichment target.
  Suppression is not a redirect. If no suitable resolver exists, add only the smallest service-only resolver needed.
- Determine whether the repository already has an Overture extraction/query mechanism. Do not assume either a hosted endpoint or a new dependency.
- Verify the current Overture Places schema and Food/Coffee taxonomy from live official documentation: feature/place ID, whether an ID is confirmed as GERS, dataset release, feature `version`, geometry, category fields, `confidence`, and the property-scoped `sources` array.
- Treat Overture `confidence` only as confidence that a place exists. Name it `overture_existence_confidence` in Corralio. It is not venue-match confidence.
- Use `overture_place_id` or `overture_feature_id` as the external identifier. Record GERS status/ID only where actually confirmed. Keep dataset release separate from feature `version`.
- Verify every applicable source/license combination. Sources can be multiple and property-scoped. Exclude Foursquare-derived records/properties from V1 unless a human-approved Apache-2.0/NOTICE compliance plan explicitly authorizes them.
- Inspect `public.venues`, `venues_public`, and provisional coordinate boundaries. Do not assume `venues_public` exposes coordinates. Use existing service-role access to `public.venues`, or add the narrowest service-only coordinate view/RPC. Do not broaden authenticated access.
- Confirm whether existing dependencies, environment variables, helpers, and the aggregate quality report can be reused.

If repository reality conflicts with a product or security rule in this prompt, stop and report it. A missing lifecycle resolver or coordinate helper is not itself a blocker because the narrow service-only additions above are authorized.

---

## 2. Scope and Privacy Boundary

### 4.5 does

- Extract only Food/Coffee-relevant Overture Places within bounded areas around eligible shared venue/event locations.
- Deterministically match provisional venues and write strong typed evidence only for one unambiguous successful match.
- Store a bounded candidate pool for canonical and eligible provisional venue identities.
- Preserve every applicable provenance/licensing relationship.
- Extend the existing aggregate quality report with Section 8's metrics.

### Private origins are categorically excluded

Overture extraction, Stage 1 sampling, matching, bounding boxes/cells, enrichment, refresh, reporting, and fixture selection must never use household home/origin coordinates or any other private routing location. Use only:

- eligible canonical coordinates obtained through the trusted server-only boundary;
- eligible provisional coordinates after lifecycle resolution; or
- eligible event-location coordinates already permitted by the shared venue model.

Private origins cannot become venue evidence or influence the Overture footprint. Do not log, export, stage, or persist them in this subsystem.

### 4.5 does not

- Build parent UI, a venue directory/profile, search, sitemap, or export surface.
- Compute travel time, round-trip time, schedule feasibility, or whether a POI fits before the next game. Those belong to 4.6.
- Apply 4.6's three-per-category presentation cap; 4.5 stores a wider bounded pool.
- Create, modify, promote, or create UAT fixtures in `public.venues`.
- Add categories beyond Food and Coffee.
- Run cron, push, deploy, or call Overture from a user request path.
- Create candidate copies keyed to households or events when a shared venue can own the pool.

---

## 3. Overture Access, Sampling, and Extraction

- Use independent bounded boxes/cells around eligible non-private shared venue or event-location coordinates, padded only for the tunable 3-mile candidate pre-filter. Do not use one broad envelope that downloads irrelevant geography.
- Filter the Nearby candidate-pool branch to current, officially documented Food and Coffee categories only. The separate provisional-venue corroboration lookup may inspect only the tightly bounded venue-like place candidates needed for deterministic matching near that provisional venue; those non-Food/Coffee match candidates must not enter the Nearby pool. This is necessary to corroborate sports venues and does not authorize another Nearby category.
- Retain the feature/place ID; optional confirmed GERS status/ID; dataset release; feature version; name; category; `overture_existence_confidence`; geometry; and every applicable source record.
- Extraction is a human-invoked or bounded internal batch process, never a page/request-path call.

### Bounded Stage 1 real-data sample

Stage 1 may perform a small read-only, no-database-write sample over representative eligible non-private venues. Before access, declare conservative limits for:

- sampled venues;
- boxes/cells;
- downloaded/scanned bytes where enforceable or measurable;
- candidate rows examined and returned;
- execution duration; and
- concurrency.

The sample must be dry-run only and retain only aggregate results. If the access mechanism cannot enforce sufficient bounds safely, do not run it in Stage 1. Mark cap/confidence values provisional and select them during bounded Stage 2 UAT.

---

## 4. Venue Corroboration — 4.4C Evidence Extension

- Corroboration applies only to active/resolved provisional venues.
- Implement a conservative, deterministic, versioned rule using bounded signals such as normalized facility/place name, exact normalized/base address when available, locality, and coordinate distance within an explicit tolerance. Proximity alone is insufficient. Ambiguity or multiple qualifiers means no match.
- Persist match-rule version and deterministic outcome separately from `overture_existence_confidence`. Do not invent a generic match-confidence score.
- The narrowly authorized writer may insert only `evidence_type = 'overture_place_match'` with bounded typed fields: feature/place ID, optional confirmed GERS status/ID, release, feature version, category, match-rule version/outcome, matched timestamp, and normalized provenance references. No generic payload, free text, or caller-declared strength.
- Extend 4.4C's allowed type and eligibility rule only as required to recognize this evidence. It is strong only after the deterministic matcher succeeds.
- Enforce retry/concurrency idempotency for the same resolved provisional, Overture feature, and applicable evidence version policy.
- Report actual before/after eligibility counts. Zero matches is valid; never manufacture evidence.

---

## 5. Durable Candidate Pool

- Use separate nullable `canonical_venue_id` and `provisional_venue_id` columns with an exactly-one CHECK. Use a real provisional FK. Validate canonical IDs through the trusted canonical boundary; add a canonical FK only if repository ownership/dependency constraints make it safe. Do not use a weak polymorphic type-plus-ID pair when stronger integrity is practical.
- Resolve lifecycle before enrichment using Section 1's exact rules. Do not write pools for suppressed identities. A merged identity enriches its one-hop active survivor; a reconciled identity enriches its canonical target.
- Store Food and Coffee only.
- Use a tunable 3-mile candidate pre-filter. It is not a product eligibility rule.
- Store a wider per-category pool than 4.6 presents. Select its cap from bounded sampling, or mark it provisional until Stage 2.
- Apply an evidence-based `overture_existence_confidence` floor. Empty is correct; never lower the floor just to fill a pool.
- Deduplicate candidates deterministically within each resolved venue/category pool.
- Do not duplicate a venue's own coordinates or create household-specific copies.

### Operational bounds and atomic refresh

- Enforce explicit maximum venues/run, boxes/cells/run, downloaded/scanned bytes where enforceable, candidates examined, stored candidates/category/venue, execution duration, and concurrency.
- Support dry-run. It may calculate aggregate changes but must not mutate database state.
- Use atomic per-venue/category replacement or versioned staging and activation/swap. Partial refresh output must never become active.
- A failed refresh against a newer release must preserve the previous complete active pool.
- Stop safely and report when a bound is reached; never silently exceed it.

---

## 6. Required Data Model

Exact names/types follow repository conventions, but storage must represent:

- exactly one of `canonical_venue_id` or `provisional_venue_id`;
- `overture_feature_id` or `overture_place_id`;
- optional confirmed GERS ID/status;
- separate Overture dataset release and feature `version`;
- Food/Coffee category and bounded source taxonomy needed to reproduce selection;
- POI name, latitude, and longitude;
- `overture_existence_confidence`;
- distance in meters from the resolved venue coordinate;
- refresh/staging/activation timestamps and state sufficient for atomic replacement and staleness; and
- normalized provenance relationships preserving all applicable property/source/license/attribution requirements.

Use coordinate, enum/value, exactly-one, uniqueness, and lifecycle constraints consistent with prior migrations. Do not collapse multiple/property-scoped sources into one license field.

---

## 7. Provenance and Licensing

- Preserve every applicable source entry for each candidate and corroboration match using normalized provenance rows or another bounded lossless representation.
- Confirm licenses using current official Overture documentation for every source included by the filter.
- Exclude a source/property when its license or attribution mapping cannot be confirmed.
- Exclude Foursquare-derived data in V1 unless a documented human-approved Apache-2.0/NOTICE plan authorizes it.
- The Stage 1 report records factual findings and exclusions; implementation code must not make a legal determination.

---

## 8. Readiness Reporting

Extend the existing read-only, human-run, aggregate-only report. Do not create a dashboard or second report. Add:

- venue-level Food fill rate;
- event-weighted Food candidate coverage;
- venue-level Coffee fill rate;
- zero/partial/full pool distribution by category;
- duplicate/near-duplicate rate;
- enrichment success/failure rate with bounded reason buckets;
- corroboration matches and promotion-eligible provisional count before/after; and
- release/staleness and aggregate bound consumption where available.

Do not report whether a POI fits before the next game. Schedule/time/routing feasibility belongs to 4.6.

Report output must not include raw addresses, coordinates, household/event identifiers, Overture payloads, or other row-level/private data.

---

## 9. Security and Trusted Boundaries

- Enable and force RLS on new raw/staging/pool/provenance tables where appropriate. Restrict them to service role; grant no direct `public`, `anon`, or `authenticated` access.
- Read canonical coordinates only through a server-only boundary: existing service-role `public.venues` access or the narrowest service-only view/RPC. Do not broaden `venues_public` or authenticated grants.
- Harden the evidence writer like 4.4C: explicit owner, fixed `search_path`, untrusted execute revoked, bounded inputs/return, payload-free logging.
- Any lifecycle resolver added here is service-only and returns the minimum resolved identity/status.
- Keep candidate-pool reads service-only until Slice 4.6 defines its reader.
- No household origin may enter Overture code, logs, bounds, storage, or reports.

---

## 10. Two-Stage Workflow

### Stage 1

Perform the repository/schema/security/licensing audit; implement schema/runtime code; create an unapplied migration; add offline tests, read-only catalog verifier, rollback-only behavioral verifier, aggregate quality report, bounded dry-run command, and operational documentation. A bounded read-only, no-database-write sample is permitted only under Section 3. Run TypeScript, Corralio lint/tests, all four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`), usage/cost review, and `git diff --check`; update notes and commit locally only.

Do not apply the migration, perform database-writing real-data ingestion, push, deploy, or schedule cron in Stage 1.

### Stage 2

A human applies the migration. Run catalog and rollback-only verifiers, then a bounded real Overture dry run and disposable-provisional mutation UAT. Finalize provisional thresholds if needed. Confirm writer idempotency/concurrency, lifecycle resolution, atomic replacement/failure preservation, reporting, usage, and independent cleanup zero.

---

## 11. Minimum Tests

- Food/Coffee taxonomy and `overture_existence_confidence` filtering.
- Feature ID handling, separate release/feature version, and optional confirmed GERS state.
- Deterministic matching: one qualifying match succeeds; signal disagreement, ambiguity, or multiple qualifiers writes nothing; existence confidence is never match confidence.
- Writer authorization, bounded typed fields, eligibility integration, retry idempotency, and concurrency.
- Multiple/property-scoped provenance survives normalization; incomplete/excluded licensing is rejected; Foursquare is excluded absent approval.
- Radius, cap, floor, deduplication, and exactly-one venue relationship.
- Lifecycle: active self; merged one-hop active survivor; reconciled canonical; suppressed no target.
- Trusted canonical-coordinate boundary and denial of untrusted raw table/function access.
- Dry-run produces zero mutations and operational bounds stop safely.
- Atomic activation and injected mid-refresh/new-release failure preserving the prior active pool.
- Every Section 8 metric against fixtures.
- No code path accepts or derives Overture scope from household origins.

---

## 12. UAT and Cleanup

- Do not create canonical fixtures or write `public.venues`.
- Use an existing stable canonical venue read-only for canonical-boundary validation.
- Use synthetic disposable provisional venues for mutation tests.
- Bound real Overture access to eligible non-private venue areas and report aggregate release, bounds, counts, exclusions, and elapsed time.
- Verify concurrency/idempotency, lifecycle outcomes, dry-run zero-write, atomic replacement, and forced-failure preservation.
- Independently prove cleanup zero for provisional fixtures, evidence, provenance, staging, refresh, and pool rows.
- Do not retain test-only coordinates, external IDs, or raw Overture payloads in repository notes.

---

## 13. Usage and Cost Boundary

Overture data has no per-request vendor meter like Geocodio or OpenRouteService, but transfer, hosted query, and compute can incur usage. Record boxes/cells, scanned/downloaded bytes where available, candidates examined, elapsed time, concurrency, and hosted-service calls. Stage 1 real sampling is dry-run/no-database-write only.

This slice makes zero incremental Geocodio, OpenRouteService, or Mapbox calls and has zero impact on Slice 4.3's household routing quota.

---

## Final Restrictions

- Audit first; repository reality wins.
- Exclude private household origins/routing locations from every Overture operation.
- Food and Coffee only; no 4.5 UI or schedule/routing feasibility.
- Tunable 3-mile pre-filter; stored pool wider than 4.6's future presentation count.
- `overture_existence_confidence` means only place-existence confidence.
- Strong evidence is written only after deterministic versioned venue matching succeeds.
- Preserve all provenance; exclude Foursquare absent an approved compliance plan.
- Use explicit canonical/provisional integrity and exact lifecycle resolution.
- No canonical writes/UAT fixtures, promotion, or household-specific POI copies.
- Enforce hard bounds, dry-run, atomic refresh, and previous-pool preservation.
- Run all four production builds before any future push. No push, deploy, migration apply, or cron without separate authorization.
- Use disposable provisional fixtures and independent cleanup-zero verification.

## Final Verdict

Report exactly one:

- `SLICE 4.5 COMPLETE LOCALLY`
- `SLICE 4.5 READY AFTER LISTED FIXES`
- `SLICE 4.5 BLOCKED BY AUDIT FINDING`
- `SLICE 4.5 NOT READY`
