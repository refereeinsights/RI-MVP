# TournamentInsights Planner — Stage 2.9B-2 (Repo-Validated): GameChanger Single-Feed Baseline UAT

## Scope and assumptions

Use this prompt only after Stage 2.10A is implemented and Stage 2.9B-1B baseline behavior is documented.

- Goal: establish first real-platform GameChanger behavior under controlled production-safe conditions before expanding to 2.9B-3+.
- Limit to **one** GameChanger source in a single run.
- Do not overclaim calendar platform support beyond what is observed in the active run.

## Inputs required

- Verified Weekend Pro UAT account (or equivalent that can connect >1 feed if needed later).
- One stable GameChanger ICS/webcal URL for a known test team.
- Existing docs:
  - `docs/weekend-planner-current-state.md`
  - `docs/qa/ti-planner-ics-uat.md`

## Execution steps

1. Open `/weekend-planner` as the fixture `weekend_pro` UAT user.
2. Import the selected GameChanger feed as a single source.
3. Add a baseline check list on:
   - imported event count and date coverage,
   - source label rendered in list/calendar,
   - no raw source URL / source event UID in UI.
4. Update scenario:
   - edit a test Practice A event in source (time and/or field/location),
   - refresh imported feed,
   - verify in-place update (no duplicate).
5. Refresh test:
   - run at least two manual refreshes,
   - confirm no duplicate storm and stable visibility.
6. Cancel/delete scenario:
   - remove a seeded Team Event C in source,
   - refresh and confirm non-destructive behavior (no unexpected source-linked hard-delete).
7. Overlay resilience:
   - add local note and/or venue to one synced event,
   - refresh and confirm overlays persist (if observed).
8. Record all findings in `docs/qa/ti-planner-ics-uat.md` and return to stage planning.

## Required evidence to record

- Run date and feed alias.
- Duplicate behavior on change + refresh.
- Cancel/delete behavior outcome.
- Any refresh delay observed.
- Overlay persistence outcome.
- Loaded/disclosure behavior if full coverage is not reached.

## Post-run status

Update:
- `CLAUDE.md` (Stage 2.9B-2 status)
- `docs/weekend-planner-current-state.md` (next-step sequencing and known results)
- `docs/qa/ti-planner-ics-uat.md` (run log / compatibility matrix row)
