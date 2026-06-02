# TournamentInsights Planner — Stage 2.9B-1B (Repo-Validated): Team Connect/Team App Update, Overlay, and Cancel/Delete UAT

You are operating in the `RI-MVP` repository:
`/Users/roddavis/RI_MVP/RI-MVP`

Assumption: `Stage 2.10A` (linked venue name display) is already implemented and in production behavior.  
Do not regress any prior stages.

## Stage purpose

Document and verify the **single imported Team Connect / Team App feed** after baseline import:

- source update/move behavior,
- local overlay and linked venue persistence,
- cancel/delete handling,
- calendar/list consistency, and
- compatibility matrix updates.

This is primarily a **UAT + docs** stage. Apply only small, low-risk code fixes if a blocker is found.

## Hard constraints (must hold)

- No additional feed imports.
- No OAuth, scraping, native Team Connect API integration, or credential storage.
- No multi-feed Sports Family UAT (GameChanger, TeamSnap, SportsEngine, etc.) in this stage.
- Do not import additional platform feeds.
- Keep exact entitlement strings only: `explorer`, `insider`, `weekend_pro`.
- `/weekend-planner` remains available (no hard gate).
- Event queries remain bounded (no unbounded history scans).
- No hard-delete of source-linked/ICS events; refresh is non-destructive.
- Source/Calendar context rules remain:
  - duplicates are suggestions only,
  - keep separate dismisses suggestions only,
  - manual cleanup remains optional and bounded,
  - merge remains manual and confirmation-gated.
- Privacy: do not expose raw feed URLs, `source_event_uid`, raw IDs, private notes, private addresses, exact private event times, or event titles in analytics payloads or normal UI beyond intended calendar-management UI.
- Analytics must fail-open.
- Do not push changes.

## Canonical repo paths (use these exact paths)

- `apps/ti-web/app/api/planner/sources/import-ics/route.ts`
- `apps/ti-web/app/api/planner/sources/[id]/refresh/route.ts`
- `apps/ti-web/app/api/planner/sources/[id]/route.ts`
- `apps/ti-web/app/api/planner/sources/route.ts`
- `apps/ti-web/app/api/planner/events/route.ts`
- `apps/ti-web/app/api/planner/events/[id]/route.ts`
- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/_components/planner/PlannerCalendar.tsx`
- `apps/ti-web/app/_components/planner/Planner.module.css`
- `apps/ti-web/lib/planner/ics-import.ts` (if needed)
- `apps/ti-web/lib/planner/types.ts`
- Docs:
  - `docs/weekend-planner-current-state.md`
  - `docs/weekend-planner-uat.md`
  - `docs/qa/ti-planner-ics-uat.md`
  - `CLAUDE.md`
  - `NOTES.md` if used for local handoff

## Active feed scope (single source only)

- Platform: Team Connect / Team App
- Team: `TI Owls 15U`
- Label: `SC-Casey`
- Existing baseline status: passed
- This is the only feed under test in Stage 2.9B-1B.

## Acceptance gates

- Source update/move behavior is documented as passing or pending with root-cause.
- Local overlays are documented as preserved or explicitly pending.
- Linked venue persistence is documented as passed/pending.
- Cancel/delete behavior is documented as passed/pending with non-destructive handling.
- Compatibility matrix row is updated.
- Current-state roadmap is updated.
- No additional feed is imported.
- No OAuth/scraping/private credential storage added.
- Pagination, entitlement, duplicate/merge/cleanup behavior remains intact.
- No exposure of source URL/UID/private fields in user-facing UI/docs.
- Validation command results recorded.

## 1) Document required Stage 2.9B-1B results

In docs, capture a concise matrix for status and evidence with `PASS`, `PARTIAL`, or `PENDING` per item:

| Area | Expected result | Status | Evidence |
|---|---|---|---|
| Update/Move | existing event updated in place, no duplicate, labels survive, list/calendar remain consistent | | |
| Overlay preservation | local note, linked venue, label/color, source-managed fields survive refresh | | |
| Cancel/Delete | planner does not unexpectedly hard-delete source-linked events | | |
| Refresh delay | pull-based delay observed and documented | | |
| Privacy/safety | no raw IDs/URLs/`source_event_uid` in UI | | |
| Boundaries | no unbounded scans, no entitlement drift, analytics fail-open | | |

## 2) Update / Move test (already-known baseline)

Record each item as fields in docs:

- Source platform: `Team Connect / Team App`
- Feed: `TI Owls 15U`
- Display label: `SC-Casey`
- Test event: `Practice A` equivalent
- Change: source time/location changed in platform
- Action: **Weekend Planner refresh only**
- Re-import: **not required** if source URL unchanged
- Result:
  - existing event updated in place: `PASS`/`PARTIAL`/`PENDING`
  - time reflected correctly: `PASS`/`PARTIAL`/`PENDING`
- Duplicate created: `No`
- Labels persisted: `Yes`
- Calendar/List consistency maintained: `Yes`
- Privacy findings: no raw IDs/URL in UI

If any item is partial, stop after documenting scope and proceed with next section only if safe.

## 3) Overlay preservation test

Select one imported event and add one local planner-specific signal (smallest safe example):

- local note (planner context)
- linked TI venue (if available)
- optional keep separate/suppression only if a safe duplicate scenario exists

Then refresh the source.

Document:

- local note survived: `Yes/No/Pending`
- linked venue survived: `Yes/No/Pending`
- source location text still visible: `Yes/No/Pending`
- label persisted: `Yes/No/Pending`
- source/feed color stable: `Yes/No/Pending`
- list/calendar match: `Yes/No`
- duplicate created: `Yes/No`
- raw IDs/URL exposed: `Yes/No`

## 4) Linked venue preservation (2.10A is implemented)

Since 2.10A is implemented:

- confirm linked venue displays as `Venue Name · address · city, state`,
- verify it is still visible after refresh,
- verify no automatic venue matching changes behavior.

Record:

- venue linked before refresh: `Yes/No`
- venue name display after initial view: `PASS/PARTIAL`
- venue still linked after refresh: `PASS/PARTIAL/PENDING`
- clear venue action works after refresh: `Yes/No`
- fallback behavior (if no link): `Venue-friendly fallback / neutral location`

## 5) Cancel/Delete behavior

If supported by Team Connect, cancel one event; if not, delete one event.

Document:

- action used: `cancel/delete`
- refresh required: `yes/no`
- source change visibility: `immediate / delayed / pending`
- planner behavior: `marked/canceled`, `removed from feed only`, `unchanged`, or `removed from planner`
- source-linked event hard-deleted unexpectedly: `No` (must remain No for PASS)
- duplicate created: `Yes/No`
- overlay/label persisted if event remains: `Yes/No`
- known platform constraints: note exact limitation

If hard-delete occurs, do **not** patch architecture in this stage; log as Stage 2.9C follow-up and gate stage sign-off.

## 6) Refresh delay

Keep this short:

- source change time observed
- refresh check time observed
- visibility change: `yes/no`
- approximate lag category:
  - immediate | <5m | 5–15m | 15–60m | >1h | unknown
- re-import required: `yes/no`

Recommended language:

- “Planner updates are pulled via refresh; source platform publishing can add delay.”

## 7) Compatibility matrix update

Update `docs/qa/ti-planner-ics-uat.md` Team Connect row with:

- alias (`TI Owls 15U / SC-Casey`),
- feed type (`ICS/webcal`),
- auth/cookie requirement,
- UID stability,
- recurrence behavior,
- update behavior,
- cancel/delete behavior,
- overlay preservation,
- known quirks,
- recommendation.

Do not include raw URLs.

## 8) Current-state updates

Update `docs/weekend-planner-current-state.md`:

- mark Stage 2.9B-1B status,
- include outcome summary for update/move,
- include overlay/cancel status,
- include next stage pointer:
  1. 2.10A (already implemented)
  2. 2.9B-1B (this stage)
  3. 2.9B-2 TeamChanger baseline
  4. 2.9B-3 TeamSnap baseline
  5. 2.9B-4 SportsEngine/MySE baseline
  6. 2.9B-5 Sports Connect family feeds
  7. 2.9B-6 generic ICS feeds
  8. 2.9C source identity hardening
  9. 2.10B assisted venue linking

## 9) Update CLAUDE.md

In UAT checklist section for Weekend Planner:

- add/refresh Stage 2.9B-1B checklist section with pass/partial/pending status,
- add quick artifact block for this run (date + key results),
- keep it aligned with the compatibility matrix and current-state docs.

## 10) Allowed small fixes (only if UAT exposes blocker)

If docs-only completion is blocked by a small defect, allow targeted fixes only:

- label display/render persistence bug,
- source color regression in an obvious UI path,
- privacy display leak in docs/UI text,
- loaded-event disclosure copy bug,
- refresh status text/copy correctness.

Not allowed:

- new source identity schema,
- cancel/deleted-event domain model rewrite,
- multi-feed/platform expansion,
- OAuth/login/native API work,
- broad overlay architecture.

## 11) Validation

Run if code changes are made:

- `npm run build --workspace ti-web`
- `npx tsc -p apps/ti-web/tsconfig.json --noEmit`

If only docs changed, note “docs-only; code validation skipped intentionally” and cite files changed.

## Final response format (for completion handoff)

Return:

- Files changed
- Update/move result
- Overlay preservation result (`PASS/PENDING`)
- Linked venue result
- Cancel/delete result
- Refresh delay findings
- Compatibility matrix updates
- Current-state updates
- Privacy/safety confirmation
- Entitlement behavior confirmation
- No new major architecture changes
- Validation run results (or explicit skip reason)
- Known limitations and Stage 2.9C follow-ups
