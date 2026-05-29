# TournamentInsights Planner — Stage 2.6B: Loaded Event Conflict Highlighting (SAFE v1.1)

You are working inside the existing TournamentInsights monorepo/codebase.

Stage 2.3 ICS refresh behavior is implemented and must be preserved.
Stage 2.4A discovery is complete.
Stage 2.4B suppression persistence + filtering is complete.
Stage 2.4C duplicate candidate detection + Keep separate dismissal persistence is complete.
Stage 2.4D manual merge endpoint + truncation disclosure is complete.
Stage 2.4E merge confirmation UI + conflict resolution is complete.
Stage 2.4F manual-original cleanup flow after merge is implemented.
Stage 2.5 season-scale pagination (bounded) is implemented and must not regress.
Stage 2.6A timezone-correct manual event entry, date/time pickers, smart end defaults, and timezone override are implemented or in progress and must not regress.

This stage adds lightweight visual highlighting for schedule overlaps among currently loaded planner events.

Do not implement multi-child profiles yet.
Do not implement kid/player color coding yet.
Do not change duplicate detection logic.
Do not change merge semantics.
Do not change Keep separate semantics.
Do not delete imported/source-linked/ICS events.
Do not introduce unbounded event queries.
Do not change timezone parsing/formatting from Stage 2.6A.
Do not push. Commit locally only.

---

## Goal

Highlight planner events that overlap in time so users can quickly spot schedule conflicts.

This is advisory only.

The flow should:

1. Detect time overlaps among currently loaded planner events (client-side only).
2. Highlight overlapping event cards with a light conflict treatment.
3. Add a visible text label such as `Schedule conflict` (not color-only).
4. Disclose that conflicts only consider loaded events when not all events are loaded.
5. Preserve duplicate suggestions, Keep separate, merge, cleanup, pagination/truncation behavior, and timezone-correct manual event entry.

---

## Product principle

Weekend Planner should help families spot real-world schedule problems early without becoming noisy or blocking.

Conflict highlighting should be:

- advisory
- easy to notice
- not blocking
- not color-only (must include text)
- honest about loaded-event scope
- compatible with future multi-child color coding

Future-safe visual model:

- future child/team identity colors = separate indicator (e.g., left rail)
- conflicts = warning treatment + `Schedule conflict` label

Do not implement child/team identity colors in this stage.

---

## Context: repo is source of truth

Likely files (use actual paths if different):

- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/_components/planner/Planner.module.css`
- `apps/ti-web/lib/planner/types.ts`
- `docs/weekend-planner-uat.md`
- `docs/qa/ti-planner-ics-uat.md`
- `CLAUDE.md` (local UAT checklist workflow, may be gitignored)

Inspect existing card rendering and event type shape before implementing.

---

## Hard requirements

- Conflict detection MUST only consider currently loaded planner events (the client’s `events[]` in memory).
- Do not add any new API queries for conflict detection in this stage.
- Do not claim conflicts were checked against unloaded events.
- Conflict highlighting must not be color-only; include `Schedule conflict` text.
- Preserve Stage 2.5 pagination behavior (`Load more`, stable ordering, honest disclosures).
- Preserve Stage 2.6A timezone-correct create/edit behavior and timezone override.
- Do not expose raw IDs, raw UUIDs, source URLs, or `source_event_uid` in user-facing UI.

---

## 1) Conflict detection logic (loaded events only)

Add a small helper that returns a conflict map for loaded events.

Definition:

Two events conflict when their time ranges overlap:

`startA < endB && startB < endA`

Important:

- Back-to-back events are NOT a conflict (end == start should not be flagged). Use strict `<` comparisons, not `<=`.

Rules:

- Use UTC instants from stored `starts_at` / `ends_at` values.
- Do not compare display strings.
- Ignore events without a valid `starts_at`.
- For events without `ends_at`, use an advisory fallback end:
  - `fallbackEnd = starts_at + 60 minutes`
  - Do not persist this.
  - Do not mutate the event row; compute locally.

Output:

- A map keyed by internal event `id` (OK for code only; never render ids):
  - `{ [eventId]: { conflictCount: number } }`
- `conflictCount` = number of other loaded events this overlaps with.

Performance guardrails:

- Use memoization (e.g., `useMemo`) keyed off loaded events.
- If events are sorted by start time, implement an early-break sweep:
  - For each event A, only compare against events B with `startB < endA`.
  - Stop scanning forward once `startB >= endA`.

---

## 2) UI conflict highlighting (event card)

For each event card with `conflictCount > 0`:

- Add a light warning treatment (pale red background and/or subtle red border/rail).
- Add a label/badge/pill: `Schedule conflict`
- Optional subcopy:
  - `Overlaps with 1 loaded event.` / `Overlaps with {count} loaded events.`

Rules:

- Do not show the other event’s identity (no ids, no hidden raw fields).
- Do not show source URLs or `source_event_uid`.
- Keep it non-blocking.

---

## 3) Disclosure copy (loaded-scope honesty)

Show a disclosure only when not all events in the selected range are loaded.

Source of truth:

- Use Stage 2.5 pagination state (`hasMore`) or its existing mapped legacy state.

Suggested copy when more events exist:

`Schedule conflicts only consider loaded events.`

If duplicate disclosure is already shown nearby, combine:

`Duplicate suggestions and schedule conflicts only consider loaded events.`

When all events in the selected range are loaded:

- Do not show a warning disclaimer.

---

## 4) UAT and validation

Update UAT docs and a local `CLAUDE.md` checklist.

UAT checks:

- Create/load two events that overlap in time (same day).
- Confirm both overlapping cards show conflict styling + `Schedule conflict` label.
- Confirm back-to-back events (end == start) are NOT flagged.
- Confirm same-day non-overlapping events are NOT flagged.
- Confirm missing `ends_at` uses advisory 60-min fallback (display-only) and does not persist changes.
- With pagination where more events exist (`Load more events` visible), confirm disclosure says conflicts only consider loaded events.
- Load more events and confirm conflicts recompute.
- Confirm duplicate suggestions still work and Keep separate still dismisses suggestions only.
- Confirm merge confirmation still works.
- Confirm manual cleanup still works.
- Confirm Stage 2.6A create/edit timezone behavior still works.
- Confirm no raw IDs/UUIDs/source URLs/source_event_uid appear in UI.

Validation:

- `npm run build --workspace ti-web`
- `npx tsc -p apps/ti-web/tsconfig.json --noEmit`

