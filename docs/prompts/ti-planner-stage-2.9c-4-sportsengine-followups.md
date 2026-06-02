# TournamentInsights Planner — Stage 2.9C-4 (SportsEngine/MySE follow-up)

Use this prompt when running UAT for the remaining Stage 2.9B-4 open items on SportsEngine / MySE feeds.

## Scope

This stage must only close 2.9B-4 carry-forwards.

- Verify update/move behavior in-place (no duplicate storm)
- Verify cancel/delete (or source cancel/removal) behavior and hard-delete policy
- Verify source identity / color stability for this platform
- Verify F3/F4 remaining checks in this path
- Verify missing-source behavior and policy consistency

Out of scope:
- New platform claims beyond SE/MySE
- OAuth / credentialed integrations
- Broad schema/API redesign

## Hard constraints

- No route-path changes in production behavior.
- No raw feed URLs/source UUIDs/UIDs exposed in UI.
- Do not introduce hard deletes on source refresh unless explicitly observed/documented for this source.

## Repo references to read/update

- `docs/qa/ti-planner-ics-uat.md`
- `docs/weekend-planner-current-state.md`
- `CLAUDE.md`

## Required preconditions

- Logged into a `weekend_pro` fixture account (currently `weekendpro_test@example.com`).
- Imported `TI Red Robbins` SportsEngine/MySE source from 2.9B-4 run.
- Control events available:
  - `TI Feed Test Practice A`
  - `TI Test Opponent 12U at TI Red Robbins Hoops 12u`
  - `TI Feed Test Team Event C`

## Validation steps

1. **Baseline context check (5 min)**
   - Confirm import remains present and labels are still shown as:
     - Source name `SportsEngine — TI Red Robbins`
     - Team name `TI Red Robbins`
   - Confirm current feed refresh summary is healthy.

2. **Update/move check (required) — no duplicate storm**
   - In SportsEngine admin/source control, modify `TI Feed Test Practice A` time or location.
   - Wait for feed publish, then refresh source in Weekend Planner.
   - Confirm:
     - existing event updates in-place (no clone/double-up event)
     - overlay/linked venue remains stable if previously set
     - refresh summary reflects updates only (no new storms)

3. **Cancel/delete check (required)**
   - Cancel/remove `TI Feed Test Team Event C` in source control.
   - Refresh source.
   - Confirm behavior is documented as one of:
     - preserved/suppressed historical source-linked events, or
     - clear source deletion effect
   - Confirm no unrelated source-derived event rows are hard-deleted unexpectedly.

4. **Source removal / missing-source check (required)**
   - If possible, temporarily remove the feed from source list or disable it briefly.
   - Refresh Planner.
   - Capture whether stale events are retained, suppressed, or removed.
   - Classify whether behavior is platform-specific, safe, or acceptable for stage sign-off.

5. **F3/F4 checks (required)**
   - While at Insider feed limit, attempt to add one additional source:
     - UI should show upgrade path before reaching full connect modal flow.
   - Hit API bypass path and confirm 403 `calendar_feed_limit_reached` where relevant.
   - Confirm `/account/logout` behavior is not a 404 in this pass.

6. **Privacy + identity consistency checks (required)**
   - Verify no raw feed URL / source_event_uid visible in list/calendar/detail.
   - Verify source color marker and label remain stable after each refresh.
   - Verify conflict/discovery labels still function (`Possible duplicate from another calendar`) without regressions.

## Documentation updates

After the pass, add evidence to:

- `docs/qa/ti-planner-ics-uat.md` under `Stage 2.9C-4`
- `CLAUDE.md` 2.9C status and open items
- `docs/weekend-planner-current-state.md` if results change status from partial to pass/fail

## Pass criteria

- Update/move: PASS/known in-place behavior confirmed.
- Cancel/delete: PASS or explicit, platform-appropriate retention policy documented.
- F3/F4: PASS on this path.
- No regressions in source identity stability, conflict handling, or privacy.
- Resulting state recorded in source UAT run log.
