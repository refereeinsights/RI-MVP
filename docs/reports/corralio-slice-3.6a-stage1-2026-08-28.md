# Corralio Slice 3.6A — Stage 1 Audit and Decision Packet

Date: 2026-08-28

Scope: Weekend Ready Web Push only

Database state: migration prepared, not applied
Runtime state: no service worker, push route, cron, permission request, subscription write, or notification send enabled

## Verdict

`SLICE 3.6A READY FOR DATABASE VERIFICATION`

Stage 2 remains gated on human migration application and both SQL verifiers. The founder approved the fixed timing/window decision below on 2026-08-28. Email remains deliberately deferred and is not assigned to Slice 3.6B. No Mapbox, traffic-aware routing, schedule-change push, Leave Soon, SMS, or native-app work started.

## Repository audit

### PWA and browser surface

- `apps/corralio/app/manifest.ts` already supplies the product name, root scope/start URL, standalone display, colors, and 192/512 icons. It is a real PWA manifest and should be extended only where the Stage 2 browser audit proves necessary.
- No Corralio service worker, service-worker registration, Push API use, Notification API use, VAPID configuration, push dependency, subscription storage, or notification UI exists.
- `middleware.ts` currently matches a future root `/sw.js` request. It does not redirect today, but Stage 2 must explicitly exclude the service-worker asset and verify JavaScript content type, root scope, update/cache behavior, and absence of authentication/private content in that response.
- Current Next.js configuration has no Corralio-specific response-header policy. Stage 2 must verify the minimum service-worker/security headers without broadening this slice into an unrelated header redesign.

### Current platform requirements

- WebKit's current documented baseline continues to require iOS/iPadOS 16.4+ and a Home Screen web app. Permission must be requested following direct user interaction. Documentation: `https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/`.
- Standards-based Web Push still requires a service worker and a `PushSubscription`. The endpoint is a sensitive capability URL; `p256dh` and `auth` are the protocol values sent to the trusted application server. Documentation: `https://developer.mozilla.org/en-US/docs/Web/API/Push_API` and `https://developer.mozilla.org/en-US/docs/Web/API/PushSubscription/getKey`.
- Current WebKit also documents declarative Web Push for newer Apple releases, but it is not a V1 replacement for the broader iOS 16.4+ service-worker baseline. Stage 2 should preserve standards-compatible payload construction rather than make newer declarative-only behavior the minimum.
- Android/Chrome installation, receipt, persistence, and background behavior still require physical-device confirmation. No browser emulation result may certify them.

### Authentication and subscription boundary

- Corralio V1 has one active owner membership per Auth user. Existing Server Actions resolve the authenticated user/household and use a trusted admin client only behind that server boundary.
- The prepared subscription schema is service-only with forced RLS and no `anon`/`authenticated` table grants. It stores `endpoint`, `p256dh`, and `auth_secret` only for the trusted sender; browser-facing Stage 2 actions must return bounded status only.
- The migration includes narrowly service-only upsert/deactivate/interaction functions, rejects cross-membership registration, refuses reassignment of an endpoint owned by another user, and deactivates active subscriptions when membership is removed.
- Stage 2 subscription/unsubscribe must use Server Actions. No browser-callable trusted claim/send RPC is authorized. The action must authenticate first and use the existing same-origin Server Action protection; it must not accept user/household identity from the submitted payload.

### Scheduled work

- Slice 3.5.5 currently owns `/api/cron/schedule-refresh`, protected by exact `Authorization: Bearer ${CRON_SECRET}`, bounded database claims, per-source failure isolation, and a four-hour Vercel schedule.
- Current Vercel documentation states cron schedules use UTC, Vercel may invoke the same event more than once, concurrent invocations are possible, and failed invocations are not retried automatically. Documentation: `https://vercel.com/docs/cron-jobs/manage-cron-jobs` and `https://vercel.com/docs/cron-jobs`.
- Stage 2 must add a separate `/api/cron/weekend-ready` route while reusing the authentication and claim disciplines. It must not add push delivery to schedule refresh. Push latency/failure therefore cannot delay or fail refresh.

### Timezone audit

Available signals:

| Signal | Repository/applied evidence | Reliability for household send time |
|---|---|---|
| Household timezone | No household timezone column or setting exists | None |
| Browser-local timezone | Current `weekend.ts` uses the executing browser's local calendar | Accurate for that browser render, not persisted or available to cron |
| Event timezone | Applied aggregate: 216 events had `America/Los_Angeles`; 151 had no timezone | Destination/event evidence; incomplete and may represent travel |
| Canonical venue timezone | Present for venues; sampled applied data contained 12 timezone values | Venue evidence, not household origin/timezone |
| Household origin coordinates | Private routing data exists for some households | Must not be repurposed into notification identity or venue evidence |

Conclusion: **Corralio has no trustworthy household notification timezone.** Running `getThisWeekendRangeLocal()` inside Vercel would use server process locality and cannot be described as household-local truth. A single event or venue timezone is also insufficient.

## Founder decision approved — V1 fixed notification window

### Repository fact

No trustworthy household timezone exists, Vercel cron is UTC, and the exact This Weekend UI window is browser-local.

### Audit evidence

The only complete deterministic option without new timezone capture/inference is a fixed reference strategy. Adding browser timezone persistence would create a new household/device attribute whose travel, multi-device, and correction semantics are not established in Corralio.

### Approved bounded V1 decision

- Primary send opportunity: **Thursday 20:37 UTC**.
- One retry-worker opportunity: **Thursday 22:37 UTC**. It sends no second reminder; it can claim only an eligible transient delivery that was not provider-accepted at the primary opportunity.
- Stage 2 cron expression: `37 20,22 * * 4`, on the separate push route.
- Model the campaign with the closed strategy key `fixed_us_v1` and explicit UTC event-window bounds. Do not store a reference timezone or describe any zone as the household/planning timezone.
- State the limitation in the durable record: this is a fixed U.S.-centered V1 notification window. It is not household-local precision.
- Household-local notification timing remains deferred until Corralio has trustworthy timezone data.

The founder explicitly rejected modeling `America/Chicago` as household/planning truth. No browser timezone attribute, event/venue inference, or household timezone architecture is authorized in this slice.

## Stage 1 architecture prepared

### Service-only subscription state

`corralio_push_subscriptions` stores the minimum protocol capability and owner/household relationship. Endpoint SHA-256 uniqueness prevents duplicate device registration without exposing a capability value. Authenticated roles have no direct table or function access. Membership loss, unsubscribe, and dead-endpoint outcomes deactivate the capability.

### Two-level idempotency

- `corralio_weekend_ready_campaigns`: exactly one row per household/planning weekend.
- `corralio_weekend_ready_deliveries`: exactly one row per campaign/subscription fingerprint.
- Claims use `FOR UPDATE SKIP LOCKED`, a ten-minute abandoned-claim window, maximum batch 50, and maximum two attempts.
- Provider acceptance is terminal and never retried.
- HTTP 404/410 is terminal and deactivates the subscription.
- HTTP 408/429/5xx or a bounded sender exception is transient. One retry becomes eligible after 90 minutes; a second transient failure becomes terminal `retry_exhausted`.
- Other non-2xx results are terminal invalid requests.
- Provider acceptance is not device delivery proof.

### Worker bounds

- Maximum claimed deliveries/invocation: 50.
- Maximum concurrent sends: 5.
- Maximum attempts/subscription/campaign: 2.
- Stage 2 sender timeout target: 10 seconds per push request.
- Maximum scheduled invocations: 2 per week.
- At current applied scale (one household), projected work is negligible. At the hard bound, a fully transient campaign can produce at most 100 provider attempts across the two invocations.
- The existing schedule-refresh cron and route remain untouched.

### Trusted URLs and secrets

- `CORRALIO_SITE_URL` remains the validated origin for the payload deep link and VAPID URL subject. No request/forwarded host is accepted.
- Stage 2 requires server-only `CORRALIO_VAPID_PRIVATE_KEY` and protocol-required public `NEXT_PUBLIC_CORRALIO_VAPID_PUBLIC_KEY`. No key exists or was generated in Stage 1.
- Payload copy is fixed and private-data free: `Your weekend is ready` / `Open Corralio to see your family plan.`
- The deep link is the trusted Corralio root with static `src=weekend_ready_push`; it contains no household/send ID. This marker can support a bounded notification-context return but is not cryptographic proof of a tap and must not be reported as such.

### Measurement

- Existing `corralio_weekly_engagement` supplies UTC-week first/last This Weekend views and subsequent-week return without duplicating page-view state.
- New closed `corralio_push_interactions` values cover `soft_ask_shown`, `permission_granted`, `permission_denied`, and `permission_dismissed`. It contains no device properties, endpoint, arbitrary payload, event data, or URL.
- Campaign/delivery state supplies eligible campaigns, attempts, provider acceptance/failure, retry, and dead endpoints.
- A This Weekend view after a campaign is a **post-send return**. The static deep-link marker may establish notification-context entry, but not device delivery or an unforgeable notification click. Stage 2 must preserve those labels.
- The closed routing-only `corralio_external_api_calls` table is unchanged.

## Prepared files and database gate

- Forward migration: `supabase/migrations/20260828_corralio_slice36a_weekend_ready_push.sql`
- Read-only catalog verifier: `scripts/analysis/corralio_slice36a_catalog_verification.sql`
- Network-free rollback-only behavioral verifier: `scripts/analysis/corralio_slice36a_behavioral_verification.sql`
- Read-only aggregate usage report: `scripts/analysis/corralio_slice36a_usage_report.sql`
- Offline pure subscription/payload/provider/batch boundary: `apps/corralio/lib/notifications/weekendReady.ts`
- Focused tests: `apps/corralio/lib/notifications/weekendReady.test.ts`

The migration has not been applied. The verifier files have not been run. Stage 1 adds no service worker, registration, permission UI, browser mutation, push provider dependency, VAPID key, route, cron entry, or runtime call. The timing/window decision is approved; only the database gate remains before Stage 2.

## Stage 2 evidence contract

Before UAT, declare synthetic subscriptions and provider-call caps. At most one real provider-accepted push is authorized in an appropriate desktop/test context. Automated tests use only fakes.

The following remain `UNVERIFIED ON PHYSICAL DEVICE` until final pre-launch testing:

- iPhone/iPad receipt;
- Android receipt;
- iOS Home Screen installation;
- OS/lock-screen presentation;
- background delivery reliability;
- native notification-tap handoff.

Stage 2 must clean disposable Auth, household, schedules/events, subscription, campaign, delivery, interaction, and temporary objects to zero and report exact push attempts plus existing provider/quota-ledger deltas.
