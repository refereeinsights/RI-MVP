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
