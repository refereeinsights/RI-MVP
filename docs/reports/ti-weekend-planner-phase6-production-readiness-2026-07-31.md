# TournamentInsights Weekend Planner — Phase 6 Production Readiness

Date: 2026-07-31  
Status: implemented locally only

## Verdict

Ready after listed fixes.

The repaired anonymous-first planner flow is locally functional and analytically distinguishable, but one true rollout blocker existed in the original Phase 6 implementation: active planner sessions could flip from treatment to control if the rollout percentage or enable flag changed mid-session. That blocker is fixed in this pass by carrying the assigned experiment variant and flag state inside the planner session context URLs and auth return path.

## Scope

This phase remains limited to rollout safety and live measurement:

- reversible rollout control
- stable control/treatment attribution
- planner-session analytics continuity
- canonical production funnel SQL
- production UAT and rollback instructions

No new planner product features were added.

## Feature-flag audit

### Implemented flag contract

Primary rollout helper:

- `apps/ti-web/lib/planner/plannerActivationExperiment.ts`

Experiment name:

- `anonymous_planner_activation_v1`

Supported environment variables:

- `NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ENABLED`
- `NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ROLLOUT_PERCENT`
- `NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_INCLUDE_AUTHENTICATED`

Backward-compatible legacy fallback:

- `NEXT_PUBLIC_ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY`

### Where rollout is evaluated

Tournament page entry decision:

- `apps/ti-web/app/tournaments/[slug]/page.tsx`

Planner route behavior:

- `apps/ti-web/app/weekend-planner/page.tsx`

Analytics metadata propagation:

- `apps/ti-web/app/tournaments/[slug]/TournamentPlanningCtasClient.tsx`
- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/api/analytics/route.ts`

### Evaluation model

- Initial assignment is computed server-side from `planner_session_id`, auth state, and rollout env vars.
- Assignment is now persisted in the planner session context as:
  - `experiment_name`
  - `experiment_variant`
  - `feature_flag_state`
- Subsequent planner route loads and auth returns reuse the locked session assignment rather than recomputing from the latest env vars alone.

### Rollout safety result

- Global disable exists.
- New sessions can be switched back to control immediately.
- Active sessions now remain on their originally assigned variant through refresh and auth return.
- Already-claimed authenticated plans are unaffected by rollback.
- Anonymous local planner state is unaffected by rollback because it remains local-first and keyed by planner session/device aliases.

## Control versus treatment definition

### Control

Previous production flow:

`tournament CTA → /weekend/[slug] → auth/save path → /weekend-planner`

### Treatment

Repaired flow:

`tournament CTA → /weekend-planner → seeded anonymous planner → first manual item → save/auth prompt → claim`

### Coexistence assessment

Both flows can safely coexist for limited rollout.

Reason:

- control still uses the older `/weekend/[slug]` bridge
- treatment enters `/weekend-planner` directly
- both flows now carry the same `planner_session_id`
- both flows can carry the same experiment metadata in URL context
- both flows converge on the same planner and claim mechanics

Recommended rollout order remains:

1. percentage-based session assignment
2. tournament or venue holdout if needed
3. before/after comparison only if traffic is too low for a clean split

## Stable-assignment audit

### Current assignment key

- `planner_session_id`

### Persistence location

- planner session query params
- preserved through `buildPlannerHref(...)`
- preserved through auth `returnTo`

### Newly fixed blocker

Before this pass, assignment was only hash-stable, not session-sticky. If the rollout percent changed from, for example, `100` to `0`, an in-flight treatment session would flip to control on refresh because `getPlannerActivationAssignment(...)` recomputed only from live env vars.

This pass fixes that by:

- extending `PlannerSessionContext` in `apps/ti-web/lib/planner/plannerSession.ts`
- parsing and rebuilding:
  - `experiment_name`
  - `experiment_variant`
  - `feature_flag_state`
- honoring locked values inside `getPlannerActivationAssignment(...)`

### Stability result by hop

- tournament CTA click: stable
- planner route entry: stable
- refresh: stable after this fix
- local anonymous resume: stable after this fix
- login: stable after this fix
- signup: stable after this fix
- email confirmation return: stable if the same planner session URL is preserved
- anonymous claim: stable
- post-auth return: stable after this fix
- hotel search/outbound from planner: session context remains available
- browser back navigation: stable if the same planner session URL remains in history

### Behavior when identifiers are missing

- no valid `planner_session_id` means no durable experiment join
- fallback route behavior remains functional
- analytics quality degrades to unjoinable session-level data

### Behavior when rollout changes mid-session

- old behavior: session could flip
- new behavior: locked treatment or locked control persists for that planner session

## Analytics property audit

### Validated implemented planner properties

Validated in:

- `apps/ti-web/lib/tiAnalyticsEvents.ts`
- `apps/ti-web/app/api/analytics/route.ts`

Implemented and persisted where applicable:

- `experiment_name`
- `experiment_variant`
- `feature_flag_state`
- `planner_session_id`
- `tournament_id`
- `tournament_slug`
- `venue_id`
- `entry_source`
- `entry_page_type`
- `entry_path`
- `entry_placement`
- `current_page_type`
- `current_page_path`
- `request_source`
- `auth_state`
- `entitlement`
- `surface`
- `source_page_type`
- `context_type`
- `cta_type`
- `action_surface`
- `first_action_type`

### Important naming correction

The implemented field name is:

- `entitlement`

Not:

- `entitlement_state`

### Device segmentation

There is no dedicated planner rollout `device_type` field on the critical Weekend Planner activation events today.

Current safe reporting approach:

- derive device from `ua`
- use `device_type` only if present on a given event family

### Metrics currently measurable

Authoritative or defensible now:

- CTA clicks
- planner ready
- first meaningful action
- save prompt viewed
- auth started
- auth completed
- anonymous claim started
- anonymous claim succeeded
- anonymous claim failed
- first authenticated action after claim
- planner-session hotel search start via `lodging_search_session`
- planner-session hotel outbound via `ti_outbound_clicks`

### Metrics not fully instrumented as dedicated canonical planner events

Not directly available today:

- dedicated `plan_saved` event
- dedicated cross-session `planner_returned` event
- reliable seven-day return across anonymous and authenticated sessions from planner analytics alone
- stable analytics-side `user_id`
- dedicated planner `anonymous_visitor_id`
- dedicated planner `temporary_plan_id`
- dedicated planner `authenticated_plan_id`

### Current proxy rule used in rollout SQL

For anonymous-first treatment measurement:

- `plan_saved_sessions` currently uses `weekend_planner_anonymous_claim_succeeded` as the authoritative save proxy

This is defensible for the repaired anonymous flow, but it undercounts authenticated-direct plan save behavior that never needed anonymous claim.

## Rollback behavior audit

### New signed-out visitor before creating an item

- new sessions can be routed back to control immediately by env change

### Signed-out visitor with temporary planner items

- local data is retained
- rollback does not delete the local snapshot
- if the user reopens the exact treatment session URL, the local snapshot still exists

### User currently in authentication

- if the auth return URL already carries treatment assignment, the session remains treatment

### User returning after authentication

- claimed items remain attached to the authenticated account
- rollback does not re-run claim

### User with a completed claim

- no rollback data loss
- authenticated planner data remains authoritative

### User with an existing authenticated tournament plan

- no overwrite behavior introduced by this phase
- claim route still uses duplicate-safe merge semantics

### Multiple tabs

- session-level duplicate event suppression still relies on session storage for some view events
- planner data correctness remains server/local-data driven, not event-driven

### Rollback result

Rollback is safe for new traffic and non-destructive for existing treatment sessions.

## Production funnel SQL

Canonical script:

- `scripts/analysis/ti_weekend_planner_phase6_rollout.sql`

What it now reports by date and experiment split:

- CTA clicks
- planner ready sessions
- first meaningful action sessions
- save prompt viewed sessions
- auth started sessions
- auth completed sessions
- claim started sessions
- claim completed sessions
- claim failed sessions
- plan saved proxy sessions
- second meaningful action proxy sessions
- hotel search started sessions
- hotel affiliate outbound sessions

Breakdowns included:

- `experiment_name`
- `experiment_variant`
- `feature_flag_state`
- `auth_state`
- `entitlement`
- device segment derived from `ua`
- traffic source
- tournament
- venue

Known query limitation:

- `seven_day_return_sessions` is intentionally `NULL` because the current planner analytics contract does not provide a stable cross-session key for that metric

## Monitoring specification

### Primary KPI

`first meaningful actions / planner-ready sessions`

### Access metrics

- CTA → planner-ready rate
- planner initialization error rate
- direct-entry correctness by variant

### Activation metrics

- planner-ready → first meaningful action
- first meaningful action → save prompt viewed
- first meaningful action → second meaningful action proxy

### Save and claim metrics

- save prompt → auth started
- auth started → auth completed
- claim started → claim completed
- claim failure rate
- duplicate claim/import incidents from browser UAT or SQL spot checks
- first meaningful action → plan saved proxy

### Hotel-support metrics

- planner-ready → hotel search started
- planner-ready → hotel affiliate outbound

### Reliability metrics

- anonymous-state recovery failures
- duplicate imported items
- claim mismatch failures
- planner API failures
- client initialization regressions

### Threshold guidance

Recommended Stage 1 watch thresholds:

- claim completion below `95%` = investigate before expansion
- claim failure above `1%` = stop expansion
- duplicate claim/import above `0.5%` = stop expansion
- planner-ready event integrity failure = blocker
- first meaningful action event integrity failure = blocker

## Staged rollout recommendation

### Stage 0 — internal production verification

- staff/UAT accounts only
- verify SQL persistence for one treatment session and one control session
- verify rollback by disabling new-session treatment while preserving an existing treatment session

### Stage 1 — 5% eligible tournament planner traffic

Expand only if:

- experiment metadata persists correctly
- planner-ready is accurate
- first meaningful action is accurate
- no claim ownership defects appear
- no authenticated planner regression appears

### Stage 2 — 25%

Expand only if:

- at least 100 treatment planner-ready sessions exist, where traffic permits
- claim completion is at least `95%`
- critical error rate is below `1%`
- duplicate import rate is below `0.5%`

### Stage 3 — 50%

Expand only if:

- activation outperforms or at least matches the prior baseline
- hotel search/outbound does not materially regress
- no data-safety issue remains unresolved

### Stage 4 — 100%

Expand only after founder review of:

- first meaningful action rate
- save conversion proxy
- claim reliability
- second action proxy
- hotel engagement
- early return evidence from supporting datasets

## Release blockers

### Fixed in this pass

- active treatment sessions could switch variants mid-session during rollout changes

Files changed for this fix:

- `apps/ti-web/lib/planner/plannerActivationExperiment.ts`
- `apps/ti-web/lib/planner/plannerSession.ts`
- `apps/ti-web/app/tournaments/[slug]/page.tsx`
- `apps/ti-web/app/weekend-planner/page.tsx`

### Remaining non-blocking limitations

- browser tooling still cannot inspect analytics POST bodies directly
- seven-day return is not fully measurable from current planner analytics alone
- dedicated `plan_saved` is still a proxy for anonymous-first treatment

### Current blocker status

No unresolved release blockers remain in local code after this pass.

## Code changes made

### Session-sticky rollout assignment

Added planner session context persistence for:

- `experiment_name`
- `experiment_variant`
- `feature_flag_state`

This ensures:

- active treatment sessions survive refresh
- auth `returnTo` preserves variant
- rollback can stop new sessions without corrupting active ones

### Query and reporting hardening

Updated rollout SQL to:

- use the implemented analytics field names
- derive device from `ua`
- include auth and entitlement splits
- join planner sessions to hotel search and hotel outbound records
- expose current unmeasurable fields explicitly instead of implying false precision

## Tests run

- `npx tsx --test apps/ti-web/lib/planner/plannerActivationExperiment.test.ts apps/ti-web/lib/planner/plannerSession.test.ts`
- `npx tsc -p apps/ti-web/tsconfig.json --noEmit`

## Exact production enable procedure

1. Deploy the build containing this Phase 6 pass.
2. Set:
   - `NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ENABLED=true`
   - `NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ROLLOUT_PERCENT=5`
   - `NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_INCLUDE_AUTHENTICATED=false`
3. Keep `NEXT_PUBLIC_ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY=false` unless intentionally using the legacy override for a full treatment environment.
4. Run one controlled treatment UAT session and one controlled control UAT session.
5. Run `scripts/analysis/ti_weekend_planner_phase6_rollout.sql` against production for the exact rollout window.
6. Confirm:
   - experiment metadata is present
   - no duplicate claim/import occurred
   - treatment sessions preserve variant across auth return
7. Only then expand beyond 5%.

## Exact production rollback procedure

1. Set:
   - `NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ENABLED=false`
   - `NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ROLLOUT_PERCENT=0`
2. Redeploy environment changes.
3. New tournament CTA sessions return to control.
4. Do not clear planner local storage or database planner data.
5. Spot-check one active treatment session URL:
   - it should remain stable if already issued with treatment context
6. Run the rollout SQL again and verify:
   - no new treatment sessions are created after rollback
   - no spike in claim failures or planner API failures appears

## Recommended first rollout

5% of eligible signed-out tournament planner CTA traffic.

## Rollout controls

The flow can now be enabled and disabled safely for new traffic without losing local anonymous state or corrupting claimed planner data.

## Analytics confidence

High for:

- control/treatment split
- planner-ready
- first meaningful action
- auth and claim chain
- hotel search/outbound by planner session

Moderate for:

- plan-save proxy
- second meaningful action proxy

Low / not available:

- seven-day return from planner analytics alone

## Rollback trigger

Disable treatment immediately if any of the following appears in Stage 0 or Stage 1:

- claim attaches items to the wrong account
- duplicate import rate exceeds `0.5%`
- claim completion falls below `95%`
- planner-ready or first meaningful action events are clearly inaccurate
- authenticated planner behavior regresses
- treatment/control can no longer be separated in SQL

## Do not build next

Public sharing expansion, broader anonymous backend storage, calendar-feed redesign, and new planner product features should remain paused until production activation data is available.
