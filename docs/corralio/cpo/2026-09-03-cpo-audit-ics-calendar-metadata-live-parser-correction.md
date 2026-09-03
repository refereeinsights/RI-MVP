# CPO Audit — ICS Calendar-Level Metadata Prompt: Live Parser Correction

**2026-09-03 · Chief Product Officer**

**Verdict: `CORRALIO ICS CALENDAR METADATA MICRO-SLICE READY AFTER LISTED FIXES` — fixes applied.** The prompt at `docs/prompts/corralio-ics-calendar-metadata-preservation-micro-slice-prompt.md` was directionally correct but not ready to implement unchanged. A pre-implementation audit (findings below, supplied for CPO review) found two material stale assumptions; this document records those findings, this session's independent re-verification of each one against the live repository and the installed `node-ical@0.20.1`, and confirms the prompt has been corrected in place accordingly. The corrected prompt is what should actually be dispatched, not the original.

## Why this exists

The prompt was filed and founder-approved as "Do Now" on 2026-08-31. It sat unstarted through 2026-09-03 while other work took priority. Before dispatching it as the next Codex task, a live-parser audit was run against it — and found real gaps that would have shipped a materially incomplete implementation had the prompt been executed as originally written. This is the audit-before-build discipline already standard in this project (see the Slice 4.6 Section 68 gate, the Slice 3.4 Stage 1 gate); it worked as intended here.

## Independent verification performed this session

Every claim below was re-derived directly, not accepted from the audit report on faith:

- Confirmed installed `node-ical` version is exactly `0.20.1` (`node_modules/node-ical/package.json`).
- Wrote and ran a standalone script (`ical.sync.parseICS(...)`) against five synthetic `VCALENDAR` fixtures — plain `X-WR-CALNAME`, parameterized `X-WR-CALNAME;LANGUAGE=en`, repeated `X-WR-CALNAME`, fully lowercase `x-wr-calname`, and `X-wr-calname` (capital `X`, lowercase remainder) — and inspected exactly where each landed in the parse result.
- Read `apps/corralio/lib/schedules/intakeAssignment.ts` in full and confirmed `resolveDeterministicIntakeAssignment()` requires both an exact normalized `calendarName`-to-team-name match **and** a corroborating exact team-name token match in an event title before assigning, falling back to `clarification_required` otherwise — it does not trust `calendarName` alone.
- Read `apps/corralio/lib/sms/scheduleIntake.server.ts` in full and confirmed its `inspect()` function already calls `normalizeIcsSchedule()`, already builds `IntakeFeedEvidence`, and hardcodes `calendarName: null` with a comment stating this preservation slice hasn't landed.
- Confirmed `calendarName` does not currently appear anywhere in `packages/lib/sports-schedule/index.ts` or its tests — the parser change genuinely has not been implemented yet, consistent with the prompt's premise.
- Read `packages/lib/sports-schedule/icsProperty.ts` (`extractIcsTextProperty`) and confirmed it returns `""` for any shape other than a plain string or `{val: string}` — including an array — so the repeated-property-degrades-to-`null` behavior is real, once the extractor actually reaches the location where that array lives.

## Findings (confirmed accurate against live testing)

**1. [Blocking, confirmed] The original prompt's proposed extraction misses valid parser shapes.**

Live-tested against the installed `node-ical@0.20.1`:

| Input form | Where it lands | Original prompt's code would find it? |
|---|---|---|
| Plain `X-WR-CALNAME:...` | `vcalendarObject["WR-CALNAME"]` | Yes |
| Parameterized `X-WR-CALNAME;LANGUAGE=en:...` | Top-level `parsed["WR-CALNAME"]` as `{params, val}` — **not inside the `VCALENDAR` object** | **No — silently missed** |
| Repeated `X-WR-CALNAME` | Top-level `parsed["WR-CALNAME"]` as a string array — **not inside the `VCALENDAR` object** | No (but degrades safely to `null` regardless, by accident of absence rather than by design) |
| `x-wr-calname:...` (fully lowercase incl. prefix) | `vcalendarObject["x-wr-calname"]` | **No — key not checked** |
| `X-wr-calname:...` (capital `X`, lowercase remainder) | `vcalendarObject["wr-calname"]` | Yes |

The original prompt's Section 1 claimed a single shape ("`X-WR-CALNAME` lands as key `WR-CALNAME`; check `wr-calname` too") and its Section 3 code checked only the `VCALENDAR` object. That code would have silently dropped a parameterized or repeated CALNAME, and any fully-lowercase producer, while reporting success. **Confirmed correct as stated in the pasted findings.**

**Fix applied:** the corrected prompt's Section 3 now defines a deterministic extractor checking three keys (`WR-CALNAME`, `wr-calname`, and `x-wr-calname` — the third added as an explicit CPO judgment call, since the audit surfaced it as a real gap and it costs one array entry) across both the `VCALENDAR` object and the top-level parse result, with `VCALENDAR` taking precedence. An array still resolves to `null` via the existing `extractIcsTextProperty()` behavior, now actually reached. A title-cased remainder (e.g. `Wr-Calname`) remains a documented, accepted gap rather than building a full case-insensitive key scanner.

**2. [Important, confirmed] Phase A+B consumption is no longer future work.**

The original prompt (written 2026-08-31) stated three consumers existed and explicitly prohibited SMS/onboarding consumption as out-of-scope future work. Phase A+B shipped after that date and added a real fourth consumer: `apps/corralio/lib/sms/scheduleIntake.server.ts`'s `inspect()` function, confirmed (this session) to already call the parser and already hardcode `calendarName: null` with a comment naming this exact slice as the blocker. Meanwhile `resolveDeterministicIntakeAssignment()`, confirmed already built and already requiring corroborating evidence rather than trusting CALNAME alone, is sitting idle for real data it will never receive until this slice lands and one line changes.

**Fix applied:** the corrected prompt authorizes exactly one line in `scheduleIntake.server.ts` (`calendarName: null` → `calendarName: normalized.calendarName`), explicitly scoped as "not a general SMS/onboarding-logic expansion" — the existing corroboration rule doesn't change, loosen, or need re-auditing; it just starts receiving real input.

**3. [Minor, confirmed] "Raw," "optional," and "provenance" were imprecise.**

- `calendarName: string | null` is a required, nullable field, not an optional one (`calendarName?:`). The original prompt's Section 0 called it "one additional, optional field" — corrected.
- The returned value is bounded and sanitized (HTML stripped, whitespace collapsed, length-clamped to 140 chars), not raw. The original prompt's Section 2 called it "a raw string" — corrected.
- The prompt's opening line promised the slice preserves "`X-WR-CALNAME` (and its provenance)," but Section 3 added no provenance field. Corrected to state that provenance is currently unambiguous by construction (only one calendar-level property is read), with an explicit note that a future second property would require an actual source field.

**4. [Minor, confirmed] The affected-file and test lists were stale.**

"No other file changes" (original Section 4) is no longer true given Finding 2. Corrected Section 4 now lists `scheduleIntake.server.ts`, its adapter test coverage, coverage proving `intakeAssignment.ts`'s corroboration rule against real (non-null) evidence, and the required `notes.md`/Stage-1-record updates stating the prior `calendarName: null` limitation is resolved.

## What this changes about priority, not just content

This doesn't change the recommendation to dispatch this micro-slice next — if anything it strengthens it. The corrected version now does real, immediately useful work (Phase A+B's SMS assignment resolver starts receiving actual CALNAME evidence instead of a permanent `null`) rather than being pure parser-boundary housekeeping. It remains zero-dependency and small.

## Disposition

- Corrected prompt: `docs/prompts/corralio-ics-calendar-metadata-preservation-micro-slice-prompt.md` (in place, original text superseded — see git history for the prior version).
- This document is the canonical record of the correction and the independent verification behind it.
- No code was changed. No push, deploy, migration, or provider call occurred. This was a documentation-only correction pass.
