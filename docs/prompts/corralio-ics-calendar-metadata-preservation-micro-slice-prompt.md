# Corralio — ICS Calendar-Level Metadata Preservation (Micro-Slice)

**Small, independent, prerequisite slice. No push, no deploy.** Preserves `X-WR-CALNAME` (and its provenance) at the ICS-parsing layer only. Does not derive, infer, persist, or expose any team/sport identity from it — that consumption logic is separate, later work (Phase A+B's Section 6.4, or a follow-on), gated by the acceptance rule in Section 2 below.

> **Founder decision, 2026-08-31, Do Now.** Accepts the CPO audit (`docs/corralio/cpo/2026-08-31-cpo-audit-ics-calendar-metadata.md`) recommendation to file and run this independently of Phase A+B — a soft prerequisite for SMS onboarding inference, not a blocker for it. Standing product rule this slice exists to make possible without violating: *"CALNAME can reduce questions; it cannot independently establish team/sport truth."*

## 0. Why This Exists

`node-ical@0.20.1` already parses `X-WR-CALNAME` (and every other calendar-level property) into an object that `normalizeIcsSchedule()` (`packages/lib/sports-schedule/index.ts:409-412`) already visits on every single parse — and then discards, via a bare `continue`. This slice stops discarding it. Nothing about ingestion, parsing correctness, or event handling changes; the only change is that one additional, optional field is now returned instead of silently dropped. Full evidence trail (exact node-ical source line references, the existing synthetic test fixture that already contains this property, case-sensitivity behavior) is in the audit document above — read it before implementing; do not re-derive this evidence independently.

## 1. Confirmed Starting Facts

- `normalizeIcsSchedule()` extracts only per-event `SUMMARY`/`LOCATION` today. No calendar-level property is read anywhere in `packages/lib/sports-schedule`, `apps/corralio/lib/schedules/`, or `apps/ti-web/lib/planner/ics-import.ts`.
- `node-ical` stores an `X-`-prefixed calendar-level property with the `X-` prefix stripped but **case otherwise preserved** — `X-WR-CALNAME` lands as key `WR-CALNAME`; a nonstandard lowercase producer would land as `wr-calname`. Check both.
- The extracted value may arrive as a plain string or as a `{params, val}` object (when the source line carries ICS parameters, e.g. `;LANGUAGE=en`) — the existing `extractIcsTextProperty()` helper (`packages/lib/sports-schedule/icsProperty.ts`) already handles both shapes correctly; reuse it, do not reimplement.
- A malformed feed with a *repeated* `X-WR-CALNAME` line would make `node-ical` store an array instead of a string/object for that key — `extractIcsTextProperty()` already returns `""` for anything that isn't a plain string or `{val: string}`, so this degrades safely to `null` with no special-casing required. Add one test confirming this rather than trusting the reasoning alone.
- `X-WR-CALNAME:ArbiterSports` already appears in two existing test fixtures (`packages/lib/sports-schedule/index.test.ts:150`, `apps/corralio/lib/schedules/ingest.test.ts:100`) — synthetic, not a captured real feed, but proof the parser already ingests this property today without erroring.
- Three real consumers of `normalizeIcsSchedule()`'s result exist: `apps/corralio/lib/schedules/ingest.ts`, `apps/corralio/lib/schedules/refresh.ts`, and `apps/ti-web/lib/planner/ics-import.ts`. All three destructure specific fields (`.events`, `.canceledSourceEventUids`, `.errors`, `.parsedTotal`) rather than doing exhaustive shape comparison — confirmed by direct inspection. A new optional field on the result type is additive-safe for all three without any change to them.

## 2. Explicit Non-Goals (binding scope boundary)

- **No team/sport derivation, inference, or persistence of any kind.** This slice returns a raw string, nothing more. Do not write it to `corralio_teams`, `corralio_children`, `corralio_schedule_sources`, or any other table. Do not add matching/fuzzy-comparison logic against existing entity names.
- **No consumption by `ingest.ts`, `refresh.ts`, or any SMS/onboarding logic.** This is deliberately a parser-boundary-only change. Threading it into `ingestCorralioSchedule()` or any downstream consumer is separate, later, and separately-scoped work (Phase A+B's Section 6.4 or its own follow-on) — do not anticipate that work here even if it looks convenient to do while the parser file is already open.
- **No `X-WR-CALDESC` or any other calendar-level property in this pass.** `calendarName` only. `X-WR-CALDESC` is available via the identical mechanism if ever wanted, but adding it now is scope creep against "smallest change" — flag it as a trivial future add if asked for, don't build it speculatively.
- **No UI, no display of this value to a parent anywhere**, in this slice. It exists in the parse result and nowhere else yet.

**Binding acceptance rule, founder's exact words, governing this slice and every future consumer of the field it preserves:** *"Preserve calendar-level metadata and provenance; do not derive or persist canonical team/sport values solely from `X-WR-CALNAME`. Any inference must remain confidence-scored and fall back to parent confirmation."* This slice satisfies the rule trivially (it performs no inference at all); record it here so later work inherits the constraint rather than rediscovering it.

## 3. The Change

**`packages/lib/sports-schedule/index.ts`:**

- Add one field to `NormalizeIcsScheduleResult`: `calendarName: string | null`.
- In the existing loop's `VCALENDAR` branch, extract and clamp it using the file's existing helpers (`extractIcsTextProperty`, `stripHtml`, `collapseWhitespace`, `clamp` — no new dependency):
  ```ts
  let calendarName: string | null = null;
  // ...inside the existing loop, VCALENDAR branch:
  if (event?.type === "VCALENDAR") {
    sawCalendarStructure = true;
    if (calendarName === null) {
      const raw = extractIcsTextProperty(event["WR-CALNAME"] ?? event["wr-calname"]);
      calendarName = clamp(collapseWhitespace(stripHtml(raw.trim())), 140) || null;
    }
    continue;
  }
  ```
- Return `calendarName` in the result object alongside the existing fields.
- Verify the exact current shape of `event` at this point in the loop against a live parse before writing the above — the audit document's trace is believed correct but was not executed against the live library in this session; confirm it holds (e.g., via a quick local script or the new test in Section 5) before treating the implementation as done.

**Do not modify** `apps/corralio/lib/schedules/ingest.ts`, `apps/corralio/lib/schedules/refresh.ts`, `apps/ti-web/lib/planner/ics-import.ts`, or any of their tests. If implementation discovers that any of these three actually do perform exhaustive shape comparison against `normalizeIcsSchedule()`'s result (contradicting the audit's finding), stop and report it — that would mean this slice's blast radius is larger than scoped, which is a finding to surface, not silently work around.

## 4. Fixtures Affected

- `packages/lib/sports-schedule/index.test.ts`: update the 2 full-result `assert.deepEqual(result, {...})` calls to include `calendarName` (`null` for the "rejects non-calendar text" case; `"ArbiterSports"` for the "accepts a structurally valid empty calendar" case, whose fixture already contains the `X-WR-CALNAME` line). Add one new test asserting extraction from a calendar with both `X-WR-CALNAME` and real events (the existing fixture only covers the empty-calendar case). Add one new test confirming the `WR-CALNAME`/`wr-calname` dual-case lookup. Add one new test confirming the repeated-property/array-value case degrades to `null` rather than throwing.
- No other file changes.

## 5. Verification

1. All new and existing tests in `packages/lib/sports-schedule/index.test.ts` pass.
2. Every existing test in `apps/corralio/lib/schedules/ingest.test.ts`, `refresh.test.ts`, and `apps/ti-web`'s ICS-import tests passes unchanged — zero assertion edits required in any of them (confirms the additive-safety claim in Section 1, doesn't just assume it).
3. Complete Corralio test suite, Corralio TypeScript validation, zero-warning Corralio lint.
4. All four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`) — `ti-web` specifically, since it's a real consumer of the changed package.
5. `git diff --check`.
6. Confirm no team/sport/child/team-table write occurs anywhere in the diff — a direct code-review check against Section 2's non-goal, not just a test-suite pass.

## 6. Execution Gates

1. Implement the change (Section 3) and the fixture updates (Section 4).
2. Run full verification (Section 5).
3. Local commit only. Do not push. Do not deploy.
4. Stop at `CORRALIO ICS CALENDAR METADATA MICRO-SLICE COMPLETE LOCALLY` (or `...READY AFTER LISTED FIXES` / `...BLOCKED BY AUDIT FINDING` if Section 3's live-verification step surfaces a discrepancy from the audit's trace).

## 7. Final Verdict

Return exactly one:

`CORRALIO ICS CALENDAR METADATA MICRO-SLICE COMPLETE LOCALLY`
`CORRALIO ICS CALENDAR METADATA MICRO-SLICE READY AFTER LISTED FIXES`
`CORRALIO ICS CALENDAR METADATA MICRO-SLICE BLOCKED BY AUDIT FINDING`

Include: confirmation the live parse behavior matched the audit's trace (or how it differed); final diff summary; test/build results; explicit confirmation nothing was pushed or deployed; local commit hash.
