# Corralio Slice 4.4C — Provisional Venue Lifecycle, Evidence & Promotion Eligibility

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

Slices 4.3, 4.4, and 4.4B are complete locally and verified.

4.4B established this accepted model:

**ICS event location**

→ confidently matched existing canonical venue

→ otherwise structurally isolated shared provisional venue

→ future stronger corroboration

→ eventual canonical/public venue only through a separate trusted process

The governing principle remains:

# Capture broadly. Enrich automatically. Publish conservatively.

This slice does **not** create new canonical venues. It makes provisional intelligence maintainable and determines, transparently and deterministically, whether a provisional venue has enough strong evidence to become promotion eligible.

---

# 0. Objective

Answer:

> **Can provisional venue intelligence accumulate evidence safely, converge through suppression, merge, and reconciliation, and expose deterministic promotion eligibility without creating new canonical venues?**

4.4C establishes:

* durable, privacy-safe evidence observations;
* evidence idempotency and independence semantics;
* a minimal coherent lifecycle;
* durable suppression;
* provisional-to-provisional merge;
* reconciliation with an existing canonical venue;
* lifecycle redirects in the 4.4B creation/reuse path;
* deterministic, versioned promotion eligibility;
* immutable lifecycle audit history;
* aggregate venue-quality reporting.

Do not build a venue CMS or a canonical publishing system.

---

# 1. Audit First

Before editing schema or runtime behavior, inspect the actual implemented 4.4B system and repository contracts.

Audit at minimum:

* `corralio_provisional_venues` and its exact lifecycle values, constraints, indexes, RLS, grants, comments, and suppression behavior;
* `corralio_event_venue_matches` and its canonical/provisional mutual-exclusion contract;
* `corralio_create_or_reuse_provisional_venue_v1` and `corralio_suppress_provisional_venue_v1`;
* provisional normalization, identity-key versioning, parser, matching, and post-geocode orchestration;
* canonical-first race checks and current reconciliation behavior;
* zero-association behavior and the 4.4B quality report;
* canonical `public.venues`, `venues_public`, aliases, deduplication, and trusted write boundaries;
* current venue quick-check/crowdsourced verification implementation and its actual semantics;
* existing merge, verification, and audit mechanisms that can safely be reused;
* TI/RI public venue pages, search, exports, and sitemaps to confirm isolation remains intact;
* ADR-008, ADR-021, ADR-030, and ADR-033;
* all relevant existing tests, migrations, reports, and notes.

4.4B does not currently have a complete durable evidence model. Do not assume one exists merely because event-match provenance exists.

Repository reality wins. Extend a safe existing mechanism rather than creating a competing model.

If the audit reveals a material conflict with the privacy, evidence-authority, lifecycle-audit, canonical-isolation, or merge-authority requirements below, stop and report it rather than inventing policy.

---

# 2. Scope

## 4.4C does

* add the smallest durable evidence structure required now;
* distinguish raw observations, distinct generic ICS source scopes, and materially stronger evidence;
* preserve and extend the existing `suppressed` lifecycle vocabulary;
* support provisional-to-provisional merge;
* support provisional-to-existing-canonical reconciliation;
* preserve evidence and immutable transition history through lifecycle changes;
* update 4.4B creation/reuse behavior to follow lifecycle redirects;
* derive promotion eligibility under an explicit rule version;
* extend aggregate quality reporting.

## 4.4C does not

* change 4.4B's permissive provisional-creation policy;
* create a row in `public.venues`;
* expose provisional venues publicly;
* implement Overture ingestion or provider calls;
* implement Nearby, POIs, travel intelligence, or HotelPlanner changes;
* build consumer/admin merge or moderation UI;
* build AI/ML confidence scoring;
* build field/court/gym canonical entities;
* change leave-by behavior;
* change successful schedule-ingestion semantics;
* promote, merge, suppress, or reconcile production records in bulk;
* backfill historical evidence;
* run production cron, push, or deploy.

---

# 3. Lifecycle Vocabulary

Preserve 4.4B vocabulary. Use exactly:

* `active`
* `suppressed`
* `merged`
* `reconciled`

Reserve `promoted` for the future separately authorized canonical-write slice. Do not use it in 4.4C.

The trusted withdraw/suppress operation produces `lifecycle_status = 'suppressed'`. Do not add `withdrawn` as a competing state.

---

# 4. Lifecycle Coherence

Enforce current-state coherence in the database.

## Active

* no provisional merge target;
* no canonical reconciliation target;
* eligible for normal provisional reuse, subject to existing canonical-first checks.

## Suppressed

* no provisional merge target;
* no canonical target;
* suppression timestamp is present;
* not reusable or promotion eligible;
* durable identity tombstone prevents identical recreation.

## Merged

* `merged_into_provisional_id` or the repository-appropriate typed equivalent is required;
* target is a different provisional identity;
* no canonical target;
* source is not an active candidate.

## Reconciled

* `canonical_venue_id` or the repository-appropriate typed equivalent is required;
* no provisional merge target;
* source is not an active candidate.

Use CHECK constraints, foreign keys where domain ownership safely permits them, and indexes appropriate to redirects and reporting. Preserve 4.4's deliberate no-cross-domain-FK approach for canonical IDs if the audit confirms it remains necessary.

Define valid transitions. At minimum:

* `active → suppressed`
* `active → merged`
* `active → reconciled`

Repeated execution of the same completed transition must be idempotent. Conflicting transitions must fail safely.

---

# 5. Durable Redirect Semantics

The 4.4B creation/reuse path must understand obsolete provisional identities.

## Active

May be reused normally.

## Merged

Resolve to the final active surviving provisional identity. Never reuse the obsolete source identity.

## Reconciled

Resolve directly to the existing canonical venue. Never create or reuse another provisional identity for the reconciled identity key.

## Suppressed

Return a suppressed/no-create result. Never create a replacement UUID for the identical deterministic identity.

Update the trusted RPC/service outcome contract as required so the caller can distinguish, with repository-appropriate bounded names:

* canonical outcome;
* active provisional creation/reuse;
* redirected provisional;
* reconciled canonical;
* suppressed/no-create;
* ambiguous/unresolved/ineligible.

Do not return raw evidence, private identifiers, or unbounded error details.

---

# 6. Evidence Authority

Evidence strength is type-derived and never caller-declared.

Every evidence observation must use an enumerated `evidence_type`. V1 or future types may include only where actually implemented:

* `ics_observation`;
* `quick_check_verification` only if the required audit proves it qualifies;
* future `overture_place_match`;
* future explicitly trusted TI/RI verification types.

Whether a type counts as strong corroboration is determined exclusively by the versioned promotion-eligibility rule.

Generic ICS ingestion may create only `ics_observation`. It must never declare an observation strong.

Do not add:

* a writable `strong_evidence` boolean;
* a caller-supplied strength field;
* a generic RPC/service capable of inserting arbitrary evidence types;
* a generic production strong-evidence writer.

Use narrowly validated insertion operations that allow only the evidence type appropriate to that trusted caller/path.

If quick-check is not accepted as strong evidence, 4.4C must expose no production strong-evidence writer. That is correct and expected.

---

# 7. Evidence Schema

Add the smallest dedicated shared evidence structure required by evidence types actually supported in 4.4C.

Each observation should contain only explicit, typed, bounded fields needed for its supported type, conceptually including:

* provisional venue ID;
* observation fingerprint and fingerprint version;
* keyed source-scope fingerprint and version for ICS evidence;
* enumerated evidence type;
* observation timestamp;
* normalizer/validator version;
* bounded evidence-type-specific fields only where currently implemented.

Do not add or store:

* generic JSON/JSONB evidence payloads;
* arbitrary metadata blobs;
* raw provider responses;
* free-text evidence reasons;
* raw source URLs or credentials;
* source event descriptions or raw schedule location strings;
* household origins or household locations;
* household, child, or team identifiers;
* direct schedule-source identifiers in shared historical evidence;
* notes or other private schedule content.

Use database CHECK constraints to enforce valid evidence-type/column combinations. Unsupported evidence types and incoherent field combinations must fail.

Do not add Overture-specific columns prematurely. Slice 4.5 may add explicit bounded fields such as GERS ID, release, and category through a separate migration when that evidence type is actually implemented.

---

# 8. Observation Idempotency

Require deterministic, versioned observation identity. Enforce an equivalent of:

`unique (provisional_venue_id, observation_fingerprint)`

or a safer repository-appropriate uniqueness contract.

Repeated processing of the same event observation or refresh must not add duplicate evidence. Concurrent retries must converge to one observation row.

The fingerprint must distinguish a materially new observation, such as a stable source event whose relevant normalized venue identity changed, without embedding raw private values.

Document the algorithm and version. Prefer a keyed construction for any fingerprint derived from identifiers or private source context.

---

# 9. Source-Scope Fingerprint and Deletion Policy

Generic ICS evidence needs a privacy-safe way to distinguish repeated observations from one schedule/source scope from observations arising in distinct source scopes.

Create a versioned keyed/HMAC-style source-scope fingerprint using trusted server-side secret material and the minimum stable source-scope input available inside the trusted schedule-source boundary.

The fingerprint must:

* be non-reversible;
* remain stable enough to recognize the same source scope;
* be versioned for algorithm/key evolution;
* never be generated by plain-hashing a credential-bearing URL;
* never be sent to a client or logged;
* never expose the underlying source URL, token, or identifier.

If a new server secret is required, keep it server-only, use injected deterministic test material offline, document configuration without recording a value, and do not push/deploy a secret. Missing configuration must not turn an otherwise successful schedule refresh into a failure or cause an unsafe fallback fingerprint.

Adopt this V1 deletion policy:

> **After the originating schedule source is deleted, retain only the non-reversible keyed source-scope fingerprint as anonymized historical evidence. Do not retain a private reverse source-to-evidence linkage solely to make historical evidence traceable to the deleted source.**

After source deletion, shared evidence must retain no raw URL, credential, household ID, schedule-source ID, child/team identity, or direct lookup that resolves the fingerprint back to the deleted source.

The retained fingerprint exists only to preserve historical same-source-scope versus distinct-source-scope semantics. Document it as anonymized historical provenance.

If repository or privacy constraints make this impossible, stop and report the conflict rather than adding a reversible/private linkage.

---

# 10. Evidence Independence

Do not collapse evidence into a single confidence number. Expose internally at least:

## Raw observation count

All unique evidence observations.

## Distinct ICS source-scope count

Unique generic ICS source scopes observed.

## Strong corroboration count/type

Evidence types explicitly recognized as materially stronger than generic ICS by the current eligibility rule version.

Ten events from one feed, repeated refreshes, duplicate imports, retries, or concurrent duplicate inserts must not falsely increase distinct-source or strong-evidence counts.

Generic ICS may increase raw observation and distinct-source counts. It cannot, by itself, satisfy strong promotion corroboration, regardless of volume.

Do not present a consumer-facing confidence percentage.

---

# 11. Quick-Check Audit and Strong-Evidence Interpretation

Audit the actual TI/RI venue quick-check or crowdsourced verification mechanism.

Before it may count as strong corroboration, prove:

* authenticated provenance;
* correct canonical/provisional venue linkage;
* independence from the provisional observation being validated;
* semantics strong enough to mean actual venue verification rather than a casual interaction or reward action;
* a narrow trusted insertion boundary compatible with Corralio privacy and isolation.

Report exactly one:

* `QUICK_CHECK_STRONG_EVIDENCE_SUPPORTED`
* `QUICK_CHECK_NOT_STRONG_ENOUGH`
* `QUICK_CHECK_INTEGRATION_DEFERRED`

Do not invent trust.

If the audit determines that quick-check does **not** qualify as strong corroboration, 4.4C must:

* support only currently justified production evidence types, which may be only `ics_observation`;
* expose no production strong-evidence writer;
* produce zero promotion-eligible provisional venues under the current production rule;
* treat zero eligible venues as correct, not as an implementation failure;
* test future strong-evidence behavior only at the pure deterministic eligibility-rule boundary using synthetic typed inputs/fixtures;
* not add a fake `overture_place_match`, trusted-admin evidence row, or generic strong-evidence insertion path merely to make a test pass.

The production system must never contain a writer for a strong evidence type without an implemented, audited trusted source. Future slices may add a new strong type and its narrowly authorized writer through an explicit migration and implementation.

Therefore, if quick-check is not accepted as strong evidence, the expected production state after 4.4C is:

`production evidence types: ics_observation only`

`promotion-eligible provisional venues: 0`

until Slice 4.5 or another separately authorized trusted evidence source is implemented.

---

# 12. Promotion Eligibility

Promotion eligibility is derived, deterministic, explainable, and versioned. It is not an editable business flag.

Use a deterministic SQL view/function or transactionally recomputed internal state. Retain an `eligibility_rule_version` or equivalent. Do not permit arbitrary application code to write `promotion_eligible = true`.

A provisional venue is eligible only when all applicable current-rule conditions hold:

* lifecycle is `active`;
* identity, address, and coordinate state is internally coherent;
* no unresolved duplicate, conflict, privacy, or suppression blocker exists;
* at least one explicitly recognized strong corroboration evidence type exists;
* all other versioned rule conditions pass.

Examples:

* 1 generic ICS observation → not eligible;
* 20 generic ICS observations → not eligible;
* 6 distinct generic ICS source scopes → still not eligible by themselves;
* a future recognized strong type may contribute to eligibility when all blockers pass.

It is acceptable and expected before a trusted strong source exists for production to contain zero promotion-eligible provisional venues.

If there is no production strong type in 4.4C, test future strong-evidence behavior only through a pure deterministic rule boundary using synthetic typed inputs. Do not persist a fake strong evidence type or add a writer for it.

---

# 13. No Canonical Creation

This is a hard boundary.

4.4C must not create new rows in `public.venues`, construct a new canonical publishing workflow, or automatically promote anything.

It implements only:

* promotion eligibility;
* reconciliation with an already existing canonical venue.

A future separately authorized slice will implement promotion-eligible provisional → new canonical venue after stronger evidence and canonical-write behavior are settled.

---

# 14. Suppression

Preserve the 4.4B tombstone contract.

Suppressing an active provisional must atomically:

* set lifecycle to `suppressed`;
* set the required timestamp/state fields;
* detach current provisional event associations without altering family events;
* remove it from active matching, enrichment, and eligibility;
* insert the required immutable lifecycle transition;
* retain the deterministic identity tombstone so identical evidence cannot recreate it.

Nearby coordinates alone must not broaden suppression. A nearby variant that is not the same deterministic identity remains ambiguous, unresolved, or separately evaluable.

Repeated suppression is idempotent. A conflicting transition fails safely.

---

# 15. Merge Authority

A provisional-to-provisional merge may occur through only one of two trusted paths.

## A. Automated merge

Allowed only when exact server-validated duplicate criteria are satisfied through the implemented deterministic normalization model and appropriate compatible combinations of:

* normalized facility/place name;
* locality;
* normalized address identity.

Geographic proximity alone is never sufficient. If identity remains ambiguous, do not merge.

The audit must identify the exact criteria implemented; do not silently loosen 4.4B identity rules.

## B. Trusted operational merge

A trusted service/admin operation may explicitly choose the surviving provisional identity. It must supply an enumerated reason code. Do not accept arbitrary free text.

Use a narrow implemented enum such as:

* `exact_duplicate`
* `normalized_address_duplicate`
* `trusted_manual_duplicate`

Do not add a consumer or admin merge UI.

Canonical reconciliation is not a provisional merge and has separate transition/reason semantics.

---

# 16. Provisional Merge Behavior

Support `active provisional A → active provisional B` with:

* source and target revalidation inside the transaction;
* source != target;
* deterministic lock ordering;
* conflict and concurrent-transition rejection;
* cycle prevention;
* a strict one-hop invariant;
* evidence preservation;
* atomic repointing of every current event association from source to survivor;
* source lifecycle changed to `merged` with final survivor target;
* an atomic immutable transition row;
* idempotency for an already completed identical merge.

If the requested target is already merged, resolve it inside the transaction to the final active survivor and store that final survivor directly. Do not create arbitrary merge chains.

Future creation/reuse for the merged identity must return the final active survivor.

Do not rewrite historical evidence in a way that destroys which provisional identity originally received it. If effective aggregation follows merge lineage, keep original observation provenance immutable and make the aggregation rule explicit.

---

# 17. Existing-Canonical Reconciliation

Canonical truth always wins.

If an existing canonical venue confidently matches an active provisional identity, the trusted reconciliation operation must atomically:

1. lock and revalidate the provisional identity;
2. validate the canonical target through the trusted canonical read boundary and current identity rules;
3. repoint **every current event association** referencing the provisional identity to the canonical venue;
4. clear provisional association on each affected match row so no event references both identities;
5. preserve each event's original location, accepted geocode, route, and leave-by state byte-for-byte;
6. preserve provisional evidence and history;
7. mark the provisional `reconciled`;
8. set the canonical target ID;
9. insert the required immutable lifecycle transition;
10. make future resolution of the old identity return the canonical target.

Do not reconcile only one household or event. Do not modify the existing canonical venue. Do not create another canonical venue.

Repeated identical reconciliation is idempotent. A conflicting target or lifecycle transition fails safely.

---

# 18. 4.4B Creation/Reuse Update

Update the trusted 4.4B creation/reuse logic so its transaction always checks, in a safe lock order:

1. canonical candidates;
2. existing provisional identity and lifecycle;
3. durable redirect or suppression state;
4. only then new provisional creation.

It must never:

* reuse a merged source;
* reuse a reconciled provisional;
* recreate a suppressed identity;
* create a provisional when canonical truth now exists;
* leave an event with both canonical and provisional identity.

The caller must correctly persist a canonical result, active/reused/redirected provisional result, or no-create result without altering the event's stored location/geocode.

The update must remain bounded, service-only, canonical-first, and separately caught so evidence/lifecycle enrichment failure cannot reverse successful schedule persistence or change source health.

---

# 19. Immutable Lifecycle Transition History

Add a bounded append-only lifecycle transition record or an equivalent database-enforced immutable audit mechanism.

The provisional row remains the authoritative fast current state. Transition history explains how it reached that state.

At minimum retain typed, bounded fields for:

* provisional venue ID;
* enumerated transition type;
* `from_state`;
* `to_state`;
* target provisional venue ID when applicable;
* canonical venue ID when applicable;
* enumerated reason code;
* operation/rule version;
* transition timestamp;
* bounded trusted actor class or system-operation identifier.

Support at least suppression, provisional merge, and canonical reconciliation.

Do not store arbitrary free text, generic JSON, household-private data, raw locations, URLs, credentials, or user-provided notes.

Transition-type and state/target/reason combinations must be coherent through database constraints.

Lifecycle state mutation and transition insertion occur in the same database transaction. A required transition insert failure must roll back the state mutation and association changes.

Transition rows must be append-only through ordinary trusted runtime paths. Revoke or otherwise prevent normal runtime UPDATE/DELETE, and machine-test the chosen boundary. Client roles receive no read or write access.

---

# 20. Changed/Deleted Event Evidence

Evidence observations and current event associations are distinct concepts.

When an ICS event changes location, disappears during refresh, or is deleted, its current association must detach or re-evaluate through existing behavior. Do not change successful schedule-ingestion semantics.

Do not automatically erase valid anonymized shared evidence merely because a current event disappears. Apply the explicit source-deletion policy in Section 9: after source deletion, only the non-reversible keyed source-scope fingerprint and other permitted bounded shared evidence may remain, with no direct private reverse linkage.

Family events remain usable from their original location/geocode regardless of provisional lifecycle changes.

---

# 21. Zero-Association Provisionals

Do not automatically delete or suppress a provisional venue merely because its current event association count becomes zero.

Track and report zero-association records. They may later be rediscovered, corroborated, merged, suppressed, or reconciled. A general retention/cleanup policy remains future work.

---

# 22. Public Isolation

No provisional lifecycle or evidence state may enter public surfaces.

`active`, `suppressed`, `merged`, and `reconciled` provisional rows and their evidence/history remain absent from:

* `venues_public` except through an independently existing canonical venue;
* TI/RI public venue pages;
* public venue search;
* sitemaps;
* SEO routes;
* canonical exports.

Do not create a second public provisional surface.

---

# 23. Security

All provisional lifecycle, evidence, eligibility, and transition data remains trusted-server only.

Require:

* RLS enabled;
* forced RLS where appropriate;
* no `public` table/function privileges;
* no `anon` access;
* no direct `authenticated` SELECT/INSERT/UPDATE/DELETE or RPC execution;
* only the minimum service-role/trusted-operation privileges;
* no generic evidence or lifecycle mutation surface.

Every privileged function must follow the established secure-function pattern:

* owner explicitly selected and verified;
* fixed `search_path`;
* server-side validation and deterministic locking;
* execute revoked from untrusted roles;
* minimum bounded return value;
* no private payload logging.

Select and justify `SECURITY INVOKER` or `SECURITY DEFINER` for each operation. Stage 2 catalog verification must assert the exact chosen contract, table policies, grants, owners, function configuration, and append-only transition boundary.

---

# 24. Reporting

Extend the existing human-run, read-only, aggregate-only venue-quality report. Do not create a dashboard.

Include:

* canonical venue association rate;
* provisional venue association rate;
* combined Venue Identity Coverage;
* unresolved eligible rate;
* potential duplicate/near-duplicate rate;
* active provisional count;
* zero-association provisional count;
* suppressed count;
* merged count;
* reconciled count;
* raw observation distribution;
* distinct ICS source-scope distribution;
* strong-evidence count/type distribution where a real type exists;
* promotion-eligible count by eligibility-rule version.

No report output may include raw locations, source identifiers/fingerprints, URLs, credentials, household/event identifiers, or other private row-level data.

The report should help answer whether Corralio is capturing reusable locations broadly enough for future Nearby/travel value without creating an unmanageable data-quality problem. Do not optimize merely to reduce provisional count.

---

# 25. Overture Contract

Slice 4.5 may introduce `overture_place_match` as strong corroboration with explicit bounded fields such as GERS ID, release, category, match identity, timestamp, and required provenance/license metadata.

Design 4.4C so a future migration can add that enumerated type, its coherent typed columns, and its narrowly authorized writer idempotently.

Do not add an Overture writer, fake Overture row, provider request, generic payload, or premature Overture columns in 4.4C.

---

# 26. Required Tests

At minimum cover all of the following.

## Evidence authority and schema

* ICS path can insert only `ics_observation`;
* caller cannot declare evidence strong;
* unsupported evidence type is rejected;
* quick-check cannot write strong evidence unless its audit qualifies;
* no generic production strong-evidence RPC exists;
* invalid evidence-type/column combinations are rejected;
* arbitrary JSON/free-text/raw/private payload cannot be stored.

## Evidence privacy and idempotency

* identical observation processed twice yields one record;
* concurrent duplicate evidence insert yields one record;
* raw observation count is correct;
* repeated same-source events do not repeatedly increase distinct source-scope count;
* distinct source scopes count correctly;
* generic ICS never becomes strong corroboration;
* keyed source-scope fingerprint is deterministic with injected test key, versioned, non-reversible in the implemented contract, and absent from clients/logs;
* source deletion leaves no direct/private reverse source linkage while permitted anonymized fingerprint history remains;
* no raw URL, source ID, household ID, credential, or schedule content survives in shared evidence.

## Eligibility

* one generic ICS observation is not eligible;
* any number of generic ICS observations remains non-eligible without a strong type;
* blockers prevent eligibility;
* suppressed, merged, and reconciled states are never eligible;
* eligibility is derived and cannot be arbitrarily written;
* future recognized strong-evidence behavior is tested only at a pure typed deterministic rule boundary when no production strong type/writer exists.

## Suppression

* `active → suppressed` succeeds atomically;
* identical evidence cannot recreate the identity;
* a near variant is not broadly suppressed;
* creation/reuse returns the suppressed/no-create result;
* event remains usable;
* immutable transition is inserted;
* transition failure rolls back the state mutation and association changes.

## Merge authority and behavior

* exact server-validated duplicate can merge automatically;
* proximity-only and ambiguous candidates cannot merge;
* trusted operational merge requires an enumerated reason;
* invalid/free-text reason is rejected;
* active A → active B repoints every current association;
* self-merge, inactive target, conflicting target, and cycle are rejected;
* one-hop invariant is maintained;
* evidence history is preserved;
* identical repeated merge is idempotent;
* immutable transition is inserted atomically.

## Reconciliation and redirects

* active provisional reconciles to an existing canonical venue;
* every current association is repointed;
* no event references both identity types;
* event location/geocode/route state remains byte-for-byte unchanged;
* provisional becomes `reconciled` with canonical target;
* immutable transition is inserted atomically;
* repeated identical reconciliation is idempotent;
* conflicting reconciliation is rejected;
* merged identity resolves to final active survivor;
* reconciled identity resolves to canonical;
* suppressed identity returns no-create;
* a current canonical candidate always wins.

## Lifecycle audit and security

* suppression, merge, and reconciliation transitions are coherent;
* lifecycle mutation cannot commit without its required transition;
* transition history cannot be updated/deleted through ordinary trusted runtime paths;
* untrusted roles cannot read or mutate provisional, evidence, eligibility, or transition data;
* narrowly authorized trusted operations succeed.

## Zero association and public isolation

* deleting the last event does not delete the shared provisional/evidence history;
* zero-association reporting works;
* no provisional lifecycle/evidence state enters public views, search, routes, exports, or sitemaps;
* only existing canonical venues participate in current public behavior.

---

# 27. Concurrency

Lifecycle and evidence operations must be database-atomic. Test real or safely equivalent concurrency around:

* duplicate evidence insertion;
* conflicting merge attempts;
* reconciliation attempts;
* creation/reuse while merge or reconciliation occurs.

Require deterministic lock ordering and the same identity lock domain where operations can race.

Do not allow:

* duplicate observation rows;
* evidence loss;
* double/conflicting lifecycle transition;
* conflicting merge targets;
* merge cycles or multi-hop drift;
* canonical and provisional association simultaneously;
* provisional creation after canonical reconciliation;
* lifecycle mutation without its audit transition.

---

# 28. Two-Stage Workflow

Use the established Corralio safety process.

## Stage 1

Perform:

* repository audit and quick-check verdict;
* schema and runtime code;
* unapplied migration;
* offline unit/architecture/concurrency tests;
* machine-failing catalog verifier preparation;
* rollback-only behavioral verifier preparation;
* aggregate quality-report extension;
* TypeScript;
* Corralio lint;
* all four production builds:
  * `corp-app`
  * `corralio-app`
  * `referee-app`
  * `ti-web`
* security and usage review;
* `git diff --check`;
* complete diff review;
* notes and final Stage 1 report;
* local-only commit.

Do not apply the migration. Do not push, deploy, run cron, call Overture or another external provider, mutate canonical venues, backfill evidence, or run production lifecycle operations.

## Stage 2

Only after human migration application, run:

* machine-failing catalog verification;
* rollback-only behavioral verification ending in `ROLLBACK`;
* disposable lifecycle and redirect UAT where safe;
* concurrency verification;
* signed-in browser regression sufficient to prove events and leave-by remain normal;
* aggregate venue-quality report;
* usage verification;
* independent cleanup-zero verification.

No production bulk lifecycle operation or canonical promotion is authorized.

---

# 29. UAT and Cleanup

Use clearly synthetic disposable fixtures. Prefer rollback-only SQL for lifecycle fixtures.

Verify:

* repeated/same-scope and distinct-scope ICS evidence counts;
* expected zero production strong evidence/eligibility if quick-check is not accepted;
* suppression and no-recreation;
* exact and operational merge authorization;
* one-hop redirects;
* all-association canonical reconciliation using an existing read-only canonical target without modifying it;
* immutable transition history and atomicity;
* creation/reuse behavior for active, suppressed, merged, and reconciled identities;
* unchanged event location/geocode/route data;
* clean signed-in consumer behavior.

Because service-role deletion of lifecycle tombstones/history may intentionally be restricted, use one of:

### Preferred

Rollback-only synthetic lifecycle fixtures inside an explicit transaction ending in `ROLLBACK`.

### Alternative

Exact owner-level cleanup of fixed, clearly synthetic evidence, transitions, redirects, and provisional rows after every association/reference is safely detached. Do not weaken runtime grants to facilitate cleanup.

After cleanup, independently verify zero expected synthetic residue across:

* disposable Auth identities;
* households, sources, and events;
* event associations;
* evidence rows;
* lifecycle transition rows;
* synthetic provisional identities where physical fixture cleanup is allowed;
* claims or temporary rows;
* external API-call audit rows.

Do not retain fixture addresses, coordinates, URLs, tokens, fingerprints, IDs, raw locations, credentials, screenshots, or Auth responses in repository artifacts or notes. Suppress raw Auth-admin responses immediately if Auth fixtures are used.

---

# 30. Browser Regression

No new consumer UI is required.

Verify that:

* schedule ingestion and event rendering remain normal;
* events remain visible and usable;
* estimated leave-by remains unchanged;
* canonical events continue normally;
* merged/reconciled/suppressed mechanics do not expose internal state unexpectedly;
* no new provisional/evidence UI appears;
* there are no console errors, page errors, framework overlays, or relevant failed responses.

Remove temporary browser artifacts and stop the local server.

---

# 31. Usage and Cost Boundary

4.4C must make zero incremental Geocodio, OpenRouteService, Mapbox, Overture, Nearby, source-feed, or other provider calls during Stage 1.

Evidence/lifecycle work is bounded database work after successful persistence. It must not add a cron, render-time vendor request, automatic historical sweep, or unbounded batch.

Report actual external-call ledger deltas during Stage 2 and require zero unless separately authorized after a concrete finding. Missing fingerprint configuration or lifecycle/evidence failure must remain separately caught and cannot change successful ingestion or source health.

---

# 32. ADRs and Notes

Verify that current ADR language accurately reflects:

> **Provisional creation may be permissive because it is structurally isolated; canonical/public promotion requires stronger validated evidence.**

Document 4.4C's lifecycle vocabulary, evidence-independence policy, anonymized source-scope retention decision, deterministic eligibility, immutable transition history, redirect behavior, and existing-canonical reconciliation.

Do not authorize new canonical creation or reopen settled Geocodio/Overture/provider decisions.

If canonical ADR or roadmap files contain unrelated uncommitted changes, do not overwrite or stage them. Record exact proposed amendments in the report and update only clean in-scope notes safely.

---

# 33. Success Criterion

4.4C succeeds when:

> **Provisional venues can accumulate durable evidence without overcounting repeated generic ICS observations, bad identities can be suppressed, duplicates can merge safely, existing canonical truth can reconcile every current association, lifecycle changes remain auditable, and promotion eligibility is derived from audited strong corroboration rather than manually asserted.**

It is acceptable—and expected before a trusted strong source exists—to have:

> **zero promotion-eligible venues.**

The goal is:

# Broad capture with controlled convergence toward trusted canonical truth.

---

# 34. Final Report

Report:

1. audit findings and quick-check verdict;
2. lifecycle implementation and coherence;
3. evidence model and supported production evidence types;
4. observation idempotency;
5. source-scope fingerprint design/version and configuration boundary;
6. deletion/anonymized historical-evidence policy;
7. evidence independence semantics and counts;
8. strong-evidence definitions and writer authority;
9. eligibility rule/version and result;
10. suppression behavior;
11. automated and operational merge authority;
12. merge behavior and one-hop invariant;
13. redirect semantics;
14. existing-canonical reconciliation;
15. immutable lifecycle-transition history;
16. 4.4B RPC/runtime changes;
17. future Overture evidence contract;
18. security/public-isolation boundary;
19. aggregate quality-report results;
20. tests, TypeScript, lint, diff, and all four build results;
21. usage impact;
22. migration requiring human application;
23. cleanup-zero result when Stage 2 runs;
24. explicit deferrals.

Never include credentials, private fixture data, raw evidence, source URLs/fingerprints, or sensitive identifiers.

---

# Final Restrictions

* Audit first; repository reality wins.
* Stop on a material policy/security/privacy conflict.
* Preserve 4.4B's permissive provisional creation and structural isolation.
* Preserve `suppressed`; do not introduce competing lifecycle vocabulary.
* Generic ICS evidence is never strong promotion corroboration by volume alone.
* Evidence strength is type/rule-derived, never caller-declared.
* Use versioned keyed source-scope fingerprints; never plain-hash credential-bearing URLs.
* Retain only anonymized non-reversible source-scope history after source deletion.
* Evidence observations are typed, bounded, idempotent, and free of arbitrary payloads/private content.
* No production writer may exist for an unaudited strong evidence type.
* Promotion eligibility is deterministic, derived, and versioned.
* Zero eligible venues is a correct V1 result when no trusted strong source exists.
* No new canonical venue creation.
* Existing canonical truth always wins.
* Reconciliation repoints every current association.
* Event location/geocode/route state remains unchanged.
* Merge requires exact automated criteria or an enumerated trusted operational reason.
* Merge uses deterministic locks, rejects cycles/conflicts, and preserves one-hop semantics.
* Suppressed identities cannot recreate.
* Merged/reconciled identities redirect durably.
* Lifecycle mutation and immutable transition history are atomic.
* No public provisional/evidence surface.
* No Overture calls, Nearby, venue CMS, AI scoring, bulk lifecycle work, or historical backfill.
* Run all four production builds before any future push.
* Use rollback-only or exact owner-cleaned synthetic fixtures.
* No push, deploy, or cron without separate authorization.
* Stop after lifecycle, evidence, reconciliation, and promotion eligibility.

# Final Verdict

Report exactly one:

* `SLICE 4.4C COMPLETE LOCALLY`
* `SLICE 4.4C READY AFTER LISTED FIXES`
* `SLICE 4.4C BLOCKED BY AUDIT FINDING`
* `SLICE 4.4C NOT READY`
