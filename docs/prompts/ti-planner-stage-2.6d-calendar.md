# TournamentInsights Planner — Stage 2.6D: Calendar View + Source Color Coding (SAFE v1.2)

You are working inside the existing TournamentInsights monorepo/codebase.

Stage 2.3 ICS refresh behavior is implemented and must be preserved.  
Stage 2.4A discovery is complete.  
Stage 2.4B suppression persistence + filtering is complete.  
Stage 2.4C duplicate candidate detection + Keep separate dismissal persistence is complete.  
Stage 2.4D manual merge endpoint + truncation disclosure is complete.  
Stage 2.4E merge confirmation UI + conflict resolution is complete.  
Stage 2.4F manual-original cleanup flow after merge is implemented.  
Stage 2.5 bounded planner pagination / loaded-event reliability has been committed.  
Stage 2.6A timezone-correct manual event entry, date/time pickers, and smart end defaults are implemented or in progress and must not regress.  
Stage 2.6B loaded-event schedule conflict highlighting is implemented and must not regress.  
Stage 2.6C schedule-first returning parent UX pass is implemented or in progress and must not regress.

This stage adds a visual calendar view to the Weekend Planner Season experience using Schedule‑X (free tier), with source-based color coding and a session-only timezone override.

Do not add a second planner events fetch.  
Do not change database schema.  
Do not change duplicate detection logic.  
Do not change merge semantics.  
Do not change Keep separate semantics.  
Do not change manual cleanup semantics.  
Do not change ICS refresh behavior.  
Do not change timezone parsing/formatting from Stage 2.6A.  
Do not remove pagination behavior from Stage 2.5.  
Do not remove conflict highlighting from Stage 2.6B.  
Do not undo schedule-first hierarchy from Stage 2.6C.  
Do not implement drag-and-drop or rescheduling.  
Do not implement recurring event UI.  
Do not implement multi-child profiles yet.  
Do not implement persistent kid/player color coding yet.  
Do not delete imported/source-linked/ICS events.  
Do not introduce unbounded event queries.  
Do not push. Commit locally only.

---

## Goal

Add a visual calendar to the Weekend Planner **Season** view so sports parents can scan a loaded season schedule, distinguish calendar sources, and inspect events without losing the existing list view.

The flow should:

1. Add a `PlannerCalendar` component using Schedule‑X.
2. Render currently loaded planner events passed from `PlannerClient` via props.
3. Provide `Calendar | List` toggle in Season view only.
4. Default Season view to Calendar **only when events exist**; default to List when empty.
5. Preserve the existing list view behind the List toggle.
6. Color-code events by calendar `source_id`, with manual events using neutral gray.
7. Month view by default; week view available on desktop.
8. Mobile uses agenda/list-style view (no dense week grid).
9. Session-only timezone override UI (no persistence).
10. Clicking a calendar event opens a user-safe detail modal/panel.
11. Empty calendar state is explained (not a blank grid).
12. Preserve all existing planner behaviors.

---

## Implementation safety addendum (must follow)

Environment note (repo check):
- `ti-web` historically has **no `next/dynamic` usage**; adding it is acceptable and expected for this stage.
- `ti-web` already imports CSS from node_modules successfully (e.g. Mapbox CSS), so Schedule‑X theme CSS is likely OK.

Hard mitigation requirement:
- Implement Schedule‑X behind a **client-only boundary** so `next build` cannot SSR-evaluate Schedule‑X.
- Use `next/dynamic` with `{ ssr: false }` to render the calendar component.
- List view must remain the primary reliable fallback.

If Schedule‑X fails at runtime:
- Do not crash the planner page.
- Show a small user-safe message inside the calendar section:  
  `Calendar view could not load. Use List view for now.`
- Keep the Calendar | List toggle visible.

---

## Library requirements

Use Schedule‑X free tier if compatible with the current repo.

Install packages as needed, or confirm they are already present:

`npm install --workspace ti-web @schedule-x/react @schedule-x/calendar @schedule-x/theme-default @schedule-x/events-service @schedule-x/calendar-controls temporal-polyfill`

Notes:
- Schedule‑X requires explicit container height.
- Theme CSS import paths vary by version; use the installed version’s documented path.
- Timezone changes should use Schedule‑X calendar timezone config + calendar-controls `setTimezone` when supported by the installed version.

---

## Hard requirements

- `PlannerCalendar` must receive events via props from `PlannerClient`.
- `PlannerCalendar` must not fetch `/api/planner/events` (or any planner events endpoint).
- Calendar uses loaded events only; updates as Stage 2.5 pagination loads more.
- Do not imply full-season coverage when more events are unloaded.
- Null `ends_at` renders as a one-hour display duration (display-only).
- Do not expose raw IDs/UUIDs/source URLs/`source_event_uid` in user-facing UI.
- Calendar is display-only (no edits, no drag/drop, no resizing).
- Timezone override is session-only React state (no DB/localStorage/cookies/URL params).
- Browser timezone is default on each mount; fallback is UTC (not America/Los_Angeles).
- Preserve Stage 2.6A create/edit timezone correctness and pickers.
- Preserve Stage 2.6B conflict highlighting in list view; do not duplicate conflict logic in calendar v1.
- Preserve Stage 2.6C schedule-first hierarchy.

---

## Season default view rule (empty-safe)

Season view defaults to **Calendar** only when there is at least one loaded event.

- If `events.length > 0`: default Season view to Calendar.
- If `events.length === 0`: default Season view to List.
- The Calendar | List toggle must remain visible in both cases.
- If the user switches to Calendar while empty, show empty-state copy:
  `No events to display. Connect a calendar or add events to get started.`

---

## UAT addendum (must add)

Add UAT checks for:
- Season defaults to List when empty; toggle remains visible.
- Switching to Calendar while empty shows the empty-state message.
- Simulated calendar failure (Schedule‑X init error) shows:
  `Calendar view could not load. Use List view for now.`
  and the planner page remains usable.

