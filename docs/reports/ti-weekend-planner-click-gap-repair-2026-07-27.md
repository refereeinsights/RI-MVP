# TournamentInsights Weekend Planner click-gap repair — 2026-07-27

## Root cause

The tournament-detail CTA event `weekend_planner_contextual_cta_clicked` did not persist `planner_session_id`.
That identifier was only generated later on `/weekend/[slug]`, so click rows could not join to canonical planner entry/auth/load events.

## Files changed

- `apps/ti-web/app/tournaments/[slug]/TournamentPlanningCtasClient.tsx`
- `apps/ti-web/lib/planner/plannerSession.ts`
- `apps/ti-web/lib/planner/plannerSession.test.ts`

## Change made

- Generate one stable client-side `planner_session_id` at the tournament CTA boundary.
- Append that same `planner_session_id` to the `/weekend/[slug]` CTA href.
- Persist that same `planner_session_id` on `weekend_planner_contextual_cta_clicked`.
- Preserve the existing server-side fallback on `/weekend/[slug]` when the parameter is absent.

## Validation

- Added focused unit coverage for tournament planner entry href generation.
- Planned validation command:
  - `node --import tsx --test apps/ti-web/lib/planner/plannerSession.test.ts`
