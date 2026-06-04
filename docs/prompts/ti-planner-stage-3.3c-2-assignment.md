# TI Weekend Planner Stage 3.3C-2 — Assignment

Do not push to Vercel in this pass.

## Context

Weekend Planner 3.3C-1 is already intended to exist and should already provide:

- child/team profile foundation
- child/team CRUD
- archived-team restore behavior
- management UI

Before beginning:

- verify 3.3C-1 schema, typed models, CRUD routes, and management UI are already present
- if 3.3C-1 is not actually present, stop and report
- do not implement 3.3C-1 inside this pass

## Goal

Allow users to assign:

- connected calendar feeds to a child/team
- manual events to a child/team

Then surface that family context inside the planner UI in a safe, minimal way.

This pass should improve organization for families with multiple children/teams without destabilizing:

- source/feed identity
- source/feed colors
- conflict warnings
- existing planner schedule behavior
- linked venue behavior
- duplicate/merge behavior
- entitlement behavior

## Hard boundaries

Do not change:

- Stripe
- auth model
- entitlement logic
- ICS import parsing rules
- duplicate merge logic
- venue matching logic
- planner timezone behavior
- planner map behavior
- source refresh behavior
- connected calendar lifecycle semantics
- database behavior beyond what is strictly required for assignment persistence

Do not add:

- auto-assignment heuristics
- bulk assignment tools
- AI suggestions
- large responsive redesign
- analytics expansion unless a tiny existing pattern makes it unavoidable
- planner filters in this pass
- new filter complexity beyond a minimal safe version

## Exact existing table/model names

Use the existing 3.3C-1 and planner table names already present in the repo:

- `public.planner_children`
- `public.planner_teams`
- `public.planner_event_sources`
- `public.planner_events`

Use the established type/model naming already present in code:

- `PlannerChildRow`
- `PlannerTeamRow`
- `PlannerChildWithTeamsRow`
- `PlannerEventRow`

Do not invent parallel child/team table names or alternate assignment entity naming.

## Core requirements

### 1. Assignment model

Add the minimum persistence needed so a planner source and a manual planner event can optionally reference:

- `child_profile_id`
- `team_profile_id`

Rules:

- a source may be assigned to:
  - a child only
  - a child + team
  - or remain unassigned
- a manual event may be assigned to:
  - a child only
  - a child + team
  - or remain unassigned
- if a team is chosen, it must belong to the selected child
- do not permit cross-child invalid team assignment
- unassigned must remain valid

If schema changes are needed:

- keep them minimal and reversible
- prefer nullable foreign-key style assignment fields over new assignment tables unless the existing data model clearly requires otherwise

### 2. Connected calendar source assignment UI

On the connected calendar/source surface in Weekend Planner:

- add a compact assignment control for each source
- user should be able to set:
  - no assignment
  - child only
  - child + team

Requirements:

- preserve existing source card layout as much as possible
- preserve source label behavior
- preserve source color identity
- preserve refresh/disconnect actions
- preserve current mobile usability
- assignment UI should feel secondary to the source identity, not overpower it

Safe UX direction:

- small `Assigned to` row or inline control on each source card
- if only a child is selected, show child name
- if child + team selected, show `Child · Team`
- if none selected, show `Unassigned`

### 3. Manual event assignment UI

For manual planner events:

- allow assignment at edit time
- allow assignment at creation time only if it is straightforward and does not destabilize the form

Support:

- unassigned
- child only
- child + team

Requirements:

- do not break manual event create/edit/delete flow
- do not break linked venue behavior
- do not break loaded imported event behavior
- do not require assignment to save a manual event

If create-time assignment makes the form unstable, support assignment cleanly in edit first and leave create-time assignment out of this pass.

### 4. Planner card family context

Display family assignment context on planner event cards in a compact, readable way.

Show when present:

- child name
- optional team name

Safe display examples:

- `Assigned: Emma`
- `Assigned: Emma · Owls 12U`

Requirements:

- do not visually overpower event title/time/location
- keep source/feed identity visually distinct from family assignment
- do not confuse family assignment with source label
- do not confuse family assignment with venue/location rows
- do not remove existing source/feed color indicators
- do not remove or weaken conflict warning visibility

### 5. Imported events behavior

For imported events:

- family context is derived at render time from the assigned source only

Do not:

- add direct assignment columns to imported event rows for imported-event-specific behavior
- add assignment UI for individual imported events
- mutate imported event titles/descriptions to inject family labels
- rewrite historical imported event content unnecessarily
- backfill historical imported events with assignment data in this pass

Source-level assignment is sufficient for this pass. Derive display context at read/render time only.

### 6. Filters are deferred

Filters are deferred to 3.3C-3.

Do not add in this pass:

- planner filters
- child/team filter chips
- saved filter state
- filter-specific URL state
- filter-specific responsive UI

### 7. Conflict/source separation

This is critical:

- preserve conflict warning separation from family assignment
- preserve source/feed color separation from family assignment
- preserve duplicate/merge cues from family assignment

Family context is an added label layer only.
It must not replace or blur:

- source identity
- conflict warnings
- venue context
- entitlement gating cues

### 8. Validation and data safety

Enforce:

- a selected team must belong to the selected child
- clearing child must clear any invalid team selection
- archived teams/children must behave safely and predictably
- existing assigned data must not be required for planner rendering
- null/unassigned data must render cleanly

Validation must exist in both places:

- UI level: disable/filter invalid team choices
- API/server level: reject invalid child/team combinations before persistence

Archived-profile safety rule:

- existing assignments may still display archived names
- selectors must remain coherent and must not produce broken state

### 9. PlannerClient.tsx scope control

`apps/ti-web/app/_components/planner/PlannerClient.tsx` is large and high-risk.

If you touch it, limit changes to:

- source card rendering / assignment controls
- manual event assignment handlers
- event card family-context rendering

Do not refactor or change:

- planner schedule logic
- conflict detection logic
- entitlement gating logic
- map logic
- duplicate/merge behavior beyond what is strictly needed for assignment display

### 10. Mobile safety

At `375px` width:

- assignment controls on source cards must wrap cleanly
- family context on cards must wrap cleanly
- no horizontal overflow may be introduced
- no existing action row should become unreachable

### 11. Likely files in scope

Search and work only where needed, likely including:

- planner profile schema / migrations if required
- planner source APIs
- planner event APIs
- planner source card UI
- manual event create/edit UI
- planner card rendering UI
- planner typed models

### 12. Explicit non-goals

Do not implement in this pass:

- automatic assignment from calendar names
- bulk assign all events from a source retroactively with custom migration logic unless inherently needed
- assignment analytics expansion
- calendar/provider-specific assignment rules
- cross-household sharing
- roster import
- advanced permissions
- redesign of planner layout
- major admin tooling
- planner filters

## Acceptance criteria

- connected calendar feeds can be assigned to child/team or left unassigned
- manual events can be assigned to child/team or left unassigned
- invalid cross-child/team combinations are prevented
- planner cards display compact family context when assigned
- imported events derive family context from source assignment only
- source/feed color identity still reads clearly
- conflict warnings still read clearly
- duplicate/merge behavior still works
- venue-linked behavior still works
- refresh/disconnect behavior still works
- no entitlement, Stripe, auth, venue-matching, timezone, or filter regressions are introduced
- no planner filter system is added in this pass

## Validation

After implementation:

- run targeted tests/checks if present
- run `npm run lint --workspace ti-web`
- run `npm run build --workspace ti-web`
- if there are unrelated pre-existing warnings/issues, separate them clearly from this pass

## Manual checks

Verify:

1. assign a source to child only
2. assign a source to child + team
3. clear a source assignment
4. edit a manual event with assignment
5. create a manual event with assignment only if implemented safely
6. planner cards show family context when assigned
7. imported events reflect source-level family context correctly
8. source color identity still appears unchanged
9. conflict warning appearance/meaning remains intact
10. refresh on an assigned source does not break assignment display
11. archived profile/team behavior does not create broken selectors or blank labels
12. unassigned state renders cleanly everywhere
13. no horizontal overflow at 375px

## Final response requirements

After implementation, report:

- whether 3.3C-1 prerequisite verification passed
- files changed
- whether a schema migration was required
- exact assignment model used
- exact existing table/model names extended
- whether manual-event create-time assignment was implemented or deferred
- confirmation that imported events use source-level derived assignment only
- confirmation that filters were intentionally deferred to 3.3C-3
- confirmation that source colors and conflict warnings remained separate
- validation results
- any follow-up recommended for a later 3.3C-3 stage
