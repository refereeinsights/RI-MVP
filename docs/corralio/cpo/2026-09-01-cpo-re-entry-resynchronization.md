# Corralio CPO Re-Entry — Resynchronization From Repository Truth

**Date:** 2026-09-01
**Mode:** Reconciliation only. No code modified. No canonical document modified. Nothing pushed or deployed.
**Prior known state:** commit `384e18cb` (session's last direct knowledge before external Codex/Founder-Mentor work proceeded independently).
**Verified current state:** commit `e5053302` (HEAD), plus 6 uncommitted working-tree changes and ~18 untracked new files, all inspected directly.
**Method:** Every claim below is either read directly from the repository (git log, git diff, git show, file contents) or explicitly marked as CPO inference/opinion. Nothing here is carried forward from the stale mirror I was working from before this reconciliation.

---

## 1. Current State

Corralio is a pre-launch, mobile-first PWA for youth-sports family scheduling, still pre-revenue, running in a monorepo alongside TournamentInsights (`ti-web`) and RefereeInsights (`referee`). Slice 3.6B Phase 1 (required-arrival resolution) is **complete and shipped locally** at `34d83cf4`, giving the product an authoritative arrival hierarchy (`ics_explicit → source_preference → team_preference → corralio_default`) that all downstream planning work now consumes rather than re-derives.

The most significant discovery this reconciliation surfaces is that **a full canonical product roadmap now exists** — `docs/corralio/CORRALIO_PRODUCT_ROADMAP.md` (new, committed in `f67115c0`) — that I had never read before this session. It is coherent with everything I have separately reasoned about this product (evidence-gated tournament/travel work, Pro deferred pending usage evidence, launch defined as an experience test rather than a feature checklist) and introduces two new accepted architecture decisions I had not previously seen: **ADR-032** (Corralio gets its own independent, non-tournament-keyed HotelPlanner sites and attribution, provisioned ahead of launch but not authorizing any hotel-commerce build) and **ADR-033** (the launch gate is redefined from a fixed V1 feature list to a contextual-intelligence experience test — venue matching, Nearby, travel classification, and a HotelPlanner handoff now ship as a narrow slice *before* launch, justified by a moderated pre-launch parent test rather than post-launch data; ADR-031's evidence discipline is amended, not repealed, for everything beyond that narrow slice).

Separately, **substantial SMS/phone-auth prerequisite engineering has happened** (Gate 3 durable safety-state design, a Telnyx provider-contract sub-spike, 10DLC legal/compliance surfaces) but **zero SMS product implementation has begun** — no phone-auth UI, no webhook handler, no pending-intake table. This is heavily gated infrastructure-and-evidence work, not feature work, and it has not moved the product past where I last knew it on the actual SMS/phone-auth build. See Section 5.

Two commits at the very tip of history (`8f5ce53b`, `e5053302`) touch **TournamentInsights/RefereeInsights HotelPlanner revenue reporting**, not Corralio. I note them for completeness but they are outside this reconciliation's product (they're a sibling product in the same repo) and I have not audited them.

## 2. Changes Since Prior CPO State (classified)

**VERIFIED IMPLEMENTATION** (I confirmed these directly against code/tests, not just documentation claiming them):

- Slice 3.6B Phase 1 required-arrival resolver is real and shipped (`34d83cf4`, `03296bd2`, `8db597a2`). Verified via `git show --stat` on all three commits.
- Public `/privacy`, `/terms`, `/sms` routes and a site-wide "Corralio is a service of CO Services" footer exist in the working tree (`apps/corralio/app/privacy/`, `/terms/`, `/sms/`, `SmsOptInDisclosure.tsx`) — **uncommitted**, untracked in git. The `/sms` route is fail-closed behind `CORRALIO_SMS_OPT_IN_ENABLED`, which is not set anywhere I can find, so it currently shows no phone number and no SMS CTA.
- A durable SMS send-safety schema exists as an **unapplied** migration (`supabase/migrations/20260831_corralio_sms_durable_safety_state.sql`, untracked) — I read it directly: four tables (test policy, allowlist, rate-limit state, one-use send permits) with hard-coded test-only limits (20 segments/day global, 5/destination/day, 1/message) baked in as CHECK constraints, not application logic. It has never been applied to any database — this is source only.
- The `X-WR-CALNAME` preservation micro-slice I filed (`a41a70b6`) has **not** been implemented — I grepped `packages/lib/sports-schedule/index.ts` directly and there is no `calendarName` or `WR-CALNAME` reference. It remains queued, not started.
- `git status` confirms the repository is still unpushed to `origin` and nothing has been deployed — no exception to this exists anywhere in what I reviewed.

**FOUNDER DECISION** (explicitly recorded as such in the repository, and per your Re-Entry instruction I am accepting these without reopening them):

- Cloudflare Turnstile is the approved CAPTCHA provider for Stage 1 phone auth. This appears consistently across `CORRALIO_CPO_EXECUTION_STATE.md` (currently uncommitted), the Phase A+B prompt (uncommitted diff), and `apps/corralio/notes.md`, each time with the same scope limitation attached: *provider selection only, does not authorize configuration, deployment, or SMS.* I note for transparency that this attribution does **not** appear in `CORRALIO_FOUNDER_MENTOR_HANDOFF.md`'s decision log (II.22–II.25) — it was recorded directly into execution-state/engineering notes rather than through the handoff doc. Per your explicit instruction not to reopen Turnstile absent evidence it was mis-recorded, and since the attribution is consistent and repeated rather than a single unverified assertion, I am treating it as settled. I flag the handoff-doc gap only as a documentation-currency item (Section 3), not as grounds to relitigate the decision itself.
- CO Services' Telnyx/TCR campaign classification is Sole Proprietor — recorded in `notes.md` as "founder-confirmed."
- SMS-first sequencing (build the SMS intake leg before the email leg) is unchanged, not reversed. I compared the current committed Phase A+B prompt directly against what I flagged as a possible contradiction before this reconciliation: the "SMS leg first" language is a **sequencing/build-order statement**, justified by "the phone-auth/channel-identity boundary already belongs to Phase A" and by explicitly *rejecting* letting carrier lead-time push email first — which is the same distinction the founder drew earlier this session (email ships within Phase B for carrier-lead-time reasons, not as a strategic demotion of SMS). This is not a reversal. I am closing this as a false alarm from my earlier partial-diff read, not carrying it forward as an open conflict.

**CODEX TECHNICAL FINDING** (verified work product, not itself a product decision):

- Telnyx provider-contract sub-spike: verdict `PARTIALLY VERIFIED` — read-only API inspection confirmed an active messaging profile, one associated two-way A2P number, and an enabled $5/day cap; 10DLC brand/campaign state remains unproven via API (dashboard evidence not overridden). No live send occurred.
- Supabase Phone Auth / Turnstile / Send SMS Hook spike: verdict `GATE 3 BLOCKED` — confirmed the correct CAPTCHA boundary (Corralio enforces its own controls, passes one Turnstile token to Supabase; does not double-verify against Cloudflare directly) and identified the atomic `webhook-id` claim as the critical remaining safety requirement given Supabase's own retry behavior.
- Gate 3 durable-state implementation: verdict `DURABLE GATE 3 STATE READY FOR DATABASE VERIFICATION` — the migration and two atomic RPCs are written and locally tested (13 focused tests, 358 total Corralio/shared tests, typecheck, lint, build all reported passing), but nothing has been applied to any database.

**APPROVED ARCHITECTURE** (already-accepted design now more fully documented):

- ADR-032 (independent Corralio HotelPlanner attribution) and ADR-033 (launch gate as contextual-intelligence experience test) — both marked `Accepted` in `CORRALIO_ARCHITECTURE_DECISIONS.md`. Both are consistent with, and materially extend, ADR-030/031 which I already knew.
- Mobile Resilience & Offline PWA hard launch gate (founder, 2026-08-29) — read resilience over offline mutation, audit-first, not yet an authorized build prompt.

**OPEN-BLOCKED:**

- Full Gate 3 (live OTP capability) — blocked on a human applying the migration to an isolated database and running three verifiers, then separately configuring an isolated Supabase project, Turnstile keys, and a reachable signed webhook. None of this is authorized to happen automatically.
- 10DLC/campaign approval — packet is drafted (`2026-08-31-corralio-10dlc-campaign-submission-packet.md`) but not submitted anywhere I can see evidence of.
- Resend inbound email authentication — still unproven; blocks only the email leg, does not block SMS-first work.
- CALNAME micro-slice — filed, accepted, not yet dispatched/run.

## 3. Canonical Conflicts (flagged, not resolved)

- **Turnstile decision is not cross-referenced in `CORRALIO_FOUNDER_MENTOR_HANDOFF.md`.** The handoff doc is supposed to be the canonical founder-decision log for this workstream (I built II.22–II.24 for exactly this purpose), but this decision was recorded only in execution-state/engineering notes. Not a contradiction of substance — I found no document that disputes the decision — but a documentation-currency gap. I have not corrected it, per your instruction not to modify canonical documents during this reconciliation.
- **`CORRALIO_CPO_EXECUTION_STATE.md` and the Phase A+B prompt are currently mid-edit and uncommitted** (`git status` shows both modified, not staged). I have read the working-tree content and incorporated it above, but you should know the record you're reading right now, if you open these files directly, reflects in-progress edits that have not been committed to history. If this is Codex actively mid-task, committing over it or asking Codex to continue is your call, not mine to resolve here.
- I found **no conflict** between the roadmap's evidence-gated Pro/travel discipline and anything I previously recommended — ADR-032/033 are, if anything, a more rigorous version of the same discipline (explicit unproven-hypothesis framing on the $5/night subsidy test, explicit "infrastructure only, does not commit to launching" framing on HotelPlanner site provisioning). I am not flagging this as a conflict; I record it here only because your prompt asked me to state explicitly where I found none.

## 4. Current Critical Path

**Active-blocking (nothing else in this lane proceeds until these move):**
- Gate 3 database verification — requires a human to apply the migration to an authorized isolated database and run the three prepared verifiers. This is the actual bottleneck for any further SMS/phone-auth engineering.
- 10DLC/campaign submission and carrier approval — independent timeline, does not block engineering but blocks any real-volume send regardless of engineering readiness.

**Parallel (proceeding independently, not blocked by the above):**
- CALNAME micro-slice — filed, ready, zero dependency on Gate 3.
- HotelPlanner Phase 3B evidence diagnostic — filed, read-only, not yet run.
- Mobile Resilience & Offline PWA — audit not yet authorized to be written (explicitly gated on 3.6B core planning finishing first, per founder instruction 2026-08-29).
- TI Weekend Planner pilot (Slice 4.2A) — already shipped, running independent of the launch-gate timeline.

**Deferred (explicitly not to be started):**
- Any hotel-commerce/checkout build (ADR-032 explicitly forbids this being inferred from site provisioning).
- Any consumption of `X-WR-CALNAME` beyond raw preservation (blocked on the micro-slice landing first, and even then confidence-scored only).
- Phase 3B hotel-origin auto-suggestion (separately gated on a real Corralio-owned HotelPlanner handoff existing first).
- Section 6.8 reply-intent contract amendment I drafted last session — **I am holding this uncommitted per your explicit "do not modify canonical documents yet" instruction for this reconciliation.** It has not been reconciled against the current Phase A+B prompt state (which itself is currently uncommitted/mid-edit, see Section 3) and should not be merged in until that settles.

## 5. Current SMS/Phone-Auth State

- **Phone auth:** not implemented. Corralio remains email-only for application authentication (confirmed directly in the execution-gates audit and by absence of any phone-auth UI/callback in the app).
- **SMS sending:** zero. All counters across every spike/report I read are explicitly zero live sends, zero live OTPs, zero provider mutations.
- **Legal/consent surface:** built locally, uncommitted, and inert. `/privacy`, `/terms`, `/sms`, and the footer exist but the SMS opt-in route is fail-closed behind an unset environment flag — a parent visiting `/sms` today sees no phone number and no way to opt in.
- **Durable safety state:** designed and locally tested, not applied to any database. This is the one piece of new work that materially de-risks the eventual build (it closes the double-send/replay hole that the Supabase-retry finding surfaced), but it changes nothing about product readiness until a human applies it.
- **10DLC:** Sole Proprietor classification confirmed by founder; submission packet drafted; not submitted.
- **Net assessment:** SMS/phone-auth is exactly as far from shipping to a real parent as it was at my last known state — arguably closer in terms of safety-engineering maturity, but the actual product surface (auth screen, webhook handler, pending-intake flow) has not been started. This is evidence-gated infrastructure hardening, not scope creep and not a sign that Phase A+B implementation began without my knowledge.

## 6. Product Impact

- **Acquisition:** No change. Nothing here touches top-of-funnel; the legal/consent pages are prerequisite plumbing, not a growth lever.
- **Activation:** No change yet. SMS-first schedule intake (the actual activation lever this workstream targets) has not been built. The 3.6B arrival-resolution shipping is a quiet activation improvement (fewer parents hit "corralio_default" fallback with no explanation) but was already known to me.
- **Retention:** No change yet from this window's work. The Mobile Resilience hard gate (founder, 2026-08-29) is the most retention-relevant item in the roadmap, but it is explicitly not yet authorized to begin.
- **Revenue:** No change to Corralio's own revenue this window — ADR-032/033 are architecture/roadmap decisions, not shipped commerce. I flag ADR-033's move to ship a narrow travel-handoff slice pre-launch (rather than post-launch, per original ADR-031) as the single most consequential change to the revenue timeline in this reconciliation: it means HotelPlanner handoff work is now on the *critical path to launch* rather than a strictly post-launch, evidence-gated add-on. I don't think this is wrong — the founder's own moderated-parent-test rationale is a reasonable substitute for post-launch data at this stage — but it is a real scope and schedule expansion you should be deliberate about, not one to let drift further without re-checking it against the actual pre-launch parent test results when they exist.
- **Referral:** No change; nothing here touches sharing or invite mechanics.

**Inference, not evidence:** the durable Gate 3 safety-state design is good defensive engineering and reduces future execution risk on SMS, but I have zero usage evidence that SMS-first intake will out-convert the existing web-paste-a-link flow. That remains untested, exactly as it was at my last known state.

## 7. Founder Decisions Required

- **Gate 3 database application authorization.** Someone with access to the authorized isolated database needs to actually apply `20260831_corralio_sms_durable_safety_state.sql` and run the three verifiers. This is a go/no-go on spending the time to do that now versus later — it's the one item in this reconciliation that is a real, unresolved decision rather than something already settled or already correctly deferred.
- **Whether to dispatch the CALNAME micro-slice now.** It's filed, accepted, has zero dependency on Gate 3, and I see no reason not to run it — but I'm flagging it explicitly rather than assuming, since it's the one piece of currently-idle, ready-to-execute work.
- Everything else I reviewed already has a recorded owner and a clear next step (see Section 8) or is correctly and explicitly deferred (Section 4) — I am not manufacturing additional open questions where the repository already shows a settled answer.

## 8. Recommended Next Actions (max 5)

1. **Owner: Founder/human-with-DB-access. Action: apply `20260831_corralio_sms_durable_safety_state.sql` to the authorized isolated database and run the catalog, rollback-behavioral, and real-concurrency verifiers.** Why now: it's the single active-blocking item on the entire SMS/phone-auth critical path, is fully prepared and tested offline, and every day it waits is a day Gate 3 stays blocked for no engineering reason. Gate result if it passes: unblocks isolated Supabase/Turnstile/Send-SMS-Hook configuration — still several steps from a live OTP, not itself authorization to send anything.

2. **Owner: Codex. Action: dispatch the filed CALNAME preservation micro-slice** (`docs/prompts/corralio-ics-calendar-metadata-preservation-micro-slice-prompt.md`). Why now: zero dependency on Gate 3, founder-accepted, small, and currently the only fully-ready piece of work sitting idle. Gate result: either `COMPLETE LOCALLY` (small, reviewable diff, no team/sport truth created) or a named blocker report — either way it's a fast, low-risk signal.

3. **Owner: Founder + GPT Founder Mentor. Action: decide whether to commit the current uncommitted edits to `CORRALIO_CPO_EXECUTION_STATE.md` and the Phase A+B prompt, or whether they're still mid-revision.** Why now: I cannot safely reconcile my own Section 6.8 draft, or trust the execution-state doc as a stable reference, while these are sitting uncommitted in the working tree — this is a small process fix, not new work, but it should happen before more parallel edits stack on top of an uncommitted base.

4. **Owner: Founder. Action: confirm the 10DLC submission packet is ready to actually submit, and record that decision explicitly** (it's drafted but I found no evidence of submission or of an explicit founder go-ahead to submit). Why now: carrier approval timelines are typically the longest lead-time item in this whole workstream and run independently of engineering — waiting on engineering to finish before starting the carrier clock costs real calendar time for no benefit.

5. **Owner: Founder/CPO (me), next session. Action: reconcile my drafted Section 6.8 closed reply-intent contract against the current (once-committed) Phase A+B prompt and either merge or re-file it.** Why now: it's real, founder-refined product work (the STOP/START/HELP scoping exception and the two-category negative-test split are substantive additions, not cosmetic) that's currently stranded outside the canonical document purely because of the mtime-conflict/uncommitted-edit situation — it shouldn't be lost, but per this reconciliation's own scope discipline it belongs in a follow-up action, not folded in here.

---

*Nothing in this document changes code, migrations, or canonical decision records. All classifications above are traceable to the specific commit, diff, or file cited beside them.*
