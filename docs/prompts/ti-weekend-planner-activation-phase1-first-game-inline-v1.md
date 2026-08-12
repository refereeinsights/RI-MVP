# TI Weekend Planner Activation Phase 1 — Prebuilt Tournament Weekend + One-Step First Game

Implement a focused activation improvement for TournamentInsights (TI) Weekend Planner. A parent entering from a tournament page should see a useful, prebuilt tournament-weekend context and one obvious first action: add the first game without signing in first.

## Objective

Increase persisted first-value activation for tournament entrants while preserving the existing planner, entitlement model, and anonymous-to-authenticated claim path.

## Scope

Work in the existing TI Weekend Planner and its current APIs/storage helpers. This phase includes only:

- a prebuilt tournament summary;
- a compact inline first-game flow;
- tournament-scoped eligibility;
- the minimum `field_label` persistence plumbing needed by that flow;
- post-activation progressive actions;
- activation analytics and focused tests.

Do not include logout/profile cleanup, pricing-copy changes, sharing redesign, broad analytics taxonomy cleanup, or unrelated planner refactors. Do not change RI.

## Tournament context and venue resolution

Use the existing planner session context from `apps/ti-web/lib/planner/plannerSession.ts`. The flow is eligible only when the entry page type is `tournament` and trusted context contains a valid tournament ID, tournament name, and valid start/end dates.

Resolve venue data in the server component at `apps/ti-web/app/weekend-planner/page.tsx` before rendering `PlannerClient`:

1. Verify an incoming `venue_id` belongs to the current tournament through `tournament_venues`; never trust the query string alone.
2. If there is no valid explicit venue and the tournament has exactly one trusted, non-inferred venue, use that venue.
3. If there are multiple venues, do not silently choose one.
4. Pass only the minimum venue shape: `id`, `name`, `address`, `city`, `state`, and `timezone`.
5. On a slow server fetch, the normal page request may remain pending. On a failed lookup, render the activation card with tournament dates and neutral venue fallback copy; do not block first-game entry.

Use the resolved venue timezone for date/time interpretation. Fall back to the existing tournament-timezone endpoint, then the browser timezone, then UTC.

## Tournament-scoped eligibility

Show the first-game activation flow only when the current tournament has no user-authored logistics event yet. A user-authored event is a manual planner event whose `tournament_id` exactly matches the current tournament ID. A seeded tournament context row does not count.

For anonymous users, use the existing anonymous snapshot and tournament alias pattern in `apps/ti-web/lib/planner/anonymousPlanner.ts`. Verify that tournament-scoped state is stored under `ti:anonymous-planner:v1:tournament:{tournament_id}` or an equivalent existing alias; if absent, add it using the same storage pattern. Do not use a global manual-event count, because an event for tournament A must not suppress activation for tournament B.

For authenticated users, use the planner events already loaded server-side and filter by exact `tournament_id` and manual source type. Verify that `tournament_id` exists in the anonymous event schema and claim payload; add it if missing.

## Pre-activation experience

Before first activation, replace the dense Planner controls with one primary card. Hide the normal schedule, calendar management, profiles, and other competing controls until the first game persists.

The card should show:

- tournament name;
- inclusive tournament dates;
- resolved venue name/location, `Multiple venues`, or neutral fallback copy;
- the prompt `What time is your first game?`;
- one primary `Add first game` button.

Match the current TI Planner visual system and keep the interaction mobile-friendly and accessible.

## Inline first-game form

After `Add first game` is selected, expand an inline form in the same card with:

- date;
- required game time;
- optional field/court label.

For a single-day tournament, preselect and fix the date; do not show a date picker. For a multi-day tournament, default to the start date and show a selector constrained to the inclusive tournament date range. Interpret and validate the date in the resolved venue timezone, falling back as described above.

Create a one-hour game event with:

- `event_type: "game"`;
- a tournament-aware title;
- exact current `tournament_id`;
- trusted venue ID/location only when one venue is resolved;
- optional `field_label`;
- `source_type: "manual"` through the existing persistence path.

Add `field_label` only to the minimum required create, anonymous snapshot, anonymous claim, and authenticated API paths. Do not broaden this into a full serialization refactor.

## Persistence and activation boundary

For authenticated users, await a successful `POST /api/planner/events` response before treating the event as persisted. For anonymous users, make the local-storage save helper return a success/failure result and require a successful write before updating the activation state.

If persistence fails, keep the form open, show an actionable error, emit the failure event, and allow retry. Do not show the post-activation state and do not emit success/activation analytics.

**Critical analytics rule:** when reusing the existing analytics events, `weekend_planner_first_meaningful_action` and `weekend_planner_activation_achieved` must fire **only after persistence succeeds**, never on submit attempt. This applies to both the inline first-game path and the existing generic manual-event path. The experiment measures persisted value, not intent.

## Post-activation experience

After the first game persists:

- collapse the Tournament Weekend card into a compact summary showing tournament name, dates, venue when known, and the first game's time/field;
- show a success confirmation;
- reveal the normal Planner experience;
- make `Add another game` the primary next action;
- show visually secondary actions for `Add hotel or check-in`, `Add meal`, and `Add travel`, reusing the existing generic manual-event form;
- for anonymous users, show secondary create-account/sign-in actions only after this persisted value exists.

## Analytics contract

Use the literal experiment property:

```text
activation_flow: "first_game_inline_v1"
```

Ensure it survives the typed event contract in `apps/ti-web/lib/tiAnalyticsEvents.ts` and the server allowlist/property sanitizer in `apps/ti-web/app/api/analytics/route.ts`.

Use the existing event names:

| Moment | Event |
| --- | --- |
| First-game CTA is available | `weekend_planner_first_action_available` |
| First-game CTA is viewed | `weekend_planner_first_action_cta_viewed` |
| First-game CTA is clicked | `weekend_planner_first_action_cta_clicked` |
| Inline form opens | `weekend_planner_manual_event_form_opened` |
| User first edits the form | `weekend_planner_manual_event_form_started` |
| Submit attempt | `weekend_planner_manual_event_submitted` |
| Anonymous local write succeeds | `weekend_planner_temporary_event_persisted` |
| Persistence fails | `weekend_planner_manual_event_failed` |
| First persisted action | `weekend_planner_first_action` |
| Persisted value exists | `weekend_planner_first_meaningful_action` |
| Activation is achieved | `weekend_planner_activation_achieved` |

The meaningful-action and activation-achieved events must share the same post-persistence boundary. View toggles must not count as a first meaningful action.

## Focused tests

Cover at least:

1. valid versus invalid tournament activation context;
2. single-day and multi-day date constraints;
3. tournament A events do not suppress tournament B;
4. seeded rows do not count as user-authored activation;
5. trusted single-venue, multiple-venue, and failed venue resolution behavior;
6. `field_label` through anonymous create/save/load/claim and authenticated create payloads;
7. anonymous local-storage failure does not emit meaningful-action or activation events;
8. authenticated API failure does not emit them either;
9. successful persistence emits both with `activation_flow: "first_game_inline_v1"`;
10. view toggles never emit first-action analytics;
11. post-activation progressive actions preserve tournament context.

## Acceptance criteria

- A valid tournament entrant with no manual event for that tournament sees one prebuilt activation card and no competing Planner controls.
- Single-day tournaments require only time; multi-day tournaments constrain date selection to the tournament range.
- The first game persists with tournament context and optional field label for anonymous and authenticated users.
- An unrelated event from another tournament does not suppress the flow.
- After successful persistence, the compact summary and normal Planner appear with progressive next actions.
- Authentication is requested only after value for anonymous users.
- `weekend_planner_first_meaningful_action` and `weekend_planner_activation_achieved` cannot fire before persistence succeeds.
- `activation_flow: "first_game_inline_v1"` reaches stored analytics properties.
- Existing Planner and RI behavior outside this scoped flow remains unchanged.
