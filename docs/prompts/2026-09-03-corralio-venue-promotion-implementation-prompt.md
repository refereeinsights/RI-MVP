# Corralio Venue Promotion (Slice 4.5B) — Test-First Implementation Prompt

**Date:** 2026-09-03
**Author:** CPO, reconciled against live repository
**Design doc:** `docs/corralio/cpo/2026-09-03-cpo-design-portfolio-venue-pipeline-implementation.md` (read this first — this prompt assumes its §0–§11)
**Founder decisions this prompt implements:** §9 of the design doc (threshold 2, distinct households, read-only audit feed, Path A/Path B)
**Governs under:** ADR-008 (Slice 4.5B), ADR-021 (validated automation with provenance and audit history), ADR-010 (privacy classification), ADR-009 (raw location always preserved)

---

## 0. What this is

Corralio-discovered venues (from ICS/ICAL feeds) already get matched against canonical venues, or turned into "provisional" venues, fully automatically — that part is shipped and untouched by this prompt. What's missing is the step that promotes a provisional venue to a real, canonical `public.venues` row, which is what makes it show up in TI's existing venue/map/hotel UI for every family, not just the one that entered it.

This prompt builds that promotion step. It does **not** touch venue matching, provisional venue creation, or the privacy classifier — those are correct and out of scope.

## 1. Two qualifying paths — implement as OR, not AND

A provisional venue becomes eligible for promotion when **either** path clears:

**Path A — repeat independent corroboration.** At least 2 distinct households have independently produced ICS-origin evidence pointing at the same provisional venue identity, with no identity conflict and no privacy blocker.

**Path B — high-confidence structured match.** The provisional venue has a recorded `overture_place_match` evidence row (already-existing evidence type) from a real Overture place, with no identity conflict, no privacy blocker, and no canonical duplicate.

Either path alone is sufficient. This is not a new invention — `evaluateProvisionalPromotionEligibilityV1` in `apps/corralio/lib/provisionalVenueEvidence.ts` already implements "any one strong evidence type is sufficient" (`strongEvidenceTypes.length > 0`). Path B's evidence type (`overture_place_match`) is already in that strong set. **Path A requires one addition**: a new evidence type is not currently counted as strong. Do not require both paths — that would be a stricter rule than either the founder or the existing code intends.

## 2. Task 1 — Eligibility rule v2 (Path A evidence signal)

File: `apps/corralio/lib/provisionalVenueEvidence.ts`

- Add `"repeat_independent_observation"` to the `EligibilityEvidenceSignal` union.
- Add it to `FUTURE_STRONG_EVIDENCE`.
- Bump `CORRALIO_ELIGIBILITY_RULE_VERSION` to `"corralio-promotion-eligibility-v2"` — **do not mutate v1 in place**; existing test file and any stored references to v1 must keep working, per this codebase's own versioning convention (see `CORRALIO_OVERTURE_MATCH_RULE_VERSION`-style versioning already used elsewhere).
- This evidence type is produced by a new aggregation, not by `buildIcsEvidenceFingerprints` (which fingerprints a single household's observation). Write a new query/function (server-side, likely alongside `provisionalVenues.server.ts` or a new `provisionalVenuePromotion.server.ts`) that: for a given provisional venue's `identity_key`, counts **distinct `household_id`** values across `corralio_event_venue_matches` rows in `active`, non-conflicting match state pointing at that provisional venue. Threshold is **2** — hardcode as a named constant, not a magic number, so it can be changed later without a re-read of this prompt.
- Do not count distinct teams or events — the founder explicitly rejected that as an independence unit (a single household spanning multiple teams, or one team importing repeatedly, would falsely inflate the count).
- Write/extend unit tests for `evaluateProvisionalPromotionEligibilityV1`/`V2` covering: 1 household + no Overture match → not eligible; 2 distinct households, no Overture match → eligible (Path A); 1 household + Overture match → eligible (Path B); identity conflict or privacy blocker present → not eligible regardless of evidence strength (this must never be overridable by evidence volume).

## 3. Task 2 — Promotion RPC + audit record

This is the one genuine gap in the existing infrastructure — nothing today writes a provisional venue into `public.venues`, and ADR-021 requires an audit trail for the promotion decision itself, separate from the underlying evidence fingerprints.

New migration, naming convention matched to `corralio_create_or_reuse_provisional_venue_v2`: e.g. `corralio_promote_provisional_venue_v1`.

Requirements for the RPC (service-role only, `security definer`, same permission posture as the existing provisional-venue functions):

- Re-run the eligibility check server-side at promotion time — never trust a caller-supplied "this is eligible" flag. Reject if `lifecycle_status <> 'active'`, if there's an identity conflict, or a privacy blocker.
- Check for an existing canonical duplicate before creating a new `venues` row (reuse whatever duplicate-detection logic `venueMatching.ts` already applies for canonical matches — do not write a second, divergent duplicate-check).
- On eligible + no duplicate: create the canonical `public.venues` row from the provisional record's already-normalized identity (name, address, city, state, lat/lng — all captured at provisional-creation time, no new geocoding needed).
- Write a **promotion audit record** (new table, e.g. `corralio_venue_promotion_audit`) capturing: provisional venue id, new canonical venue id, which path qualified it (A or B, or both), the qualifying evidence signal(s) and their ids, household evidence count at time of promotion, `CORRALIO_ELIGIBILITY_RULE_VERSION` used, timestamp. This table is what the admin feed (Task 4) reads — do not conflate it with the existing evidence-fingerprint tables, which record *observations*, not *decisions*.
- Repoint every `corralio_venue_aliases` row from `provisional_venue_id` to the new `canonical_venue_id`.
- Transition the provisional venue's `lifecycle_status` to `reconciled` and set `canonical_venue_id` on it (the schema already has columns for this state — confirm exact column names against `20260825_corralio_slice44c_provisional_lifecycle_evidence.sql` before writing the migration, don't assume).
- On an existing canonical duplicate being found instead: do not create a second venue — merge/link per whatever the existing `merged`/`reconciled` lifecycle semantics already encode (read the full state-machine function in slice44c before writing this branch; it already has a `merged_into_provisional_id` concept — reuse or extend consistently with it rather than inventing a parallel one for provisional→canonical).
- No RLS/anon/authenticated grants — `service_role` only, matching every other write path in this pipeline.

Write behavioral + catalog verification scripts in `scripts/analysis/` following this repo's existing convention (see `corralio_slice45_catalog_verification.sql`, `corralio_slice45_behavioral_verification.sql` as templates) before considering this done.

## 4. Task 3 — Periodic re-evaluation sweep

- A scheduled job (match the existing pattern used for the 30-day unmatched-venue recheck — same cadence mechanism, not a new one) that re-evaluates all `active` provisional venues against current evidence and calls the promotion RPC for anything now eligible.
- This is what makes "automatically reevaluate later, no human queue" real — a venue that didn't qualify last month (e.g., a second household hadn't shown up yet, or Overture hadn't indexed it) gets picked up automatically once it does.
- Idempotent: running it twice on the same data must not double-promote or error.

## 5. Task 4 — Overture evidence caller (Path B activation)

- `apps/corralio/lib/overtureNearby.server.ts` → `recordOvertureVenueCorroboration()` already does the matching and evidence-write; it has zero callers today.
- Add a caller from the existing bounded Overture ops flow (`scripts/ops/corralio_overture_refresh.ts` or a small sibling script) so that when an operator runs a bounded extract/apply that includes active provisional venues as targets, matched ones get `overture_place_match` evidence recorded via the existing RPC.
- **Do not** build new Overture data-fetching, live API polling, or automated extract scheduling — that is explicitly out of scope (see design doc §5, §10) and would re-open the not-yet-authorized Overture-automation question the Sept 2 economics packet already deferred. This task is "wire the two existing functions together," nothing more.

## 6. Task 5 — Level 1 deep link (Corralio → TI venue page)

- Once a Corralio event's `corralio_event_venue_matches` row carries a `canonical_venue_id` (post-promotion), surface a link from Corralio's own event/venue UI to the existing public TI venue page, using the same URL pattern TI already uses internally: `getVenueHref` (`/venues/${seo_slug || id}`) from `apps/ti-web/lib/venues/getVenueHref.ts`.
- This is a plain outbound link to already-public content. No new API, no auth, no ADR-005 dependency — confirm before building that you are not accidentally reaching for server-to-server data fetching here; if the implementation needs anything beyond constructing a URL and an `<a>`/`Link`, stop and flag it, because that would mean scope has silently grown into Level 2 (explicitly out of scope — see design doc §3.3).

## 7. Task 6 — Admin-visible read-only audit feed

- A read-only view/query (admin-authenticated, not public) over `corralio_venue_promotion_audit` (Task 2), answering exactly the fields the founder specified: venue promoted, when, source provisional identity, why it qualified (path + evidence), household evidence count, Overture corroboration if present, coordinate/address agreement, duplicate-match result, promotion-rule version.
- **This is explicitly not an approval workflow.** No pending/approve/reject states, no blocking of promotion on anyone viewing this feed. It exists for spot-checking the first 100–200 promotions, per the founder's own framing — build it as a simple list/detail view, not a queue.

## 8. What this prompt does not authorize

- No push, no deploy, no production data migration run against a live environment without separate explicit authorization — this session's standing rule (commits stay local until the founder says otherwise).
- No change to venue matching (`venueMatching.ts`), provisional venue creation (`provisionalVenues.server.ts`), or the privacy classifier (`isHouseholdOriginLocation`) — all confirmed correct and out of scope.
- No automation or scaling of Overture data acquisition itself (live API integration, removing the bounded-extract/manual-apply posture) — separate, not-yet-authorized track.
- No Level 2 (inline TI venue data surfaced inside Corralio's own screens) or ADR-005 read-only contract work.
- No change to the repeat-household threshold (2) or the independence unit (household, not team) without a founder decision — these are product calls already made in the design doc §9, but if implementation surfaces a reason they don't work as specified (e.g., `household_id` isn't reliably available on the rows needed for the count), stop and report back rather than substituting a different unit or threshold.

## 9. Evidence required before this is reported done

- All new/changed functions have unit tests; `evaluateProvisionalPromotionEligibilityV1`/`v2` tests cover the four cases in §2.
- Catalog + behavioral verification scripts for the new migration(s), following the existing `slice45`-style convention, passing.
- A concurrency/idempotency check on the promotion RPC (calling it twice on the same eligible provisional venue does not create two canonical venues or two audit rows) — this pipeline's own established verification standard (see Phase A+B's concurrency verifier) applies here too.
- Confirmation that no schema/RPC grants were made to `anon`/`authenticated` — service_role only, matching every sibling function in this pipeline.
- A short report (matching this session's reporting convention) stating what was built, what tests ran and passed, and explicitly confirming nothing was pushed or deployed.

## Sources

`docs/corralio/cpo/2026-09-03-cpo-design-portfolio-venue-pipeline-implementation.md` (full); `apps/corralio/lib/provisionalVenueEvidence.ts`, `provisionalVenues.server.ts`, `provisionalVenues.ts`, `venueMatching.ts`, `venueMatching.server.ts`, `overtureNearby.server.ts`; `supabase/migrations/20260825_corralio_slice44b_shared_provisional_venues.sql`, `20260825_corralio_slice44c_provisional_lifecycle_evidence.sql`, `20260826_corralio_slice44d_incomplete_ics_venue_resolution.sql`, `20260825_corralio_slice45_overture_nearby_foundation.sql`; `scripts/ops/corralio_overture_refresh.ts`; `apps/ti-web/lib/venues/getVenueHref.ts`; `docs/corralio/CORRALIO_ARCHITECTURE_DECISIONS.md` ADR-008, ADR-009, ADR-010, ADR-021; `docs/corralio/cpo/2026-09-02-portfolio-api-economics-stage2-decision-packet.md` §5; chat discussion 2026-09-03 (founder decision packet, Path A/Path B).
