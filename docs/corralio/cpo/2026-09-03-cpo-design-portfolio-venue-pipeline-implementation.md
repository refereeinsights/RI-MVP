# Portfolio Venue Pipeline — Implementation Design

**Date:** 2026-09-03
**Status:** CPO design, reconciled against the live repository. Not a build authorization — see "What this document does not authorize" at the end.
**Scope:** How a Corralio-discovered venue becomes a canonical `public.venues` record, reuses TI's existing venue/map/hotel UI, and what genuinely needs building versus what already exists.
**Supersedes nothing** — this reconciles and extends ADR-005, ADR-006, ADR-008, ADR-009, ADR-010, ADR-021, ADR-030, all already accepted, none contradicted.

---

## 0. The headline finding

This is not a new architecture decision. It's the completion of one that's already accepted and roughly two-thirds built. ADR-008 (revised Aug 29, 2026) explicitly reserved a "Slice 4.5B" for provisional-to-canonical venue promotion, and named ADR-021 as its governing rule. That governing rule — the actual risk-bearing logic — already exists in code, versioned, unit-tested, and unused:

`apps/corralio/lib/provisionalVenueEvidence.ts` — `evaluateProvisionalPromotionEligibilityV1()` (rule version `corralio-promotion-eligibility-v1`). It takes lifecycle status, evidence types, identity-conflict and privacy-blocker flags, and returns eligible/not-eligible. It requires at least one "strong" evidence signal from a defined set. It is called from exactly one place in the entire repository: its own test file. Nothing in production calls it. The eligibility *decision* is designed; the eligibility *decision is never made* today, because no promotion action exists to make it.

That reframes the work: this design is mostly about wiring existing pieces together and closing one real gap (see §3), not designing a venue-promotion system from scratch.

## 1. What already exists today — confirmed by direct read, not inferred

- **Provisional venue creation is fully automatic**, already shipped (Slice 4.4B/4.4C). Every ICS-origin Corralio event with resolved coordinates gets matched against canonical venues first (`apps/corralio/lib/venueMatching.ts` → `evaluateVenueMatches()`); on no match, a provisional venue is created or reused via `createOrReuseProvisionalVenues()` (`provisionalVenues.server.ts`), calling RPC `corralio_create_or_reuse_provisional_venue_v2`.
- **Privacy classification already happens first, exactly as ADR-010 requires.** `isHouseholdOriginLocation()` compares an event's location text against the household's own registered `origin_address`; a match is classified `private_skipped` before any venue candidacy — not even provisional. This is real, shipped, and precise for the one case it targets: a family's own home. It does **not** generalize to "any private-feeling location" — see §4 for what still depends on the promotion gate rather than this classifier.
- **Matching is deterministic and conservative**, not fuzzy. Exact normalized name+city+state, or a precision-gated street-address match (≥3 tokens, ≥10 chars, exact). Multiple candidates → treated as no-match, never guessed. Unmatched events get a 30-day automatic recheck (`CORRALIO_UNMATCHED_RECHECK_DAYS`).
- **Evidence is fingerprinted with provenance**, already (`provisionalVenueEvidence.ts` → `buildIcsEvidenceFingerprints()`), HMAC-keyed, versioned (`corralio-evidence-hmac-v1`), scoped to source + event + identity — this is real audit-trail material, not just a log line.
- **The promotion-eligibility rule already models a two-signal-strength system.** Evidence types today: `ics_observation`, `quick_check_verification`, `overture_place_match`, `trusted_ti_ri_verification`. Only the latter two count as "strong" (`FUTURE_STRONG_EVIDENCE`), and eligibility requires at least one strong signal plus `active` lifecycle, identity coherence, no identity conflict, no privacy blocker.
- **An alias/dedup table already exists** (`corralio_venue_aliases`, migration `20260826_...slice44d...`), pointing to either a canonical or provisional venue — the natural place to repoint aliases at promotion time.
- **The reuse target already renders standalone.** `apps/ti-web/app/venues/[venueId]/page.tsx` has exactly one hard requirement — `if (!resolvedVenue?.id) notFound();` — every tournament reference in the file is optional (`tournamentId: contextTournament?.id ?? null`, repeated throughout). A venue with zero tournament history renders the full page today: `OwlsEyeVenueCard`, `HotelBookingCta`, `TeamTravelVenueLink`, `CampspotAffiliateLink`, `VenueIndexBadge`, `QuickVenueCheck`, `MobileMapLink`. **No fork needed, no new page needed** — this confirms your "reuse the map" requirement is already mechanically true the moment a row exists in `public.venues`.
- **ADR-030 already commits Corralio to consuming this instead of rebuilding it** ("Corralio consumes TI's existing Mapbox-based venue mapping, canonical venue coordinates, and already-stored venue-local context... rather than building a second mapping or POI stack"). Nothing new to decide here — just to build the consumption path (§5).

## 2. What ADR-021 actually requires — and why "no human queue" is already compatible with it

ADR-021, verbatim: *"Corralio-originated observations may become candidate evidence but cannot automatically create or overwrite canonical venues. Promotion requires trusted review **or validated automation with provenance and audit history**."*

"Validated automation" is explicitly an alternative to human review, not a euphemism for skipping verification. What it requires operationally: (a) a defined, versioned rule for what counts as sufficient evidence — already exists (`evaluateProvisionalPromotionEligibilityV1`, v1); (b) provenance on the evidence — already exists (HMAC fingerprints); (c) audit history of the *promotion decision itself* — does **not** yet exist, and is the one piece of net-new infrastructure ADR-021 compliance actually requires (§3.2).

## 3. What's genuinely net-new

### 3.1 A repeat-independent-household evidence signal

This is the gap the founder's "one team practices at the local elementary school, but it may happen again" scenario exposed. Today's v1 evidence taxonomy has no signal for "N independent households/teams observed the same location" — `ics_observation` exists as a type but isn't in the strong-evidence set, and there's no aggregation logic counting distinct households per provisional-venue identity at all.

Concrete, small addition: add `repeat_independent_observation` to `EligibilityEvidenceSignal`, include it in `FUTURE_STRONG_EVIDENCE`, and add the aggregation query — count distinct `household_id` values with an active, non-conflicting match to the same provisional venue `identity_key`, threshold **2** (the number from this session's discussion; the founder should confirm or adjust it before this is built — see §7). This is a small, isolated change to an already-versioned, already-tested function — bump to `corralio-promotion-eligibility-v2` per its own versioning convention, don't mutate v1 in place.

Both paths — Overture match and repeat-household — coexist rather than either alone being sufficient, because they cover different failure modes: Overture match instantly clears a real institution (a school, a park) regardless of how many Corralio households use it; repeat-household independently corroborates a real place Overture hasn't indexed yet, without relying on any single family's say-so. A true singleton with no Overture match stays provisional indefinitely — not a gap, the intended outcome (see the earlier chat discussion this design formalizes).

### 3.2 The promotion action itself, with its own audit record

Nothing today writes a provisional venue into `public.venues`. This needs a narrow, service-role-only RPC (naming to match the existing `corralio_create_or_reuse_provisional_venue_v2` convention, e.g. `corralio_promote_provisional_venue_v1`) that: calls the eligibility function; on eligible, creates the canonical `venues` row from the provisional record's normalized identity (name, address, city, state, lat/lng — already captured at provisional-creation time); writes a **promotion audit record** — which evidence signals qualified it, the rule version, timestamp, and the provisional venue's id — satisfying ADR-021's "audit history" requirement independent of the underlying observation fingerprints; repoints `corralio_venue_aliases` rows from `provisional_venue_id` to the new `canonical_venue_id`; and updates the provisional venue's `lifecycle_status` (existing enum already has `merged`/`reconciled` states that look built for exactly this).

This does not need to be synchronous with event ingestion — a periodic sweep (mirroring the existing 30-day unmatched-recheck pattern already in the matcher) that re-evaluates all `active` provisional venues is simpler and gives Overture's own monthly refresh cycle a chance to newly corroborate something that missed the bar last time, which is the "automatically reevaluate later, no human queue" behavior from the original brief.

### 3.3 The Corralio→TI venue link — two levels, only one of which is needed now

**Level 1 (ship with the above, no new infra):** once a Corralio event's provisional venue is promoted, its `corralio_event_venue_matches` row already carries `venue_id`. Corralio's own UI can link out to the existing public TI venue page using the same URL pattern TI already uses internally (`getVenueHref`: `/venues/${seo_slug || id}`). This is a plain deep link to already-public content — no API, no contract, no ADR-005 dependency, no cross-domain auth question. This is the version that should ship first.

**Level 2 (separate, bigger, not yet justified):** actually surfacing TI venue context *inside* Corralio's own screens (rather than linking out) is what ADR-030 gestures at and what ADR-005 was written to govern — and ADR-005's own status is **"Accepted — implementation details pending."** That contract does not exist yet. Nothing in this design requires building it; Level 1 alone satisfies "don't fork the venue experience." Build Level 2 only if/when there's a specific product reason Corralio needs inline TI venue data rather than a link (a concrete UX case, not a default).

## 4. What the privacy gate still depends on

`isHouseholdOriginLocation()` protects exactly one thing well: a household's own registered home address. It does not evaluate whether a non-home location is *appropriate* to publish — a coach's private backyard, a defunct/temporary spot, a garbled address that happens not to match the household's origin string. That's precisely why promotion eligibility (§3.1) — not the privacy classifier — is the layer actually deciding whether something becomes public. A location that isn't literally "home" but also isn't a real, findable place will simply never clear either evidence path (no Overture match, unlikely to recur across independent households) and stays provisional forever, private to the household that entered it. The two mechanisms are complementary, not redundant: privacy classification stops known-private locations from ever becoming candidates at all; the eligibility gate stops everything else from becoming public without real corroboration.

## 5. Weekend Guide / Owl's Eye dynamic Overture querying — keep this out of this design's critical path

This is a separate, larger change (replacing Owl's Eye's persisted Foursquare-derived counts with live Overture queries) that this session already flagged as ahead of its own evidence: the bounded 100–250 venue Overture-vs-Foursquare coverage experiment (`docs/corralio/cpo/2026-09-02-portfolio-api-economics-stage2-decision-packet.md` §5) was designed and never run. Don't bundle it with venue-promotion work — they're independent, and conflating them risks the promotion pipeline's own rollout waiting on an unrelated, unvalidated experiment.

## 6. HotelPlanner

No new decision — ADR-006 already governs ("Corralio reuses trusted HotelPlanner search, handoff, attribution, and Hotel Program logic. Commercial fee and beneficiary resolution remain server-side"), and the existing `HotelBookingCta`/`TeamTravelVenueLink` components on the venue page already encode the two intents (individual search vs. team block) the founder asked to preserve. Corralio surfacing a stronger-intent CTA into this same page ("Your tournament is 147 miles away...") is downstream product work, gated behind Corralio actually having a travel-intent signal to send — which is exactly what the still-unrun HotelPlanner Phase 3B evidence diagnostic and the calendar-feed Phase 1 pilot (both already tracked, both already sequenced ahead of this) are for. Nothing to build here yet.

## 7. Recommended build sequence

1. Extend the eligibility rule to v2 with the repeat-independent-household signal (§3.1) — small, isolated, has existing tests to extend.
2. Build the promotion RPC + audit record + alias repoint + lifecycle transition (§3.2).
3. Add the periodic re-evaluation sweep, same pattern as the existing 30-day unmatched recheck.
4. Add the Level-1 Corralio→TI venue deep link (§3.3) — trivial once #2 exists.
5. Explicitly not in this sequence: the Overture-first Weekend Guide (§5, separate track behind its own experiment), and the ADR-005 read-only contract / Level-2 inline surfacing (§3.3, build only if a specific case justifies it).

## 8. Open items that are the founder's call, not an engineering detail

- **Repeat-household threshold** — this design used 2 (from the chat discussion this formalizes). Confirm, or set differently, before #1 above is built.
- **Distinct households vs. distinct teams** — a large multi-team household could otherwise self-corroborate. Recommend the aggregation count distinct `household_id`, not distinct event/team, to preserve "independent" in "independent corroboration."
- **Promotion visibility** — "validated automation, no human queue" doesn't preclude an admin-visible feed of what got promoted and why (for spot-checking, not gating). Worth deciding whether that's wanted; it's a small addition to §3.2's audit record if so, not a new system.

## 9. Founder decisions confirmed, 2026-09-03

- **Repeat-independent-household threshold: 2.** Kept as proposed. One household alone is too weak (typo, private location, one-off bad import); two independent households is enough without a manual-review workflow. Not raised to 3 pre-emptively — revisit only if the first production sample shows false promotions.
- **Independence unit: distinct `household_id`, not distinct team or event.** Teams can create artificial concentration (one team importing the same venue repeatedly; one household spanning multiple teams; inconsistent team identifiers across sources). Team count may be retained as supporting evidence, not the qualifying signal.
- **Admin visibility: yes, read-only audit/spot-check feed — not an approval queue.** The feed answers "what did automation do," not "please approve." Required fields: venue promoted, when, source provisional identity, why it qualified, household evidence count, Overture corroboration if present, coordinate/address agreement, duplicate-match result, promotion-rule version.
- **A second promotion path added for high-confidence single-household venues (Path B), evidence-weighted rather than a flat household-count gate.** A real new sports complex shouldn't wait for a second Corralio family if machine evidence is already strong.

## 10. Path A / Path B reconciliation — and a correction from further research

The founder's Path A / Path B split maps directly onto the eligibility function's existing structure; it does not require a redesign. `evaluateProvisionalPromotionEligibilityV1` already promotes on **any one** qualifying "strong" evidence type, not all of them (`strongEvidenceTypes.length > 0`). Adding `repeat_independent_observation` to the strong-evidence set (§3.1 — this is Path A) sits alongside the two evidence types already defined there: `overture_place_match` (Path B) and `trusted_ti_ri_verification`. The rule was already evidence-weighted, not household-count-only; §3.1 is additive, not a rewrite.

**Correction to §0/§3 above:** drafting the Path B build prompt surfaced infrastructure this document missed on first pass. Overture-match evidence recording is more built than credited above. `apps/corralio/lib/overtureNearby.server.ts` → `recordOvertureVenueCorroboration()` already matches a provisional venue's identity against a set of Overture places and, on match, calls a real RPC — `corralio_record_overture_place_match_v1` (migration `20260825_corralio_slice45_overture_nearby_foundation.sql`) — that writes exactly the `overture_place_match` evidence row the eligibility function already reads, with full HMAC fingerprinting and provenance. Like the eligibility function itself, it has **zero production callers today** — it's dormant, not missing.

Why it's dormant matters for sequencing Path B: neither this function nor its sibling `refreshOvertureCandidatePools` fetches Overture data itself — both take already-fetched `places` as input. The only thing that currently produces that input is `scripts/ops/corralio_overture_refresh.ts`, an operator-run script taking a manually-prepared, size-and-count-bounded extract file (`--input=...`, dry-run by default, `--apply --confirm-apply` to write) — the same Stage 1 bounded-pilot posture the Sept 2 economics packet already had reasons to keep manual (`2026-09-02-portfolio-api-economics-stage2-decision-packet.md` §5). Path B is real and cheap to wire — genuinely just "add a caller" — but it inherits that same operator-triggered cadence: Overture evidence updates only when someone runs the bounded extract, not continuously. That's consistent with "no human approval queue," not a violation of it: the *promotion decision* stays fully automatic once evidence exists (eligibility → promotion RPC, no human in that loop); only the *evidence supply* for the Overture path runs on an operator cadence, same as it already does for the unrelated food/coffee candidate pools this same infrastructure serves today.

Practical effect: **Path A (repeat-household) is fully automatic end-to-end from day one**, no Overture dependency. **Path B (single-household + Overture) goes live incrementally**, for whichever provisional venues are covered the next time someone runs a bounded Overture extract/apply. Scaling that cadence up is the same not-yet-taken decision the Sept 2 packet already flagged, and this design doesn't need to resolve it to ship Path A + the promotion RPC + audit feed now.

## 11. Updated build sequence (supersedes §7)

1. Extend eligibility to v2: add `repeat_independent_observation` (Path A), threshold 2 distinct households. No change needed to how `overture_place_match` / `trusted_ti_ri_verification` (Path B) already work in the rule — they just need callers.
2. Build the promotion RPC + audit record + alias repoint + lifecycle transition (§3.2) — evidence-weighted per the OR logic above, so either path actually promotes, not just qualifies.
3. Add the periodic re-evaluation sweep (30-day-recheck pattern) — re-evaluates all active provisional venues against current evidence, whichever path they qualify under.
4. Wire `recordOvertureVenueCorroboration` as a caller from the existing bounded Overture ops flow, so a provisional venue included in a future bounded extract gets its Overture evidence recorded and becomes Path-B-eligible on the next sweep. Small addition — no new Overture data-fetching infrastructure, reuses the existing manual/bounded script.
5. Add the Level-1 Corralio→TI venue deep link (§3.3) — trivial once #2 exists.
6. Add the admin-visible read-only promotion audit feed (§9) — a query/view over the audit records from #2, not a new system.
7. Explicitly not in this sequence: automating or scaling Overture data acquisition itself (separate, already-flagged-premature track — unchanged from §5), and the ADR-005 read-only contract / Level-2 inline surfacing.

## What this document does not authorize

This is a design, reconciled against real code, not a build prompt. §8's open items are now resolved per §9. The companion build prompt is `docs/prompts/2026-09-03-corralio-venue-promotion-implementation-prompt.md`, issued separately and moved through the normal Evidence/Test-First → authorized-Now path — consistent with how Phase A+B, the calendar feed pilot, and every other build item in this session were handled. No schema change, RPC, or UI change described here is authorized by this document alone; the build prompt carries its own explicit authorization boundary.

## Sources

Direct repository reads, 2026-09-03: `apps/corralio/lib/provisionalVenues.server.ts`, `venueMatching.server.ts`, `venueMatching.ts`, `provisionalVenues.ts`, `provisionalVenueEvidence.ts`; `apps/ti-web/app/venues/[venueId]/page.tsx`; `apps/ti-web/lib/venues/getVenueHref.ts`; `supabase/migrations/20260825_corralio_slice44b_shared_provisional_venues.sql`, `20260825_corralio_slice44c_provisional_lifecycle_evidence.sql`, `20260826_corralio_slice44d_incomplete_ics_venue_resolution.sql`, `20260402_venue_inference_*.sql` (precedent pattern, not reused code — TI's own tournament↔venue inference pipeline, confirmed to still require explicit UI promote/reject, a different problem than this design's venue-creation gate). `docs/corralio/CORRALIO_ARCHITECTURE_DECISIONS.md` ADR-005, ADR-006, ADR-008, ADR-009, ADR-010, ADR-021, ADR-030 (full text quoted above). `docs/corralio/cpo/2026-09-02-portfolio-api-economics-stage2-decision-packet.md` §5. Chat discussion this session, 2026-09-03 (the two-path promotion rule and the "may happen again" scenario that motivated §3.1).
