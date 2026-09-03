# Corralio — ICS Calendar-Level Metadata Preservation (Micro-Slice)

> **Corrected 2026-09-03.** A pre-implementation live-parser audit (`docs/corralio/cpo/2026-09-03-cpo-audit-ics-calendar-metadata-live-parser-correction.md`) found this prompt's original Section 1/3 parser-shape claim incomplete and its Section 2 scope boundary stale against a real fourth consumer that has since shipped (Phase A+B). Both are corrected in place below; the corrections were independently re-verified against the installed `node-ical@0.20.1` before being accepted, not taken on the audit's word alone. Original text is not preserved inline — see the audit document and git history for the prior version. Verdict on the original: it was directionally correct but **not ready to implement unchanged.**

**Small, independent, prerequisite slice. No push, no deploy.** Preserves `X-WR-CALNAME` at the ICS-parsing layer, plus exactly one narrow, already-authorized downstream wiring change (Section 2). Does not derive, infer, or persist any team/sport identity from it beyond the already-completed, already-audited corroboration rule in `resolveDeterministicIntakeAssignment()`.

> **Founder decision, 2026-08-31, Do Now.** Accepts the original CPO audit (`docs/corralio/cpo/2026-08-31-cpo-audit-ics-calendar-metadata.md`) recommendation to file and run this independently of Phase A+B — a soft prerequisite for SMS onboarding inference, not a blocker for it. Standing product rule this slice exists to make possible without violating: *"CALNAME can reduce questions; it cannot independently establish team/sport truth."*

## 0. Why This Exists

`node-ical@0.20.1` already parses `X-WR-CALNAME` into the object `normalizeIcsSchedule()` (`packages/lib/sports-schedule/index.ts`, the `for (const event of Object.values(parsed))` loop) already visits on every single parse — and then discards, via a bare `continue`. This slice stops discarding it. Nothing about ingestion, parsing correctness, or event handling changes; every real `normalizeIcsSchedule()` execution returns `calendarName` as a bounded string or `null` instead of silently dropping it.

**Implementation-time TypeScript correction, 2026-09-03:** the repository audit correctly found no exhaustive result comparisons outside the two named assertions, but it missed six injected `normalizeSchedule` test fakes in `refresh.test.ts`. Those fakes structurally implement `typeof normalizeIcsSchedule` and omit the new field. To preserve the binding prohibition on changing refresh code/tests while retaining the concrete runtime guarantee above, the exported result type declares `calendarName?: string | null`; the real parser still includes the key on every return, and the one authorized consumer normalizes an absent fake value to `null`. This is type-level backward compatibility, not optional runtime behavior.

Read the corrected Section 1 below before implementing — it replaces the original audit's single-shape trace, which a 2026-09-03 live-parser test found to be incomplete.

## 1. Confirmed Starting Facts (corrected 2026-09-03)

- `normalizeIcsSchedule()` extracts only per-event `SUMMARY`/`LOCATION` today. No calendar-level property is read anywhere in `packages/lib/sports-schedule`, `apps/corralio/lib/schedules/`, or `apps/ti-web/lib/planner/ics-import.ts`.
- **Where `X-WR-CALNAME` lands depends on its exact form on the wire — this was live-tested against the installed `node-ical@0.20.1`, not assumed:**
  - A plain, unparameterized line (`X-WR-CALNAME:Test League`) lands as a **string**, nested inside the `VCALENDAR` object the existing loop already visits, under key `WR-CALNAME`.
  - A **parameterized** line (`X-WR-CALNAME;LANGUAGE=en:Test League`) does **not** land inside the `VCALENDAR` object at all — it lands as `{params, val}` at the **top level of the full `node-ical` parse result** (the same object the loop's `Object.values(parsed)` iterates over), under the same key `WR-CALNAME`.
  - A **repeated** `X-WR-CALNAME` line similarly lands at the top level, not inside `VCALENDAR`, as a **string array** under key `WR-CALNAME`.
  - Case handling: only the leading `X-`/`x-` is stripped, case-insensitively; everything after it preserves the source's exact case. A fully lowercase `x-wr-calname:` line lands under key `x-wr-calname` (not `wr-calname`); a `X-wr-calname:` line (capital `X`, lowercase remainder) lands under key `wr-calname`.
  - **Practical consequence:** an extractor that only reads `vcalendarObject["WR-CALNAME"] ?? vcalendarObject["wr-calname"]` — the original prompt's proposed code — silently misses any parameterized CALNAME and any repeated CALNAME (both land outside the object it checks), and misses a fully-lowercase `x-wr-calname` producer (neither key it checks matches that string) — even though `node-ical` parsed the value successfully in every case. Section 3 is corrected to check both locations.
- The extracted value may arrive as a plain string or as a `{params, val}` object — the existing `extractIcsTextProperty()` helper (`packages/lib/sports-schedule/icsProperty.ts`) already handles both shapes correctly; reuse it, do not reimplement. It also already returns `""` for anything that is neither shape — including an array — so a repeated-property value degrades safely to `null` through the existing helper with no special-casing required, once the extractor actually reaches the location where that array lives (the fix above).
- `X-WR-CALNAME:ArbiterSports` already appears in two existing test fixtures (`packages/lib/sports-schedule/index.test.ts:150`, `apps/corralio/lib/schedules/ingest.test.ts:100`) — synthetic, not a captured real feed, but proof the parser already ingests this property today without erroring.
- **Four real consumers of `normalizeIcsSchedule()`'s result exist, not three.** `apps/corralio/lib/schedules/ingest.ts`, `apps/corralio/lib/schedules/refresh.ts`, and `apps/ti-web/lib/planner/ics-import.ts` all destructure specific fields (`.events`, `.canceledSourceEventUids`, `.errors`, `.parsedTotal`) rather than doing exhaustive shape comparison — confirmed by direct inspection; a new field is additive-safe for all three without any change to them. The fourth is `apps/corralio/lib/sms/scheduleIntake.server.ts`'s `inspect()` function, which shipped with Phase A+B after the original version of this prompt was written — see Section 2.

## 2. Explicit Non-Goals (binding scope boundary, corrected 2026-09-03)

- **No team/sport derivation, inference, or persistence of any kind.** This slice returns a bounded, sanitized string (HTML stripped, whitespace collapsed, length-clamped to 140 chars) or `null` — not a raw, unprocessed value. Do not write it to `corralio_teams`, `corralio_children`, `corralio_schedule_sources`, or any other table. Do not add matching/fuzzy-comparison logic against existing entity names beyond what's already described below.
- **No consumption by `ingest.ts` or `refresh.ts`.** Threading the preserved value into `ingestCorralioSchedule()` or either of those two files remains separate, later, out-of-scope work.
- **Exactly one narrow, explicitly authorized consumer change — not a general SMS/onboarding-logic expansion.** `apps/corralio/lib/sms/scheduleIntake.server.ts`'s `inspect()` function already calls `normalizeIcsSchedule()` and already builds an `IntakeFeedEvidence`-shaped result, but currently hardcodes:
  ```ts
  return { ok: true, evidence: { calendarName: null, eventTitles: normalized.events.map((event) => event.title) } };
  ```
  with a comment stating the preservation slice hasn't landed. This slice authorizes changing that one line to:
  ```ts
  return { ok: true, evidence: { calendarName: normalized.calendarName ?? null, eventTitles: normalized.events.map((event) => event.title) } };
  ```
  and nothing else in that file. The already-completed, already-audited `resolveDeterministicIntakeAssignment()` (`apps/corralio/lib/schedules/intakeAssignment.ts`) already refuses to trust `calendarName` alone: it requires an exact normalized match between `calendarName` and a candidate team's name, **and** a corroborating exact team-name token match in at least one event title, before it will assign — anything short of that returns `clarification_required`. Wiring the one line above only lets that existing rule see real data instead of a hardcoded `null`; it does not add, loosen, version-bump, or bypass any rule, and it introduces no new inference architecture.
- **No `X-WR-CALDESC` or any other calendar-level property in this pass.** `calendarName` only. `X-WR-CALDESC` is available via the identical mechanism if ever wanted, but adding it now is scope creep against "smallest change" — flag it as a trivial future add if asked for, don't build it speculatively.
- **No UI, no display of this value to a parent anywhere**, in this slice.

**Binding acceptance rule, founder's exact words, governing this slice and every future consumer of the field it preserves:** *"Preserve calendar-level metadata and provenance; do not derive or persist canonical team/sport values solely from `X-WR-CALNAME`. Any inference must remain confidence-scored and fall back to parent confirmation."* This slice satisfies the rule: the parser change performs no inference at all, and the one authorized consumer change routes the value into a rule that already requires independent corroborating evidence and already falls back to parent confirmation. On "provenance": since `X-WR-CALNAME` is currently the only calendar-level property this slice reads, the field's own presence is unambiguous about its source — no separate provenance/source field is added in this pass. If a second calendar-level property is ever read by a future slice, an explicit source field would become necessary then, not now.

## 3. The Change (corrected 2026-09-03)

**`packages/lib/sports-schedule/index.ts`:**

- Add one backward-compatible field to `NormalizeIcsScheduleResult`: `calendarName?: string | null`. Every concrete parser return must still include `calendarName`; optionality exists only so established injected parser fakes remain source-compatible without editing prohibited consumer tests.
- Implement a small deterministic extractor that checks the supported keys in **both** locations identified in Section 1 — the `VCALENDAR` object, then the top-level parsed result — with a defined precedence, reusing the existing helpers (`extractIcsTextProperty`, `stripHtml`, `collapseWhitespace`, `clamp` — no new dependency):
  ```ts
  const CALNAME_KEYS = ["WR-CALNAME", "wr-calname", "x-wr-calname"] as const;

  function readCalendarName(source: Record<string, unknown> | undefined): string | null {
    if (!source) return null;
    for (const key of CALNAME_KEYS) {
      const raw = extractIcsTextProperty(source[key]);
      const value = clamp(collapseWhitespace(stripHtml(raw.trim())), 140);
      if (value) return value;
    }
    return null;
  }

  let calendarName: string | null = null;
  // ...inside the existing loop, VCALENDAR branch:
  if (event?.type === "VCALENDAR") {
    sawCalendarStructure = true;
    if (calendarName === null) {
      // Precedence: a value nested inside the VCALENDAR object (the plain,
      // unparameterized form) wins if present; otherwise fall back to the
      // top-level parsed result, where node-ical places a parameterized
      // (`;LANGUAGE=en`) or repeated X-WR-CALNAME line instead.
      calendarName = readCalendarName(event as Record<string, unknown>) ?? readCalendarName(parsed as Record<string, unknown>);
    }
    continue;
  }
  ```
- `x-wr-calname` (fully lowercase, including the prefix) is added as a third supported key beyond the original prompt's two — a CPO judgment call made when correcting this prompt, since the live audit showed it's a real, distinct key a nonstandard producer can emit, and adding it costs one array entry. A title-cased remainder (e.g. `X-Wr-Calname` landing as key `Wr-Calname`) is **not** covered and is an accepted, documented gap: catching every possible casing would require a case-insensitive key scan rather than an enumerated list, which is more machinery than this "smallest deterministic change" slice should add. If a real feed is ever found using an uncovered casing, that's a one-line follow-up, not a reason to build a generic case-insensitive property reader now.
- Return `calendarName` in the result object alongside the existing fields.
- Confirm the exact current shape of `event` and `parsed` at this point in the loop against a live parse before treating the implementation as done (a quick local script, or the new tests in Section 4) — this prompt's own Section 1 trace was itself corrected once already from an earlier, incomplete version; do not treat this version as beyond needing the same confirmation discipline.

**`apps/corralio/lib/sms/scheduleIntake.server.ts`:**

- Change exactly the one line specified in Section 2 (`calendarName: null` → `calendarName: normalized.calendarName ?? null`). No other line in this file changes.

**Do not modify** `apps/corralio/lib/schedules/ingest.ts`, `apps/corralio/lib/schedules/refresh.ts`, `apps/ti-web/lib/planner/ics-import.ts`, `apps/corralio/lib/schedules/intakeAssignment.ts`, or any of their tests. If implementation discovers that any of the first three actually do perform exhaustive shape comparison against `normalizeIcsSchedule()`'s result (contradicting Section 1's finding), stop and report it — that would mean this slice's blast radius is larger than scoped, which is a finding to surface, not silently work around.

## 4. Fixtures Affected (corrected 2026-09-03 — "no other file changes" is stale)

- `packages/lib/sports-schedule/index.test.ts`: update the 2 full-result `assert.deepEqual(result, {...})` calls to include `calendarName` (`null` for the "rejects non-calendar text" case; `"ArbiterSports"` for the "accepts a structurally valid empty calendar" case, whose fixture already contains the `X-WR-CALNAME` line). Add tests covering: extraction from a calendar with both `X-WR-CALNAME` and real events; the plain-value-inside-`VCALENDAR` case; a parameterized (`;LANGUAGE=en`) CALNAME resolving via the top-level fallback; a repeated CALNAME (array at the top level) degrading to `null` rather than throwing; the `wr-calname` and `x-wr-calname` key variants; and a title-cased variant (e.g. `Wr-Calname`) confirmed to correctly resolve to `null` per the documented gap, not throw or silently misbehave.
- `apps/corralio/lib/sms/scheduleIntake.server.ts`: update or add focused coverage on `inspect()` proving the one changed line now threads a real parsed `calendarName` through to `IntakeFeedEvidence` instead of the hardcoded `null`.
- `apps/corralio/lib/schedules/intakeAssignment.ts` (or its existing test file, unchanged in implementation — coverage only): add focused coverage proving, against real (not hardcoded-null) evidence — exact CALNAME plus exact event-title corroboration assigns; CALNAME alone (no title corroboration) still requires clarification; a vendor-generic value like `ArbiterSports` that doesn't match any real team name does not assign; ambiguous or conflicting matches still require clarification; and that nothing in this coverage writes team, child, or sport identity anywhere.
- Update `apps/corralio/notes.md` and the Stage 1 CPO record to state the prior `calendarName: null` limitation in `scheduleIntake.server.ts` is now resolved.

## 5. Verification

1. All new and existing tests in `packages/lib/sports-schedule/index.test.ts` pass.
2. Every existing test in `apps/corralio/lib/schedules/ingest.test.ts`, `refresh.test.ts`, and `apps/ti-web`'s ICS-import tests passes unchanged — zero assertion edits required in any of them (confirms the additive-safety claim in Section 1, doesn't just assume it).
3. New/updated coverage in `apps/corralio/lib/sms/scheduleIntake.server.ts`'s tests and `apps/corralio/lib/schedules/intakeAssignment.ts`'s tests (Section 4) passes.
4. Complete Corralio test suite, Corralio TypeScript validation, zero-warning Corralio lint.
5. All four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`) — `ti-web` specifically, since it's a real consumer of the changed package.
6. `git diff --check`.
7. Confirm no team/sport/child/team-table write occurs anywhere in the diff — a direct code-review check against Section 2's non-goal, not just a test-suite pass.
8. Confirm the diff touches only: `packages/lib/sports-schedule/index.ts`, its test file, `apps/corralio/lib/sms/scheduleIntake.server.ts`, its test file, `intakeAssignment.ts`'s test file (if added), `apps/corralio/notes.md`, and the Stage 1 CPO record update. Anything else is a scope-boundary finding to report, not silently include.

## 6. Execution Gates

1. Implement the change (Section 3) and the fixture updates (Section 4).
2. Run full verification (Section 5).
3. Local commit only. Do not push. Do not deploy.
4. Stop at `CORRALIO ICS CALENDAR METADATA MICRO-SLICE COMPLETE LOCALLY` (or `...READY AFTER LISTED FIXES` / `...BLOCKED BY AUDIT FINDING` if implementation surfaces a further discrepancy from this corrected Section 1's trace).

## 7. Final Verdict

Return exactly one:

`CORRALIO ICS CALENDAR METADATA MICRO-SLICE COMPLETE LOCALLY`
`CORRALIO ICS CALENDAR METADATA MICRO-SLICE READY AFTER LISTED FIXES`
`CORRALIO ICS CALENDAR METADATA MICRO-SLICE BLOCKED BY AUDIT FINDING`

Include: confirmation the live parse behavior matched this corrected Section 1's trace (or how it differed); final diff summary; test/build results; explicit confirmation nothing was pushed or deployed; local commit hash.
