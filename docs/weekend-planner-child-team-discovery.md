# TournamentInsights Weekend Planner — Child/Team Profiles Discovery

Date: 2026-06-04
Stage: `3.3C-0`
Status: Discovery / implementation-planning only

## Current State

Weekend Planner is currently a user-owned, schedule-first system centered on:

- `planner_events` for rendered schedule items
- `planner_event_sources` for connected ICS calendar sources
- `planner_weekends` for optional weekend grouping
- `team_name` string fields on both events and sources
- user-owned RLS boundaries on planner tables

Current ownership is entirely `user_id`-based. There is no first-class child or team entity. Existing event/source labeling relies on free-text `team_name`, which is useful for display but is not durable ownership.

Relevant constraints from the existing implementation:

- ICS refresh relies on `(user_id, source_id, source_event_uid)` identity and must remain stable.
- Duplicate detection already uses `team_name` as one signal, but duplicate logic is not ownership-aware.
- Source disconnect keeps imported events and only disconnects future refreshes.
- Venue linking, source labels, duplicate merge, and mobile next-up behavior are already implemented and should remain additive.

## Product Goal

Add family-aware structure to Weekend Planner so a household can manage:

- multiple children
- multiple teams per child
- separate feeds/calendars
- optional assignment of events and feeds

without turning the planner into a roster-management or household-collaboration system.

The goal is not to build a perfect abstract sports identity model. The goal is to make ownership clearer for parents while keeping planner behavior stable and low-risk.

## Constraints

- Keep rollout optional. Existing unassigned data must continue to work.
- Preserve ICS source identity and refresh semantics.
- Preserve user-owned RLS boundaries.
- Avoid many-to-many event assignment in the first release unless absolutely required.
- Avoid heuristics/backfill that can silently mis-assign events or feeds.
- Keep the first release schedule-first and mobile-friendly.

## Recommended Model

### Core entities

Recommend introducing two new first-class planner entities in later implementation stages:

1. `planner_children`
2. `planner_teams`

Recommended semantics:

- A `child` is the person.
- A `team` is a sports team owned by exactly one child in the first release.
- A child can have multiple teams.
- A team belongs to one child.

This is intentionally child-first. It matches the family mental model better than a team-only graph and avoids early many-to-many complexity.

### Recommended first-release shape

`planner_children`
- `id`
- `user_id`
- `display_name`
- `birth_year` or age-band: deferred
- `color_token`: optional, likely later
- `sort_order`: optional but useful early
- `is_archived`
- timestamps

`planner_teams`
- `id`
- `user_id`
- `child_id`
- `display_name`
- `sport`
- `season_label`: optional
- `team_label` or division: optional
- `sort_order`: optional but useful early
- `is_archived`
- timestamps

### Entity rules

- A child can belong to multiple teams: **yes**
- A team can exist without a child: **not in the first release**
- One event can belong to multiple children/teams: **no, defer**
- One feed can belong to multiple children/teams: **no, defer**
- Manual events can be child/team-scoped: **yes**
- Imported ICS events can be child/team-scoped: **yes, via source defaults plus optional event override in later stage**

## Recommended Ownership Model

## Minimum viable rule

Ownership should attach to **both feeds and events**, but with different priorities:

- feeds establish the default ownership for future imported events
- events can carry explicit ownership for display/filtering and for override cases

### Recommendation

Later stages should add optional nullable ownership columns directly on:

- `planner_event_sources`
  - `child_id`
  - `team_id`
- `planner_events`
  - `child_id`
  - `team_id`

This is the recommended MVP over join tables.

### Why direct nullable columns first

- simpler queries for the existing planner list and calendar
- easier event-card filtering and chips
- easier refresh inheritance logic
- no immediate need for event-to-many-team assignment
- lower risk than adding ownership join tables into every planner query path

### Ownership rules

1. `team_id` implies a single canonical child via `planner_teams.child_id`.
2. `child_id` may exist without `team_id`.
3. If both are present, the team must belong to the selected child.
4. If a source/feed is assigned to a team, imported events inherit both `team_id` and the implied `child_id`.
5. If a source/feed is assigned only to a child, imported events inherit only `child_id`.
6. Manual events may be:
   - unassigned
   - child-assigned only
   - team-assigned (with implied child)

### Why not team-only ownership

Team-only ownership would make individual child-scoped items awkward:

- travel just for one child
- school/schedule coordination for one child
- generic household logistics that are child-specific but not team-specific

Allowing optional child-only assignment solves this without requiring a household entity.

## UI Impact Surfaces

### Must change in `3.3C-1`

- profile management surface for child and team creation/edit/archive
- basic picker models/types used by later planner UIs
- passive display surfaces only if needed to verify foundation state

### Must change in `3.3C-2`

- event edit/add flows
- ICS source connect/edit flows
- event cards (badges/labels only)
- source/feed cards
- filters/grouping affordances
- next-up card labels if ownership is present
- API route payloads and validators for event/source assignment

### Can wait until after `3.3C-2`

- weekend summary by child/team
- advanced grouping presets
- color customization
- child/team-aware saved views
- cross-weekend summaries

### Should stay unchanged for first release

- duplicate detection model
- duplicate merge semantics
- linked venue display model
- venue matching/search behavior
- entitlement logic
- PWA shell behavior

## Future Schema Recommendation

### Required in `3.3C-1`

Add new profile tables only:

- `planner_children`
- `planner_teams`

Recommended indexes:

- `planner_children (user_id, sort_order)`
- `planner_teams (user_id, child_id, sort_order)`

Recommended constraints:

- `planner_teams.child_id` references `planner_children.id`
- `planner_children.user_id` and `planner_teams.user_id` remain user-owned under RLS
- team uniqueness should be scoped conservatively; do not over-constrain names globally

### Required in `3.3C-2`

Add nullable ownership columns directly on existing planner tables:

- `planner_events.child_id`
- `planner_events.team_id`
- `planner_event_sources.child_id`
- `planner_event_sources.team_id`

Recommended indexes:

- `planner_events (user_id, child_id, starts_at)`
- `planner_events (user_id, team_id, starts_at)`
- `planner_event_sources (user_id, child_id)`
- `planner_event_sources (user_id, team_id)`

### Intentionally deferred

- event-to-many-team join tables
- feed-to-many-team join tables
- household entity
- cross-user sharing
- roster/player abstractions
- league/club hierarchy

## Migration Strategy

### Existing users

Do not force migration.

Users with no child/team profiles should continue using Weekend Planner exactly as they do today.

### Existing events and feeds

Leave them unassigned by default.

Do not do heuristic backfill from:

- `team_name`
- source labels
- tournament names
- venue metadata

That is too risky and would create trust problems.

### Launch posture

Launch with optional assignment.

Recommended rollout sequence:

1. Create child/team profiles
2. Optionally assign sources/feeds to a child/team
3. Newly refreshed/imported events inherit source ownership
4. Users can optionally assign or reassign manual events
5. Mixed/messy feeds remain valid and can stay unassigned

### Mixed-team feed rule

If one ICS feed contains events for multiple teams, the first release should not attempt auto-splitting.

Recommended behavior:

- allow source-level assignment to remain blank
- allow event-level assignment overrides later in `3.3C-2`
- document that mixed feeds are supported but not auto-classified

### Multi-child weekend rule

If a tournament weekend spans multiple children:

- individual events can be assigned separately
- shared logistics events can remain unassigned
- no multi-child event assignment in MVP

This keeps the model understandable without requiring join tables.

## UX Strategy

### Recommended mental model

Use a **child-first, team-second** model.

Parents think in terms of:

- “This is Emma’s soccer team”
- not “This is team X in an abstract household graph”

### Recommended first-release UX

- Users create child profiles first, but only when needed.
- Team creation happens inside a child context.
- Feed assignment should happen from feed setup/edit.
- Event assignment should happen from event add/edit and from source-imported event edit.

### Label strategy

Use:

- `Child`
- `Team`

Avoid:

- athlete
- player
- roster
- household member

Those either broaden scope or make the model less clear.

## Risks and Deferred Decisions

### Key risks

1. **Mixed ICS feeds**
   - one source may contain multiple real teams
   - avoid pretending source-level assignment always solves ownership

2. **Legacy `team_name` vs first-class `team_id`**
   - existing string labels will continue to exist
   - they must not be treated as canonical ownership after rollout

3. **Refresh inheritance**
   - ICS refresh must preserve explicit event ownership correctly
   - source default vs event override precedence must be defined clearly in `3.3C-2`

4. **Badge density on event cards**
   - child/team labels can crowd already dense cards
   - first release should use compact badges, not redesign cards

### Deferred decisions

- color customization per child/team
- archived vs deleted semantics in UI
- season/year normalization
- per-child default filters
- cross-household sharing/collaboration
- many-to-many event ownership

## Stage Breakdown

## `3.3C-1 — Child/Team Profiles Foundation`

Scope:

- add child/team profile tables and RLS
- add basic CRUD/profile management UI
- add type definitions and shared selectors/pickers
- no event/source assignment yet
- no planner card/filter overhaul yet

Acceptance criteria:

- a user can create, edit, archive, and order child profiles
- a user can create, edit, archive, and order teams under a child
- no existing planner events or feeds are changed automatically
- no planner behavior regresses when no profiles exist
- docs and admin reference are updated

## `3.3C-2 — Assign Events and Calendar Feeds to Child/Team`

Scope:

- add optional `child_id` / `team_id` ownership on sources and events
- assign feeds during source setup/edit
- assign manual events during add/edit
- inherit ownership during ICS import/refresh
- add compact child/team labels to cards and sources
- add basic filters only if they remain compact and schedule-first

Acceptance criteria:

- a user can assign a source to a child/team or leave it unassigned
- refreshed/imported events inherit expected ownership
- a user can assign manual events to a child/team or leave them unassigned
- mixed feeds can remain unassigned without breaking import/refresh
- existing venue, duplicate, entitlement, and source identity behaviors remain intact

## Recommended Naming Convention

Use explicit `planner_*` naming to stay aligned with the existing planner schema.

### Tables

- `planner_children`
- `planner_teams`

### TypeScript types

- `PlannerChildRow`
- `PlannerTeamRow`
- `PlannerChildCreateBody`
- `PlannerTeamCreateBody`
- `PlannerChildUpdateBody`
- `PlannerTeamUpdateBody`

### Variables and payload fields

- `childId`
- `teamId`
- `assignedChildId`
- `assignedTeamId`

Do not use:

- `athleteId`
- `playerId`
- `rosterId`

## Recommended Next Implementation Prompt

Next implementation stage should be:

`3.3C-1 — Child/Team Profiles Foundation`

That stage should create:

- the new planner profile tables
- RLS policies
- basic CRUD/profile management UI
- shared types and selectors

without assigning existing events or feeds yet.
