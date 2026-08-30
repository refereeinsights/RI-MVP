# Corralio CPO Execution State

**Status:** Operational snapshot, not a strategic document.
**As of:** 2026-08-30
**Companion document:** `CORRALIO_FOUNDER_MENTOR_HANDOFF.md` (Part II) carries the full narrative/architecture context behind every line item here. This document exists to answer, quickly: what's done, what's next, what's blocked, and on what evidence.

**How to use this in a fresh session:** read this document's NEXT 5 ACTIONS first. Read the handoff's Part II only for the "why" behind an item, or when an item here references a design/decision by name.

Every claim below was verified directly against the live repository, git history, and `apps/corralio/notes.md` on 2026-08-30 — not carried forward from chat memory. Commit hashes are real, from this repository's `main` branch, unpushed beyond origin as of this writing (`git status`: 6 commits ahead of `origin/main`, none pushed).

---

## COMPLETE

Core planning loop (household → children/teams → schedules → This Weekend → conflicts → leave-by → location/venue foundation → What Fits): Slices 3.1 through 4.6, complete locally, Aug 17–26, 2026. Not re-verified line-by-line in this pass (unchanged since the last full audit); flag if evidence suggests otherwise.

| Item | Commit(s) | Notes |
|---|---|---|
| Slice 3.7 — Arbiter/ArbiterLive schedule sources | `4d3008b8`, `0d5c6cac`, `5e8c652c` | Complete locally. Populated-feed lifecycle UAT (decline/reassignment/cancellation) explicitly outstanding — see PHYSICAL/TEST-FIRST gates below. |
| Schedule Connection UX Unification | `99d83fd8`, `c48db691` | Complete locally. Seven-key catalog, LeagueApps added, caveat copy shipped. |
| Household timezone foundation | `c25f22c6`, `8efcfc82`, `f58dbfce`, `e50ac010` | `planning_timezone` on `corralio_households`, nullable, no backfill, owner-scoped RPC validation against Postgres tz data. |
| Slice 3.6A — Weekend Ready Web Push | `b0495553` (feat), `e6945ca8` (DB verification close) | **SLICE 3.6A COMPLETE LOCALLY** + database-verified. Generic "Your weekend is ready" push only — no schedule/event/location content. Thursday 4:37 PM household-local, bounded 15-min cadence workers. See DEPLOYMENT and PHYSICAL-DEVICE gates below for what's still outstanding. |
| RI Travel MVP (referee travel hotel search) | `a4256590` | `apps/referee` — hotel search UI, `travelContracts.ts`. Not a Corralio feature; relevant as the TI/RI-side HotelPlanner precedent Corralio's Phase 3B design reuses. |
| Vercel cron-cost reduction | `2ce13572`, `d5755c26` | Reduced `ti-web` cron frequency; removed a redundant static-map cron. |
| ADR-030–033 landed in canonical ADR file | `5afb3181` | Mapbox/venue reuse, founder/product gate redefinition, HotelPlanner site provisioning, launch-gate-as-experience-test. |
| Mobile Resilience & Offline PWA added to roadmap as hard launch gate | `154f88ef`, `83f772e9` | Roadmap placement only — audit prompt not yet authorized. |
| HotelPlanner attribution/reconciliation design locked | `3054d53a` | `docs/reference/corralio-hotelplanner-attribution-design.md`. Design only, nothing built. Contains one known bug pending correction — see TEST FIRST. |
| Founder backlog reconciliation | `c525b2dd` | `docs/corralio/cpo/2026-08-30-founder-backlog-reconciliation.md`. |

## IN PROGRESS

- **HotelPlanner Phase 3B evidence diagnostic filed** (`6fd64ffb`) — `docs/prompts/corralio-hotelplanner-phase3b-evidence-diagnostic-prompt.md`. Read-only: Task A (SQL enumeration of real `ti_hotel_bookings.status` values), Task B (one live `getReport` call with `cancelledDateStart/End` + `includeCancelled`). **Not yet run.** Closes 2 of the founder's 4 required evidence items before Phase 3B's Stage 1 build prompt can be written.
- **HotelPlanner addendum reconciliation review** (`07279763`) — flagged that the locked attribution design's reconciliation rule (`status === 1`, numeric, from `getClientSummary`) does not apply to `getReport`, whose `Status` field is textual. Correction to `docs/reference/corralio-hotelplanner-attribution-design.md` Section 7 is queued pending the diagnostic above, not yet applied.

## READY TO EXECUTE (prompts filed, fully specified, not yet sent to Codex)

1. **3.6B Stage 1 — Required-Arrival Accuracy & Arbiter Group-Identity Audit** — `docs/prompts/corralio-slice-3.6b-required-arrival-accuracy-audit-prompt.md`. First item in the critical path; unblocks the Mapbox traffic-check model (Phase 4/5) and is a roadmap prerequisite for Phase 3A.
2. **3.6B Phase 3A — Temporary Routing Origin** — `docs/prompts/corralio-slice-3.6b-phase3a-temporary-routing-origin-prompt.md`. Home / current-location / choose-another-location. No hotel/trip data model. Roadmap places this after Stage 1.
3. **Schedule-Source Compatibility & Evidence Matrix** — `docs/prompts/corralio-schedule-source-compatibility-evidence-matrix-prompt.md`. Prerequisite (UX Unification) satisfied. Non-blocking — internal data-model slice, no parent-facing surface, can run anytime alongside anything else.

## TEST FIRST (evidence required before a build prompt can even be written)

- **Phase 3B HotelPlanner build prompt** — blocked on the evidence diagnostic above returning (status-contract enumeration + cancellation-window query-shape confirmation). Property-coordinate capture is already resolved (capture at outbound-click time via `hotelPlannerProvider.ts` — no diagnostic needed).
- **Phase 4/5 Mapbox traffic-aware leave-by + monitoring/alerts** — design accepted (`2026-08-28-slice-3.6b-traffic-check-model.md`: 90/60/30/15-minute checkpoints before standard departure, 5 founder-accepted refinements). Blocked on: (a) Phase 1 shipping first (the model needs a trustworthy `required_arrival` input), (b) a Stage 1 audit of the scheduling mechanism (reuse the periodic-worker-polling pattern, not a new per-event timer primitive), (c) re-running the Mapbox cost estimate against the actual 4-calls-per-event cadence rather than the rougher Slice 3.6 estimate.
- **Mobile Resilience & Offline PWA audit prompt** — not yet authorized. Founder instruction: write it once 3.6B core planning (Phase 1, 2, 3A, 4, 5 — excluding Phase 3B) is done, not before.
- **LeagueApps reschedule UAT** and **Arbiter Officials populated-feed lifecycle UAT** — both tracked as "Outstanding UAT" in `apps/corralio/notes.md`; need a representative real feed, not more engineering.

## DATABASE / DEPLOYMENT GATES

- `CORRALIO_VAPID_PUBLIC_KEY` / `CORRALIO_VAPID_PRIVATE_KEY` — **not configured** in any deployment environment. Required before Weekend Ready push can go live anywhere. No key material exists yet, per `apps/corralio/notes.md` (2026-08-28).
- All migrations to date have been applied to a human-controlled dev/verification environment only. Nothing has been pushed to `origin` or deployed to production this session or in the reconciled history above — repository is 6 commits ahead of `origin/main`, unpushed, per explicit standing instruction.

## PHYSICAL-DEVICE GATES (all explicitly `UNVERIFIED ON PHYSICAL DEVICE` in the source notes)

- Real iPhone/Android push receipt, lock-screen presentation, background reliability, notification-tap handoff (3.6A).
- iOS Home Screen install friction (structural: iOS push is inert until installed).
- GPS/current-location permission real-device behavior (Phase 3A, once built).
- Weak-cellular/offline/reconnect real-device behavior (Mobile Resilience, once built).
- **Founder decision on record:** one combined physical-device UAT pass covers all of the above (3.6A + 3.6B + Mobile Resilience), not a separate pass per workstream.

## DEFERRED (post-pilot backlog — no current evidence, or explicitly gated on evidence that doesn't exist yet)

Child color editing; team color coding; split color pill; manual event entry (schema-ready, no UI); event-level arrival override; non-sports "family logistics assistant" wide version; native app evaluation (ADR-027-gated); CSV schedule import; external personal-calendar OAuth (Google/Outlook/iCloud); PDF schedule import (needs new extraction infra — none exists); SMS infrastructure + entitlement/Pro model (ADR-011-gated, no billing infra exists anywhere in `apps/corralio`); What Fits proactive notifications; email digest economics (downstream of the email decision below); admin/support console; consolidated cross-provider API cost audit. Full detail and rationale per item: `docs/corralio/cpo/2026-08-30-founder-backlog-reconciliation.md`.

## OPEN — REQUIRES A FOUNDER DECISION, NOT MORE ENGINEERING

1. **Email channel status** — the 2026-08-27 notification audit calls email launch-required (structural reach argument: iOS push is inert pre-install). 3.6A's actual closeout notes call it "deliberately deferred... not assigned to Slice 3.6B." These disagree and neither has been reconciled.
2. **Schedule-change push** — classified "launch if technically clean" by the same audit, absent from the locked 3.6B phase sequence with no recorded deferral. No diffing/change-detection logic exists in `schedules/refresh.ts` today (confirmed via direct grep — upsert only).
3. **ADR-024 amendment** — the Mapbox/compute-on-demand traffic-routing architecture was accepted as CPO analysis (2026-08-27) but never landed in the canonical ADR file; ADR-024 still reads "provider selection and retention remain open."
4. **Admin/support tooling for the pilot** — is founder-direct support sufficient for a 10–15 family bounded pilot, or is a minimal support-assisted schedule-URL-repair capability worth building first? No admin tooling exists anywhere in the repository today.
5. **HotelPlanner status-contract bug** — the locked attribution design's reconciliation rule is written against `getClientSummary`'s numeric `status` field; the addendum correctly selected `getReport`, whose `Status` field is textual. The design doc has not yet been corrected. This is a documentation defect, not a founder decision, but it's real and open — will close once the evidence diagnostic (IN PROGRESS, above) returns.
6. **Email/SMS-first pre-account onboarding** — founder proposal (2026-08-30) to accept schedules before an account exists, evaluated in `docs/corralio/cpo/2026-08-30-cpo-strategy-email-sms-first-onboarding.md`. Recommendation: run a manual/concierge test of the pre-account hypothesis before building any automated claim pipeline; treat post-account ICS-only email forwarding as a separate, much cheaper TEST FIRST candidate. Neither is authorized to build yet — awaiting founder response to the review's verdict.

---

## NEXT 5 ACTIONS

1. **Send the filed 3.6B Stage 1 prompt to Codex** (required-arrival accuracy + Arbiter group-identity audit). This is the critical-path prerequisite for Phase 3A's roadmap sequencing and for the Mapbox traffic-check model.
2. **Run the filed HotelPlanner Phase 3B evidence diagnostic** (read-only SQL enumeration + one live `getReport` cancellation-window call). Independent of #1 — can run in parallel. Closes 2 of the founder's 4 required Phase 3B evidence gaps.
3. **Get the founder's decision on the three open conflicts and the admin-tooling question** (Section "OPEN" above / Section 7 of the backlog reconciliation doc). None require engineering; all currently block downstream clarity, not downstream code.
4. **Once #1 clears:** send the filed Phase 3A prompt (temporary routing origin) to Codex.
5. **Once the diagnostic (#2) returns:** correct the attribution design doc's status-contract section and write Phase 3B's Stage 1 build prompt. **Once Phase 1 ships:** write the Phase 4/5 Mapbox traffic-aware leave-by build prompt using the accepted checkpoint model plus its five refinements.
