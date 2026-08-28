# Corralio Slice 3.6A — Stage 1 Audit and Decision Packet

Date: 2026-08-28

Scope: Weekend Ready Web Push only

Database state: migration prepared, not applied
Runtime state: household-timezone UI/action prepared behind the unapplied migration; no service worker, push route, cron, permission request, subscription write, or notification send enabled

## Verdict

`SLICE 3.6A READY FOR DATABASE VERIFICATION`

Stage 2 remains gated on founder/CPO approval of the exact household-local send recommendation below, human migration application, and both SQL verifiers. The founder approved the authoritative household-timezone foundation on 2026-08-28; that decision supersedes the temporary fixed-US workaround. Email remains deliberately deferred and is not assigned to Slice 3.6B. No Mapbox, traffic-aware routing, schedule-change push, Leave Soon, SMS, or native-app work started.

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

## Household Timezone Foundation amendment

### Repository fact

No trustworthy household timezone exists in the applied schema, Vercel cron is UTC, and the exact This Weekend UI window is browser-local. Event/venue timezones are destination truth and absolute event timestamps are already independent of household settings.

### Audit evidence

The existing one-owner household and Family settings surface support a narrow nullable planning field without a new preferences system. The browser can suggest an IANA zone, but only an explicit parent submission crosses the authenticated Server Action and authorization-scoped RPC. PostgreSQL's timezone catalog supplies independent server validation.

### Founder-approved product model

- `corralio_households.planning_timezone` is nullable and stores only a confirmed canonical IANA zone.
- Existing rows remain null. There is no migration backfill and no event-, venue-, home-, or server-timezone inference.
- `Intl.DateTimeFormat().resolvedOptions().timeZone` is an unpersisted suggestion only. The parent confirms it or chooses a human-labeled common U.S. zone; the same Family surface permits later correction.
- Null-timezone households remain ineligible for Weekend Ready.
- Household timezone is stable during travel. Event rendering continues to use event-local timezone; routing and leave-by continue to resolve absolute instants.
- The migration grants no direct authenticated update to the timezone column. A hardened authenticated RPC validates active ownership and `pg_timezone_names`; pure application validation supplies an earlier bounded error.
- No timezone analytics/history, home data, coordinates, device history, or provider call was added.

### Recommended local schedule — approval required

- Primary opportunity: **Thursday at 4:37 PM household local time**.
- Worker cadence: every 15 minutes during the bounded global Thursday-local evaluation/retry envelope: `7,22,37,52 2-23 * * 4` and `7,22,37,52 0-6 * * 5` UTC. These offsets cover IANA zones whose UTC offsets fall on whole, half, or quarter hours without one cron per timezone, while avoiding an all-week poll.
- The claim RPC accepts an injected absolute `p_now`, converts it using each confirmed household zone, and admits new campaigns only during the local 4:37–4:51 PM window.
- Friday 00:00 through Monday 00:00 is resolved in the household timezone into absolute event bounds. PostgreSQL and `Intl` IANA rules provide DST behavior.
- The worker first derives the bounded current eligible-zone set from PostgreSQL, joins through a partial `(planning_timezone, id)` household index, and bounds household candidates, inserted deliveries, and returned claims to 50. Recurring calls remain safe through campaign/delivery uniqueness and `SKIP LOCKED`.
- The existing 90-minute transient cooldown remains. Later invocations may claim the one retry outside the primary window, while accepted delivery is terminal.

This exact time/cadence is the remaining founder/CPO product decision before Stage 2.

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
- Maximum scheduled invocations: 116 per week across the two recommended UTC cron entries; only the bounded household-local window creates campaigns, while later calls can claim a due transient retry.
- At current applied scale (one household), projected work is negligible. Each invocation claims at most 50 deliveries with concurrency 5, and each campaign/subscription still has at most two provider attempts.
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
- Focused tests: `apps/corralio/lib/notifications/weekendReady.test.ts`, `apps/corralio/lib/householdTimezone.test.ts`, and `apps/corralio/lib/notifications/weekendReadyArchitecture.test.ts`

The migration has not been applied. The verifier files have not been run. Stage 1 prepares the confirmation UI and authorized action but adds no service worker, registration, push permission UI, push provider dependency, VAPID key, route, cron entry, or notification runtime call. The exact local time/cadence decision and database gate remain before Stage 2.

## Amendment verification

- 15 focused household-timezone/Weekend Ready tests passed, including summer/winter DST and null-timezone behavior.
- All 286 Corralio/shared-schedule regression tests passed.
- Corralio TypeScript and zero-warning lint passed.
- All four production builds passed; RI/TI emitted only their existing unrelated warnings.
- `git diff --check` passed.
- The browser suggestion is consistent with MDN's documented `Intl.DateTimeFormat().resolvedOptions().timeZone` behavior: `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/resolvedOptions`.
- PostgreSQL documents `pg_timezone_names` as its recognized named-zone catalog and named IANA zones as DST-rule-bearing rather than fixed offsets: `https://www.postgresql.org/docs/current/view-pg-timezone-names.html` and `https://www.postgresql.org/docs/current/datatype-datetime.html#DATATYPE-TIMEZONES`.
- No migration/verifier was applied or run, and no database mutation, provider call, cron, push, or deployment occurred.

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
