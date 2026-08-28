# Corralio Slice 3.6A — Weekend Ready Web Push

## Proactive Mobile Return Loop

**Status: Founder-approved, 2026-08-28. Supersedes the earlier CPO draft `corralio-slice-3.6a-weekend-ready-notifications-prompt.md`, which bundled an email digest into this slice — that draft is retired. This document is canonical for Slice 3.6A.**

**Amendments folded in below (all from the 2026-08-28 founder review):** Section 25's email item is now an explicit, reasoned deferral rather than a bare exclusion. The Household Timezone Foundation amendment supersedes the temporary fixed-US window: Corralio stores a parent-confirmed IANA planning timezone and keeps it separate from event/venue timezone and absolute event time. The final specification corrections also lock the service-only subscription boundary, two-level idempotency, bounded opt-in/re-entry measurement, same-origin mutation protection, a separate push worker, physical-device evidence limits, operational logging, and trusted URL construction.

You are working inside the existing TournamentInsights / RefereeInsights / Corralio monorepo.

This is the first half of the previously planned Slice 3.6 work:

- **Slice 3.6A — Weekend Ready Web Push**
- **Slice 3.6B — Mapbox Traffic-Aware Leave-By**

Founder decision:

> **Web Push is the primary V1 Weekend Ready notification channel.**

Do not implement email notifications in this slice.

Slice 3.6B follows immediately after 3.6A if technically clean. It is **not** gated on obtaining statistically meaningful pilot signal from 3.6A.

Schedule-change push remains conditional on deterministic change-detection evidence and belongs to 3.6B or later.

Leave Soon push remains deferred.

Inherit and do not reopen completed Corralio planning, schedule connection, schedule freshness, venue, leave-by, What Fits, Arbiter, or schedule-source work.

Do not push or deploy.

---

# 1. Product Objective

Corralio should not depend entirely on a parent remembering to open the product.

Test:

> **Can one useful, well-timed Weekend Ready push bring an activated sports family back into This Weekend?**

The smallest credible loop is:

**Connect schedules** → **experience This Weekend** → **understand notification value** → **opt into Web Push** → **receive Weekend Ready** → **tap** → **return directly to This Weekend**

This is a product notification, not marketing. Do not build a generic notification platform.

---

# 2. Scope

This slice includes:

- standards-based Web Push;
- service-worker push handling;
- contextual notification opt-in UX;
- minimum push-subscription persistence;
- user/household authorization;
- VAPID/server signing configuration where required;
- one deterministic Weekend Ready trigger;
- idempotent delivery;
- privacy-safe payloads;
- This Weekend deep linking;
- expired/revoked subscription handling;
- bounded operational measurement;
- database migration/verifiers where required;
- automated/browser verification;
- explicit physical-device UAT handoff.

This slice excludes:

- email digest;
- Resend/product email infrastructure;
- schedule-change notifications;
- Mapbox;
- traffic-aware leave-by;
- Leave Soon;
- traffic alerts;
- SMS;
- marketing notifications;
- broad notification preferences;
- native iOS/Android apps;
- Pro/entitlement logic.

---

# 3. Audit First

Before implementation, inspect current repository and applied database reality.

## PWA/browser

- `manifest.ts`;
- service-worker infrastructure, if any;
- registration behavior;
- installability;
- existing Push/Notification API usage;
- relevant security headers;
- client/server boundaries.

Do not rebuild the existing manifest/PWA foundation unnecessarily.

## Authentication/households

- authenticated user model;
- household membership;
- household-scoped RLS;
- server authorization conventions;
- account/session behavior.

## Scheduled work

- existing Corralio cron/background-job conventions;
- Slice 3.5.5 schedule-refresh worker architecture;
- bounded batch/claim/idempotency patterns;
- Vercel Pro configuration.

Reuse existing trusted scheduled-job patterns where appropriate. Do not create a parallel job-running architecture.

## Timezone

The audit found no authoritative household timezone. Add the smallest nullable `planning_timezone` field to the household and store only a parent-confirmed, server-validated canonical IANA identifier. Existing households remain null; do not backfill from events or venues.

Maintain this hierarchy:

1. stored household timezone — authoritative for recurring household-local planning;
2. browser/device timezone — suggestion only while unset;
3. home-derived timezone — optional secondary suggestion only if an existing trusted capability makes it free and privacy-safe;
4. event/venue timezone — event-local truth only, never household truth.

The authenticated browser may suggest `Intl.DateTimeFormat().resolvedOptions().timeZone`, but the parent must explicitly confirm it. Do not silently overwrite a confirmed value. Present human labels rather than requiring IANA knowledge, while storing only the canonical identifier. Reject offset strings such as `UTC-8` and `GMT+2` at both pure and server boundaries.

Use the smallest Family/settings surface for initial confirmation and later correction. Do not create a preferences center. A null-timezone household is not eligible for Weekend Ready until confirmed. Never fall back to the browser, Vercel/server timezone, an event destination, or a guessed zone during worker eligibility.

Household timezone remains stable during travel unless the parent changes it. Event display remains event-local, and leave-by/routing remains an absolute timestamp calculation. Do not add dynamic travel-zone UX, new provider calls, timezone history, device-timezone history, or timezone analytics.

## Measurement

Inspect:

- Slice 4.2A weekly engagement;
- Slice 3.4 activation measurement;
- This Weekend measurement;
- existing external-call/audit conventions.

Prefer deriving existing product state rather than duplicating it as notification analytics.

## Security

Inspect:

- migration/verifier conventions;
- logging/redaction;
- secret handling;
- cleanup/UAT conventions.

Repository reality wins. If reusable notification infrastructure unexpectedly already exists, reuse it.

---

# 4. Platform Reality

Confirm current authoritative Web Push requirements before implementation.

## iOS

Audit current Safari/iOS requirements relevant to launch, including:

- minimum supported version;
- Home Screen/PWA installation requirement;
- permission requirements;
- service-worker requirements;
- limitations affecting Corralio.

If iOS requires Home Screen installation for Web Push, provide a restrained contextual install explanation before notification enablement. Do not nag users to install merely for marketing purposes.

## Android

Audit current Chrome/Web Push behavior, including:

- whether installation is required;
- permission behavior;
- service-worker behavior;
- relevant persistence limitations.

## Evidence boundary

Documentation and browser emulation do not prove physical-device delivery. Record applicable mobile delivery behavior as:

`UNVERIFIED ON PHYSICAL DEVICE`

until witnessed on actual devices.

---

# 5. Architecture

Use standards-based Web Push unless the audit exposes a material blocker.

Target:

**Browser/PWA** → **push subscription** → **trusted Corralio server** → **authorized subscription persistence** → **Weekend Ready eligibility/claim** → **Web Push send** → **service worker** → **This Weekend deep link**

Prefer the smallest architecture Corralio controls. Do not introduce a third-party notification platform unless the audit demonstrates a material security/reliability advantage and reports it before implementation.

---

# 6. Push Subscription Model

Persist only what Web Push requires. Use the smallest schema necessary for values equivalent to:

- authenticated user relationship;
- authorized household relationship;
- endpoint;
- protocol-required `p256dh` public key and `auth` secret;
- created/updated timestamps;
- active/revoked state where needed.

Add only the bounded delivery/idempotency state required by V1.

Do not build: device profiles; browser fingerprinting; notification history; device-management UI.

A push endpoint must never become identity truth.

The subscription table is service-only. The browser submits `endpoint`, `p256dh`, and `auth` only through an authorized same-origin server boundary and receives only a bounded safe result such as `subscribed` or `unsubscribed`. Stored endpoint/key material must never be directly selectable by authenticated clients.

Deactivate a user's subscriptions when that user loses the household membership that authorized them. Define the smallest deterministic lifecycle needed to enforce this without building device management.

---

# 7. Authorization / RLS

Push subscriptions are sensitive access capabilities. Require:

- authenticated subscription creation;
- server-derived user identity;
- validated household relationship;
- service-only table access with household/user authorization enforced by narrow trusted mutations;
- cross-user/cross-household denial;
- trusted service-role worker access;
- no browser access to trusted send/claim functions.

A user must not be able to read, mutate, revoke, or send through another user's subscription. Frontend visibility is not authorization.

Subscription and unsubscribe mutations must use the existing protected Server Action convention or explicit same-origin/CSRF validation. Authentication and RLS alone are insufficient. The browser-facing boundary returns no stored endpoint or key material.

---

# 8. Secrets

VAPID/private signing material remains server-only. Never: commit it; expose it to the browser except protocol-required public material; put it in analytics; put it in ordinary logs.

Follow existing environment-secret conventions.

Construct the VAPID subject and every notification/deep-link origin from validated trusted infrastructure configuration such as `CORRALIO_SITE_URL`. Never derive a trusted destination from `Host`, forwarded-host, request origin, or another caller-controlled header.

---

# 9. Permission UX

Do not request notification permission: on landing; during signup; immediately after account creation; before schedule connection; on arbitrary first page load.

The parent must experience product value first.

Preferred eligibility: authenticated household; connected schedule(s); meaningful This Weekend content; parent has reached This Weekend.

Use a soft ask before invoking browser permission. Conceptual copy:

> **Stay ahead of your sports weekend**
>
> Get a reminder when your family's weekend plan is ready.
>
> **Turn on notifications**

Refine copy to current Corralio voice if needed. Do not use manipulative permission UX.

---

# 10. Permission / Subscription States

Handle: unsupported; not requested; granted; denied; subscription created; subscription failed; revoked; expired/dead endpoint.

Denied or unsupported push must not degrade Corralio. Do not repeatedly nag a user who declined.

---

# 11. iOS Install Guidance

If current iOS Web Push still requires Home Screen installation:

- explain that requirement only when relevant;
- do not show the nudge on Android;
- do not show it when already installed;
- keep the instructions short;
- do not turn this into a PWA-install marketing campaign.

Browser/emulated tests may verify conditional rendering. They may not claim actual iOS installation behavior.

---

# 12. Weekend Ready Eligibility

A household is eligible only when:

- an active push subscription exists;
- meaningful upcoming weekend content exists under the canonical This Weekend definition;
- the household has not already been notified for that planning weekend;
- the current time is within the approved send window.

Do not notify simply because a cron ran. Do not send empty Weekend Ready notifications.

---

# 13. Weekend Definition

Reuse the canonical Friday-through-Sunday This Weekend shape. For Weekend Ready eligibility, resolve Friday 00:00 through Monday 00:00 in the confirmed household timezone, producing absolute UTC bounds. Preserve the existing browser-local This Weekend rendering and event-local display; do not refactor either broadly.

---

# 14. Send Timing and Timezone Strategy — Approved V1 Decision

The fixed-US UTC schedule is superseded by the Household Timezone Foundation amendment.

Founder/CPO-approved V1 behavior:

- one primary send opportunity Thursday at 4:37 PM in the confirmed household timezone;
- one bounded worker every 15 minutes during the global Thursday-local evaluation/retry envelope, using `7,22,37,52 2-23 * * 4` and `7,22,37,52 0-6 * * 5` in Vercel UTC cron (116 invocations/week, not an all-week poll);
- each invocation evaluates the injected current instant through the household's stored IANA rules and claims only households inside the 15-minute local window;
- no per-timezone cron and no unbounded household scan;
- transient delivery failures become eligible once after the existing 90-minute cooldown; recurring worker cadence does not create another campaign or retry provider-accepted delivery;
- households with null timezone remain disabled and receive the lightweight confirmation flow.

Optimize for:

> **Give the family enough time to understand and plan the upcoming weekend.**

Requirements:

- one send opportunity per planning weekend;
- no adaptive send optimization;
- no multiple reminders;
- avoid middle-of-the-night delivery.

This exact local send time and cadence are approved for Stage 2. The household-timezone product model is founder-approved and must not be replaced with the former fixed-US workaround.

---

# 15. Notification Content

Keep lock-screen content intentionally minimal.

Preferred concept:

**Title**
> Your weekend is ready

**Body**
> Open Corralio to see your family plan.

Do not include: child names; team names; event names; event times; locations; home/origin; conflict details; tournament details; private notes; What Fits recommendations; hotel/travel information.

Do not include schedule-source URLs or identifiers.

---

# 16. Deep Link

Notification tap should route directly to **This Weekend**, not a generic homepage/dashboard.

Preserve safe authentication behavior. If authentication has expired, use existing authentication-return behavior where supported.

Do not put household IDs or sensitive planning data in the notification URL merely to support navigation.

---

# 17. Idempotency

Weekend Ready must be at-most-once per eligible household/planning weekend under normal operation. The design must survive: repeated cron execution; retries; concurrent workers; provider errors.

Use two explicit durable levels:

1. one campaign claim per household/planning weekend;
2. one delivery record per campaign/subscription.

Provider-accepted delivery is not retried. Transient failures may retry only within a bounded policy. Permanently dead endpoints are deactivated. Repeated cron execution and concurrent workers must not duplicate an already accepted delivery while still allowing the bounded retry of an eligible transient failure.

Do not infer delivery state from client UI. Do not build generic notification history beyond the minimum campaign/delivery state required for this contract.

---

# 18. Multiple Subscriptions

Audit actual V1 requirements for multiple browser/device subscriptions. Support the smallest correct model. Do not build user-facing device management.

If multiple active subscriptions are allowed for one user/household, define deterministic delivery behavior so the same device does not receive duplicate sends from repeated claims. Document the choice.

---

# 19. Revocation / Dead Endpoints

Support: explicit unsubscribe where necessary; browser revocation; expired subscription cleanup; permanently invalid endpoint cleanup/deactivation.

Do not retry dead endpoints indefinitely. Do not expose provider errors to parents.

---

# 20. Failure Isolation

Push is asynchronous/best-effort. Push failure must never affect: schedule connection; schedule refresh; event persistence; This Weekend; conflicts; leave-by; What Fits; directions.

One failed subscription must not abort unrelated household sends.

---

# 21. Scheduled Worker

Reuse existing trusted Vercel/server worker conventions, but use a separate push route/cron from schedule refresh. Reuse cron authentication, bounded-claim, and failure-isolation patterns rather than coupling execution. Push latency or failure must never delay or fail schedule refresh.

The push worker must: be server-only; use trusted authorization; process bounded batches; atomically prevent duplicate Weekend Ready claims; isolate per-subscription failures; have bounded execution; emit sanitized operational results.

Do not scan unbounded household data in one invocation. Choose batch size from current scale and execution evidence.

---

# 22. Vercel Usage

Vercel Pro is confirmed. Cron availability is not a blocker.

Report projected: scheduled invocations; households evaluated; push attempts; function CPU/memory implications.

Do not create an unnecessarily frequent cron for a once-per-weekend job. Optimize for reliable delivery rather than negligible infrastructure savings.

---

# 23. Measurement

Product question:

> **Does Weekend Ready bring families back into This Weekend?**

Reuse existing measurement wherever possible. Derive existing facts such as: connected schedules; weekend content; This Weekend views; weekly return — rather than logging duplicates.

Add only notification-specific operational/interaction state required for: opt-in/subscription state; send/idempotency; provider acceptance/failure; notification-driven re-entry where technically supportable.

If reporting opt-in rate, add the smallest closed measurement needed to distinguish `soft_ask_shown`, permission granted, and permission denied/dismissed where technically knowable. If that cannot be measured safely and narrowly, explicitly report opt-in rate as unmeasured rather than inventing a denominator.

Distinguish deterministic notification-click attribution from a generic This Weekend return observed after a send. Never label a post-send return as notification-driven unless the implemented join actually proves that relationship. If deterministic click attribution is unavailable, report the weaker post-send return measure honestly.

Do not claim `delivered` unless device delivery is actually knowable.

Never log: push endpoints; cryptographic key material; notification payload contents; private household data.

If a desired metric cannot be safely measured without expanding analytics materially, report it as unmeasured.

Reuse the pattern of existing external-call handling, not necessarily `corralio_external_api_calls`. Do not automatically widen that table's closed Geocodio/OpenRouteService vocabulary for push. The minimum campaign/delivery state may carry sanitized operational outcomes required for idempotency, retry, provider acceptance/failure, and reporting.

---

# 24. Success Measures

Do not create a new Corralio north star. Primary Corralio metric remains:

> **Weekly returning families with multiple connected schedules.**

3.6A diagnostics: eligible households; notification opt-in rate; push attempts/acceptance; notification-driven This Weekend re-entry where measurable.

Strategic signal:

> **Subsequent-weekend return among notification-enabled households.**

Small pilot numbers are directional.

---

# 25. Explicit Deferrals

Do not implement:

### Email

Deliberately deferred pending evidence. Slice 3.6A intentionally tests Web Push as the primary proactive-return channel. Email is not omitted accidentally and is not assigned to Slice 3.6B. After initial push opt-in, reach, and notification-driven return evidence exists, evaluate whether email materially improves household reach, particularly for users blocked by iOS installation/permission friction. Do not build email infrastructure in anticipation of that decision.

### Schedule-change push

No game/time/location/cancellation/new-event notifications.

### Leave Soon

No leave-now or leave-in-X notifications.

### Mapbox / traffic

No traffic-aware leave-by or routing-provider changes.

### SMS

No SMS.

### Native apps

No native iOS/Android applications.

### Preferences

No broad notification preference center.

---

# 26. Relationship to Slice 3.6B

Slice 3.6B follows immediately after 3.6A if technically clean.

3.6B owns: Mapbox traffic-aware leave-by; Standard-tier traffic-aware planning; traffic freshness/as-of semantics; estimated-routing fallback; Mapbox cost/quota controls.

Schedule-change push may be audited in 3.6B but is implemented only if meaningful change detection is deterministic and bounded.

3.6B is **not gated on obtaining statistically meaningful pilot signal from 3.6A.**

Email is owned by neither 3.6A nor 3.6B — it is a distinct future decision per Section 25, made only after push evidence exists.

The split exists for implementation clarity and reviewability.

---

# 27. Physical-Device Evidence Boundary

Automated/browser tests may verify: permission-state logic; soft-ask UX; iOS-install-nudge conditional rendering; subscription serialization; authorization/RLS; payload construction/privacy; eligibility; idempotency; worker behavior; deep-link construction; provider-request behavior; failure handling.

They may not certify: actual iPhone push receipt; actual Android push receipt; iOS Home Screen installation; OS notification rendering; lock-screen behavior; notification-tap return behavior; background delivery reliability.

Report these as `UNVERIFIED ON PHYSICAL DEVICE` until separately witnessed.

---

# 28. Controlled UAT

Use only disposable/synthetic test data. Require: authorized disposable Auth identity; disposable household; controlled schedules/events; privacy-safe weekend content.

Declare before UAT: maximum synthetic subscriptions; maximum actual push attempts; expected external push-service calls. Local completion may require at most one bounded real provider-accepted push in an appropriate desktop/test context; do not expand that allowance without a new explicit approval.

Do not send uncontrolled notifications. Do not use real family schedule URLs.

Clean to zero: Auth fixture; household; schedules; events; push subscriptions; Weekend Ready claim/send records; notification-specific measurement fixtures; temporary test objects.

Independently confirm cleanup.

---

# 29. Tests

Add deterministic tests covering at minimum:

## Eligibility
1. meaningful weekend + active subscription can become eligible;
2. empty weekend cannot;
3. no subscription cannot;
4. duplicate household/weekend claim is rejected.

## Household timezone
5. valid IANA timezone accepted and canonicalized;
6. malformed/offset timezone rejected at the server boundary;
7. browser timezone remains an unpersisted suggestion until confirmation;
8. confirmed stored timezone remains authoritative;
9. event/venue timezone cannot overwrite household timezone;
10. eligibility uses household-local time rather than server timezone;
11. null timezone remains disabled;
12. representative US spring/fall DST behavior uses IANA rules;
13. travel event time remains event-local/absolute without mutating household timezone;
14. no home address, coordinates, or device-timezone history enters logging/measurement.

## Authorization
15. authenticated user can create only an authorized subscription;
16. cross-user/cross-household access denied;
17. trusted worker has required access;
18. browser cannot invoke trusted send/claim operations.

## Permission/subscription
19. unsupported state;
20. denied state;
21. granted/subscribed state;
22. revoked/expired state;
23. dead endpoint handling.

## Privacy
24. payload contains no child/team/event/location/private-note data;
25. endpoint/key material does not enter analytics/logging;
26. deep link contains no sensitive household data.

## Weekend Ready
27. approved copy;
28. correct This Weekend deep link;
29. duplicate cron/retry cannot duplicate normal send;
30. individual failure does not abort unrelated work.

## Regression
31. schedule connection unchanged;
32. schedule freshness unchanged;
33. This Weekend planning unchanged except approved notification opt-in entry;
34. conflicts unchanged;
35. leave-by unchanged;
36. What Fits unchanged;
37. schedule-source catalog unchanged;
38. signed-out landing remains push-free.

Use fixed/injected clocks. Automated tests must not send real push notifications.

---

# 30. Database Gate

If subscription/idempotency persistence requires database changes:

1. create forward migration(s);
2. do not edit historical migrations;
3. enforce appropriate RLS;
4. prepare catalog verifier;
5. prepare rollback-only behavioral verifier;
6. verify ownership/grants;
7. verify fixed search paths for trusted functions;
8. verify cross-household denial;
9. verify trusted worker operations;
10. verify untrusted roles cannot execute claim/send operations;
11. verify failed-operation atomicity where applicable;
12. verify cleanup zero.

Do not apply automatically. Stop at:

`SLICE 3.6A READY FOR DATABASE VERIFICATION`

A human applies reviewed SQL. Continue only after both verifiers pass.

---

# 31. Stage 1

Stage 1 must: complete repository/PWA audit; verify current Web Push platform requirements; implement the smallest household-timezone foundation (Section 3); define subscription persistence; define idempotency; recommend exact household-local send timing and worker cadence (Section 14); define batch/execution bounds; reconcile measurement; prepare migrations/verifiers where required; implement only work safe before database application; run offline verification; update notes; commit locally.

Return the Section 14 local-time/cadence recommendation for founder/CPO approval before Stage 2. Confirm the household schema design, browser suggestion flow, null fallback, DST strategy, and separation from event/venue timezone.

If database work is required, stop at: `SLICE 3.6A READY FOR DATABASE VERIFICATION`

If a genuine architecture/security/platform blocker exists: `SLICE 3.6A BLOCKED BY AUDIT FINDING`

Do not silently substitute email. Do not silently assume a timezone.

---

# 32. Stage 2

After the Stage 1 decision/database gate clears: run catalog verifier; run rollback-only behavioral verifier; confirm cleanup zero; complete server/client integration; run controlled browser UAT; run no more than the single bounded real provider-accepted push authorized by Section 28 where an appropriate desktop/test context exists; verify soft ask; verify permission-state UX; verify iOS install-nudge rendering; verify eligibility; verify idempotency; verify payload privacy; verify deep-link construction; verify revocation/dead endpoint behavior; verify failure isolation; report physical-device-only behavior as unverified.

Do not claim mobile push delivery from browser emulation.

Actual iPhone/Android receipt, iOS Home Screen installation, lock-screen presentation, background reliability, and notification-tap handoff remain `UNVERIFIED ON PHYSICAL DEVICE` until final pre-launch physical-device UAT.

---

# 33. Verification

Before completion run: focused push tests; complete Corralio test suite; TypeScript; zero-warning lint; `git diff --check`; all four production builds: `corp-app`, `corralio-app`, `referee-app`, `ti-web`.

Also verify: no unrelated schedule connection, freshness, conflict, leave-by, What Fits, or venue-matching behavior changed; no Slice 3.6B (Mapbox/traffic) work entered the diff; signed-out landing behavior remains unchanged and push-free.

Do not push. Do not deploy.

---

# 34. Notes and Durable Record

Update `apps/corralio/notes.md` with: audit findings (PWA/service-worker state, authentication/household model, scheduled-work reuse decision, measurement reuse, security conventions); the timezone audit's findings, available signals and their reliability, and the chosen V1 strategy; the exact approved send-timing decision; the push architecture actually built (subscription model, RLS, idempotency/claim mechanism, worker reuse); permission/opt-in UX delivered; notification content approved; measurement added; database migration/verifier results if applicable; browser UAT result, explicitly listing every item recorded as `UNVERIFIED ON PHYSICAL DEVICE` pending real-device testing; tests/builds; the explicit deferrals from Section 25 — including email's status as a deliberate, evidence-gated deferral, not an omission and not assigned to 3.6B; final verdict.

Preserve unrelated worktree changes.

---

# 35. Commit

Review the complete diff before committing. Commit only files belonging to this Weekend Ready Web Push work. Use a focused local commit message. If the database-verification gate requires separate prepare/complete commits, follow the repository's established migration workflow. Do not manufacture multiple commits where one focused commit is sufficient.

Do not push. Do not deploy.

---

# 36. Final Verdict

Return exactly one appropriate terminal verdict:

`SLICE 3.6A COMPLETE LOCALLY`
`SLICE 3.6A READY FOR DATABASE VERIFICATION`
`SLICE 3.6A READY AFTER LISTED FIXES`
`SLICE 3.6A BLOCKED BY AUDIT FINDING`
`SLICE 3.6A NOT READY`

Include: audit result (PWA/service-worker, auth/household, scheduled-work reuse, measurement, security); timezone audit findings and the chosen V1 strategy; the approved send-timing decision; push architecture and RLS/idempotency result; permission/opt-in UX delivered; database state/verifier results if applicable; privacy/security result; every item recorded as `UNVERIFIED ON PHYSICAL DEVICE` and why; tests/builds; explicit confirmation that email and every other Section 25 item was not built, and that email's deferral is recorded as deliberate, evidence-gated, and unassigned to 3.6B — not omitted; explicit confirmation that Slice 3.6B's scope (Mapbox/traffic) was not started; local commit hash(es); explicit confirmation that nothing was pushed or deployed.
