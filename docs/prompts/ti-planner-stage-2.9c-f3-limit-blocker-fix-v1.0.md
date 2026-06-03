# TournamentInsights Planner — Stage 2.9C-F3 (Insider limit gate fix)

Use this prompt to fix the remaining **F3 blocker**:

- UI still opens Connect modal at Insider 4th-calendar attempt.
- API direct `/api/planner/sources/import-ics` still returns HTTP 200 and inserts the 4th source.

## Scope

Only implement the F3 limit-enforcement fix. Do not alter unrelated 2.10B venue UX, duplicate suppression, or platform coverage behavior.

## Hard constraints

- Preserve entitlement semantics (`explorer`, `insider`, `weekend_pro`) and existing planner non-destructive import policy.
- Keep `/weekend-planner` flows intact.
- Keep existing privacy guardrails (`source_event_uid`, source URLs) untouched unless already in existing code path.
- Do not add new feed providers or new entitlement states.
- Commit locally; no push.

## Required files

- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/_components/planner/PlannerCalendar.tsx`
- `apps/ti-web/app/api/planner/sources/import-ics/route.ts`
- `apps/ti-web/app/api/planner/sources/route.ts`
- `docs/qa/ti-planner-ics-uat.md`
- `CLAUDE.md`
- `docs/weekend-planner-current-state.md`

## Fix goal (must satisfy both UI + API)

### UI

On an `insider` account already at feed limit:
- Clicking **Connect calendar** must **not** open the standard import modal.
- Show upgrade path inline or via modal with clear copy to unlock Weekend Pro (no silent no-op).
- Existing connected sources should remain browsable and editable; action row behavior should remain unchanged.

### API

On direct over-limit attempts:
- `/api/planner/sources/import-ics` must return:
  - HTTP `403`
  - error `calendar_feed_limit_reached`
- The request must not create a new source row for the authenticated user.
- API clients should continue to return existing success payloads for in-limit imports unchanged.

## Implementation acceptance criteria

- [ ] UI Connect flow:
  - At limit, Insider sees upgrade messaging (upgrade modal/action) and does not reach the import form.
  - No source creation occurs from this path.
- [ ] API enforcement:
  - Existing Insider 4th-import attempt returns HTTP `403` with `calendar_feed_limit_reached`.
  - Source row count remains unchanged.
- [ ] F7 and existing non-F3 functionality remain unchanged:
  - no duplicate button on synced events,
  - no raw IDs/source URLs/source_event_uid in list/calendar/detail.
- [ ] Tests/docs:
  - `npm run lint --workspace ti-web`
  - `npm run build --workspace ti-web`
  - `npx tsc -p apps/ti-web/tsconfig.json --noEmit`
  - `git status --short` before commit and after only intended files changed.

## Validation to run immediately after fix

1. UAT on Insider fixture currently at limit (no extra feed attached):
   - `Connect calendar` click result = upgrade-blocked path.
   - Confirm no row/modal sequence for full import.
2. Bypass check:
   - call `/api/planner/sources/import-ics` with a valid ICS import payload as the same Insider account.
   - Confirm 403 + `calendar_feed_limit_reached`.
   - Confirm no new source row created.
3. Refresh relevant docs:
   - Update 2.9C closeout section in `docs/qa/ti-planner-ics-uat.md` with F3 pass/fail evidence.
   - Update `CLAUDE.md` and `docs/weekend-planner-current-state.md` so blocker status and next stage boundary are explicit.

## Deliverable

When this prompt passes, append a 2.9C follow-up row in
`docs/qa/ti-planner-ics-uat.md` showing:
- F3 UI upgrade-gate result = PASS
- F3 API enforcement result = PASS

Then remove F3 from the blocker list in CLAUDE/current-state and mark 2.10B re-enabled.
