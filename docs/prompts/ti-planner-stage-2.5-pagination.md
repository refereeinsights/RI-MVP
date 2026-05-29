# TournamentInsights Planner — Stage 2.5: Season-Scale Cursor Pagination + Honest Duplicate Reliability (SAFE v1.2)

You are working inside the existing TournamentInsights monorepo/codebase.

Stage 2.3 ICS refresh behavior is implemented and must be preserved.
Stage 2.4A discovery is complete.
Stage 2.4B suppression persistence + filtering is complete.
Stage 2.4C duplicate candidate detection + Keep separate dismissal persistence is complete.
Stage 2.4D manual merge endpoint + truncation disclosure is complete.
Stage 2.4E merge confirmation UI + conflict resolution is complete.
Stage 2.4F manual-original cleanup flow after merge is implemented (if present in repo; preserve it).

This stage improves planner reliability for full-season and multi-calendar usage by adding bounded season-scale cursor pagination and making duplicate suggestions honest about loaded scope.

Do not introduce unbounded planner event queries.
Do not implement automatic merge.
Do not implement automatic cleanup.
Do not delete imported/source-linked/ICS events.
Do not change Keep separate semantics.
Do not change merge semantics.
Do not build OAuth, scraping, notifications, calendar export, or background jobs.
Do not push. Commit locally only.

---

## Goal

Make the planner usable and trustworthy for larger event sets (6–12 months, multiple calendars).

Current limitation:

Duplicate detection considers only loaded events. When the planner event list is truncated, the UI discloses:

`Showing first {limit} events in this range. Duplicate suggestions only consider loaded events.`

Stage 2.5 reduces this limitation by supporting bounded pagination and updating duplicate suggestions as additional events are loaded.

---

## Product principles

- **Fast and bounded:** never fetch an entire season in one request.
- **Honest:** never imply duplicates are “complete” when only part of the range is loaded.
- **Stable:** pagination must not skip or duplicate events even when multiple events share the same start time.
- **Safe:** preserve suppression, dismissals, merge, and refresh behavior.

---

## Context: repo is source of truth

Likely files:

- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/_components/planner/Planner.module.css`
- `apps/ti-web/app/api/planner/events/route.ts`
- `apps/ti-web/lib/planner/duplicates.ts`
- `docs/weekend-planner-uat.md`
- `docs/qa/ti-planner-ics-uat.md`
- `CLAUDE.md` if used for local UAT checklist workflow

Use actual repo paths and component names if different.

Inspect the current planner events API response shape before implementing. Do not assume it already returns pagination metadata.

---

## Non-goals

Do not build:

- automatic merge
- automatic cleanup
- source event deletion
- imported/source-linked/ICS deletion
- new duplicate merge semantics
- new Keep separate semantics
- recurring-event identity engine
- global duplicate discovery across all user history
- unbounded event queries
- complex virtualization unless already present and easy to reuse

---

## Hard requirements (must not regress)

- Preserve Stage 2.3 ICS refresh behavior.
- Preserve user edits through refresh.
- Preserve Stage 2.4B suppression behavior (`merged_duplicate` suppressions must keep eligible imported originals hidden).
- Preserve Stage 2.4C Keep separate behavior (dismiss suggestions only; never hide events).
- Preserve Stage 2.4D merge endpoint behavior.
- Preserve Stage 2.4E merge confirmation UX (explicit confirmation only).
- Preserve Stage 2.4F cleanup behavior (if present).
- Do not expose raw IDs, raw UUIDs, source URLs, or `source_event_uid` in user-facing UI.
- If only part of a range is loaded, UI must clearly disclose duplicates only consider loaded events.
- All planner fetches must remain bounded (no unbounded loops; no unbounded counts).

---

## 1) Inspect current event loading + suppression filtering

Before coding, inspect:

- how `/api/planner/events` accepts date range, limit, filters
- how it orders results
- how suppressions are filtered (must remain batched; must not be N+1)
- how the UI stores loaded events
- how duplicate suggestions are calculated and dismissed
- how merge + cleanup refresh the planner list

Adapt to the repo’s current conventions.

---

## 2) Implement cursor-based pagination in `GET /api/planner/events` (server)

### Ordering (required)
Pagination MUST be stable and deterministic:

- Order by `starts_at ASC, id ASC`

### Cursor shape (required)
Use a cursor that includes both fields:

```ts
type PlannerEventsCursor = {
  starts_at: string; // ISO
  id: string;        // UUID
};
```

### Cursor semantics (required)
When fetching subsequent pages, apply:

- `starts_at > cursor.starts_at`
  OR
- (`starts_at == cursor.starts_at` AND `id > cursor.id`)

Do not use offset pagination as the default implementation.

### Response shape (required)
`GET /api/planner/events` must return a JSON object (not a bare array):

```ts
{
  ok: true,
  events: PlannerEventRow[],
  limit: number,
  hasMore: boolean,
  nextCursor: PlannerEventsCursor | null,

  // Back-compat: keep this if Stage 2.4D used it.
  truncated?: boolean
}
```

Rules:

- Return only **visible** events (after suppression filtering).
- `hasMore` should represent “more visible events exist” when possible.
- If the server hits an internal scan cap while trying to find `limit + 1` visible events, it must:
  - return `events` (up to `limit`)
  - set `hasMore: true`
  - set `nextCursor` based on the last returned visible event
  - and set `truncated: true` (if `truncated` is present for back-compat)

### Bounded suppression filtering (required)
Do not introduce:

- N+1 suppression queries (no per-event suppression lookups)
- unbounded loops while “filling” a page

Use bounded chunk reads + batched suppression lookups + a hard scan cap.

---

## 3) Client pagination behavior (Planner UI)

### UX: “Load more events”
Add a mobile-friendly flow:

- Button: `Load more events`
- Loading state: `Loading more events…`
- When fully loaded: `All events in this range are loaded.`

Rules:

- Append new events to the existing list.
- Do not replace the list unless the user changes lens/range/filters.
- Do not duplicate rows; dedupe by `id`.
- Maintain stable sort order (`starts_at`, then `id`).
- Recalculate duplicate suggestions after each successful page load.
- Preserve merge modal behavior and Stage 2.4E explicit confirmation.
- Preserve cleanup behavior (Stage 2.4F) after merges triggered from later-loaded events.

---

## 4) Disclosure copy: loaded subset vs fully loaded

If `hasMore === true`:

`Showing {loadedCount} loaded events in this range. Duplicate suggestions only consider loaded events. Load more to check additional events.`

If `hasMore === false`:

`All events in this range are loaded. Duplicate suggestions consider all events in this range.`

Rules:

- Never imply duplicate coverage is complete if `hasMore` is true.
- If total count is not available, do not claim a total.
- Keep the disclosure visible near the planner list / duplicates area.

---

## 5) Duplicate suggestions with pagination

Duplicate detection remains client-side and limited to **loaded events only** in Stage 2.5 unless a bounded server duplicates endpoint is explicitly added.

Requirements:

- Recalculate suggestions after every “load more”.
- Keep separate dismissals must still hide only suggestions, not events.
- Suppressed merged ICS/source-linked originals must remain hidden from the event list.
- Suggestions must not reappear if the user already selected Keep separate for that pair.
- Merge flow must work for suggestions discovered after loading additional pages.
- Cleanup flow (if present) must remain bounded to just-merged manual events.

---

## 6) Optional: bounded server duplicate-candidate endpoint (only if needed)

Only implement if pagination-first UX is insufficient after UAT.

If implemented, it MUST be bounded by:

- user ownership
- selected date range (`from`, `to`)
- hard `limit`
- stable cursor (if paginated)
- suppression + dismissal rules

It must be read-only and must not return source URLs or `source_event_uid`.

If not implemented, state explicitly in final response that pagination-first was used and server-side duplicates were deferred.

---

## 7) Range/lens/filter reset behavior

When the user changes lens/range/filter/scope:

- clear loaded events
- reset cursor state
- load the first page for the new scope
- recalculate duplicate suggestions

Durable server-side suppressions and dismissals remain effective.

---

## 8) Merge + cleanup refresh behavior under pagination

After merge/cleanup:

- refresh the current scope safely
- prefer resetting to the first page (bounded + simple)
- avoid unbounded “reload until cursor” loops

---

## 9) Performance and safety constraints

- Keep per-request limits conservative (use current `limit` defaults/caps).
- Keep any “scan to find visible rows” bounded with a hard cap.
- Do not add expensive counts unless known cheap and indexed.

---

## 10) UAT documentation updates

Update:

- `docs/weekend-planner-uat.md`
- `docs/qa/ti-planner-ics-uat.md`
- `CLAUDE.md` (if used locally)

Add Stage 2.5 checks:

- first page loads with bounded limit
- disclosure indicates loaded-only scope when `hasMore=true`
- load more appends without duplicates and preserves ordering
- duplicates refresh after load more and remain honest
- Keep separate/merge/cleanup regressions avoided

---

## 11) Validation

Run:

- `npm run build --workspace ti-web`
- `npx tsc -p apps/ti-web/tsconfig.json --noEmit`

Do not push.

