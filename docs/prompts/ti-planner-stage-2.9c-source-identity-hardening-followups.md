# TournamentInsights Planner — Stage 2.9C (Repo-Aligned): Source Identity Hardening Follow-Ups

You are implementing and validating the 2.9C follow-ups after real-feed baseline passes (Team Connect, GameChanger, TeamSnap).

## Scope

This stage closes remaining cross-feed hardening items from 2.9B:

- Insider feed-limit gate behavior must be enforced consistently in both UI and API.
- Source label + source color stability and fallback behavior must be explicit and stable.
- Cancel/delete and missing-from-feed behavior must be validated without destructive side effects.
- Identity persistence under repeated refresh and edited source metadata.
- Privacy guardrails remain unchanged.

Do **not** expand to unrelated platform onboarding or OAuth/native integrations in this stage.

## Hard constraints

- Keep `explorer | insider | weekend_pro` entitlement exactness intact.
- No new source types, web scraping, or credential storage.
- No broad schema changes unless required by blocker fix.
- `/weekend-planner` remains canonical route; `/planner` can redirect.
- Event sync remains non-destructive: no source-linked hard-delete semantics unless explicitly documented for the platform.
- Privacy in UI + analytics:
  - no feed URL, UUID, source IDs, or `source_event_uid` exposed in list/calendar/detail.
  - no private notes/venues in analytics payloads.
- Do not claim platform support until tested behavior is logged.
- Do not push. Update repo docs/notes and run commands only locally.

## Repo paths (read/write)

- Core planner APIs:
  - `apps/ti-web/app/api/planner/sources/import-ics/route.ts`
  - `apps/ti-web/app/api/planner/sources/[id]/refresh/route.ts`
  - `apps/ti-web/app/api/planner/sources/[id]/route.ts`
  - `apps/ti-web/app/api/planner/sources/route.ts`
  - `apps/ti-web/app/api/planner/events/route.ts`
  - `apps/ti-web/app/api/planner/events/[id]/route.ts`
- Planner UI:
  - `apps/ti-web/app/_components/planner/PlannerClient.tsx`
  - `apps/ti-web/app/_components/planner/PlannerCalendar.tsx`
  - `apps/ti-web/lib/planner/ics-import.ts`
- Documentation:
  - `docs/qa/ti-planner-ics-uat.md`
  - `docs/weekend-planner-current-state.md`
  - `CLAUDE.md`
  - `docs/admin-reference.md`
  - `docs/notes.md`

## Inputs

- Weekend Pro fixture account for 2+ source validation:
  - `weekendpro_test@example.com`
- At least one of each available real feed:
  - GameChanger — TI Owls 12U (already validated baseline/imported)
  - TeamSnap user schedule (`TI Strikers / TI Wolves`)
  - SportsEngine/MySE (if accessible; optional in this stage)
- Existing stage artifacts from 2.9B-2 and 2.9B-3.

## 1) Focus scope checks (must pass/fail explicitly)

Run these in order and stop only for hard blockers:

1. **F3 entitlement enforcement**
   - Use an `insider`/single-feed fixture account and attempt to open “Connect calendar” while already at limit.
   - Expected:
     - UI should show upgrade prompt/instruction path (not open import modal).
     - API import/refresh should return `calendar_feed_limit_reached` if bypassed.
   - Record: `PASS / PARTIAL / FAIL`.

2. **Source label + color stability baseline**
   - For each accessible imported source (GC, TeamSnap, optional SportsEngine):
     - ensure list, calendar and connected-card labels match expected source naming.
     - ensure one stable color per source/feed is visible consistently while sorting/refreshing.
     - if label text is empty from platform, verify fallback is safe/consistent (`Connected calendar`) and not blank/missing.

3. **Cancel/delete + missing-in-feed behavior**
   - For at least one existing source with a seeded test control event:
     - cancel/remove/correct that source event in platform (or simulate with fixture test event if available).
     - refresh the affected source.
     - confirm no unexpected hard-delete of unrelated source-linked rows.
     - confirm event removal behavior is either:
       - retained as historical/suppressed state, or
       - clearly visible hard-delete if intentionally documented by stage.
   - Document exact behavior as `No hard-delete / controlled stale behavior / hard-delete observed`.

4. **Identity update semantics**
   - Change an event in source (time or location) and refresh.
   - Confirm in-place update via `updated` counters and absence of duplicate storm.
   - Confirm overlay notes/venue links remain intact when present.

5. **Optional SportsEngine path**
   - If SportsEngine/MySE URL is available:
     - import once and run baseline + 2 refreshes + one update/move + one remove scenario.
     - If unavailable, log as blocked `NOT AVAILABLE`.

## 2) UAT execution checklist to log in docs/qa

For each source run (GC/TeamSnap/SportsEngine if accessible), record:

- feed alias + source URL type
- baseline import result
- refresh count and duplicate/storm signal
- cancel/delete result and hard-delete classification
- label text + color stability
- overlay/venue persistence
- loaded-scope disclosure correctness
- raw identifier exposure (UI)
- recommendation (pass / follow-up)

## 3) Required documentation updates

### `docs/qa/ti-planner-ics-uat.md`
- Add/refresh Section: **Stage 2.9C — Source Identity Hardening Follow-Ups**
- Add/refresh source platform rows for:
  - GameChanger
  - TeamSnap
  - SportsEngine/MySE (if tested)
- Populate matrix fields touched by this stage:
  - cancel/delete semantics
  - overlay preservation
  - source-label stability
  - missing/deleted behavior

### `CLAUDE.md`
- Under Weekend Planner UAT, add a dedicated 2.9C section:
  - status
  - docs link
  - gate checklist and latest result timestamp.

### `docs/weekend-planner-current-state.md`
- Update Stage 2.9C status from “future/pending” to current stage readiness.
- Add observed outcomes from GC/TeamSnap and any open follow-ups.

### `docs/admin-reference.md`
- Update Stage 2.9C entry to include current state and implementation intent.

### `docs/notes.md`
- Add short run/plan log entry for prompt creation + expected follow-up fixes.

## 4) Validation commands

- If code is changed:
  - `npm run build --workspace ti-web`
  - `npx tsc -p apps/ti-web/tsconfig.json --noEmit`
  - `npm run lint --workspace ti-web`
- If docs-only:
  - `git status` + focused diff review + mark docs-only handoff.

## Pass criteria for 2.9C completion

- F3 UI/server limit enforcement documented as PASS on at least one insider attempt path.
- Source label + color stability no longer ambiguous (or documented as constrained follow-up with reason).
- At least one multi-source real-feed source cancel/delete path executed and hard-delete behavior recorded without regression.
- 2.9B run artifacts updated with 2.9C evidence.
- No raw source identifiers exposed in list/calendar/detail after tests.
- SportsEngine status explicitly marked `PENDING` if access remains blocked.
