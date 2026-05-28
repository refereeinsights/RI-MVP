```md
# TournamentInsights Planner — Stage 2.4F: Manual-Original Cleanup Flow After Merge (SAFE v1.4)

You are working inside the existing TournamentInsights monorepo/codebase.

Stage 2.3 is implemented and tested.
Stage 2.4A discovery is complete.
Stage 2.4B suppression persistence + filtering is complete.
Stage 2.4C duplicate candidate detection + Keep separate dismissal persistence is complete.
Stage 2.4D manual merge endpoint + truncation disclosure is complete.
Stage 2.4E merge confirmation UI + conflict resolution is complete.

This stage adds a safe, optional cleanup flow for manual duplicate originals that remain visible after a successful merge.

Do not create automatic cleanup.
Do not automatically delete manual events.
Do not delete imported/source-linked/ICS events.
Do not suppress imported/source-linked/ICS events outside the existing `merged_duplicate` suppression behavior.
Do not change duplicate detection logic.
Do not build season-scale pagination.
Do not push. Commit locally only.

---

## Goal

After a successful duplicate merge, give users a safe way to review and optionally clean up manually created duplicate originals that remain visible.

The flow should:

1. Detect when manual duplicate originals were part of the just-completed merge and remain visible.
2. Clearly explain that manual originals were not hidden automatically.
3. Let users choose whether to review cleanup now or keep them for now.
4. Require explicit confirmation before deleting any manual original.
5. Reuse existing planner event delete behavior. Do not invent a new archive model unless it already exists.
6. Never silently remove user-created manual events.
7. Never delete imported/source-linked/ICS source events.
8. Preserve Keep separate behavior.
9. Preserve truncation disclosure.
10. Preserve Stage 2.3 ICS refresh behavior and user edits through refresh.

---

## Product principle

The canonical merged event should become the user’s clean planning event.

However, manually created duplicate originals are user-owned data. They must not be silently deleted or hidden.

Stage 2.4F should solve the UX confusion caused by manual duplicates remaining visible after merge, while preserving user trust and data safety.

---

## Context: repo is source of truth

Likely files:

- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/_components/planner/Planner.module.css`
- `apps/ti-web/app/api/planner/events/[id]/route.ts` — existing delete path
- `apps/ti-web/app/api/planner/events/merge/route.ts`
- `docs/weekend-planner-uat.md`
- `docs/qa/ti-planner-ics-uat.md`
- `CLAUDE.md` — UAT checklist; may be gitignored but still update it if present or expected by local workflow

Use actual repo paths and component names if different.

Before implementing, inspect the existing planner event delete behavior and reuse it.

Do not invent a new cleanup backend if existing planner event delete behavior already exists and is safe.

---

## Non-goals

Do not build:

- automatic merge
- automatic cleanup
- one-click cleanup
- source event deletion
- imported/source-linked/ICS deletion
- new duplicate detection algorithm
- season-scale pagination
- bounded duplicate endpoint
- recurring-event identity engine
- background jobs
- notifications
- calendar export/subscribe feeds
- scraping or OAuth integrations
- new entitlement tiers
- new planner routes unless absolutely necessary
- complex bulk event management

---

## Hard requirements

- Manual-original cleanup must be optional.
- Cleanup must require explicit user confirmation.
- Do not delete or hide manual originals automatically after merge.
- Do not delete imported/source-linked/ICS events.
- Do not expose raw IDs, source URLs, or `source_event_uid` in user-facing UI.
- Do not expose raw UUIDs in user-facing UI.
- Keep separate must remain available.
- Keep separate must still dismiss suggestions only and must not hide events.
- Truncation disclosure must remain visible when applicable.
- If event results are truncated, do not imply duplicate suggestions or cleanup candidates are complete.
- Preserve Stage 2.3 ICS refresh behavior.
- Preserve user edits through refresh.
- Do not optimistically remove events before cleanup succeeds and the planner list refreshes.
- Do not alter `planner_event_duplicate_dismissals` semantics.
- `planner_event_duplicate_dismissals` must never hide events from the main planner list.
- `kept_separate` must not hide events.
- `planner_event_suppressions` with `reason='merged_duplicate'` remains for eligible source-linked/ICS originals only.
- Manual-original cleanup must use the existing event ownership rules and RLS/API protections.
- Do not add new DB columns, such as `archived_at`, in Stage 2.4F unless a matching archive model already exists today.

---

## 1) Identify safe cleanup candidates — strictly bounded

Stage 2.4F MUST NOT run unbounded searches to find “other manual duplicates”.

Cleanup candidates are limited to the events the user just merged in the UI: the anchor + candidate for a 1:1 merge.

Rules:

- A cleanup candidate MUST be a manual event that was part of the just-completed merge attempt.
  - If the merge was triggered from a duplicate suggestion, the UI already knows `anchorEventId` and `candidateEventId`.
  - Only those IDs may be considered for cleanup in Stage 2.4F.
- Candidate must be:
  - owned by the current user
  - `source_type='manual'`
  - part of the just-completed merge attempt
  - visible after the post-merge refresh
  - not the newly created canonical merged event returned by the merge endpoint
  - not imported/source-linked/ICS
  - not already deleted

Important implementation safety — CRITICAL:

- In the merge success handler, `closeMergeModal()` clears `mergeAnchorEventId` and `mergeCandidateEventId`.
- Therefore, BEFORE calling `closeMergeModal()`, capture `mergeAnchorEventId` and `mergeCandidateEventId` into local variables.
- After `await loadEvents()` resolves, determine which captured IDs refer to visible manual events using the freshly loaded events array (not pre-close state).
- Initialize cleanup state from those captured IDs only.

Triggering condition:

Only show the cleanup prompt if ALL are true:

1. The merge endpoint returned `ok: true`.
2. The merge endpoint returned a warning indicating manual originals remain visible. Use API `warnings[]` as the source of truth.
3. At least one of the two merged events, identified via captured IDs + freshly loaded events, is manual.
4. At least one manual cleanup candidate is still visible in the refreshed planner event list.

If these conditions are not met, do not show the cleanup prompt.

---

## 2) Post-merge cleanup prompt

After successful merge, if manual cleanup candidates exist, show a user-safe prompt:

- `Merged duplicate events into a new manual event.`
- `Manual duplicate events were not hidden. You can review them now or keep them for later.`

Actions:

- Primary: `Review manual duplicates`
- Secondary: `Keep them for now`

---

## 3) Manual cleanup review UI — no bulk actions

When the user chooses `Review manual duplicates`, show a modal/panel.

For each manual cleanup candidate, show a safe summary (no raw IDs/UUIDs/URLs/UIDs).

No bulk cleanup in Stage 2.4F:

- Do not add “remove all”.
- Do not add multi-select.
- Do not add bulk delete.

---

## 4) Cleanup action behavior — reuse existing delete API; new confirmation UI required

Preferred behavior:

- If an existing archive/soft-delete model already exists today, use it.
- Otherwise, reuse the existing hard delete API behavior for planner events.

Important note about existing code reality:

- The existing planner delete UI uses `window.confirm()`, which cannot render the required custom confirmation title/body/button copy.
- The cleanup panel MUST render its own inline confirmation UI with title + body + explicit buttons using the copy below.
- After explicit confirmation, call the same `DELETE /api/planner/events/[id]` endpoint used by the existing planner delete behavior.

Required confirmation copy (hard delete):

Title: `Delete this manual duplicate?`

Body: `This permanently deletes the manually created duplicate event from your planner. Imported calendar events are not deleted.`

Confirm: `Delete manual duplicate`

Cancel: `Cancel`

Safety re-check (required):

- Immediately before calling `DELETE /api/planner/events/[id]`, re-verify from the freshly loaded `events` list that the target event:
  - is still present,
  - is still `source_type='manual'`, and
  - is still one of the cleanup-candidate IDs.
- If not, block the delete and show a small user-safe message (do not attempt deletion with stale state).

---

## 5) UAT + docs

Update:

- `docs/notes.md`
- `docs/admin-reference.md`
- `docs/weekend-planner-uat.md`
- `docs/qa/ti-planner-ics-uat.md` (optional)
- `CLAUDE.md` (UAT checklist; may be gitignored)

---

## Validation

Run:

- `npm run build --workspace ti-web`
- `npx tsc -p apps/ti-web/tsconfig.json --noEmit`
```

