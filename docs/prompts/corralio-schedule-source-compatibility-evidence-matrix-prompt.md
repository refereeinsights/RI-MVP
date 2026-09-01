# Corralio — Schedule-Source Compatibility & Evidence Matrix

**Extends the canonical schedule-source catalog with structured, closed-typed evidence tracking and vendor-support provenance.**

Run this work only after Schedule Connection UX Unification is complete locally (or further along). This slice extends the same canonical catalog that slice touched — reconcile field names with whatever that implementation actually shipped (`contexts`, `officialSupportUrl`, and the existing compatibility-tier field) rather than reintroducing parallel names.

Do not push or deploy.

## 0. Why Now (CPO framing — read before implementing)

This is a data-model/internal-tooling slice, not a UX slice. It has no direct parent-facing surface in this slice (see Section 8, Non-Goals). The justification is evidence, not speculation: Slice 3.7 and the Schedule Connection UX Unification slice each independently produced an ad hoc "Outstanding UAT" prose disclosure in `apps/corralio/notes.md` — one for Arbiter Officials' lifecycle semantics, one for LeagueApps' reschedule behavior. That is the same shape of fact recorded twice, in free text, with no shared structure. A third platform will produce a third ad hoc paragraph unless this is formalized now, while there are only two real instances to migrate and reconcile against.

This also directly serves an existing, already-approved product policy — the Future Platform Addition Rule and the Vendor-Documented Compatibility policy from the UX Unification prompt — by giving that policy a structured place to record its own evidence bar per platform, instead of relying on prose judgment calls each time a new source is proposed.

Scope discipline still applies. The previous slice's founder decision ("add only catalog metadata required for current behavior… do not broaden into a speculative catalog redesign") was about that slice's UI-facing picker work, not a blanket freeze on the catalog forever. This slice is the deliberate, separately-justified place to do structural catalog work — but it inherits the same discipline: populate only what is actually known today (see Section 4), do not manufacture new testing to fill cells, and do not use this slice to sneak in a public-facing page (explicitly deferred, Section 8).

## 1. Product Objective

Give Corralio one internal, typed, queryable answer to: for this platform, in this connection context, what have we actually verified — and what have we only read in the vendor's documentation?

Two audiences depend on this distinction:

* **Product/CPO**, deciding whether a platform is safe to add, safe to promote from COMPATIBLE to VERIFIED, or needs a caveat.
* **Support**, troubleshooting a parent's specific complaint (e.g. "my rescheduled game shows twice") against a known, disclosed gap rather than treating it as a surprise bug.

A third audience — parents, via a future compatibility page — is designed for but not built in this slice (Section 8).

## 2. Audit First

Before editing, inspect the post-UX-Unification repository state. Confirm:

1. The exact shape the catalog module ended up with after UX Unification (`contexts`, `officialSupportUrl`, compatibility-tier field name) — do not assume the sketch from that prompt was implemented verbatim.
2. Every place `apps/corralio/notes.md` currently records platform-specific evidence, caveats, or "Outstanding UAT" language (at minimum: Arbiter Officials lifecycle semantics from Slice 3.7, LeagueApps reschedule behavior from UX Unification). These are the seed data for Section 4 — migrate their substance into the structured model rather than leaving them only as prose.
3. Whether any existing test or code already encodes an implicit capability claim (e.g., a test asserting duplicate-event suppression, or the `extractIcsTextProperty` fix from Slice 3.7 implicitly verifying location/summary parsing for the platforms whose feeds were used as fixtures) — those are real evidence and should populate real cells, not `untested`.
4. Existing caveat/tier fields per platform, so the new matrix supersedes rather than duplicates them.

Repository reality wins. If the UX Unification catalog shape differs materially from what either prompt assumed, adapt this model to the real shape and report the deviation rather than forcing a mismatch.

**Founder-supplied out-of-catalog evidence — InLeague, 2026-08-31.** Preserve the following vendor-support statement as candidate evidence, not as Corralio verification:

> We have added an ICS subscription (or download) function that is available under team assignments, upcoming games, or your team's schedule page (presuming there are games published).

This establishes only that InLeague reports an ICS export/subscription capability and names three possible access surfaces. It does not establish whether every surface returns a durable subscription rather than a one-time download, whether the URL is publicly fetchable or credential-bearing, whether Corralio can ingest it, or how refreshes, changes, reschedules, cancellations, duplicates, and locations behave. InLeague is not currently a catalog key, so this slice must not add an InLeague evidence record or picker option. Include it in the audit report as a Future Platform Addition Rule candidate and cite `docs/corralio/cpo/2026-08-31-cpo-evidence-inleague-ics-availability.md`; a later separately authorized platform-addition pass must verify the original public support source and a representative credential-safe feed before assigning a Corralio compatibility tier.

## 3. Data Model

Extend the canonical catalog (same module family as the existing typed platform list — do not create a second catalog or a database table) with a per-platform evidence record. At minimum, each platform carries:

```ts
type CapabilityEvidenceStatus =
  | "verified"       // Corralio has observed this specific capability behave
                      // correctly on a real, representative feed, and considers
                      // that observation currently trustworthy (not stale).
  | "passed"          // Corralio ran a specific, one-time UAT-style check for
                      // this capability and it behaved correctly, but it has
                      // not been exercised on an ongoing/representative basis
                      // strong enough to call it "verified".
  | "failed"          // Corralio observed a defect for this capability. Must
                      // be paired with a known caveat (Section 4) describing it.
  | "untested"        // Default. No Corralio-side observation exists yet.
  | "not_applicable"; // This capability does not apply to this platform or
                      // connection method (e.g. a platform with no concept of
                      // "reassignment" at all).

type ScheduleSourceCapabilityEvidence = {
  initialImport: CapabilityEvidenceStatus;
  refresh: CapabilityEvidenceStatus;
  scheduleChanges: CapabilityEvidenceStatus;
  reschedules: CapabilityEvidenceStatus;
  cancellations: CapabilityEvidenceStatus;
  locations: CapabilityEvidenceStatus;
  duplicateHandling: CapabilityEvidenceStatus;
};

type ScheduleSourceEvidenceRecord = {
  platformKey: string;               // must match the existing catalog key — do not fork identity
  vendorDocLastReviewedAt: string | null;   // ISO date; when a human last confirmed
                                              // the vendor documentation cited in
                                              // officialSupportUrl still matches
                                              // reality. Null if never reviewed.
  corralioVerifiedAt: string | null;        // ISO date of the most recent Corralio-side
                                              // observation informing this record.
                                              // Null if nothing has ever been observed.
  capabilities: ScheduleSourceCapabilityEvidence;
  knownCaveats: readonly string[];          // parent-safe-or-internal text; see Section 5
                                              // for which subset is parent-safe
  outstandingUat: readonly string[];        // structured list, not a single free-text
                                              // paragraph — e.g. one entry per unresolved
                                              // capability gap, so tooling can eventually
                                              // count/report them
};
```

Exact TypeScript naming should follow whatever convention the catalog module already established (e.g. if the existing tier field is called `tier`, do not introduce a differently-named parallel `compatibilityStatus` — reuse it). The literal five-state enum, the seven capability dimensions, and the four provenance/evidence fields (`vendorDocLastReviewedAt`, `corralioVerifiedAt`, `knownCaveats`, `outstandingUat`) are the actual requirement; exact field names are an implementation detail as long as they stay closed-typed.

Do not add a sixth capability dimension or additional provenance fields speculatively. If implementation discovers a real gap this list doesn't cover, report it rather than silently expanding the model.

## 4. Populating the Matrix — Honesty Over Completeness

For each existing catalog platform (GameChanger, TeamSnap, Stack Team App, ArbiterLive, Arbiter Officials, LeagueApps, Other calendar), populate the record using only evidence that already exists:

* If a platform's original addition to the catalog required a real household connection (per the existing platform-curation evidentiary discipline), that at minimum supports `initialImport: "passed"` or `"verified"` for that platform — confirm which by checking whether that evidence was a one-time historical test or something re-confirmed on an ongoing basis, and choose the status honestly.
* Arbiter Officials: `reschedules`, `cancellations` should be `"untested"` (per Slice 3.7's own tracked Outstanding UAT), not `"failed"` — untested and known-broken are different claims. `initialImport`, `locations` should reflect what Slice 3.7's audit and fixture testing actually exercised (the `extractIcsTextProperty` fix was validated against real ArbiterLive/Arbiter fixtures — that's real evidence, use it).
* LeagueApps: `reschedules` must be `"untested"` with a corresponding `knownCaveats` entry describing the documented old+new duplicate-event behavior, and a corresponding `outstandingUat` entry — this is the direct migration target for the caveat added in the UX Unification slice. `vendorDocLastReviewedAt` should be set from that slice's documentation-verification date (Section 29 of that prompt); `corralioVerifiedAt` should remain `null` for LeagueApps until a representative feed is actually tested.
* "Other calendar" (the generic ICS fallback) should mostly read `not_applicable` or `untested` across the board except where the generic ingestion pipeline's own test suite genuinely exercises a capability platform-agnostically (e.g. generic duplicate handling logic, if it exists and is tested independent of any specific vendor).
* Do not run new exploratory tests against live vendor feeds merely to fill in a better-looking status. `untested` is a correct, honest value for most cells today. The point of this slice is to make that visible and structured, not to eliminate it.

## 5. Public/Private Boundary and Future Public Subset

Design so a safe parent-facing subset can later be derived, without creating a second hand-maintained source of truth:

* The full evidence record (all capability cells, both dates, full caveat/UAT text) is internal-only by default. Nothing in this slice renders it in-product or on any public page.
* Design a pure, unit-testable selector/derivation function (e.g. `deriveParentSafeCompatibilitySummary(record)`) that maps a full internal record down to a safe subset — for example: platform name, plain-language compatibility tier, a parent-safe rendering of any caveat that is written to already be parent-appropriate, and the official vendor support URL. This function is the only sanctioned way a future public surface would ever read this data; a future slice building that surface should call this selector, not hand-copy fields.
* Distinguish, in the data itself, caveat/UAT text that is already written in parent-safe language (like the LeagueApps reschedule caveat, which was written for in-product display) from anything written in internal/engineering shorthand. If any current caveat text is not safe to show a parent as-is, do not silently mark it parent-safe — flag it in the audit findings.
* Never let `knownCaveats` or `outstandingUat` entries contain: private calendar/subscription URLs, account identifiers, household/user identifiers, internal test fixture details, or internal-only engineering notes. If any currently do, sanitize them as part of this slice.
* `vendorDocLastReviewedAt` and `officialSupportUrl` are already public-safe by nature (they describe public vendor documentation) and may pass through the selector unchanged. `corralioVerifiedAt` is safe to expose in principle (it's a claim about Corralio's own testing, not vendor or user data) but is not required to be shown in any public surface built later — that's a decision for whoever builds that surface, not this slice.

## 6. Vendor-Documented Provenance Integrity

* `officialSupportUrl` must remain a static HTTPS link to public vendor documentation, structurally identical in kind to what UX Unification already established — this slice does not change what that field is, only tracks when it was last confirmed accurate (`vendorDocLastReviewedAt`).
* Never conflate `vendorDocLastReviewedAt` (a human confirmed the vendor's documentation still says X) with `corralioVerifiedAt` (Corralio actually observed the behavior on a real feed). A platform can have a recent `vendorDocLastReviewedAt` and a `null` `corralioVerifiedAt` forever — that is the honest COMPATIBLE-but-not-VERIFIED state, and the model must be able to represent it without any status field implying otherwise.
* Do not scrape vendor sites to auto-populate `vendorDocLastReviewedAt`. This remains a human/audit action recorded when a person actually reads the current documentation (consistent with Section 29 of the UX Unification prompt).

## 7. Relationship to the Existing Compatibility Tier

The existing platform-level tier (`VERIFIED | COMPATIBLE | MANUAL | DIRECT_INTEGRATION`) is not replaced by this matrix — it remains the coarse, parent-relevant classification. The new per-capability matrix is a finer-grained internal justification for that tier. Do not let engineering invent a second, competing platform-level status derived independently from the matrix; if a derived overall status is useful internally, it should be computed from the same tier field, not duplicate it.

A platform should not be marked tier `VERIFIED` while any of `initialImport`, `refresh`, `reschedules`, or `cancellations` reads `untested` or `failed` for a context where that capability is expected to matter. If auditing finds an existing platform currently marked `VERIFIED` with unverified core capabilities in the matrix, report that as a finding rather than silently reclassifying it — that's a product decision, not an implementation detail.

## 8. Explicit Non-Goals

Do not, in this slice:

* build any parent-facing or public compatibility page — design for it (Section 5), do not build it;
* add a database table or CMS for this data — it stays in the same typed code module family as the existing catalog;
* add automated vendor-documentation-change monitoring or scraping;
* add new UI to the connection flow itself (no new picker copy, no new caveat surfaces beyond what UX Unification already shipped);
* retest or re-verify any platform against a live feed merely to populate this slice — use existing evidence only (Section 4);
* change ingestion, parsing, refresh, or SSRF behavior — this is a data/documentation model, not a pipeline change;
* rename or restructure the existing `contexts`/tier/`officialSupportUrl` fields beyond what's needed to attach this matrix to them;
* add platforms not already in the catalog;
* implement the Future Platform Addition Rule's process changes beyond what this data model enables — process/workflow changes are a separate, later product decision.

## 9. Tests

Add/update deterministic tests covering at minimum:

1. every existing catalog platform has a complete, well-typed evidence record (no missing capability keys);
2. the capability-status enum is closed — an invalid string is a compile-time error, not a runtime possibility;
3. `deriveParentSafeCompatibilitySummary()` never returns a private URL, account identifier, or internal-only text for any current platform record;
4. LeagueApps' record reflects `reschedules: "untested"` and includes a caveat/outstanding-UAT entry describing the duplicate-event behavior;
5. Arbiter Officials' record reflects `reschedules`/`cancellations` as `"untested"`, not `"failed"`, consistent with Slice 3.7's closeout language;
6. no platform is `tier: "VERIFIED"` while `initialImport` is `"untested"` or `"failed"` in the matrix (a guard test, not just a manual audit);
7. the matrix module introduces no runtime dependency on network/vendor calls;
8. existing catalog-consuming code (picker components, connection actions) is unaffected — this is an additive extension, not a breaking change to the fields those already consume.

## 10. Verification

Before declaring completion, run: focused catalog/evidence-matrix tests; all affected deterministic tests; complete Corralio test suite; explicit Corralio TypeScript validation; zero-warning Corralio lint; `git diff --check`; all four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`).

Also verify: no schedule-connection UX behavior changed (this slice is data/documentation only); no existing picker/connection test regressed; no database migration was introduced (none should be necessary — flag and stop if one seems required).

Do not push. Do not deploy.

## 11. Notes and Durable Record

Update `apps/corralio/notes.md` with: audit findings (including the reconciled UX-Unification catalog shape); the final evidence-matrix structure; how each existing platform's record was populated and from what evidence (cite the specific prior slice/fixture, not "assumed"); the migrated Arbiter Officials and LeagueApps outstanding-UAT entries in their new structured form (superseding, not duplicating, the prose versions); the public-subset selector design and what it currently excludes; any platform found to be `VERIFIED` with unverified core capabilities (Section 7); tests/builds; deferred items; final verdict.

Preserve unrelated worktree changes.

## 12. Commit

Review the complete diff before committing. Commit only files belonging to this evidence-matrix work. Use a focused local commit message. Do not push. Do not deploy.

## 13. Final Verdict

Return exactly one appropriate terminal verdict:

`SCHEDULE SOURCE EVIDENCE MATRIX COMPLETE LOCALLY`
`SCHEDULE SOURCE EVIDENCE MATRIX READY AFTER LISTED FIXES`
`SCHEDULE SOURCE EVIDENCE MATRIX BLOCKED BY AUDIT FINDING`
`SCHEDULE SOURCE EVIDENCE MATRIX NOT READY`

Include: prerequisite (UX Unification) status; audit result and any catalog-shape reconciliation; final data model; per-platform population summary and evidence sources cited; any platform flagged under Section 7; public-subset selector design; tests/builds; deferred items; local commit hash(es); explicit confirmation that nothing was pushed or deployed.
