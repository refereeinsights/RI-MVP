# Corralio Slice 3.6A Stage 2 — Weekend Ready Web Push

Date: 2026-08-28

Verdict: **SLICE 3.6A COMPLETE LOCALLY**

## Approved behavior

Weekend Ready has one Thursday 4:37 PM opportunity in the household's confirmed IANA planning timezone. Two Vercel UTC cron expressions provide a bounded 15-minute evaluation envelope across supported U.S. zones: `7,22,37,52 2-23 * * 4` and `7,22,37,52 0-6 * * 5`. Households without a confirmed timezone are ineligible. The database permits one bounded retry after a transient failure and never retries a provider-accepted delivery.

## Runtime implementation

- A separate `/api/cron/weekend-ready` Node route uses the existing exact bearer-secret convention and never delays or fails schedule refresh.
- A server-only `web-push` adapter claims bounded delivery work, sends only the approved private-safe payload, records sanitized outcomes, deactivates permanent endpoints, and isolates per-delivery finalization failures.
- Subscription registration, revocation, timezone confirmation, and closed interaction measurement use owner-authorized same-origin Server Actions and service-role RPCs. Authenticated clients cannot select stored subscription capabilities.
- The service worker displays `Your weekend is ready` / `Open Corralio to see your family plan.` and opens the validated same-origin `/?src=weekend_ready_push` destination. It has no cache/fetch handler and stores no product data.
- The soft ask appears only with meaningful weekend content. Permission is requested only on an explicit gesture. Browser timezone is suggestion-only and must be explicitly confirmed when the household timezone is unset.

## Controlled browser UAT

Declared ceiling: one disposable Auth identity/household, one controlled credential-free schedule/event, at most one synthetic subscription, zero provider push sends, zero Geocodio calls, and zero OpenRouteService calls.

Observed:

- meaningful authenticated weekend content exposed the soft ask;
- denied and dismissed branches recovered safely without a retained subscription;
- the null-timezone path suggested the browser zone and required explicit confirmation before enablement;
- a controlled browser-only Push API fixture exercised subscribed and unsubscribe UI through the real Server Action/database boundary without contacting a push provider;
- iPhone-sized browser emulation rendered the Home Screen requirement and did not request permission;
- the real static service worker registered and controlled the page after reload;
- `/sw.js` returned 200 with JavaScript content type, no-cache/no-store, `Service-Worker-Allowed: /`, and `X-Content-Type-Options: nosniff`;
- the cron route rejected an unauthenticated request with 401 and no-store;
- 375×812 rendered with no horizontal overflow, no application errors, and zero automated accessibility violations.

One existing contrast check remained automation-incomplete because gradient/pseudo-element backgrounds prevent deterministic color calculation. It was not a measured violation.

## Usage and cleanup

No real push was attempted and no push provider was called. Geocodio and OpenRouteService use were zero. One synthetic endpoint was stored solely for the controlled fixture, then revoked. Before cleanup there were zero campaigns, provider-ledger rows, quota rows, and active subscriptions. Independent cleanup confirmed zero remaining disposable Auth, household, membership, source, event, subscription, campaign/delivery, interaction, provider/quota, and temporary-calendar records.

## Security and privacy result

The implementation preserves forced RLS, service-only capability reads/writes, membership-loss deactivation, one campaign per household/weekend, one delivery per campaign/subscription, terminal provider acceptance, bounded transient retry, constant/sanitized operational output, trusted configuration-derived destinations, and the existing CSRF-protected Server Action convention. Notification payloads contain no family, schedule, event, venue, home/origin, conflict, recommendation, travel, or source data.

## Verification

- Database catalog verifier: passed.
- Rollback-only behavioral verifier: passed; cleanup zero.
- Corralio/shared-schedule tests: 294 passed.
- Corralio TypeScript: passed.
- Corralio lint: passed with zero warnings.
- React/Next review: passed.
- Four production builds: `corp-app`, `corralio-app`, `referee-app`, and `ti-web` passed; RI/TI retained only pre-existing warnings.
- `git diff --check`: passed.

## Remaining launch evidence/configuration

Local VAPID keys were absent and no key material was retained. `CORRALIO_VAPID_PUBLIC_KEY` and `CORRALIO_VAPID_PRIVATE_KEY` must be configured in authorized deployment environments before deployment.

The following remain **UNVERIFIED ON PHYSICAL DEVICE**: actual iPhone/Android receipt, iOS Home Screen installation, lock-screen/OS presentation, background reliability, and native notification-tap handoff. These are final pre-launch device gates, not claims made by browser emulation.

Email is deliberately deferred pending push reach/opt-in/re-entry evidence and is not part of 3.6B. Schedule-change push, Leave Soon, Mapbox/live traffic, SMS, native apps, broad preference centers, entitlement, and notification optimization were not built. Slice 3.6B was not started.

Nothing was pushed or deployed.
