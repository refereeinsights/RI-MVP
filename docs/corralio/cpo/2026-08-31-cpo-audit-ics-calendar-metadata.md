# Corralio CPO Audit — ICS Calendar-Level Metadata (`X-WR-CALNAME` and Neighbors)

**Audit and recommendation, not build authorization.** Answers, with repository evidence, whether calendar-level ICS metadata already available to the parser but currently discarded can safely reduce the number of SMS onboarding questions needed for team/sport identification (Section 6.4 of the Phase A+B build prompt, and Section 4 of the SMS Schedule Onboarding Contract). Does not block ingestion on inference and does not authorize writing team/sport truth from low-confidence metadata — see Section 4 below for how that constraint is enforced by the recommended design, not just stated as intent.

## 1. What the Parser Already Sees and Discards

Traced line-by-line against the actual installed `node-ical@0.20.1` source (`node_modules/node-ical/ical.js`), not assumed from its README:

- `normalizeIcsSchedule()` (`packages/lib/sports-schedule/index.ts:316`) calls `ical.parseICS(input.icsText)`, iterates `Object.values(parsed)`, and for every entry with `event?.type === "VCALENDAR"` does exactly this (`index.ts:409-412`):
  ```ts
  if (event?.type === "VCALENDAR") {
    sawCalendarStructure = true;
    continue;
  }
  ```
  That `event` object is not empty. Tracing `node-ical`'s own parser (`ical.js:428-451`): when the `END:VCALENDAR` line closes the calendar, it sweeps every *string-valued* top-level property off the calendar object being built — `type`, `version`, `prodid`, `calscale`, and any `X-`-prefixed custom property present in the source (case preserved, minus the `X-` prefix — an `X-WR-CALNAME` line lands as key `WR-CALNAME`; a lowercase `x-wr-calname` line would land as `wr-calname`, since `node-ical` only strips the prefix and does not normalize case for `X-` properties) — into a `highLevel` object, then reattaches it as `curr.vcalendar = highLevel`. Since `Object.values(parsed)` yields this `.vcalendar`-holding container alongside each individual event, `index.ts`'s loop **already reads this object on every parse — it just throws it away instead of extracting anything from it.**
- **This isn't hypothetical.** `X-WR-CALNAME:ArbiterSports` already appears as a fixture line in two existing test files (`packages/lib/sports-schedule/index.test.ts:150`, `apps/corralio/lib/schedules/ingest.test.ts:100`), proving the parser already ingests this exact property today without erroring — the "accepts a structurally valid empty calendar" test at `index.test.ts:141-159` parses a calendar containing this exact line and passes. **Caveat on that evidence:** this fixture is a synthetic test file written to *look like* a plausible ArbiterSports feed, not a captured real one — it's proof the parser handles the property safely, not proof of what any real vendor's feed actually contains. No real captured feed from any of the seven cataloged platforms exists in this repository.
- Only `SUMMARY` and `LOCATION` are extracted per-event today (`index.ts:353-358`, via the existing `extractIcsTextProperty()` helper). No calendar-level property — `X-WR-CALNAME`, `X-WR-CALDESC`, `X-WR-TIMEZONE`, or anything else — is read anywhere in `packages/lib/sports-schedule`, `apps/corralio/lib/schedules/`, or `apps/ti-web/lib/planner/ics-import.ts`.

## 2. Does Preserving It Actually Reduce SMS Questions? Honest Answer, Not a Hope

**Plausibly, for some platforms, unverified for any of them.** Two things are true at once:

- Preserving `X-WR-CALNAME` gives Section 6.4's feed-evidence inference step a genuinely stronger signal than what it has today (per-event `SUMMARY` text alone, which is typically an opponent/game description, not a team identity). A platform that populates a per-team calendar subscription's name with something like "Spokane Select - Baseball" would let [S5] (the SMS Schedule Onboarding Contract's context-resolution state) reach medium or even high confidence instead of asking cold.
- **The one piece of evidence this repository actually has cuts the other way.** The existing `X-WR-CALNAME:ArbiterSports` fixture — even acknowledging it's synthetic, not captured — is illustrative of a real failure mode: a calendar name that's just the *vendor's* product name, not the *team's* name, would be actively misleading if trusted at anything above low confidence ("Found events from 'ArbiterSports' — is this for Jake?" is nonsense). Whether GameChanger, TeamSnap, LeagueApps, Stack Team App, or ArbiterLive populate this field with team-specific text, vendor-generic text, or nothing at all is **not knowable from this repository** — it requires the same per-platform verification work already recommended for the (filed, not-yet-run) Schedule-Source Compatibility & Evidence Matrix.

**Recommendation: preserve it, but treat it strictly as one additional medium-confidence input signal to Section 6.4's existing confirm/ask discipline — never as a new high-confidence source on its own, and never platform-agnostically trusted.** Concretely: a calendar name that exactly or near-exactly matches an existing team's `display_name` in the household is reasonable medium-confidence evidence (state the guess, ask for one-word confirm, per the Contract's Section 1 confidence tiers). A calendar name with no relationship to any existing entity is not evidence of anything and should not change what [S5] does today (ask). This is a genuine improvement in *some* cases, not a general solution — and per-platform confirmation of which cases belongs in the evidence-matrix work, not this audit.

## 3. Smallest Parser/Model Change

Scoped to stay purely additive at the parser boundary and touch nothing downstream:

**`packages/lib/sports-schedule/index.ts`:**
- Add one field to `NormalizeIcsScheduleResult`: `calendarName: string | null`.
- In the existing `VCALENDAR` branch, extract it using the same helpers the file already uses for every other text field (`extractIcsTextProperty`, `stripHtml`, `collapseWhitespace`, `clamp` — no new dependency, no new parsing logic):
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
  Checking both `WR-CALNAME` and `wr-calname` handles the case-preservation behavior traced in Section 1 without assuming every producer emits the RFC-conventional uppercase form. `extractIcsTextProperty()` already safely handles the `{params, val}`-wrapped shape `node-ical` uses when a property carries parameters (e.g., `X-WR-CALNAME;LANGUAGE=en:...`) — reused as-is, not reimplemented. Note `node-ical`'s `storeValueParameter` (`ical.js:60-76`) turns a *repeated* same-named property into an array rather than a string; `extractIcsTextProperty()` returns `""` for anything that isn't a plain string or `{val: string}` object, so a malformed feed with duplicate `X-WR-CALNAME` lines degrades safely to `null` rather than throwing — worth a one-line test to confirm, not worth handling specially.
- Return `calendarName` in the result object.
- **`X-WR-CALDESC` (calendar description) is available via the identical mechanism** (`event["WR-CALDESC"]`) but is not recommended for this pass — it's lower-signal for team/sport identification than the name field, and adding it now would be scope creep against "smallest change." Flagging it as a trivial follow-on if ever wanted, not a reason to expand this slice.

**Explicitly not touched in this change:** `apps/corralio/lib/schedules/ingest.ts` (`ingestCorralioSchedule()`'s return type and its 9 full-shape test assertions in `ingest.test.ts`), `apps/corralio/lib/schedules/refresh.ts`, `apps/ti-web/lib/planner/ics-import.ts`. All three consume `normalizeIcsSchedule()`'s result by destructuring specific fields (`.events`, `.canceledSourceEventUids`, `.errors`, `.parsedTotal`) rather than exhaustive shape comparison — confirmed by direct inspection — so a new optional field is additive-safe for all three today, and none of them need to change to keep working exactly as they do now. **Consuming `calendarName` — actually using it in an onboarding question — is deliberately left to whoever builds Section 6.4's resolution logic**, not bundled into this parser-level change. This keeps ingestion behavior itself completely unchanged: nothing about what gets fetched, parsed, or persisted differs before and after this slice, which is the concrete mechanism by which "do not block ingestion on inference" is satisfied — inference has nothing to do with this slice at all.

## 4. Fixtures Affected

Precisely, not hand-waved — checked against every `assert.deepEqual(result` call site:

- **`packages/lib/sports-schedule/index.test.ts`** — 2 of its 7 `assert.deepEqual(result, ...)` calls compare the *full* result object and will need `calendarName` added to their expected literal: the "rejects non-calendar text" test (`calendarName: null`) and the "accepts a structurally valid empty calendar" test (`calendarName: "ArbiterSports"` — the fixture already contains the line, so this test's expected value changes from implicitly-discarded to explicitly-asserted). The other 5 compare sub-properties (`.errors`, `.events[0]`, `.canceledSourceEventUids`, `.events.map(...)`) and are unaffected. **Recommend one new test** asserting extraction from a calendar that has both `X-WR-CALNAME` and real events (the existing fixture only exercises the empty-calendar case), and one confirming the dual-case (`WR-CALNAME` vs `wr-calname`) lookup actually works, since that's the one piece of this change with no existing test coverage to lean on.
- **`apps/corralio/lib/schedules/ingest.test.ts`** — **zero changes required**, because this slice deliberately does not touch `ingest.ts`'s return type (Section 3). Its existing `fetchValidEmpty` fixture (which also already contains `X-WR-CALNAME:ArbiterSports`) continues to exercise the same code path without any assertion change, since `ingestCorralioSchedule()` never reads or returns the new field.
- **No other test file, and no fixture in `apps/ti-web`**, is touched.

Total footprint: one non-test file (~10 net new lines plus one new field declaration), one test file (2 edited assertions, 1-2 new tests). This is deliberately small, and the smallness is a direct consequence of stopping at the parser boundary rather than threading the field through `ingest.ts` in the same pass.

## 5. Placement — Prerequisite Micro-Slice, Not Inside Phase A+B

**Recommend this run as its own small, independently-shippable slice — before or in parallel with Phase A+B, not folded into it.** Reasoning:

- **Zero coupling.** This change touches only ICS-parsing logic in a shared package (`packages/lib/sports-schedule`) used by two apps (`corralio`, `ti-web`). It has no dependency on phone auth, channel identity, webhooks, pending-intake state, or anything else Phase A+B is actually about, and nothing in Phase A+B depends on it functioning in order to ship — Section 6.4's resolution logic degrades gracefully (falls back to per-event-title-text-only inference) if this hasn't landed yet, exactly as already stated in the amended Section 6.4.
- **Different review surface.** Phase A+B is already a dense, security-and-architecture-reviewed document awaiting founder sign-off (manual OTP, webhook signing, SMS compliance gates, a fresh authorization-model review). A parsing-library change with a different blast radius (a second consuming app, `ti-web`, that has nothing to do with SMS or auth) is a distraction inside that review, not a natural extension of it.
- **Faster to verify in isolation.** Two files, no schema, no migration, no vendor dependency, no webhook, fully covered by fast unit tests — this could land and be verified in isolation well before Phase A+B's own vendor spike (Task 0) even starts, meaning Section 6.4 could have the stronger signal available *before* it's needed rather than racing to catch up.
- **Consistent with the existing 3.6B Phase 1 precedent already in this prompt.** Section 6.5 already treats a different prerequisite (the required-arrival model) the same way: named, depended-upon, explicitly not duplicated inline, "stop and flag if absent" rather than block. This document's Section 6.4 amendment applies that identical pattern to calendar-name metadata, for consistency rather than inventing a second dependency-handling idiom.

**If accepted, this becomes its own short, separately-filed build prompt** (parser change + the two test-file edits above), landing independently of and prior to any implementation of Phase A+B's Section 6.4 resolution logic. Not authorized to build from this audit alone — this document is the audit and recommendation Phase A+B's amended Section 6.2/6.4 now references, nothing more.
