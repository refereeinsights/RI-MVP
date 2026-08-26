# Corralio Slice 4.5A — Overture Candidate Quality Hardening

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

Slice 4.5 infrastructure is implemented and its first bounded real-venue UAT exposed candidate-quality problems. Do not begin Slice 4.6 yet. This is a narrow correction and verification pass against the existing 4.5 foundation.

The parent use case is:

> **We have limited time between sports commitments. Where can we grab something and get back?**

Do not implement route-time, schedule-feasibility, ranking, presentation, or other Slice 4.6 behavior here.

## 1. Audit and stop gate

Audit the applied 4.5 schema, classifier, property-scoped provenance, atomic activation, bounded refresh input, and the retained three-venue UAT evidence before editing.

The reviewed baseline is:

- Overture release `2026-08-19.0`;
- UWM Sports Complex, Evolution Sportsplex, and Oakland University Recreation Outdoor Complex;
- three-mile radius;
- 51 stored candidate rows: 45 Food and 6 Coffee;
- 10 confirmed-invalid rows and 2 questionable rows.

If no generalized deterministic rule can reject the known contamination without materially eliminating legitimate local businesses, do not invent an exact-name denylist or activate a new production pool. Return `SLICE 4.5A NOT READY FOR 4.6` with the unresolved evidence gap.

Repository reality wins. Do not otherwise expand scope.

## 2. Deterministic multi-signal acceptance

The UAT proved Overture taxonomy alone is insufficient. False positives arrived with Food taxonomy, including a medical clinic classified as a sandwich shop, a realtor classified as a gastropub, and a senior-care provider classified as a restaurant.

Implement a pure, deterministic, versioned candidate-acceptance rule using bounded signals such as:

- primary/basic category and taxonomy hierarchy;
- property-scoped source evidence;
- normalized place name and generalized contradictory non-food indicators;
- operating status where present;
- address and identity completeness;
- permitted provenance quality; and
- existence confidence, used only as evidence that a place exists.

Requirements:

- taxonomy alone cannot override materially contradictory identity evidence;
- `other_food` is not a fallback for uncertain records;
- uncertain records may be excluded;
- confidence cannot repair category contamination;
- deterministic brand knowledge is supplemental and cannot become a closed allowlist;
- valid local/non-chain fixtures must remain eligible;
- do not use ML/AI or a live Places API;
- do not blacklist exact UAT names, feature IDs, or addresses. Every regression must pass because of a generalized rule that works on unseen fixtures.

## 3. Pool and intent categories

Preserve the broad atomic-refresh contract:

`pool category = food | coffee`

Add a separate exact constrained intent category:

`quick_service | pizza | sandwiches | coffee | brewery | other_food`

Use repository-appropriate column naming, but preserve these semantics. Enforce database coherence:

- Coffee pool rows require Coffee intent.
- Food pool rows allow quick service, pizza, sandwiches, brewery, or other Food.
- Invalid cross-category combinations fail.

Keep brewery separately identifiable and never equate it automatically with quick service. `other_food` requires affirmative legitimate Food evidence.

## 4. Explicit exclusions

Exclude structured bar, pub, liquor-store, lounge, nightclub, healthcare, senior-service, real-estate, government, and other clear non-Food leakage. A mixed record does not qualify merely because its name contains `pizza`, `coffee`, `sandwich`, `grill`, or `food`.

Generalized contradictory identity rules may reject records whose category conflicts with clear non-Food identity evidence. Tests must prove that this does not become a brand-only policy or exact UAT blacklist.

## 5. Confidence and operating status

Continue naming Overture confidence `overture_existence_confidence`. It is not restaurant quality, speed, popularity, recommendation quality, operating status, or match confidence.

Represent operating status with exactly:

- `confirmed_open`;
- `confirmed_closed`;
- `status_unknown`.

Confirmed closed/inactive records cannot enter the active pool. Unknown never means open; it may remain only when other identity evidence is sufficient. Do not fabricate status. Preserve the explicit state for Slice 4.6 and report its distribution.

Audit why the closed brewery survived. If structured closure is absent, document the limitation and use only a generalized existence/identity rule; do not hard-code that brewery.

## 6. `overture-signals` and Foursquare

Audit the authoritative license, attribution requirements, contributed properties, and operating-status representation for the property-scoped `overture-signals` source. Do not silently exclude or approve it.

If accepted, require explicit dataset/license/property validation and normalized provenance. If the source property or declared license conflicts with the approved mapping, exclude it.

Any record containing Foursquare-derived provenance remains excluded from V1 unless a separately human-approved Apache-2.0/NOTICE plan exists. An acceptable source does not erase an unapproved Foursquare obligation. Report affected counts.

## 7. Deduplication

Apply deterministic deduplication after acceptance and before the final cap.

- Same confirmed feature/place identity is a duplicate.
- Different identities may merge only when exact normalized address, alias-equivalent normalized name, and bounded coordinate distance all align.
- Distinct addresses generally mean distinct locations.
- Shared brand name alone is insufficient.

Choose a winner in stable order using permitted provenance strength, operating-status evidence, existence confidence, address/identity completeness, then feature ID. Version the rule.

Cross-venue reuse is expected and is not duplication. Semantic idempotency means replaying identical release/input produces the same active logical pool with no duplicate/conflicting active scopes; a new refresh audit row is allowed.

## 8. Caps and bounded diversity

Preserve at most 15 total Food and 15 total Coffee candidates per venue. The intent categories do not receive independent 15-row caps.

Use a documented deterministic Food diversity rule so brewery/other Food cannot crowd out all quick-service, pizza, and sandwich options while still retaining a bounded sample of legitimate other Food and brewery records. Do not increase the overall cap without separate approval.

Slice 4.6 owns its eventual approximately-three recommendations and route/schedule ranking.

## 9. Atomic installation and migration safety

Add only the narrow candidate-layer migration/read-model changes required for intent, operating status, and rule versions. Existing rows must receive coherent deploy-safe values before NOT NULL/coherence enforcement.

Install corrected pools only through the atomic refresh mechanism:

- stage and validate the complete replacement;
- activate only after all venue/category scopes succeed;
- preserve the prior complete pool on failure;
- never expose a half-replaced pool;
- do not manually edit/delete active candidates.

No writes are authorized to canonical venues, provisional identities, 4.4C lifecycle/evidence, or promotion state.

## 10. Reproducible UAT

Replay the same August 19 release, venue identities/coordinates, three-mile radius, and bounded extraction where safely retained. If fresh data is required, label it `changed-data comparison` and do not attribute release drift to classifier improvement.

For each venue report accepted candidates by intent, exclusions/reasons, status distribution, duplicate findings, and unresolved questionable records. Report baseline and post-hardening:

- confirmed and potential contamination rates;
- Food availability fill rate;
- quick-option fill rate;
- Coffee availability fill rate;
- intent/status distribution;
- duplicate rate;
- coverage retained; and
- release/data drift.

Do not expose household/private data or manufacture engagement metrics.

## 11. Verification

TypeScript tests own pure classification, provenance normalization, deduplication, diversity selection, cap enforcement, generalized negative fixtures, valid local/non-chain fixtures, and semantic idempotency.

The read-only catalog verifier owns columns, constraints, indexes, grants/RLS, allowed-value coherence, hardened activation, and active-pool integrity.

The rollback-only SQL behavioral verifier owns database coherence constraints, typed activation, cap/provenance completeness, atomic swap/failure preservation, and cleanup zero. Do not duplicate the TypeScript classifier in SQL.

Run relevant 4.5 tests, Corralio TypeScript/lint, report/ops TypeScript, `git diff --check`, and all four production builds before any separately authorized push:

- `corp-app`;
- `corralio-app`;
- `referee-app`;
- `ti-web`.

Report extraction rows/bytes/time, storage and candidate-count impact, provenance exclusions, `overture-signals` impact, Foursquare impact, and confirm zero added routing/geocoding calls.

## 12. Scope restrictions

Do not add parent UI, Nearby UI, maps, free-text search, routing calls, return-by calculations, 4.6 ranking, personalization, HotelPlanner work, live Google/Yelp/Foursquare APIs, canonical promotion, cron, push, or deployment.

Private household origins remain categorically excluded from extraction, matching, reporting, fixtures, and storage.

No push or deployment is authorized.

## Final quality question

Did the generalized deterministic multi-signal rule materially reduce confirmed contamination while preserving useful quick-service, pizza, sandwich, Coffee, and legitimate local options?

Report exactly one:

- `SLICE 4.5A READY FOR 4.6`
- `SLICE 4.5A READY AFTER LISTED FIXES`
- `SLICE 4.5A NOT READY FOR 4.6`
