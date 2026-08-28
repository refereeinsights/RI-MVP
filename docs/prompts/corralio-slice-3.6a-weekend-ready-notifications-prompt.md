# Corralio — Slice 3.6A: Weekend Ready Notifications (Push + Email)

> **SUPERSEDED, 2026-08-28.** The founder scoped 3.6A to Web Push only for V1, with email explicitly deferred as its own future evidence-gated decision (not bundled into this slice or assigned to 3.6B). This draft's bundling of email into 3.6A no longer reflects that decision. The canonical Slice 3.6A prompt is `docs/prompts/corralio-slice-3.6a-weekend-ready-web-push-prompt.md`. Do not implement from this file.

**Resumes the launch-critical path (4.6 → 3.4 → 3.5 → 3.5.5 → 3.6 → launch UAT → pilot) after the 3.7/UX-Unification schedule-source detour. This is the first of two parts — Slice 3.6B (schedule-change detection, Mapbox traffic-aware leave-by, "traffic is building" push) is deliberately deferred to its own slice and must not be started here.**

Founder decision, 2026-08-28: split Slice 3.6 into 3.6A (this slice — the smallest real test of the retention-notification hypothesis) and 3.6B (traffic/schedule-change work, gated on 3.6A shipping and getting real signal first). Ship the smallest thing that tests whether a proactive notification brings a parent back, before building the materially larger and riskier traffic-aware leave-by capability on top of an unproven hypothesis.

Inherit and do not reopen: Slice 4.6 (What Fits), Slice 4.5/4.5A (Overture/Nearby), Slice 4.4 family (venue matching), Slice 4.3 (leave-by), Slice 3.4/3.5/3.5.5 (schedule connection, mobile hardening, freshness), Slice 3.7/UX Unification (schedule sources). Do not touch `leaveBy.server.ts`, `whatFits.server.ts`, `weekendPlan.ts`'s conflict logic, or the schedule-source catalog.

Do not push or deploy.

## 0. What This Slice Tests

The hypothesis: a proactive "your weekend is ready" notification, reaching a parent outside the app, brings them back and reinforces the habit loop faster than waiting for them to remember to open Corralio. Corralio has never sent a notification of any kind — this is genuinely unproven, not a refinement of something that already works.

Content requires no new logic: `weekendPlan.ts` already computes exactly what the notification says ("Your weekend is ready — N events across M teams"). The entire scope of this slice is the delivery mechanism — getting that existing sentence in front of a parent through push and/or email — not deciding what to say or inventing new schedule intelligence.

## 1. Audit First

Confirmed by prior CPO audit (`2026-08-27-slice-3.6-notification-and-traffic-routing-audit.md`) and to be re-confirmed directly against the live repository before building:

* Zero notification infrastructure exists: no service worker, no push subscription code, no `Notification` API usage, no product-notification email-sending abstraction (Supabase Auth's identity emails — magic link, recovery — are a separate, unrelated pathway; do not repurpose them).
* `apps/corralio/app/manifest.ts` is a complete, real Web App Manifest (name, standalone display, icons) — the PWA installability layer already exists. It is necessary but not sufficient for push; do not rebuild it.
* `leaveBy.server.ts` already has a working pattern worth reusing structurally: per-household call caps, dedup, retry/failure classification, and audit logging to `corralio_external_api_calls`. Follow this same pattern for push/email send tracking rather than inventing a new one.
* Whatever cron/scheduled-job mechanism already drives Corralio's daily schedule refresh (Slice 3.5.5) is the mechanism this slice should extend for a weekly send trigger — audit it directly and reuse it; do not stand up a second, parallel job runner.
* Audit whether the monorepo's existing Resend usage (`apps/referee`'s `trackExternalCall('resend', ...)` pattern) can be reused for Corralio's sending domain/account, or whether Corralio needs its own Resend configuration. Report the finding rather than assuming either way.
* `corralio_weekly_engagement` (Slice 4.2A) already tracks household-level weekly engagement without logging discrete events. Follow that same report-time-query-over-event-logging discipline wherever it applies here; do not casually add a new event-logging table where an existing query would do.

Repository reality wins over this document if any of the above turns out to be stale.

## 2. Push Notification — Platform Reality

Design for both platforms' real, verified constraints, not an idealized web-push model:

* **iOS (Safari/WebKit):** push requires the PWA to be installed to the Home Screen first — it does not work in an ordinary browser tab. This is a hard precondition. Requires iOS 16.4+. Build an iOS-specific install nudge (contextual, not a nag) since push is otherwise completely inert there — a parent who never installs will never receive push regardless of how well the rest is built.
* **Android (Chrome):** no install requirement; push works from an installed PWA or, with lower persistence, an ordinary browser context.
* **Permission UX:** use a "soft ask" — explain the value before triggering the native browser permission dialog — rather than asking cold on first load. Time it to a moment the parent has already gotten value (e.g., after their first successful schedule connection or first This Weekend view), not on landing.
* **Net new engineering surface, all required:** a service worker scoped to push-handling only (no offline-caching commitment implied or required by this slice), VAPID key generation/config, a push-subscription table scoped to household/device with RLS matching the existing household-scoped pattern, the soft-ask UX, the iOS install nudge, and a send-side function using a standard web-push library.
* Deep-link a notification tap straight into This Weekend via standard `notificationclick` service-worker behavior.

## 3. Email Digest — Structural Reach, Not a Fallback

Email is not a cost-minimization fallback — it is the only channel that reaches a household regardless of iOS install state or push-permission outcome, per the founder's own explicit direction overriding the earlier minimize-infrastructure-cost framing. Ship it alongside push in this same slice, not as a "maybe later" add-on.

* Reuse an existing Resend account/pattern per Section 1's audit rather than introducing a second email vendor.
* The email is a genuine product notification, not a transactional identity email — do not extend Supabase Auth's templates for this.
* Content mirrors the push notification's substance ("Your weekend is ready — N events across M teams") with a direct link back into This Weekend. Do not build a separate, richer "digest" content model in this slice — same underlying data, same trigger, a second channel.
* Include a working unsubscribe mechanism in every email. This is a compliance requirement (CAN-SPAM), not a nice-to-have, even though there is no broader preference center in this slice (Section 6).

## 4. Trigger and Send Discipline

* One trigger type only in this slice: "Weekend Ready." Design a bounded, idempotent send: a household should never receive two Weekend Ready notifications for the same weekend, even if the underlying job runs more than once (retries, overlapping cron windows, etc.) — this needs a real dedup mechanism (e.g., a keyed record of the last weekend a household was notified for), not a best-effort assumption.
* Only send to a household with a genuinely non-empty upcoming weekend (per `weekendPlan.ts`'s existing definition of "this weekend"). Do not send an empty or contentless notification.
* Decide and record the actual send timing (e.g., a specific day/time before the weekend) during Stage 1 design, grounded in what "ready" should mean for a parent planning ahead — this is a real product decision to make explicitly, not leave implicit in code.
* Respect quiet hours in the choice of send time (i.e., do not schedule the job to fire at a time that would deliver push/email in the middle of the night in the household's likely timezone) — a simple, defensible default (e.g., a fixed reasonable local-feeling time) is sufficient; do not build per-household timezone customization in this slice.

## 5. Opt-In, Not Opt-Out

* Push requires explicit browser permission by platform design — nothing to add here beyond the soft-ask UX (Section 2).
* Email requires an explicit, clear opt-in step during or shortly after activation (e.g., a single checkbox/toggle, not a pre-checked default) — do not send a parent product email they never agreed to receive, even though Corralio already has their email address from signup. Signup for the product is not consent to product-notification email.
* Store consent/opt-in state per household, scoped by the existing RLS pattern, readable/writable only by the owning household and service role.

## 6. Explicit Non-Goals (this slice)

Do not, in Slice 3.6A:

* implement schedule-change detection/diffing on refresh — no diffing logic exists in `schedules/refresh.ts` today and building it is Slice 3.6B's scope, not this one's;
* implement Mapbox (or any) traffic-aware routing, "traffic is building" push, or "leave soon" — all explicitly Slice 3.6B or later, gated on real leave-by accuracy data that doesn't exist yet;
* build a notification preference center — one opt-in toggle for email (Section 5) and the OS-level push permission are sufficient for this slice;
* add SMS in any form — explicitly sequenced after this slice's own retention hypothesis has real evidence, per the existing CPO roadmap addendum;
* add a second trigger type of any kind;
* modify schedule connection, ingestion, freshness, conflict detection, leave-by, What Fits, or venue matching;
* add Pro/entitlement gating on notifications — no entitlement infrastructure exists anywhere in the app, and none should be introduced here (ADR-011);
* build native iOS/Android apps or any native-push (APNs/FCM direct) integration — web push only, consistent with ADR-027's PWA-first posture.

## 7. Privacy / Security

* Push subscription endpoints and email addresses are private household data — RLS-scoped exactly like existing household-owned tables; never exposed to another household, never returned in a client-readable form beyond what the browser's own Push API already holds locally.
* Notification content stays intentionally low-detail ("N events across M teams") — do not put a specific child's name, an opponent's name, or a venue address into a push notification body, since push previews can be visible on a locked device screen to anyone nearby. Email may be marginally more detailed since it's opened deliberately, but should not include a private calendar/subscription URL under any circumstance.
* Log Resend/web-push calls through the existing `corralio_external_api_calls` audit pattern (Section 1), the same way `leaveBy.server.ts` already does for Geocodio/OpenRouteService — do not create a second, parallel logging mechanism.
* No new analytics event vocabulary beyond what's needed to know whether this hypothesis worked (Section 8) — do not instrument for its own sake.

## 8. Measurement

This slice exists to test a hypothesis — it must be possible to tell whether it worked. At minimum, track (household-scoped, RLS-locked, service-role-readable, consistent with the existing Slice 4.2A/connection-analytics pattern — no client-writable aggregate rows):

* push opt-in rate (of households prompted, how many granted permission);
* email opt-in rate;
* notification sent (push/email, success/failure, per household per week — for dedup and delivery-health purposes, not vanity reporting);
* notification-driven return: did the household open This Weekend within a bounded window after a Weekend Ready send (reusing/extending the existing weekly-engagement measurement rather than building a new funnel).

Do not track content beyond what's needed to answer "did this bring the household back." Do not build a dashboard in this slice — a report-time query is sufficient, matching existing practice.

## 9. Tests

Add/update deterministic tests covering at minimum:

1. Weekend Ready content matches `weekendPlan.ts`'s existing computed summary for a given household/week;
2. a household with an empty upcoming weekend is never sent a notification;
3. a household is never sent two Weekend Ready notifications for the same weekend, including under a simulated duplicate job run;
4. push subscription records are RLS-scoped to the owning household and inaccessible to another household's session;
5. email is never sent to a household without recorded opt-in;
6. the unsubscribe mechanism actually clears/records opt-out and a subsequent send is suppressed;
7. push/email send attempts are logged through the existing external-API-call audit pattern, success and failure both;
8. no private calendar/subscription URL, exact address, or child name appears in a push notification payload;
9. the iOS install nudge only appears in the iOS-not-installed condition, not on Android or an already-installed PWA;
10. existing schedule connection, freshness, conflict, leave-by, and What Fits tests are unaffected.

Do not send real push notifications or real emails from automated tests — use fakes/mocks for the provider boundary, consistent with how `leaveBy.server.ts`'s tests presumably mock Geocodio/OpenRouteService already (verify and follow that existing pattern).

## 10. Stage 1 — Audit, Design, and the CPO Decision Gate

Stage 1 produces: the audit findings from Section 1; the exact send-timing decision (Section 4); the RLS/schema design for push subscriptions and email opt-in state; the reused-vs-new Resend configuration finding; an unapplied migration if new tables/columns are needed; and a Stage 1 report.

Present explicitly for CPO/founder decision before Stage 2 begins, mirroring this project's established decision-gate discipline:

1. Exact Weekend Ready send day/time (a specific proposal, not left open).
2. Whether Corralio needs its own Resend account/domain or can share the existing one, and what that implies for sender identity/deliverability.
3. Any case where the live repository contradicts this prompt's inherited assumptions (e.g., if a cron mechanism doesn't already exist in the form Section 1 assumes).

No runtime behavior change, no push, no deployment in Stage 1 — same as every other slice in this repository.

## 11. Stage 2 — Build and Verify

After the Stage 1 gate clears: implement, add/apply the migration following the established narrow-migration-plus-verifier pattern, run catalog/behavioral verification if applicable, and perform bounded browser UAT covering at minimum: the soft-ask permission flow, the iOS install nudge (in an emulated iOS viewport), a successful push send/receive in a disposable test context, a successful email send with working unsubscribe, and confirmation that an opted-out household receives nothing on the next simulated trigger.

Before declaring completion, run: focused notification tests; all affected deterministic tests; complete Corralio test suite; explicit Corralio TypeScript validation; zero-warning Corralio lint; `git diff --check`; all four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`).

Update `apps/corralio/notes.md` with: audit findings; the send-timing decision and why; the push/email architecture; opt-in mechanics; measurement added; tests/builds; deferred items (explicitly naming Slice 3.6B's scope as the next step, not abandoned); final verdict.

Do not push. Do not deploy.

## 12. Final Verdict

Return exactly one appropriate terminal verdict:

`SLICE 3.6A COMPLETE LOCALLY`
`SLICE 3.6A READY FOR DATABASE VERIFICATION`
`SLICE 3.6A READY AFTER LISTED FIXES`
`SLICE 3.6A BLOCKED BY AUDIT FINDING`
`SLICE 3.6A NOT READY`

Include: audit result; Stage 1 decisions made; push/email architecture delivered; opt-in/consent mechanics; measurement added; database state/verifier results if applicable; privacy/security result; browser/mobile UAT result (including the iOS install-nudge and permission-flow checks); tests/builds; explicit confirmation that Slice 3.6B's scope (schedule-change detection, traffic-aware leave-by, "traffic is building" push) was not started; local commit hash(es); explicit confirmation that nothing was pushed or deployed.
