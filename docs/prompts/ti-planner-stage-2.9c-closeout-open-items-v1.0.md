# TournamentInsights Planner — Stage 2.9C-5 (Open-Item Closeout)

Use this prompt to close the remaining open UAT items tracked in:
- `docs/qa/ti-planner-ics-uat.md` (Stage 2.9C sections)
- `CLAUDE.md` (2.9C and 2.10B follow-up notes)

## Intent

Close unresolved items in two areas:

1. **Stage 2.9C source-identity hardening leftovers**
   - F3 UX + API bypass enforcement for Insider limit
   - Source label/color stability and fallback consistency
   - Non-destructive cancel/delete and missing-source behavior (with policy recorded)

2. **Stage 2.10B polish precondition**
   - Source location + linked venue visibility and clear separation
   - Edit/search flow and persistence checks already in scope from prior run context

Do not broaden this stage beyond the explicit check-list. No schema redesign and no new feed integrations.

## Hard boundaries

- Preserve entitlement behavior (`explorer`, `insider`, `weekend_pro`) and existing hardening from prior stages.
- Keep source-linked events non-destructive by default. Only document any documented hard-delete behavior; do not introduce new destructive semantics.
- No raw IDs/URLs/UIDs in normal UI.
- Keep `/weekend-planner` canonical behavior unchanged.
- Do not add auto-venue matching.
- No push. Local commit only.

## Required paths

- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/_components/planner/PlannerCalendar.tsx`
- `apps/ti-web/lib/planner/ics-import.ts`
- `apps/ti-web/app/api/planner/sources/import-ics/route.ts`
- `apps/ti-web/app/api/planner/sources/[id]/route.ts`
- `apps/ti-web/app/api/planner/sources/[id]/refresh/route.ts`
- `apps/ti-web/app/api/planner/sources/route.ts`
- `docs/qa/ti-planner-ics-uat.md`
- `CLAUDE.md`
- `docs/weekend-planner-current-state.md`

## 1) Verification steps (ordered)

### 1A. F3 gate and API limit consistency

Run on an `insider` account already at limit.

- Attempt “Connect calendar” in the Connected calendars area.
- Expected UI outcome:
  - **No import modal on 4th-attempt click**
  - **Upgrade path is shown first** (clear action/copy to unlock)
- Bypass check:
  - Hit API path directly / simulate an over-limit import attempt if you already have a captured request.
  - Expected response: `403` with `calendar_feed_limit_reached`.
- Record `F3 UX result` + `F3 API result`.

### 1B. Source identity stability (label + color)

For each available platform source in the active matrix:

- Source name is visible and stable in:
  - connected source list/cards
  - list view rows
  - calendar view
- Source color mapping is stable across refreshes and across views.
- If platform does not provide friendly source name:
  - fallback should be consistent and user-safe (e.g. `Connected calendar`), documented as explicit fallback.

### 1C. Cancel/delete and missing-source policy check

For at least one non-production control event path:

- Trigger a source update/move.
- Trigger cancel/remove behavior via source control or equivalent temporary disable.
- Trigger refresh in Planner immediately after each action.
- Capture:
  - whether source-linked events remain (suppressed/historical/preserved) vs hard-removed,
  - whether overlays and manual links remain intact,
  - whether any unrelated source-linked rows are deleted unexpectedly.
- Classify as:
  - PASS (retained/preservation),
  - DOCUMENTED LIMITATION (explicit documented policy),
  - FAIL (unexpected hard-delete).

### 1D. Optional remaining platform coverage

- If SportsEngine/MySE feed is available:
  - run baseline/update/move/cancel/delete checks in this same stage run.
- If not available:
  - record `NOT AVAILABLE` with blocker/time-window in the UAT row.

### 1E. Stage 2.10B visibility follow-up

- In event list + detail:
  - if linked venue exists, show `Linked venue: ...`.
  - if source location exists and differs, also show `Source location: ...`.
  - no raw IDs/titles/URLs.
- Verify Map and map-search use linked venue first; source location remains visible in text context.

## 2) Required UAT run log updates

Update `docs/qa/ti-planner-ics-uat.md` with:

- Latest stage header date/time and status.
- For Stage 2.9C-? source rows:
  - F3 UI result
  - F3 API result
  - source label/fallback
  - source color stability
  - cancel/delete outcome classification
  - missing-source behavior classification
  - overlay/venue linkage retention
  - privacy check (raw IDs exposure: PASS/FAIL)
- For SportsEngine path: mark `Not available` only if truly inaccessible.

## 3) Required docs updates

- `docs/qa/ti-planner-ics-uat.md`: resolve the current open items marked unchecked in:
  - Stage 2.9C checklist
  - Stage 2.9C-0 checklist
  - Stage 2.9C-4 follow-up checklist entries
- `CLAUDE.md`: advance stage statuses from open to complete where applicable; keep unresolved items explicit.
- `docs/weekend-planner-current-state.md`:
  - update 2.9C/2.10B status to reflect closure or blocked items
  - list concrete remaining risk and reason for any BLOCKER.

## 4) Validation checklist

- `npm run lint --workspace ti-web`
- `npm run build --workspace ti-web`
- `npx tsc -p apps/ti-web/tsconfig.json --noEmit`
- `git status --short` and verify only intended files changed

## Pass criteria for stage closeout

- F3 UI and API are both PASS for at-limit Insider path.
- Source identity (label + color + fallback) is consistent across views and refreshes.
- Cancel/delete/missing-source behavior is fully documented and non-destructive behavior is confirmed or explicitly logged as planned policy.
- Stage 2.10B visibility requirement has no raw identifier exposure.
- No regressions in duplicate/merge, conflict marking, loaded-scope disclosure, and existing analytics privacy posture.

