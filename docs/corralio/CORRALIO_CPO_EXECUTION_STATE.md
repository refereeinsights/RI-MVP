# Corralio CPO Execution State

**Status:** Operational snapshot, not a strategic document.
**As of:** 2026-09-03 (five open founder decisions resolved — email, schedule-change push, ADR-024, admin/support tooling, TI planning-handoff doc status; Phase A+B Stage 1 production database verification and calendar-feed decision recorded; Gate 3 PASS committed and confirmed earlier the same day; everything else reconciled through 2026-09-02)
**Companion document:** `CORRALIO_FOUNDER_MENTOR_HANDOFF.md` (Part II) carries the full narrative/architecture context behind every line item here. This document exists to answer, quickly: what's done, what's next, what's blocked, and on what evidence.

**How to use this in a fresh session:** read this document's NEXT 5 ACTIONS first. Read the handoff's Part II only for the "why" behind an item, or when an item here references a design/decision by name.

Every current-status claim below was reconciled against the live repository, git history, and `apps/corralio/notes.md` through commit `b06daada` (2026-09-03) — not carried forward from chat memory. Commit hashes are real, from this repository's `main` branch. Nothing in this document authorizes a push or deployment.

---

## COMPLETE

Core planning loop (household → children/teams → schedules → This Weekend → conflicts → leave-by → location/venue foundation → What Fits): Slices 3.1 through 4.6, complete locally, Aug 17–26, 2026. Not re-verified line-by-line in this pass (unchanged since the last full audit); flag if evidence suggests otherwise.

| Item | Commit(s) | Notes |
|---|---|---|
| **Phase A+B Gate 3 — isolated Auth/runtime chain, end to end** | `b06daada` ("Verify Gate 3 isolated auth runtime") | **Committed and independently reviewed.** Full chain: Turnstile → Corralio authorization → one-use permit → signed Supabase hook → durable authorization → one segment reserved → one mock invocation → Supabase HTTP `202`. Closeout filed at `docs/corralio/cpo/2026-09-02-cpo-report-gate3-isolated-auth-runtime-verification.md`; its narrative, chain diagram, and exact accounting match the chat-reported result verbatim. Root cause of every prior blocker was the hook response contract, not the durable-safety design: Supabase's Send SMS Hook requires HTTP `200`, `application/json`, body `{}` — the documented "empty 200 is sufficient" claim does not match Supabase's actual current behavior (it JSON-decodes the response). Four `signInWithOtp()` calls used of a five-call budget (signature mismatch → missing content-type → empty-body `unexpected_failure` → success), one intervening request correctly rate-limited pre-Auth and not counted. `DATABASE CLEANUP ZERO`, durable policy restored exactly, disposable Auth identity removed, hook deleted, CAPTCHA/Phone Auth disabled, temporary Vercel secrets removed, isolated endpoints fail closed (`404`). Verification: 24 focused tests, TypeScript, zero-warning lint, production build, `git diff --check`. **This clears the "do not begin Phase A+B implementation until full Gate 3 passes" condition** (see NEXT 5 ACTIONS below) — it does **not** clear Section 9 (SMS Production Readiness: A2P/10DLC, consent model, spend caps, STOP/START/HELP, carrier approval), which remains a fully separate, later, explicitly-founder-signed-off gate. |
| Slice 3.7 — Arbiter/ArbiterLive schedule sources | `4d3008b8`, `0d5c6cac`, `5e8c652c` | Complete locally. Populated-feed lifecycle UAT (decline/reassignment/cancellation) explicitly outstanding — see PHYSICAL/TEST-FIRST gates below. |
| Schedule Connection UX Unification | `99d83fd8`, `c48db691` | Complete locally. Seven-key catalog, LeagueApps added, caveat copy shipped. |
| Household timezone foundation | `c25f22c6`, `8efcfc82`, `f58dbfce`, `e50ac010` | `planning_timezone` on `corralio_households`, nullable, no backfill, owner-scoped RPC validation against Postgres tz data. |
| Slice 3.6A — Weekend Ready Web Push | `b0495553` (feat), `e6945ca8` (DB verification close) | **SLICE 3.6A COMPLETE LOCALLY** + database-verified. Generic "Your weekend is ready" push only — no schedule/event/location content. Thursday 4:37 PM household-local, bounded 15-min cadence workers. See DEPLOYMENT and PHYSICAL-DEVICE gates below for what's still outstanding. |
| Slice 3.6B Phase 1 — Required-Arrival Accuracy | `8db597a2` (implementation), `03296bd2` (verifier repair), `34d83cf4` (database/UAT closeout) | **SLICE 3.6B PHASE 1 COMPLETE LOCALLY**. Dependency satisfied by `34d83cf4`: catalog + rollback-only behavioral verification passed, bounded signed-in UAT passed, and cleanup zero was independently confirmed. The one shared resolver is now repository fact: `ics_explicit → source_preference → team_preference → corralio_default`. What Fits and This Weekend/Leave-by consume it identically. Source preference uses the existing nullable bounded column and narrow owner-authorized writer; downstream work must reuse both and must not add another arrival schema, preference tier, or resolution path. Arbiter Phase 2 remains separately inconclusive/non-blocking. |
| RI Travel MVP (referee travel hotel search) | `a4256590` | `apps/referee` — hotel search UI, `travelContracts.ts`. Not a Corralio feature; relevant as the TI/RI-side HotelPlanner precedent Corralio's Phase 3B design reuses. |
| Vercel cron-cost reduction | `2ce13572`, `d5755c26` | Reduced `ti-web` cron frequency; removed a redundant static-map cron. |
| ADR-030–033 landed in canonical ADR file | `5afb3181` | Mapbox/venue reuse, founder/product gate redefinition, HotelPlanner site provisioning, launch-gate-as-experience-test. |
| Mobile Resilience & Offline PWA added to roadmap as hard launch gate | `154f88ef`, `83f772e9` | Roadmap placement only — audit prompt not yet authorized. |
| HotelPlanner attribution/reconciliation design locked | `3054d53a` | `docs/reference/corralio-hotelplanner-attribution-design.md`. Design only, nothing built. Contains one known bug pending correction — see TEST FIRST. |
| Founder backlog reconciliation | `c525b2dd` | `docs/corralio/cpo/2026-08-30-founder-backlog-reconciliation.md`. |
| Portfolio API Economics — Stage 1 + Stage 2 discovery/decision packets | `ac202d8c`, `f89f2c30`, `f38c1838`, `10508533` | Read-only measurement/decision work across the whole API portfolio; register at `docs/reports/portfolio-api-economics-register-stage2-2026-09-02.xlsx`. Not Corralio-specific but includes the Corralio Geocodio/OpenRouteService and `corralio_external_api_calls` findings. |
| WeatherAPI.com migration decision recorded; 7-phase migration prompt filed | `ba105238`, `52153abb` | Founder decided to swap Open-Meteo → WeatherAPI.com (verified live: commercial use permitted on free tier, resolving the licensing ambiguity that made Open-Meteo an audit item). Register updated (Open-Meteo → SWAP/RETIRE). Migration prompt at `docs/prompts/2026-09-02-weatherapi-migration-implementation-prompt.md`, revised once per founder correction (measure-before-caching, one shared client across products, explicit STOP before production deploy). **Not yet executed** — this is a filed, accepted design, not a build in progress. |
| ADR-024 amended — Mapbox / compute-on-demand routing decision canonicalized | `bc364705` | Founder decision, 2026-09-03. Documentation reconciliation only: ADR-024 no longer reads "provider selection and retention remain open" — records Mapbox as provider and compute-on-demand/never-persisted as architecture, both already-accepted CPO decisions (Handoff §II.13). No code/behavior change. |

## IN PROGRESS

- **Phase A+B — Phone-First Channel Identity & Deterministic Schedule Intake:** Stage 1 repository work is implemented, and production database verification is complete. Catalog, rollback-only behavioral, and real concurrent RPC verification all passed with cleanup zero; see `docs/corralio/cpo/2026-09-03-cpo-report-phase-ab-stage1.md`. Product flags remain unset and live SMS/provider readiness is not implied. The next gate is separately authorized bounded Stage 2 configuration/UAT.
- **Founder decision — Cloudflare Turnstile (2026-08-31):** approved CAPTCHA provider for Corralio Stage 1 phone authentication. Not sufficient by itself for production SMS authorization; SMS Production Readiness (Section 9) remains fully separate and unaffected by Gate 3's result.
- **10DLC compliance surface:** Sole Proprietor classification confirmed; submission packet drafted, not submitted anywhere on record. Gate 3 passing does not change 10DLC status.
- **HotelPlanner Phase 3B evidence diagnostic filed** (`6fd64ffb`) — read-only, not yet run.
- **HotelPlanner addendum reconciliation review** (`07279763`) — correction to attribution design doc Section 7 queued pending the diagnostic above.
- **WeatherAPI.com migration prompt filed, not executed** — see COMPLETE table row above. Ready to dispatch to engineering whenever the founder wants it sequenced in; explicitly not urgent relative to Phase A+B/CALNAME.
- **Private Corralio calendar feed — Phase 1 approved as TEST NEXT (2026-09-03), Phase 2/3 explicitly not authorized.** Investigation at `docs/corralio/cpo/2026-09-03-cpo-investigation-corralio-calendar-feed-travel-lifecycle.md`; founder decision at `docs/corralio/cpo/2026-09-03-founder-decision-calendar-feed-phase1-test-next.md`. Key findings: TI (`apps/ti-web/lib/planner/calendarFeeds.ts`) already has a complete, production RFC 5545 serializer + token lifecycle, portable to Corralio, correcting a prior misremembering that it was only a loose pattern. Corralio has zero tournament concept and zero HotelPlanner/lodging-state implementation today, so hotel-reservation-state feed updates (Phase 3) can't be scheduled independently of the still-unrun HotelPlanner Phase 3B evidence diagnostic. Founder-approved scope: one household feed, imported events only, minimal child identity, reduced venue, no leave-by/conflicts/hotel status/planning reminders/notes/home address/promotional content — with an explicit decision gate to be set before any code is written (10–15 activated multi-schedule households, evidence of persistent fetches weeks out, compared against differentiated-planning engagement in a matched non-subscribed cohort; stop rather than proceed to Phase 2 if that engagement collapses). A Phase-1-only implementation prompt is approved to be **written**, but stays queued behind the items in READY TO EXECUTE below — not dispatched yet. Promotional/advertising calendar content is a flat KILL.

## READY TO EXECUTE (prompts filed, fully specified)

1. **Phase A+B bounded Stage 2 configuration/UAT** — `docs/prompts/corralio-phase-a-b-stage-2-bounded-configuration-uat-prompt.md`. Stage 1 and its production database gate are complete. Proceed only under separate founder authorization; database verification does not authorize Telnyx, live SMS/OTP, product flags, deployment, or push.
2. **ICS Calendar-Level Metadata Preservation (micro-slice)** — `docs/prompts/corralio-ics-calendar-metadata-preservation-micro-slice-prompt.md`. Founder-accepted, Do Now (2026-08-31). Still not dispatched/run as of 2026-09-03 (confirmed via direct grep: zero `X-WR-CALNAME`/`CALNAME` references in `packages/lib/sports-schedule/index.ts`). Zero dependency on Gate 3 or anything else — the other fully idle, ready-to-run item, alongside Phase A+B.
3. **3.6B Phase 3A — Temporary Routing Origin** — `docs/prompts/corralio-slice-3.6b-phase3a-temporary-routing-origin-prompt.md`. Phase 1 dependency satisfied by `34d83cf4`.
4. **Schedule-Source Compatibility & Evidence Matrix** — `docs/prompts/corralio-schedule-source-compatibility-evidence-matrix-prompt.md`. Non-blocking, can run anytime.
5. **WeatherAPI.com migration implementation prompt** — `docs/prompts/2026-09-02-weatherapi-migration-implementation-prompt.md`. Founder-accepted 7-phase sequence with an explicit STOP before production deploy. No dependency on Gate 3/Phase A+B; can run in parallel.

## DATABASE / DEPLOYMENT GATES

- ~~Phase A+B Gate 3 — corrected-config Auth call awaits separate authorization~~ **PASSED and committed, `b06daada`** — see COMPLETE table above.
- **Phase A+B Stage 1 database gate PASSED, 2026-09-03** — production migration applied; catalog and rollback-only behavioral verifiers passed; both real concurrency races passed; final synthetic Auth/household/pending/claim fixture counts were zero.
- `CORRALIO_VAPID_PUBLIC_KEY` / `CORRALIO_VAPID_PRIVATE_KEY` — still not configured in any deployment environment.
- All migrations to date applied to a human-controlled dev/verification environment only. Repository remains unpushed to `origin` per standing instruction.

## PHYSICAL-DEVICE GATES (unchanged)

Real iPhone/Android push receipt; iOS Home Screen install friction; GPS/current-location real-device behavior (Phase 3A, once built); weak-cellular/offline/reconnect behavior (Mobile Resilience, once built). Founder decision on record: one combined physical-device UAT pass covers all of these, not one per workstream.

## DEFERRED (unchanged)

See `docs/corralio/cpo/2026-08-30-founder-backlog-reconciliation.md` for the full list and rationale.

## OPEN — REQUIRES A FOUNDER DECISION, NOT MORE ENGINEERING (as of 2026-09-03)

- **HotelPlanner status-contract bug** (documentation-only, closes with the Phase 3B evidence diagnostic — see READY TO EXECUTE #3).
- **`CORRALIO_TI_PLANNING_HANDOFF.md` disposition** — new finding, 2026-09-03. The document (146 lines, substantive TI↔Corralio handoff policy, last reviewed 2026-08-18) was found only in a dangling, non-mainline commit (`af4d6ea6`) and has been recovered/committed locally (`c4580fe2`) to prevent loss to `git gc`. Not yet resolved: is this restored document the authoritative source going forward, or should it be marked superseded and merged into ADR-013 + `CORRALIO_SECURITY_PRIVACY.md`'s "TI to Corralio handoff" section, which currently carry only condensed fragments of the same policy? Recommend a quick Codex sanity-check on the git-history finding itself before finalizing.

Resolved 2026-09-03 (see FOUNDER DECISIONS RECORDED below): email channel status, schedule-change push, ADR-024 amendment, admin/support tooling for the pilot.

---

## FOUNDER DECISIONS RECORDED, 2026-09-03 — pilot scope narrowed, not expanded

Rod worked through all five open Founder Decisions in one pass. Net effect: these decisions **reduce** pilot launch scope rather than add to it — no new engineering was authorized by any of the five.

1. **Email channel — DEFER for pilot.** Phase A+B SMS is explicitly solving the no-installed-client reach problem; building email before observing SMS reach data would add an unvalidated channel. Resolves the 3.6A-vs-audit documentation contradiction in favor of SMS-first. Revisit after initial SMS/pilot reach data. No email-vendor build authorized.
2. **Schedule-change push — DEFER, explicitly recorded (not a silent drop).** Change detection isn't free (diff semantics, notification policy, false-positive risk, another delivery surface); Phase A+B activation is the closer proof point. ICS refresh can update the plan without proactively notifying the parent for the pilot. Revisit after recurring usage shows which changes parents actually care about.
3. **ADR-024 — AMENDED.** Documentation reconciliation, not a new decision — see COMPLETE table (`bc364705`).
4. **Pilot admin/support tooling — FOUNDER-DIRECT SUPPORT.** No admin product at 10–15 families; track support interventions and reasons (see READY-TO-EXECUTE-adjacent pilot-ops tracking in Todoist). Build a narrow tool only from observed recurring cases.
5. **`CORRALIO_TI_PLANNING_HANDOFF.md` — reference under repair, not yet closed.** See OPEN section above; this one surfaced a real finding (recovered content, not just a stale pointer) and needs one more pass before it's fully resolved.

Not pilot blockers, by these decisions: email, schedule-change push, admin tooling. Documentation cleanup: ADR-024 (done) + the handoff-doc reference (in progress). This keeps the sequencing discipline: prove the core loop with 10–15 families before adding more ways to notify them or more tooling to operate it — let the pilot expose those needs rather than predicting them.

Full record: Todoist "Corralio — CPO" project, 🚨 Founder Decisions section (four completed tasks + one still open).

---

## NEXT 5 ACTIONS

1. **Review and authorize bounded Phase A+B Stage 2 configuration/UAT** — Stage 1 and production database verification are complete; keep Telnyx/live SMS and deployment behind their independent gates.
2. **Send the filed ICS Calendar-Level Metadata Preservation micro-slice** (`docs/prompts/corralio-ics-calendar-metadata-preservation-micro-slice-prompt.md`) — still idle, zero dependency, Do Now since 8/31. This and #1 are the two items the founder asked about directly on 2026-09-03 ("what is next here?").
3. **Run the filed HotelPlanner Phase 3B evidence diagnostic in parallel** — independent of the above.
4. **Proceed with the filed Phase 3A prompt when selected** (temporary routing origin) — Phase 1 dependency satisfied.
5. **Sequence the WeatherAPI.com migration prompt in whenever convenient** — filed and accepted, no dependency on the above, not time-sensitive.

---

## CPO VERIFICATION NOTE, 2026-09-03

A Gate 3 `PASS` result was reported via chat (Turnstile → authorization → permit → signed hook → durable authorization → one segment → one mock invocation → Supabase `202`; root cause was Supabase's Send SMS Hook requiring `HTTP 200 / application/json / {}`, not an empty 200 as documentation implies). This session verified it in two passes:

**Pass 1 (uncommitted-diff check):** with the diagnostic diff still uncommitted and a live `.git/index.lock` indicating concurrent git activity, CPO checked the working-tree diff for internal consistency with the reported narrative (found consistent — a new `hook_secret_unavailable` pre-authorization category, stricter webhook-secret validation, and test fixtures matching the four-call sequence) and grepped for leaked secrets (found none — only a synthetic `WEBHOOK_KEY` test-fixture placeholder). CPO deliberately did not commit the five diagnostic files or edit this document's repository copy while that concurrent activity was in progress.

**Pass 2 (post-commit confirmation, this pass):** the working tree is now clean — `git status --short` returns nothing, and the five files plus `apps/corralio/notes.md` and a new closeout report were committed as `b06daada` ("Verify Gate 3 isolated auth runtime") by the Gate 3 driver. CPO independently reviewed:

- **The commit diff** — same shape as the Pass-1 review, now with `apps/corralio/notes.md` updated in place (a new 2026-09-02 entry reading "Gate 3 isolated Auth/runtime path verified end to end with mock provider") and a new closeout report filed at `docs/corralio/cpo/2026-09-02-cpo-report-gate3-isolated-auth-runtime-verification.md`.
- **The closeout report itself** — its chain diagram, four-call evidence-backed-correction narrative, exact accounting table (4 of 5 `signInWithOtp()` calls, 4 hook deliveries, 3 segment reservations, 3 mock invocations, 0 Telnyx/handset), cleanup/restoration list, and the hook-secret-in-browser-automation-output flag all match the chat-reported result **verbatim**, not just consistently. This is strong corroboration — an independently filed repository artifact agreeing point-for-point with the chat narrative.
- **Secret hygiene in the commit** — re-grepped the full commit diff for secret-shaped strings; found only the same synthetic `WEBHOOK_KEY` test constant. No real credential value appears anywhere in the commit.

**What this session still cannot verify:** the live Supabase/Vercel/Cloudflare API calls themselves (no network egress from this session), and whether the browser-automation tool's own session output — where the report says a temporary hook secret briefly appeared during cleanup — is retained anywhere reachable outside this repository. The reported mitigation (deleting the hook and its paired Vercel secret, which invalidates that credential immediately) is the correct response to that specific exposure; confirming the tool session itself doesn't retain the output is the one item still worth the founder's direct attention, and it's outside what a repository-only check can ever see.

**Net:** Gate 3 PASS is now committed, independently corroborated by a separately-filed closeout report that agrees with the chat report point-for-point, and clean of any leaked secret in the repository. Treat it as fact going forward, with the one disclosed exception above.
