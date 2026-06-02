# TournamentInsights Planner — Stage 2.9C-1 v1.3 (Repo-Aligned)

You are implementing this in the existing monorepo for a **safe, low-risk UI hardening pass**. This stage is intended as an incremental polish pass, not a sync architecture rewrite.

## Stage intent

Connected-calendar management in `/weekend-planner` already supports:
- edit label
- refresh schedule
- disconnect (API route)

Stage 2.9C-1 v1.3 tightens this behavior to:
1) enforce one clear grouped action row,
2) make disconnect explicit and safe,
3) remove regressions by preserving current non-destructive semantics.

## Hard constraints (do not change)

- Preserve existing source model and routes unless blocked:
  - `apps/ti-web/app/_components/planner/PlannerClient.tsx`
  - `apps/ti-web/app/api/planner/sources/[id]/route.ts`
- Preserve all already completed stages: 2.3, 2.4A–F, 2.5, 2.6A–F, 2.7, 2.8, 2.9A, 2.9B-
- Do not alter entitlement semantics (`explorer | insider | weekend_pro`) and do not add tiers.
- Do not add destructively deleting behavior for source-linked/ICS events.
- Do not introduce OAuth/scraping/native calendar APIs.
- Do not change `/weekend-planner` route behavior.
- Do not add unbounded queries.
- Do not expose internal identifiers in UI (`raw source URL`, `source_event_uid`, `planner source id`, UUIDs).
- Do not build unrelated feed onboarding or new integrations.
- Do not push commits. Local commit only.

## Preflight verification (mandatory before edits)

- Confirm current action cards already render Edit / Refresh / Disconnect and identify current exact markup blocks.
- Confirm disconnect API is `/api/planner/sources/[id]` and requires auth/ownership.
- Confirm source row fetch/refresh uses existing ownership checks and that refresh for deleted sources is no longer attempted (or is naturally prevented by source removal).
- Confirm what data model stores source status today.
- If any assumption is wrong, pause and update scope before coding.

## Required behavior

### 1) One action row, explicit and grouped

Under each connected calendar card header/status block, render **one action row** containing exactly:
- `Edit label`
- `Refresh schedule`
- `Disconnect calendar`

Rules:
- Row should use existing button styles/classes (no new UI framework).
- Button order: Edit, Refresh, Disconnect.
- Row must wrap gracefully on mobile (`flex-wrap: wrap`) without horizontal overflow.
- No action row should exceed card width.
- Preserve edit and refresh behavior.

### 2) Disconnect confirmation and safety

- Disconnect must be explicit and require user confirmation before API call.
- Required copy:
  - Title: `Disconnect this calendar?`
  - Body: `This stops future refreshes from this calendar. Imported events from this feed will remain in your planner.`
  - Confirm: `Disconnect calendar`
  - Cancel: `Cancel`
- Acceptable implementation:
  - `window.confirm` is acceptable only if message is explicit and includes event-retention statement.
  - Modal/panel implementation is preferred if already easy in the current UI stack.
- On confirm:
  - Call existing API in a safe stateful way.
  - Disable row actions while pending.
  - Show a clear success notice.
  - Refresh source + event data after success.
- On failure:
  - Keep UI in stable state.
  - Show user-safe error message (no raw internal details).

### 3) Non-destructive disconnect

- Do not delete imported/planner events in this stage.
- Do not delete source-linked/ICS rows as part of disconnect.
- If current behavior is row deletion in DB, keep it only if schema-level side-effects remain non-destructive.
- If schema proves destructive in practice, document as hard limitation and do not introduce additional cleanup in this stage.

### 4) Entitlement and scope stability

- Preserve existing F3 limit behavior as-is.
- Preserve insider/wknd-pro/Explorer entitlement logic already in place.
- No auth bypass.

### 5) Privacy safety

- No feed URL in card UI.
- No source UUID/internal ID in card UI.
- No `source_event_uid` in UI text.
- Do not add analytics fields that contain raw identifiers.

### 6) Accessibility and UX quality

- Buttons remain keyboard reachable.
- Loading/disabled state clearly visible.
- Confirmation path should be cancelable.
- Avoid duplicate submissions (dedupe during pending state).

## Acceptance criteria

- [ ] Connected calendar cards show feed label/context + status (`Synced`/`Error`/etc.) and last-synced text as today.
- [ ] Exactly one grouped action row appears (or clean grouped structure with no duplicate separated rows).
- [ ] Edit label works.
- [ ] Refresh schedule works.
- [ ] Disconnect prompts explicit confirmation.
- [ ] Cancel leaves source connected.
- [ ] Confirmed disconnect succeeds and removes/marks the source according to existing model.
- [ ] Imported events remain (or are not hard-deleted) after disconnect.
- [ ] No raw feed URLs/IDs/UUID/source_event_uid visible.
- [ ] Source labels/colors remain stable where implemented.
- [ ] Pagination, duplicate/merge/cleanup, and loaded-disclosure semantics remain unchanged.

## Implementation notes (minimal-change path)

- Prefer editing only:
  - `apps/ti-web/app/_components/planner/PlannerClient.tsx`
  - `apps/ti-web/app/_components/planner/Planner.module.css`
- Avoid touching planner import/refresh pipelines unless required for one-row alignment.
- Avoid changing data model unless verification shows a hard blocker.

## Required documentation updates

If modified:
- `docs/qa/ti-planner-ics-uat.md` → add Stage 2.9C-1 checklist + results.
- `docs/weekend-planner-current-state.md` → update Stage 2.9C status line.
- `CLAUDE.md` (if used for UAT workflow) → add/update 2.9C-1 gate.
- `docs/admin-reference.md` if operational/ops behavior changed.

## Validation

- `npm run lint --workspace ti-web`
- `npm run build --workspace ti-web`
- If changed types touched significantly: `npx tsc -p apps/ti-web/tsconfig.json --noEmit`

## Final report format

Return results in this order:
1. Files changed
2. Action-row layout result
3. Disconnect confirmation behavior
4. API route behavior confirmation
5. Event-retention verification
6. Entitlement regression check
7. Privacy checks
8. Validation command results
9. Open limitations / follow-ups

## Suggested commit message

`feat(planner): stage 2.9c-1 connected calendar action-row polish`
