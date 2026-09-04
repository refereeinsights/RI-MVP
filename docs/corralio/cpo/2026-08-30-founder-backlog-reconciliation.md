# CPO Backlog Reconciliation — Founder Investigation List vs. Live Repository
**2026-08-30**

Reconciles the founder's raw investigation/backlog list against the live repository, canonical roadmap, ADRs, filed prompts, and existing CPO records. Classification exercise only — nothing below is build authorization. Where an item is already resolved by existing work, this points to the canonical artifact rather than re-deriving it. Where it isn't, this says so plainly rather than inventing a slice to fill out the taxonomy.

**Headline finding: most of this list is already decided or already in flight.** Of ~34 line items, roughly two-thirds trace to work already scoped, filed, or explicitly deferred this session or in the days before it. The genuinely new ground is: admin/support tooling (nothing exists), visual color customization (child color exists but is auto-assigned, not editable; team color doesn't exist at all), a consolidated cross-provider cost audit (individual providers have caps, but no single document ties them together), and three real conflicts between earlier documents that need a founder call, not more engineering (Section 7).

---

## 1. Corralio Pilot Launch Gates

Only things that actually block inviting bounded real families. Everything else is post-pilot or evidence-gated regardless of how easy it would be to build.

| Gate | Status | Owner/workstream | Evidence required to close |
|---|---|---|---|
| 3.6B Phase 1 — required arrival for household/unassigned events | Filed, not built | `corralio-slice-3.6b-required-arrival-accuracy-audit-prompt.md` | Codex Stage 1 audit + build |
| 3.6B Phase 2 — Arbiter Officials group-identity audit | Filed, not built (parallel, non-blocking to general 3.6B) | Same prompt, Section 4.1/4.2 | Does a populated feed expose a stable deterministic discriminator (Question A) |
| 3.6B Phase 3A — temporary routing origin (Home/current-location/choose-another) | Filed, not built | `corralio-slice-3.6b-phase3a-temporary-routing-origin-prompt.md` | Codex Stage 1 build |
| 3.6B Phase 3B — HotelPlanner booking → lodging → routing origin | Un-deferred 2026-08-30. Cancellation-window evidence gap closed 2026-09-03 (shipped as production behavior, not a diagnostic); status-contract vocabulary confirmation (SQL enumeration) remains optional, not blocking. Stage 1 prompt not yet written. | `corralio-hotelplanner-phase3b-evidence-diagnostic-prompt.md` (superseded — see its 2026-09-03 header) | Determine whether any evidence gap remains, then draft the actual Stage 1 prompt |
| 3.6B Phase 4 — Mapbox traffic-aware leave-by | Design accepted (provider, cost, compute-on-demand architecture), not built, depends on Phase 1 | `2026-08-28-slice-3.6b-traffic-check-model.md`, `2026-08-27-slice-3.6-notification-and-traffic-routing-audit.md` | Phase 1 ships first (arrival time must be trustworthy before traffic checks anchor on it) |
| 3.6B Phase 5 — traffic monitoring/alerts (90/60/30/15-min checkpoints) | Design accepted with 5 refinements, not built | Same traffic-check-model doc | Same dependency as Phase 4 |
| Mobile Resilience & Offline PWA — hard launch gate | Roadmap-placed, hard-gated, audit not yet run | `CORRALIO_PRODUCT_ROADMAP.md` Launch Readiness section | Audit prompt (not yet authorized — waits its turn per founder instruction) |
| Combined physical-device UAT (real iPhone + Android) | Not run | Folds in 3.6A push/tap-handoff, 3.6B routing/traffic/GPS-permission, Mobile Resilience offline/reconnect | One combined pass, per founder decision not to split it |
| ADR-031/033 pre-launch experience test (10–15 real parents) | Not run | ADR-033 | Scoped Contextual Intelligence slice + Slice 4.3 shipped first |
| Weekend Ready push production config (VAPID keys) | Not configured | Flagged explicitly in 3.6A's own closeout notes | Keys created in deployment environment; no key material exists yet |

Not on this list and deliberately excluded: schedule-source compatibility matrix, admin/support tooling, visual color customization, CSV/PDF import, SMS, email digest, cost audit, native app threshold. None of these block a small, founder-supported, bounded pilot — see Sections 2–3 for why.

---

## 2. Founder Investigation Backlog — Classified

Grouped as the founder's list grouped them. Format per item: **classification** — problem/impact — evidence pointer — next action.

### Operations / Admin

- **Admin.** AUDIT/INVESTIGATE. No admin tooling exists anywhere in `apps/corralio` (confirmed by direct search). Impact: Operations/Trust. Before pilot: no — a 10–15 family bounded pilot is small enough for the founder to support directly. Next action: none now; revisit only if pilot support load proves otherwise.
- **Admin add URL / support-assisted schedule connection.** AUDIT/INVESTIGATE. Real pain if a parent gets stuck pasting a calendar URL and support needs a safe way to help without seeing private feed contents. No mechanism exists today. Impact: Trust/Retention. Before pilot: probably not at 10–15 families, but worth a quick founder gut-check since a stuck parent in week one of a pilot is a real trust cost. Next action: none now; define only if the pilot surfaces this as a real need.

### Mobile / Client Resilience

All of these are already the Mobile Resilience & Offline PWA workstream's own stated scope — restating them here would duplicate, not add. **CLOSED/ALREADY COVERED** for: client survivability, offline/read resilience, PWA install friction (especially iPhone — the notification audit already found this is structural, not a UX nudge problem), weak-cellular/offline/reconnect, privacy/security of cached data. Pointer: `CORRALIO_PRODUCT_ROADMAP.md` Launch Readiness section, `2026-08-29-mobile-resilience-offline-pwa-roadmap-review.md`.

- **Physical iPhone/Android launch UAT.** LAUNCH GATE (see Section 1) — the combined pass.
- **Push receipt / lock-screen / tap-handoff UAT.** LAUNCH GATE, already explicitly tracked as `UNVERIFIED ON PHYSICAL DEVICE` in 3.6A's own closeout notes, folded into the combined UAT pass.
- **GPS/current-location permission UAT.** LAUNCH GATE, already Section 6 of the filed Phase 3A prompt (permission states: granted/denied/dismissed/unsupported/error), folded into the combined UAT pass.

### Family / Schedule Visual UX

- **Change a child's color.** DEFER/NO CURRENT EVIDENCE. Verified directly: `CorralioChildColor` is auto-assigned from a fixed palette at creation (`nextChildColor()`, round-robin avoiding active colors) and rendered on every event card (`ThisWeekend.tsx`) and the Family screen — but there is no edit action anywhere; only the child's *name* is editable (`RenameChildForm`). Impact: mostly cosmetic/Trust unless UAT surfaces a real scanning problem. Next action: none now — add "can a parent tell whose event this is at a glance" to the physical-device UAT checklist; only build a color-editor if that UAT actually surfaces confusion.
- **Team color coding.** DEFER/NO CURRENT EVIDENCE. Confirmed: no color field exists on teams at all — this is new schema, not a toggle. Determine whether child-level color already solves the "whose event" scanning problem before adding a second, independent color dimension (a child on two teams would need one of the two colors to win, which is its own design question).
- **Split child/team color pill.** DEFER. Downstream of both items above being decided; designing a split presentation before either color dimension's necessity is established would be building UI for a problem not yet confirmed to exist.

### HotelPlanner / Booking / Travel

All of this cluster is **CLOSED/IN PROGRESS** — extensively designed and partially evidence-gathered this session, not a fresh backlog item:

- **Booking behavior, HotelPlanner booking reconciliation, booking→lodging→routing, cancellation behavior, revenue attribution/revenue per activated family.** Founder decision 2026-08-30: Phase 3B un-deferred, launch-relevant, subordinate to Phase 3A, no payment/checkout/OTA. Design locked in `docs/reference/corralio-hotelplanner-attribution-design.md`, ADR-032, and the 2026-08-30 addendum review (`2026-08-30-hotelplanner-booking-reconciliation-lodging-routing-review.md`). Property-coordinate question resolved via code audit (capture at outbound-click time, reusing TI's already-tested `hotelPlannerProvider.ts`). **Updated 2026-09-03:** the cancellation-window evidence gap this cluster was waiting on closed — a real, authorized `getReport` cancellation-window call ran (`docs/reports/ti-hotel-monetization-reporting-2026-08-31.md`), and the production sync now ships a separate, isolated 7-day cancellation refresh using the proven textual status contract (`docs/reference/corralio-hotelplanner-attribution-design.md` Section 7, corrected same day). The filed evidence-diagnostic prompt is superseded, not to be dispatched as originally written. Next action: determine whether the optional SQL vocabulary-enumeration (Task A) is still wanted, then write Phase 3B's actual Stage 1 build prompt — not re-run the diagnostic.
- **Stay-date applicability (routing relevance during a hotel stay).** Same cluster — already designed in the addendum's Section 24 (Routing Applicability), not a separate item.

### Schedule Import

- **CSV schedule import.** POST-PILOT BACKLOG, already classified 2026-08-27: real but secondary value given ICS already covers the pilot population; the schema seam (`corralio_schedule_sources.source_type` constraint) is a one-line extension whenever actually built — not worth pre-building. Pointer: `2026-08-27-roadmap-addendum-schedule-inputs-sms.md`.
- **PDF schedule import.** DEFER (Phase 3), same doc — the only import type requiring genuinely new infrastructure (no existing extraction/AI pipeline anywhere in this codebase); deserves its own dedicated scoping pass when actually scheduled.

### Schedule-Source Ecosystem

- **Arbiter Officials multi-sport/group identity + group-specific required-arrival preferences.** CLOSED/IN PROGRESS — this is exactly 3.6B Phase 2, already filed with two real fixture findings (two structurally different real Arbiter exports inspected this session). Pointer: `corralio-slice-3.6b-required-arrival-accuracy-audit-prompt.md` Sections 4.1–4.2.
- **Required-arrival support for household/unassigned events.** CLOSED/IN PROGRESS — this is 3.6B Phase 1's Task 1 exactly. No conflict with the existing approved hierarchy (Slice 4.6: ICS explicit → team preference → 30-minute default) — Phase 1 fills the gap for events with no team at all, it doesn't change the hierarchy.
- **LeagueApps real-feed UAT, especially reschedules.** TEST FIRST — tracked, not yet run. LeagueApps is honestly `COMPATIBLE`, not `VERIFIED`; the exact parent-facing caveat already ships in the connection UI. Pointer: `apps/corralio/notes.md`, "Outstanding UAT — LeagueApps Reschedule Behavior."
- **Schedule-source compatibility/evidence matrix.** BUILD — CURRENT PATH, ready now. Prompt already filed (`corralio-schedule-source-compatibility-evidence-matrix-prompt.md`); its one prerequisite (Schedule Connection UX Unification) is confirmed `COMPLETE LOCALLY`. This can go to Codex whenever there's capacity — it doesn't touch parent-facing surface and doesn't block anything else.
- **Vendor expansion process for future documented-compatible sources.** CLOSED — the "Future Platform Addition Rule" is already an approved policy, referenced in the evidence-matrix prompt's own framing (Section 0).

### Required Arrival / Planning Intelligence

Covered above under Schedule-Source Ecosystem — Phase 1 (household/unassigned) and Phase 2 (group-specific) are the same two items, not a third bucket.

### Routing Origin / Travel

- **Home / temporary / current-location / lodging hierarchy.** CLOSED/IN PROGRESS — exactly Phase 3A (filed) + Phase 3B (un-deferred). No new scope needed.
- **Travel/timezone behavior.** CLOSED. Household `planning_timezone` already built and applied (3.6A); event/venue timezones remain separate destination truth (already an explicit, verified architectural decision — not a gap).

### Traffic / Mapbox

- **Traffic-check cadence and cost.** CLOSED at the design level — the founder's own 90/60/30/15-minute-before-standard-departure model, accepted with five refinements (short-notice events, terminal-checkpoint behavior, scheduling mechanism, recomputed cost, notify-only-on-worsening). Pointer: `2026-08-28-slice-3.6b-traffic-check-model.md`.
- **Traffic-alert materiality threshold.** CLOSED — same doc, ~5–10 minute guardrail already specified.
- **Mapbox vs. TomTom provider decision, cost, caching terms.** CLOSED — Mapbox selected (100K free/month vs. TomTom's 20K, transparent pricing, no traffic surcharge, existing account relationship in this monorepo), compute-on-demand/no-persistence architecture designed to satisfy both providers' caching terms regardless. Pointer: `2026-08-27-slice-3.6-notification-and-traffic-routing-audit.md` Sections 2, 2A, 4. **Not yet formally landed**: ADR-024 still reads "provider selection and retention remain open" — see Section 7, Conflict 1.

### Notifications

- **Weekend Ready Web Push.** CLOSED — `SLICE 3.6A COMPLETE LOCALLY` and database-verified. Remaining: physical-device receipt/lock-screen UAT (Section 1) and VAPID key provisioning (Section 1).
- **Your Weekend email.** See Section 7, Conflict 2 — two prior documents disagree on whether this is launch-required. Not resolved here; needs a founder call.
- **Email cost / Resend economics.** DEFER, downstream of the email decision above.
- **Schedule-change notification feasibility.** See Section 7, Conflict 3 — classified "launch if technically clean" by the Aug-27 notification audit, but absent from the currently locked 3.6B phase sequence with no recorded deferral. Confirmed via direct code check: no diffing logic exists in `schedules/refresh.ts` today (upsert only). Needs a founder decision, not more engineering, to resolve the ambiguity.
- **Traffic/departure notifications.** CLOSED — this is Phase 5, already covered above.
- **What Fits proactive notifications.** DEFER/NO CURRENT EVIDENCE — not started, not in the current sequence, correctly consistent with the product discipline of proving utility before adding more notification surface.

### API / Infrastructure Economics

- **API/provider audit (Mapbox, HotelPlanner, Geocodio, ORS, Overture, Web Push, Vercel, Supabase).** AUDIT/INVESTIGATE — genuine gap, but a modest one. Individual pieces already have real controls (Geocodio/ORS per-household daily caps and full audit logging via `corralio_external_api_calls`, already verified this session; Mapbox costed out in the Slice 3.6 audit). What's missing is one document that ties them together. Confirmed: no such consolidated document exists anywhere in `docs/`. Before pilot: no — at 10–15 families every provider here runs comfortably inside its free tier. Next action: schedule as an early post-pilot audit, before opening beyond the bounded pilot to a larger cohort.

### Native App Threshold

CLOSED at the policy level — ADR-027 already states it plainly: consider native only when push, device integration, widgets, or background refresh create measurable retention/utility gains that the PWA can't. No evidence exists yet either way, because push hasn't even had its physical-device UAT. DEFER — this isn't a separate audit; it's a question the combined physical-device UAT will start to answer as a byproduct (a genuinely broken PWA push/install experience on real hardware would be exactly the evidence ADR-027 asks for).

---

## 3. Post-Pilot Product Backlog

**Activation / Family UX**
- Change a child's color (pending UAT evidence of need)
- Team color coding + split color pill (pending the above)
- Manual event entry (schema already supports it — `origin_type='manual'` fully specified, only UI/action missing)

**Planning Intelligence**
- Event-level arrival override (deferred at Slice 4.6, team-level remains the only V1 personalization)
- Non-sports/"family logistics assistant" wide version (narrow version — a manual non-sports event — already works today with zero further architecture work)

**Mobile**
- Native app evaluation (ADR-027-gated, evidence-driven, not scheduled)

**Schedule-Source Coverage**
- CSV schedule import
- Schedule-source compatibility/evidence matrix (ready now, not urgent)
- External personal calendar connections (Google/Outlook/iCloud) — first-class OAuth version; informal ICS-paste version may already work today via the existing "Other calendar" tile, worth a five-minute verification, not a slice
- LeagueApps representative-feed UAT

**Travel / Revenue**
- PDF schedule import (Phase 3, dedicated scoping pass required — no existing extraction infrastructure)
- SMS notification infrastructure, leave-by SMS, travel-reminder SMS (all Phase 3, downstream of push/email proving the retention hypothesis first; A2P/10DLC carrier registration has real lead time worth starting early once this is actually scheduled)
- Entitlement/Pro model (ADR-011-gated — no entitlement infrastructure exists; do not decide pricing/tiers before usage evidence)

**Notifications**
- What Fits proactive notifications
- Email digest economics (downstream of the email decision in Section 7)

**Operations / Admin**
- Admin console / support tooling
- Consolidated API/provider cost audit

---

## 4. Updated Critical Path

No change in shape from the currently locked sequence — this reconciliation confirms it rather than revising it, with Phase 3B now explicitly named in it (it was previously deferred/absent):

```
3.6B Phase 1 (required arrival, household/unassigned)
  → Phase 2 (Arbiter identity audit, parallel/non-blocking)
  → Phase 3A (temporary routing origin)
  → Phase 3B (HotelPlanner booking → lodging → routing, un-deferred 2026-08-30)
  → Phase 4 (Mapbox traffic-aware leave-by)
  → Phase 5 (traffic monitoring/alerts)
    → Mobile Resilience & Offline PWA audit + required resilience fixes
      → One combined physical-device UAT (iPhone + Android): 3.6A push/tap-handoff,
        3.6B routing/traffic/GPS permission, Mobile Resilience offline/reconnect
        → ADR-031/033 pre-launch experience test (10–15 real parents)
          → Bounded family pilot
```

Running alongside, not gating the sequence above: the Schedule-Source Compatibility Evidence Matrix (ready now) and the API/provider cost audit (early post-pilot).

---

## 5. Founder Decisions Still Required

1. **Email channel status.** The 2026-08-27 notification audit classified email as launch-required (a structural reach argument — iOS push is inert until a parent installs to Home Screen). But 3.6A's own closeout notes record email as "deliberately deferred pending push reach/opt-in and re-entry evidence... not assigned to Slice 3.6B." These disagree. Which is current truth?
2. **Schedule-change push.** Classified "launch if technically clean" by the same Aug-27 audit, but it isn't in the locked 3.6B phase list and no deferral was ever recorded — it appears to have quietly dropped rather than been decided against. Build it as an additional phase, or explicitly defer it?
3. **ADR-024 amendment.** The Mapbox/compute-on-demand traffic-routing decision was accepted as CPO analysis but never landed in the canonical ADR file, which still reads "provider selection and retention remain open." Approve landing it, matching how ADR-030/031/032/033 were just handled?
4. **Admin/support tooling for the pilot.** Comfortable running a 10–15 family bounded pilot on founder-direct support with no dedicated tooling, or is a minimal support-assisted schedule-URL-repair capability worth having before inviting families?

---

## 6. Items Closed Because Existing Work Already Covers Them

Arbiter Officials multi-sport/group identity; group-specific required-arrival preferences; required-arrival for household/unassigned events; routing-origin hierarchy (Home/temporary/current-location/lodging); HotelPlanner booking reconciliation, lodging state, cancellation behavior, revenue attribution; traffic-check cadence, materiality threshold, and Mapbox provider selection (design level); Weekend Ready push; CSV/PDF import classification; vendor-expansion process; travel/timezone behavior; native-app threshold policy; all Mobile Resilience sub-items (client survivability, offline/read resilience, PWA install friction, GPS permission UAT, weak-cellular/reconnect, cached-data privacy). See Section 2 for the specific pointer on each.

---

## 7. Conflicts With Current Roadmap/ADRs

**Conflict 1 — ADR-024 is stale relative to an accepted decision.** ADR-024's text still says "provider selection and retention remain open" for routing infrastructure. But the Slice 3.6 notification/traffic audit already selected Mapbox over TomTom and designed a specific compute-on-demand, no-persistence architecture to satisfy both providers' caching terms — a real, accepted decision sitting outside the canonical ADR file. Recommend: amend ADR-024 the same way ADR-030–033 were just reconciled and landed, rather than let a fourth citation-drift case accumulate.

**Conflict 2 — Email's launch status disagrees across two documents.** The Aug-27 notification audit's classification table says email is "launch required." The actual recorded build decision for 3.6A (`apps/corralio/notes.md`) treats email as deliberately deferred pending evidence, explicitly not assigned to 3.6B. Recommend: the founder state which is current — most likely the later, more specific decision (defer) supersedes the earlier audit's framing, but this shouldn't be assumed silently given it changes what "launch required" means for reach.

**Conflict 3 — Schedule-change push has no recorded disposition.** Classified "launch if technically clean" in the Aug-27 audit; absent from the locked 3.6B phase list with no deferral decision on record. This is a gap, not a resolved question — recommend closing it explicitly one way or the other rather than letting it stay ambiguous.

No other conflicts found. Everything else in the founder's list either matches an existing decision exactly or was genuinely undecided before this reconciliation (Sections 2–3 cover those honestly as gaps, not disguised conflicts).
