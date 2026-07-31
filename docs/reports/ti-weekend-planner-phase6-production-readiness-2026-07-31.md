# TournamentInsights Weekend Planner — Phase 6 Production Readiness

Date: 2026-07-31
Status: implemented locally only

## Scope

Phase 6 was kept narrow:

- rollout control
- experiment metadata
- authoritative funnel queryability
- UAT guidance for production readiness

No new planner product features were added.

## Changes made

### Rollout helper

Added `apps/ti-web/lib/planner/plannerActivationExperiment.ts`.

This introduces a minimal experiment contract for:

- `anonymous_planner_activation_v1`
- `control` vs `treatment`
- global enable / disable
- rollout percentage
- optional authenticated-user exclusion
- stable session assignment using `planner_session_id`

Supported env vars:

- `NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ENABLED`
- `NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ROLLOUT_PERCENT`
- `NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_INCLUDE_AUTHENTICATED`

Backward compatibility remains for:

- `NEXT_PUBLIC_ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY`

### Tournament CTA metadata

Tournament planner CTA analytics now attach:

- `experiment_name`
- `experiment_variant`
- `feature_flag_state`

### Planner activation metadata

Planner-side tracked events now attach the same experiment metadata automatically.

### Analytics persistence

Planner-shaped analytics persisted through `/api/analytics` now retain:

- `experiment_name`
- `experiment_variant`
- `feature_flag_state`

### Repeatable funnel SQL

Added:

- `scripts/analysis/ti_weekend_planner_phase6_rollout.sql`

This reports:

- CTA clicks
- planner ready
- first meaningful action
- save prompt viewed
- auth started / completed
- claim started / completed
- second meaningful action

## What this does not do

- does not deploy anything
- does not create a general experimentation platform
- does not add seven-day or thirty-day return persistence by itself
- does not change `/weekend/[slug]` shared-route behavior
- does not broaden anonymous planner capabilities

## Local validation

Added:

- `apps/ti-web/lib/planner/plannerActivationExperiment.test.ts`

Coverage includes:

- disabled default
- legacy direct-entry fallback
- authenticated-user exclusion behavior

## Local browser UAT result

Verification timestamp:

- 2026-07-31, approximately 12:22 PM local

Flow verified:

- signed-out tournament detail CTA
- direct entry to `/weekend-planner`
- seeded tournament context
- first manual event while signed out
- correct delayed save/auth prompting
- auth `returnTo` preserving the same `planner_session_id`
- successful anonymous claim
- no duplicate import on refresh or revisit

Verified planner session:

- `planner_session_id = 21f0a249-a2d2-4107-b347-37b343e09516`

Verified related context:

- `tournament_id = d390cb3f-06e6-4060-b4c0-74435ba8b9a6`
- `venue_id = e607118b-250b-4d98-b5d6-e0fb1f9f233f`

Observed outcome:

- PASS WITH LIMITATIONS

Limitation:

- Browser tooling could confirm `/api/analytics` POST activity and the server-rendered experiment state, but could not inspect analytics POST bodies directly.
- As a result, this UAT pass does not by itself prove the literal on-wire payload keys for:
  - `experiment_name`
  - `experiment_variant`
  - `feature_flag_state`

Recommended follow-up:

- Run SQL verification against `ti_map_events` using the exact `planner_session_id` above to confirm:
  - experiment metadata presence
  - canonical event ordering
  - no duplicate claim events
