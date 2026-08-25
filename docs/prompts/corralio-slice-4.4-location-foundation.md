# Corralio Slice 4.4 — Location Foundation

## Venue Matching, Coordinate Provenance & Persistent Geocoding

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

Slices through 4.3 are complete locally. The Slice 4.3 database migration has been reported applied to the shared Supabase project, but do not infer from that statement that every application deployment is current. Verify the exact database and deployed-code prerequisites below before implementation.

`corralio_events` already contains the Slice 4.3 location/geocoding and estimated-leave-by fields.

This slice is deliberately narrow.

Its purpose is:

> **Determine whether an event's imported location corresponds to an existing trusted venue, preserve that association and provenance, and improve downstream location intelligence without making venue matching a prerequisite for the event to remain usable.**

This slice does **not** implement Nearby, Overture, provisional venue creation, canonical venue promotion, public venue publishing, or new parent-facing UI.

---

# 0. Prerequisite Gate

Before editing, verify:

* Slice 4.3 is complete and applied.
* Required `corralio_events` location/geocode fields exist.
* Current Slice 4.3 leave-by behavior and invalidation rules match the applied implementation.
* Current `venues_public` shape/grants.
* Current TI venue-resolution implementation.
* Current Corralio ingestion paths.

If repository reality conflicts with this prompt, stop and report the discrepancy before implementation.

---

# 1. Audit and Reuse Existing Venue Matching

Read completely:

`apps/ti-web/lib/planner/venueResolution.ts`

and its tests.

Do not reinvent venue matching.

Port the proven product-neutral normalization/matching behavior into Corralio rather than importing across app boundaries.

Preserve the conservative principle:

> **Exactly one confident candidate → matched.**
>
> **Zero, multiple, tied, or ambiguous candidates → unmatched.**

Audit whether the existing algorithm needs adaptation because its historical false-negative cost was low.

In Corralio, false negatives may later feed provisional venue creation, so duplicate avoidance matters more.

Do not loosen matching thresholds in this slice merely to increase match rate.

Document any deliberate divergence from the TI implementation.

Important audit finding to preserve:

The current TI implementation contains broad fallback reads capped with `.limit(5000)`. Do not copy a capped or otherwise incomplete candidate set as an authoritative uniqueness check. A candidate that appears unique inside a truncated result can have a duplicate outside it.

Therefore:

* prefer complete, geographically scoped candidate retrieval;
* use deterministic pagination if an exhaustive broader candidate set is genuinely required;
* never mark an event `matched` when candidate completeness cannot be established;
* record `unmatched` only from a complete candidate set; treat query errors, truncation, incomplete pagination, or uncertain candidate completeness as a retryable evaluation failure, never as a confident match or authoritative unmatched result.

---

# 2. Scope Boundary

## This slice does

* preserve raw imported location text;
* perform V1 household-origin/private exclusion;
* attempt trusted existing-venue matching;
* store venue-match provenance;
* preserve/reuse existing Slice 4.3 geocodes;
* expose enough location identity for future 4.5 work.

## This slice does NOT

* create provisional venues;
* create canonical venues;
* promote venues;
* modify canonical venue data;
* run Overture;
* build Nearby;
* add venue UI;
* build review/admin workflows;
* add PostGIS;
* add GPS;
* add traffic;
* alter travel commerce.

Important:

> **Slice 4.4 itself is read-only against canonical venue truth.**

This is a slice-specific boundary.

It does **not** establish the permanent architecture rule that Corralio-originated evidence can never contribute to automatically validated venue creation.

Automatic provisional venue creation and validated promotion are a separate venue-data track.

---

# 3. Privacy / Household-Origin Exclusion

Before querying canonical venue data, apply the V1 household-origin exclusion.

Implement one shared, offline, address-specific privacy normalizer and use it consistently in implementation and tests. The comparison input is the same location source used by Slice 4.3: trimmed `source_location_text` when present, otherwise `display_location_text`.

The V1 normalizer must have explicit, tested behavior for:

* case, Unicode apostrophes, punctuation, and whitespace;
* common directional and street-suffix aliases;
* ZIP suffixes and country suffixes;
* apartment, suite, unit, field, court, and similar trailing sub-location identifiers.

Classify an event as private only when the normalized complete addresses are equal, or when their normalized base street addresses are equal after removing a clearly parsed unit/sub-location suffix. Do not use loose substring matching: for example, `12 Main Street` must not match `112 Main Street`. Do not use external APIs, canonical venue data, coordinate proximity, or logs for this classification.

If an event location clearly matches that household's own stored `origin_address` after normalization:

* do not query venue intelligence;
* record the event as `private_skipped`;
* keep its existing Slice 4.3 geocode;
* do not log the private address;
* do not expose it to shared venue systems.

Also skip obviously insufficient/non-venue location values that cannot safely participate in matching.

This is intentionally a **V1 household-origin exclusion**, not a claim that Slice 4.4 has solved all future private/public-location classification.

Private household locations must never become venue evidence.

---

# 4. Storage

Create a Corralio-owned venue-match table containing approximately:

* `event_id`
* `household_id`
* `venue_id`
* `match_status`
* `location_fingerprint`
* `matcher_version`
* `evaluated_at`
* nullable `matched_at`
* nullable `recheck_after`

Supported states should include:

* `matched`
* `unmatched`
* `private_skipped`
* `insufficient_location`

RLS must be household-scoped.

The match table must not duplicate `raw_location_text`. The event row remains the source of the actual location text. `location_fingerprint` must be a one-way digest of the exact normalized match input, used only for change/reuse detection and never logged or displayed.

Require:

* exactly one current match-result row per event;
* a household-safe event relationship using `(household_id, event_id)`, adding the smallest necessary parent uniqueness constraint if required;
* cascade cleanup when the event or household is deleted;
* `venue_id` and `matched_at` only for `matched`, and neither for non-matched states;
* `evaluated_at` for every recorded outcome;
* database checks enforcing status/venue/timestamp coherence;
* service-role-only writes;
* no authenticated read grant unless an implemented server/UI path actually requires it.

Do not grant speculative client write access.

Audit existing Corralio→shared/TI reference patterns before deciding whether `venue_id` should carry a foreign key.

If there is no safe ownership/lifecycle precedent, default to storing the UUID without a cross-domain FK.

If no venue FK is used, define missing-venue behavior: a stored match whose `venue_id` is absent from `venues_public` must not break event rendering or leave-by. It becomes eligible for re-evaluation and remains advisory until a current canonical row can be resolved.

Do not duplicate canonical venue name/address fields into the match table.

---

# 5. Unmatched Results Must Be Re-Evaluable

Do **not** treat an existing `unmatched` row as permanent truth.

Today's unmatched location may match tomorrow because:

* canonical venue data improved;
* matcher normalization improved;
* alias data improved;
* a new venue was validated;
* the matcher version changed.

Therefore implement explicit re-evaluation semantics.

Retain a `matcher_version`, `location_fingerprint`, `evaluated_at`, and the recheck metadata needed below.

A result may be reused only when:

* location text has not changed;
* matcher version is current;
* no explicit rematch condition applies.

Use these concrete V1 rules:

* `matched`, `private_skipped`, and `insufficient_location` results may be reused only while the location fingerprint and matcher version remain current;
* `unmatched` results are additionally stale after 30 days and must then be reconsidered on the next ingestion/update opportunity;
* matcher-version changes, location-fingerprint changes, a missing referenced venue, and an explicit trusted-server `forceRematch` input make a result immediately eligible;
* `forceRematch` is an internal orchestration capability for verification and future operations, not a new UI or authenticated client write path;
* a failed or incomplete evaluation must not overwrite a previously valid match with false certainty and must remain retryable.

Matched records may also require future re-evaluation if the event's location changes.

Do not build the later provisional-venue workflow here.

Just ensure 4.4 does not make today's failure state permanently sticky.

---

# 6. Preserve Coordinate Provenance

Do **not blindly overwrite** the event's existing Geocodio-derived coordinates with canonical venue coordinates.

The system now has potentially distinct facts:

## Event geocode

Where the schedule's location/address resolved.

## Canonical venue coordinate

Where trusted venue intelligence places the facility.

Preserve this distinction.

The implementation should either:

### Preferred

Keep Slice 4.3's:

* `location_lat`
* `location_lng`
* geocode provenance

as the event-location geocode, and obtain canonical venue coordinates through the venue relationship when downstream logic needs them.

### Or

If implementation requires a canonical-coordinate cache on the event, add explicit coordinate-source/provenance fields rather than destroying the original event geocode.

Do not discard useful Geocodio-derived data simply because a venue match exists.

Document the chosen coordinate model before implementation.

---

# 7. Leave-By Interaction

Venue matching must not become a prerequisite for leave-by.

An unmatched event continues using its existing Slice 4.3 coordinates exactly as before.

If downstream leave-by behavior is intentionally changed to use canonical venue coordinates for matched events, that decision must be explicit, provenance-aware, and covered by tests.

Do not silently change the meaning of `location_lat/location_lng`.

No changes to Slice 4.3 leave-by arithmetic, routing provider, quota governance, home-origin privacy, or traffic behavior belong in this slice.

---

# 8. Matching Trigger

Venue matching runs at **schedule ingestion/update**, not every `This Weekend` render.

Hook into every existing Corralio ingestion/update path after normalized/persisted events are available, including initial connection, replacement, and scheduled refresh. Audit whether any current manual event mutation path exists; if none exists, document that boundary rather than implying one was implemented.

Matching is best-effort.

A venue-matching failure must never cause schedule ingestion to fail.

Make this an explicit transaction/error boundary:

1. Persist the schedule/event changes using the existing authoritative ingestion operation.
2. Confirm persistence succeeded.
3. Run venue matching in a separately caught post-persistence phase.
4. Never allow matcher query, decoding, or match-row persistence failures to change an ingestion success into a connection error, mark the source failed, increment refresh-failure counters, or roll back persisted schedule data.

The interactive ingestion and scheduled-refresh orchestrators must each have tests proving this separation.

For each relevant event:

1. Apply household-origin/private exclusion.
2. Reject insufficient location.
3. Attempt existing canonical venue match.
4. Record matched or unmatched result.
5. Leave existing event geocode untouched unless the explicit coordinate-provenance model calls for a separate canonical coordinate cache.

---

# 9. Query Efficiency

Deduplicate matching work within an ingestion run.

Batch/reuse canonical venue candidate retrieval where practical based on normalized geographic scope.

Do not prescribe an artificial exact query count.

Do not use a capped global fallback to prove candidate uniqueness. A scoped query may produce a match or authoritative unmatched result only when the scope is complete for the matching rule. Broader searches must paginate deterministically to completion; otherwise the evaluation remains retryable and must not replace a previously valid result.

Report:

* events processed;
* unique normalized locations;
* venue candidate queries performed;
* reused candidate groups.

The objective is:

> **query approximately once per useful location/geographic candidate set, not once per event.**

---

# 10. `venues_public`

Audit whether `venues_public` currently exposes the canonical data required for this slice.

The current `venues_public` view does not expose canonical latitude/longitude. Under Section 6's preferred relationship-only coordinate model, Slice 4.4 does not consume those coordinates and must not expand the shared view merely for possible future use.

Only if implemented Slice 4.4 code demonstrably consumes canonical latitude/longitude may it prepare the smallest additive migration needed to expose them through the existing trusted read boundary. Report why the preferred relationship-only model was insufficient before making that cross-app change.

Do not:

* query `public.venues` directly from Corralio;
* change unrelated grants;
* weaken RLS;
* write to canonical venue tables.

Any shared-view migration must be explicitly reported as a cross-app/shared-data change.

---

# 11. Required Tests

Offline tests must cover:

### Matcher fidelity

* single confident address match;
* exact/confident name match where allowed;
* ambiguous candidates → unmatched;
* field/court/gym suffix normalization;
* state normalization;
* street abbreviation normalization.

### Privacy

* event matching household origin → `private_skipped`;
* no canonical venue query on that path;
* punctuation, abbreviation, and unit/sub-location privacy variants;
* near-but-different street numbers do not compare equal;
* insufficient location → `insufficient_location`;
* normal public sports location proceeds.

### Ingestion safety

* matching failure never blocks schedule ingestion;
* post-persistence matching failure does not return a connection failure;
* scheduled-refresh matching failure does not mark the source failed or increment refresh-failure state;
* malformed venue data never breaks schedule connection;
* no-location events continue working.

### Re-evaluation

* unchanged location + current matcher version may reuse result;
* changed location triggers rematch;
* matcher-version change makes prior unmatched result eligible for reconsideration;
* an unmatched result older than 30 days is reconsidered;
* a current unmatched result may be reused before its recheck time;
* explicit trusted-server rematch bypasses reuse;
* a referenced venue missing from `venues_public` becomes eligible without breaking the event.

### Coordinates

* unmatched events preserve Slice 4.3 coordinates;
* private-skipped events preserve Slice 4.3 coordinates;
* matched events preserve coordinate provenance according to the selected model;
* no original event geocode is silently destroyed.

### Regression

Run the existing Slice 4.3 suite and full Corralio suite.

Also run:

* TypeScript
* lint
* all four production builds: `corp-app`, `corralio-app`, `referee-app`, and `ti-web`
* a usage-impact review covering external API calls, database query volume, and Vercel/build impact
* `git diff --check`

---

# 12. Migration / Stage Pattern

Use the existing two-stage Corralio process.

## Stage 1

* audit;
* code;
* migration prepared;
* named catalog and rollback-only behavioral verifier scripts prepared but not run against production;
* offline tests;
* local commit;
* report manual production changes required.

Do not apply production migration yourself.

Do not push, deploy, promote, or invoke production cron. A later push requires explicit user confirmation after all four builds and the usage-impact review pass.

## Stage 2

After human migration application:

* run a named read-only catalog verifier covering columns, constraints, indexes, ownership, RLS, policies, and grants;
* run a named rollback-only behavioral verifier ending in `ROLLBACK` and covering every match status, household isolation, constraint failures, and cascade behavior;
* run authorized disposable UAT;
* perform browser verification;
* independently prove disposable fixture cleanup returned zero remaining rows and identities;
* confirm no production data was unintentionally altered.

Only then may the slice be marked complete.

Browser verification may use the local Corralio application against the human-applied shared schema. Stage 2 does not authorize deploying application code.

---

# 13. UAT

Using disposable fixtures:

### Matched event

Confirm:

* existing canonical venue is confidently associated;
* venue match provenance is stored;
* event remains fully usable;
* coordinate provenance follows the selected model;
* leave-by continues functioning.

### Private-origin event

Confirm:

* `private_skipped`;
* no canonical venue matching is attempted;
* the existing event geocode remains preserved;
* the leave-by pipeline remains non-blocking, without requiring a positive route or displayed leave-by result when origin and destination are the same.

### Unmatched event

Confirm:

* event remains usable;
* existing coordinates remain unchanged;
* matching failure does not block schedule connection.

Clean up all disposable records and identities using the established prior-slice process.

---

# 14. Notes

Record:

* port-vs-import decision;
* matcher version introduced;
* re-evaluation semantics;
* household-origin exclusion rule;
* coordinate provenance decision;
* FK/no-FK audit result;
* ingestion-time trigger;
* query-batching approach;
* capped-global-query avoidance and candidate-completeness rule;
* post-persistence best-effort error boundary for interactive ingestion and scheduled refresh;
* location-fingerprint and 30-day unmatched recheck semantics;
* SQL verifier names and cleanup-zero result;
* four-build and usage-impact results;
* explicit deferral of provisional venue creation;
* explicit deferral of Overture/Nearby.

Do not store private fixture addresses or sensitive identifiers in notes.

---

# 15. Final Restrictions

* Verify repository reality before implementation.
* Reuse the proven TI matching algorithm.
* Match only on one confident candidate.
* Ambiguity remains unmatched.
* Unmatched must remain re-evaluable.
* Slice 4.4 does not create or promote venues.
* Do not interpret that as a permanent prohibition on future validated automation.
* Household-origin/private data never becomes venue evidence.
* Preserve event geocode provenance.
* Matching must never block schedule ingestion.
* Matching failure must never alter schedule-refresh failure state.
* Never infer uniqueness from a truncated candidate set.
* No Overture.
* No Nearby.
* No new UI.
* No public venue write path.
* No changes to Slice 4.3 routing/provider logic.
* No push, deployment, promotion, or production cron invocation without separate explicit user confirmation after all four builds and the usage-impact review pass.
* Stop after Slice 4.4.

## Final Verdict

Report exactly one:

* `SLICE 4.4 COMPLETE LOCALLY`
* `SLICE 4.4 READY AFTER LISTED FIXES`
* `SLICE 4.4 NOT READY`
