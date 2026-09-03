# Corralio Slice 3.4 — Schedule Connection Activation

> **HISTORICAL — SLICE 3.4 COMPLETE. DO NOT EXECUTE.** Shipped and verified 2026-08-27 (`SLICE 3.4 COMPLETE LOCALLY`, `apps/corralio/notes.md` line 249; migration `20260827_corralio_slice34_schedule_connection_activation.sql`; catalog + rollback-only behavioral verifiers passed; signed-in browser UAT passed; cleanup zero; 246 tests + TypeScript + lint + all four production builds passed). This prompt's four-platform mandate (GameChanger, TeamSnap, Stack Team App, Other calendar — line 13) and its Stage 1 assumptions (no platform picker/Corralio platform evidence exists — line 42) are both superseded: current platform behavior is governed by Slice 3.7 (Arbiter/ArbiterLive) and Schedule Connection UX Unification (LeagueApps added), which expanded the catalog to the seven keys now live in `apps/corralio/lib/schedules/platforms.ts` (`SCHEDULE_PLATFORM_CATALOG_VERSION = "corralio-schedule-platforms-v3"`) and are tested in `apps/corralio/lib/schedules/scheduleConnectionUxUnification.test.ts`. Re-running this prompt against current repository state risks regressing that completed work. This document remains as historical evidence of the original specification and is not rewritten. CPO-verified 2026-09-03 against `notes.md`, the current platform catalog, and git history — not accepted on report alone.

**Renumbered from the founder's proposed "4.6B." See the CPO renumbering note (Section 0) before treating this as 4.6B anywhere — it is not a sub-slice of Slice 4.6 ("What Fits?") and must not be filed, branched, or referenced as one.**

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

This is a focused pre-launch activation-hardening slice for Corralio's existing schedule-connection flow (Slice 3). It is derived from founder product direction on schedule-connection support and platform knowledge, scoped down to what pre-launch activation actually needs — **do not treat any broader knowledge-base ambition as required implementation scope.**

## Authoritative Stage 2 execution clarification — 2026-08-27

This section incorporates the resolved CPO decisions and is authoritative where later sections retain stale or ambiguous wording.

- The launch picker is exactly **GameChanger, TeamSnap, Stack Team App, and Other calendar**. Use “also called Sports Connect” only as supporting recognition copy for Stack Team App. Never show Blue Sombrero parent-facing. Do not retain organization, team, household, event, or location identifiers in this prompt.
- The filed Stage 1 CPO decision packet is the required decision packet. Complete and file the missing bounded Stage 1 audit/design report before editing runtime behavior. If it finds no material blocker, proceed directly to Stage 2; no second decision packet is required.
- The Stage 1 household inspection is aggregate and read-only. Never print or refetch subscription URLs, raw feeds, event text, notes, private location values, account identifiers, or credentials.
- Use one typed code module as the platform-knowledge source of truth. The selected platform is an activation/UI classification only and must not become Slice 4.4B trusted-source evidence or change fetch/parser security.
- Reconcile analytics with Slice 4.2A: log only non-derivable interaction signals such as platform selection, instructions viewed, and failed submission/validation attempts. Derive successful imports, active-schedule count, second schedule connected, activation, and This Weekend use from existing persisted state. Analytics failure must never affect connection behavior.
- A bounded platform enum (`gamechanger`, `teamsnap`, `stack_team_app`, `other`) is permitted in interaction measurement. Platform account identifiers, source URLs, feed data, and arbitrary platform strings remain prohibited.
- Add a closed, privacy-safe error kind to the connection result/action contract so contextual help does not infer semantics from message text. This does not authorize redesign of ingestion.
- After success show **“Schedule connected — we found [N] upcoming events”**, **“Connect another schedule”**, and **“See This Weekend.”** Do not force a redirect after the first schedule.
- Add static “via GameChanger” and “via TeamSnap” labels to exactly two signed-out example events. They are presentation-only and imply no partnership.
- Do not add TomTom, mobile hardening, notifications, or more platforms. Those belong downstream.

---

## 0. Numbering — read this before doing anything else

The founder proposed "4.6B." That numbering is rejected for this canonical prompt, for a reason that matters to how you scope the work, not just what you call it:

- The `4.x` sequence in this repository (`docs/prompts/corralio-slice-4.3-*` through `corralio-slice-4.6-*`, and the reserved 4.7/4.8) is specifically the **Contextual Intelligence** thread — leave-by, venue matching, Overture enrichment, and the What-Fits recommendation engine. A "4.6B" label would falsely imply this work is a sub-slice of Slice 4.6 ("What Fits?"), with some technical or sequencing dependency on it. It has none. Slice 4.6 is fully shipped (`SLICE 4.6 COMPLETE LOCALLY`, commit `cfb91fe8`) and this slice must not touch it, delay it, or be blocked by it.
- This work is, in substance, a fourth hardening pass on the *original* Slice 3 ("connect schedule → This Weekend"). The existing precedent for that lineage is exactly this shape: `3` → `3.1` (secure schedule connections) → `3.1.1` (password auth/recovery) → `3.2` (secure scheduled ICS refresh) → `3.3` (persistent refresh failure and recovery). Each of those was an activation/reliability improvement to the same original connection feature, not a new capability area — precisely what this slice is.
- Therefore the canonical identifier is **Slice 3.4 — Schedule Connection Activation**. Use this name in the prompt title, in `notes.md` entries, in verifier sentinels, and in every terminal verdict string (`SLICE 3.4 ...`). If you believe repository state has changed such that a different number is now more accurate, stop and report that before proceeding — do not silently pick your own number.

**A known open question this renumbering surfaces, which you must resolve in Stage 1, not guess at:** the current CPO execution plan (`docs/corralio/CORRALIO_ARCHITECTURE_DECISIONS.md`, ADR-033) defines the launch gate as an experience test that already includes "connect multiple schedules" as a required parent-visible capability. If Stage 1's audit confirms today's connection UX is a real activation barrier (see Section 1), this slice is very likely **launch-critical**, not a nice-to-have — which means the CPO's own recently-published "launch gate cleared" status is provisional pending this slice's outcome. Say so plainly in your Stage 1 report; do not let this quietly become optional scope creep in the other direction either.

---

## 1. Audit first — grounded in what already exists, not assumption

Before designing anything:

1. Read the current connection UX in full: `apps/corralio/app/components/ConnectScheduleForm.tsx` and `apps/corralio/app/components/ConnectedScheduleList.tsx`. As of this writing, the form asks for a raw "Calendar link" with help text reading *"Paste the calendar link provided by your team app. It may be called an iCal or ICS subscription link."* — there is no platform selection step, no platform-specific instructions, and no compatibility signaling of any kind. Confirm this is still accurate; if it has changed, report the discrepancy before proceeding.
2. Read `corralio_schedule_sources.source_type`'s current state. As of Slice 4.4B's own audit (`docs/reports/corralio-slice-4.4b-source-classification-audit-2026-08-25.md`), this column is fixed to a generic `ics` value with no publisher/platform identity anywhere in the ingestion path, and that audit separately identified — for a *different* purpose (venue-creation trust, not activation UX) — the same underlying gap this slice needs to close: "a narrow, server-derived, versioned provider/source classifier." Read that report. Decide, and record your reasoning, on whether this slice should build that classifier as shared infrastructure both slices can eventually use, or a narrower activation-only construct — but do not let 4.4B's now-different trust requirements bleed into this slice's simpler need (recognizing what a parent typed or picked, not proving it for a security/trust decision).
3. Read the existing generic ICS ingestion path this slice must reuse without reopening: the SSRF-safe fetcher and parser described across Slice 3/3.1/3.2/3.3's `notes.md` entries. Confirm it remains unchanged and identify the exact integration point where a resolved "which platform did the parent pick or does this URL look like" value would attach, without altering fetch/parse/persistence behavior.
4. **Real, reusable platform evidence already exists elsewhere in this monorepo — read it before inventing anything.** `docs/qa/ti-planner-ics-uat.md` (TournamentInsights' own Weekend Planner ICS UAT log) contains genuine, dated, partially-passed real-feed testing against GameChanger, TeamSnap, and SportsEngine/MySE, including real feed URL shapes (for example SportsEngine's `webcal://` normalizing to `https://ical.sportngin.com/v3/calendar/ical?...&src=myse`), observed edge cases (TeamSnap's `00:00` time-default on some items), and an explicit "not yet tested" list for Sports Connect/Blue Sombrero, PlayMetrics, LeagueApps, and Spond/Heja. **This evidence was gathered against TI's own Weekend Planner ingestion path, not Corralio's** — treat it as strong prior signal for which platforms are worth prioritizing and what their feed URLs look like, but not as a substitute for Corralio-specific verification. Do not claim `VERIFIED` for Corralio based solely on TI's results; a platform TI has proven compatible is at most `COMPATIBLE`-candidate for Corralio until this slice's own bounded verification (Section 3) confirms Corralio's simpler generic fetch/parse path handles that same real feed shape correctly.
5. Confirm ADR-019 (`docs/corralio/CORRALIO_ARCHITECTURE_DECISIONS.md`) still stands: generic ICS/iCal ingestion is sufficient for V1; direct TeamSnap/GameChanger/SportsEngine API integrations are explicitly not required and not in scope here.
6. **Report, do not assume, on real Corralio pilot-family platform data.** As of this writing there is no evidence anywhere in this repository of which specific platforms actual Corralio pilot/test families use — no fixture, test, or note references a platform name in the Corralio app itself (only the sport taxonomy exists, which is orthogonal to platform). If the founder has this information from outside the repository, it must be supplied before Stage 1's platform-priority decision is finalized (Section 68-style decision gate, Section 6 below). Absent that, Stage 1's provisional candidate set is the three platforms with real, even if partial, tested precedent in this codebase: **GameChanger, TeamSnap, SportsEngine/MySE** — plus the generic "Other calendar" fallback every platform selector must have regardless of catalog size.
7. Identify existing analytics/instrumentation conventions (Slice 4.2A's usage-measurement RPC/table pattern) so this slice's funnel analytics (Section 5) extends the established pattern rather than inventing a second one.

Report material discrepancies against this section before expanding scope.

---

## 2. Primary objective

A sports parent should be able to connect the schedules their family already uses without understanding ICS, iCal, feeds, or calendar URLs. The connection flow should begin with **"Where does this schedule live?"** — a recognizable platform/source question — rather than today's technical-terminology-first prompt.

**Business objective:** improve schedule connection → multiple schedule connection → This Weekend activation. This is the top of the funnel every other Corralio slice depends on; nothing downstream matters if a parent abandons here.

---

## 3. Compatibility semantics — controlled vocabulary, no overclaiming

Use exactly these four tiers, nothing looser:

- **`VERIFIED`** — Corralio's own generic ICS fetch/parse path has been tested against a real feed from this platform and confirmed to import correctly (event coverage, updates in place, no duplicate storm, no hard-delete-on-cancel surprises). Nothing qualifies for this tier from TI's evidence alone (Section 1.4) — it requires Corralio-specific confirmation.
- **`COMPATIBLE`** — the platform is known or strongly believed (via TI's real-feed evidence, or the platform's own documented ICS/webcal export) to produce a standard ICS/iCal feed Corralio's generic parser should handle, but Corralio itself has not run a bounded real-feed check yet.
- **`MANUAL`** — no specific per-platform knowledge exists; the parent is guided through the generic "Other calendar" fallback (find your platform's calendar export/subscribe link, paste it here).
- **`DIRECT INTEGRATION`** — reserved, unused by this slice. Never applied to a feed/URL-based connection. Only applies to an actual API/OAuth/native platform integration, which ADR-019 explicitly excludes from V1 scope.

**Hard rules:**
- Never claim partnership, endorsement, or direct integration with any platform. Corralio consumes a compatible calendar feed; say exactly that, nothing more, in any in-product copy.
- Every platform-specific compatibility claim shown to a parent must be backed by actual testing recorded in this slice's own evidence (Section 1.4's inherited TI evidence is context, not a substitute) — no aspirational or assumed statuses in parent-facing copy.
- If a platform's actual behavior is worse than its assigned tier (observed during Stage 2 UAT), downgrade it and report the discrepancy — do not quietly patch copy to hide it.

---

## 4. One structured source of truth

Define a single, versioned, structured data source (in code — a typed module or a narrow database table, your call in Stage 1, but not both) for platform connection knowledge: platform name, compatibility tier, in-product connection instructions, and any platform-specific caveats (for example TeamSnap's observed midnight-default time edge case). Both the in-product connection UI and any future help content must read from this one source. Do not let in-product guidance and help content fork into two hand-maintained copies that can silently drift — that duplication is exactly the kind of thing this slice exists to prevent, per the founder's own framing.

---

## 5. Analytics — the funnel, not vanity metrics

**Primary activation measurement:** percentage of families who successfully connect a schedule and reach This Weekend.

**Funnel instrumentation**, extending Slice 4.2A's existing usage-measurement pattern (household-scoped, RLS-locked, service-role-readable, no client-writable aggregate rows):

```
platform selected
  → instructions viewed
  → link submitted
  → feed validated
  → events imported
  → second schedule attempted/connected
  → This Weekend viewed
```

Privacy rules, non-negotiable: no schedule subscription URL, no raw feed content, no platform account identifiers, and no other household-identifying data may ever appear in an analytics row, ordinary log, error message, or crash report. This is a stricter, security-relevant echo of the existing `corralio_schedule_sources.source_url` bearer-secret discipline already enforced elsewhere in this codebase (service-role-only reads, no client `SELECT` grant, excluded from ordinary API responses) — this slice must not create a new path that leaks it.

Do not optimize for help-page traffic. A high hit rate on connection-failure help content is a signal something upstream is confusing, not a success metric in itself.

---

## 6. Stage 1 — Audit, Design, and the CPO Decision Gate

Stage 1 produces a written audit and design, an unapplied migration if the structured source-of-truth needs one, and a Stage 1 report — no runtime behavior change, no push, no deployment, consistent with every other slice in this repository.

Stage 1 must explicitly resolve, and present to the CPO/founder for decision before Stage 2 begins (mirroring Slice 4.6's Section 68 decision-gate discipline):

1. **Launch platform set and initial compatibility tier per platform.** Proposed starting point per Section 1.6: GameChanger, TeamSnap, SportsEngine/MySE as `COMPATIBLE` candidates (pending this slice's own bounded verification per item 2 below), plus "Other calendar" as the universal `MANUAL` fallback. Confirm, add, or remove platforms — and supply any real pilot-family platform data that exists outside this repository, since none was found inside it.
2. **Whether a bounded, real-feed verification pass is authorized for Stage 1 or deferred to Stage 2.** A small number of real ICS/webcal URLs (reusing the same platforms TI already validated, ideally the same or equivalent test feeds referenced in `docs/qa/ti-planner-ics-uat.md`) run through Corralio's own generic fetch/parse path would let some platforms earn `VERIFIED` status honestly before Stage 2 writes copy that claims it. If authorized, this must remain read-only against Corralio's own state (no household/event persistence required to just prove parse compatibility) and must not touch any real household.
3. **Structured source-of-truth format** (Section 4) — a typed code module versus a narrow database table — and who maintains it going forward.
4. **Whether the deferred Slice 4.4B provider/source classifier (Section 1.2) is built now as shared infrastructure**, or whether this slice implements a narrower, activation-only platform tag that does not attempt to satisfy 4.4B's separate trust requirements. Recommend against silently expanding this slice's scope to fully solve 4.4B's classifier — flag the connection and let the CPO decide whether the overlap is worth reconciling now or later.
5. **Exact "Where does this schedule live?" microcopy and the parent-facing failure/help copy** for at least the no-connection and invalid-feed cases — reuse the existing validation error language already proven in TI's UAT (`docs/qa/ti-planner-ics-uat.md`'s "private or local address" and "does not appear to be an iCal/ICS calendar" errors) rather than inventing new wording for behavior that already has known-good copy.
6. **Analytics event names**, matching this repository's existing naming conventions.

Do not proceed into Stage 2 until these are resolved and recorded as their own decision-packet document, filed the same way Slice 4.6's Section 68 decisions were (`docs/corralio/cpo/`), before any implementation begins.

---

## 7. Stage 2 — Implementation (only after the Stage 1 decision packet is filed)

**Launch-critical scope:**

- In-product connection UX beginning with platform/source recognition ("Where does this schedule live?"), not raw ICS terminology.
- Concise, platform-specific connection instructions for each platform in the confirmed launch set, sourced from the structured source of truth (Section 4).
- An "Other calendar" fallback for any platform not explicitly listed.
- Contextual connection-failure help, keyed to the actual failure (invalid URL, non-ICS content, private/local address, empty feed, and so on) rather than one generic error.
- A clear successful-import confirmation.
- A strong, explicit next action inviting the parent to connect another family schedule.
- Direct continuation from a successful connection into This Weekend — no dead end after the first schedule.
- The funnel analytics from Section 5, wired to every real step transition.

**Explicitly deferred, not built here (later / non-blocking):**

- A large public help center.
- A broad SEO program around connection help content.
- An exhaustive platform catalog beyond the confirmed launch set.
- An extensive screenshot library.
- Video tutorials.
- Direct platform APIs/OAuth (ADR-019 already excludes this from V1).
- Automated documentation-freshness monitoring.
- A support-ticketing system.
- Formal platform partnerships.

**Explicit non-goals regardless of stage:**

- Do not reopen or redesign the existing ICS fetch/parse/persistence architecture merely to improve instructional UX. Reuse the existing Slice 3/3.1/3.2/3.3 primitives unless this Stage 1 audit finds a genuine, specifically-named blocker — and if so, stop and report it rather than redesigning around it unilaterally.
- Do not interrupt, modify, or in any way risk regressing completed Slice 4.6 What Fits behavior. If any shared component or module is touched, the Stage 2 verification (Section 8) must positively confirm What Fits is unaffected, not merely assume it because the diff looks unrelated.
- No OAuth or direct platform API integration of any kind.
- No new venue/location/routing behavior of any kind — this slice is entirely about the connection step, before any event data is used downstream.

---

## 8. Stage 2 Verification

The key launch UAT question, which the browser UAT must directly answer, not merely gesture at:

> Can a normal sports parent connect a supported schedule, understand that it worked, add another schedule, and reach a useful This Weekend without needing to know what ICS means?

Required verification, consistent with this repository's standing two-stage discipline:

1. Deterministic tests covering: platform selection → correct instructions rendered; each confirmed-tier platform's real-shape feed URL (or a faithful fixture of one) parses through Corralio's existing generic path without new fetch/parse regressions; the "Other calendar" fallback path; each distinct failure case producing its correct contextual help copy (not a generic fallback message); successful-import confirmation copy and the second-schedule prompt; the full analytics funnel firing in the correct order with no private data in any event payload.
2. Signed-in browser UAT, using disposable fixtures per this repository's standing privacy discipline (no real household data, cleaned to zero afterward), walking a first-time parent through: selecting a platform, reading its instructions, connecting a first schedule, seeing success, connecting a second schedule via a different platform or the "Other calendar" fallback, and reaching This Weekend. Include at least one deliberately-broken feed to exercise the contextual failure-help path.
3. Independent confirmation that no schedule subscription URL, raw feed content, or platform-identifying data appears in analytics rows, logs, or error surfaces produced during this UAT.
4. Independent confirmation that Slice 4.6 What Fits behavior is unaffected (Section 7's non-goal), via either a targeted regression pass or an explicit rationale for why none is needed.
5. TypeScript, zero-warning Corralio lint, `git diff --check`, and all four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`).
6. `apps/corralio/notes.md` updated with the same level of factual, verifiable detail as every prior slice entry — exact counts, exact verifier sentinels, exact provider/analytics usage, exact cleanup-zero confirmation.

**No push or deployment at any stage**, consistent with every other slice in this plan.

---

## 9. Final Verdict

Use this repository's standard terminal-verdict vocabulary, substituting the correct slice identifier:

`SLICE 3.4 COMPLETE LOCALLY` / `SLICE 3.4 READY FOR [X]` / `SLICE 3.4 READY AFTER LISTED FIXES` / `SLICE 3.4 BLOCKED BY AUDIT FINDING` / `SLICE 3.4 NOT READY`

Stop at the canonical verdict. Do not push or deploy without separate, explicit authorization beyond this prompt.
