# Corralio Slice 3.7 — ArbiterLive & Arbiter Officials Schedule Sources
## Parser Hardening (Two Confirmed Bugs) + Two Picker Tiles + Narrow Analytics Migration

You are working inside the existing TournamentInsights / RefereeInsights / Corralio monorepo.

This slice sits alongside, not inside, the active pre-launch critical path (Slice 3.4 complete → Slice 3.5 → Slice 3.5.5 → Slice 3.6 → physical-device/final launch UAT → pilot). It does not reorder or block that sequence. Build and test it locally; hold push/deploy for explicit founder sign-off on timing, same as 3.5.5.

**This slice follows the established Stage 1 / Stage 2 pattern** (see 3.2, 3.3, 4.0A, 4.5, 3.5.5): this prompt covers Stage 1 — local/offline work, plus an unapplied migration and its catalog/behavioral verifier scripts. It ends at `SLICE 3.7 READY FOR DATABASE VERIFICATION`, not `COMPLETE LOCALLY` — a real migration is required this time (see Section 5), unlike CPO's original draft of this prompt, which incorrectly claimed none was needed. Stage 2 (apply the migration, run both verifiers, confirm) is a separate follow-up once a human applies it.

**Scope boundary — read before starting:** This slice covers two ArbiterSports surfaces, both explicitly approved by the founder:

1. **ArbiterLive** — the parent/fan team-following product at arbiterlive.com (a child's team schedule).
2. **Arbiter Officials** — the assigning/officiating calendar sync under an official's own Settings → Preferences (a parent-who-is-also-an-official's own accepted game assignments).

It does NOT cover SignUpGenius — no feed evidence exists for that at all, and it stays out of scope. Do not build any Arbiter-specific ingestion architecture for either surface — both go through the existing generic ICS pipeline, unchanged in shape, per ADR-019.

**Explicit founder decision on Arbiter Officials (2026-08-28):** implement it now, using the existing pipeline. Do not hold implementation waiting for a populated Officials test feed. Decline/reassignment/cancellation lifecycle semantics for this specific feed are an **explicit outstanding UAT item**, not an implementation blocker — but they must never be presented, in code comments, `notes.md`, or product copy, as verified. When a populated Officials feed becomes available, run bounded live UAT against it and make any narrow lifecycle correction it turns up. See Section 6 and Section 11 for exactly how this gets tracked and disclosed.

**Revision note (2026-08-28):** an internal review of the first draft of this prompt found two material specification conflicts, both corrected in this version — credited and folded in below:

1. The first draft required `normalizeIcsSchedule()` to return no error for an empty-but-valid calendar, but never reconciled that `ingestCorralioSchedule()` rejects on `!normalized.events.length` *before ever calling `createSource`* — meaning, unfixed, an empty Officials calendar still would never actually connect, contradicting the "connects successfully, no games yet" outcome the rest of the prompt described. Fixed in Section 4 below with a precise, verified specification.
2. The first draft claimed no database migration was needed. It missed a real check constraint — `corralio_schedule_connection_events_platform_check`, confirmed live in `supabase/migrations/20260827_corralio_slice34_schedule_connection_activation.sql` — restricting the `platform` column to `'gamechanger', 'teamsnap', 'stack_team_app', 'other'`. Adding `arbiterlive`/`arbiter_officials` as platform keys without extending this constraint would make every analytics write for the two new tiles fail (fail-open, so it wouldn't block a connection, but it would silently lose all interaction measurement for both new tiles and generate error logs). Fixed in Section 5 below.

---

# 0. What Was Found, and the Evidence Behind It

CPO ran a live, hands-on P1 audit against a real ArbiterLive team feed the founder supplied (a public high school volleyball team's schedule, no PII/household data involved), executing Corralio's actual production parser — `packages/lib/sports-schedule/index.ts`, `normalizeIcsSchedule()`, unmodified — against the raw feed directly.

### Bug 1 — parameterized `SUMMARY` corrupts every event title

ArbiterSports emits `SUMMARY;LANGUAGE=en-us:<title>` on every event — a parameterized ICS property, valid per RFC 5545. `node-ical` parses a parameterized property into an object shape (`{ params: {...}, val: "<title>" }`) instead of a plain string. The normalizer's `String(event?.summary ?? "").trim()` stringifies that object to the literal text `"[object Object]"`. Verified directly: every event in the real feed came back with `"title": "[object Object]"`. `LANGUAGE=en-us` is a vendor-level constant, not a per-team customization — it will reproduce on any ArbiterSports-generated feed, including Officials (same `PRODID:-//ArbiterSports Calendar//EN` vendor signature). No code path anywhere in this repo's ICS handling currently unwraps `.val`, and no existing test covers it.

### Bug 2 — a genuinely empty (zero-game) calendar is misclassified and, even once reclassified, still can't actually connect

The founder also supplied a real Arbiter Officials sample feed, described as blank (an official with no current assignments) — a case CPO reproduced directly rather than assumed: a syntactically valid `VCALENDAR` with zero `VEVENT` entries. Running it through the real `normalizeIcsSchedule()`:

```
{ "events": [], "canceledSourceEventUids": [], "errors": ["not_ics"], "parsedTotal": 0 }
```

The function only sets its internal `sawCalendarEvent` flag inside the loop over `VEVENT` objects — so a calendar with zero events never sets it, and the function reports `errors: ["not_ics"]` even though the input was a perfectly valid, empty calendar. But fixing only that is not enough: `ingestCorralioSchedule()` (`apps/corralio/lib/schedules/ingest.ts`) runs `if (normalized.errors.length) return userSafeError("not_ics"); if (!normalized.events.length) return userSafeError("no_events");` — both checks run **before `store.createSource()` is ever called**. So even after `normalizeIcsSchedule()` correctly returns `errors: []` for an empty calendar, the ingestion function still rejects it via the `no_events` branch, and no source is ever persisted. An official with no current assignments would still be unable to connect at all — the exact audience this decision was meant to unblock. See Section 4 for the full, corrected specification.

### Arbiter Officials — discovery path (from ArbiterSports's own help docs)

> **How to Get Your Calendar Feed**
> 1. Sign in to your ArbiterSports account.
> 2. Click the Settings tab.
> 3. Click the Preferences sub-tab.
> 4. Under Calendar Sync, click "Send Email."
> 5. Check your email for the iCal URL ArbiterSports sends, then use that link.
>
> Note: the iCal feed automatically updates and syncs all games you are assigned to and accepted as an official.

This is a different discovery path from ArbiterLive's (no team search/Follow step; it's account settings, not a public-facing team page) but the same shape: sign in, find the calendar-sync option, get a link by email, paste it into Corralio. No hands-on screenshot walkthrough of this exact flow exists yet (unlike ArbiterLive, which was screenshot-verified) — write the picker's instructions from the vendor documentation above, and flag in `notes.md` that this specific flow (not just the feed content) is also unverified hands-on, in case wording needs a follow-up correction once someone actually walks it.

### Arbiter Officials — architecture support (verified against live schema and code, not assumed)

The founder's framing for wanting this now is specific: not "a fourth team-schedule tile," but a parent-who-officiates wanting their own assignments checked against their kid's games for conflicts. CPO checked whether Corralio's data model and conflict detection actually support that before this decision was made:

- `corralio_schedule_sources` and `corralio_events` both allow `child_id` and `team_id` to be simultaneously null (`check (num_nonnulls(child_id, team_id) <= 1)`) — an **unassigned, household-level schedule source is already a valid, already-rendered state** (`productData.ts` already shows `assignmentLabel: assignment.label ?? "Not assigned"`).
- The event query feeding This Weekend (`productData.ts`) pulls all household events in the date window regardless of `child_id`/`team_id`.
- `deriveConflictPairs()` in `weekendPlan.ts` checks every event against every other event for time overlap with no assignment gating — it only uses child-match to *label* a conflict `"same-child"` vs. generic `"schedule"`.

**Net effect, confirmed: an Officials source connected unassigned will already surface as a real conflict against a child's game in This Weekend, with no schema or conflict-detection changes required.** This slice does not need to touch `weekendPlan.ts` or the household/event schema at all for that to work — the only schema change in this slice is the narrow analytics constraint in Section 5.

---

# 1. Product Standard

Both sources connect exactly the way GameChanger/TeamSnap/Stack Team App already do — through the existing generic ICS pipeline, no bespoke ingestion path, no direct Arbiter API/partnership integration (ADR-019 stays intact), no partnership claims anywhere in copy. The two parser bugs above must be fixed generically (not as `if (provider === arbiter)` special cases) so they don't recur for any future provider. And — per the founder's explicit instruction — Arbiter Officials' lifecycle behavior (declines, reassignments, cancellations) must be disclosed as unverified, not silently assumed to work correctly, anywhere a parent or the codebase itself might read it as confirmed.

---

# 2. Audit First

Before changing anything, confirm directly against the live repository (do not assume any of the following):

- Re-read `pushEvent()` and the top-level `normalizeIcsSchedule()` control flow in `packages/lib/sports-schedule/index.ts`, and both `ingestCorralioSchedule()` and `replaceCorralioSchedule()` in `apps/corralio/lib/schedules/ingest.ts`, to confirm the exact mechanics described in Section 0 before fixing anything.
- Confirm how `node-ical` represents (a) a structurally valid empty calendar, (b) arbitrary non-calendar text, and (c) a bare `VEVENT` with no `VCALENDAR` wrapper — the exact object shapes `parseICS()` returns for each — before implementing Section 4's structural-validity check. Do not assume; print/inspect real output for all three cases.
- Confirm how `node-ical` represents a parameterized property generally (not just for `SUMMARY`) so the unwrap helper handles the general `{params, val}` shape correctly, including a missing/non-string `val`.
- Confirm the exact platform-picker shape in `apps/corralio/lib/schedules/platforms.ts` and `ConnectScheduleForm.tsx` (`SCHEDULE_PLATFORM_KEYS`, `SchedulePlatform` type, `SCHEDULE_PLATFORM_CATALOG_VERSION`) so both new entries follow it exactly — no new fields, no type changes.
- Confirm the exact shape and call sites of `corralio_schedule_connection_events` writes (`connectionAnalytics.ts`) so the migration in Section 5 extends the right constraint and nothing else.
- Confirm the assignment flow: per CPO's read, a schedule source can be connected without ever setting `child_id`/`team_id` (assignment happens separately, after connecting, and "Not assigned" is already a valid rendered state). Confirm this directly before relying on it — if connecting actually forces an assignment step somewhere CPO didn't find, stop and report, since the whole Officials use case depends on unassigned sources being a first-class, friction-free path.

Report findings before proceeding if anything here contradicts what's described above.

---

# 3. Deliverable A — Parameterized-Property Unwrap (Bug 1)

Add a small helper in `packages/lib/sports-schedule/index.ts` with this precise contract:

- plain string input → return it unchanged;
- an object with a string `.val` → return `.val`;
- an object with a missing or non-string `.val` → return `""`;
- never stringify an arbitrary object (i.e., never let a bare `String(x)` on an object reach the caller — that's the exact mechanism of the `"[object Object]"` bug, and the fix must close it categorically, not just for the one field that happened to trigger it).

Apply it everywhere a string-typed ICS property is currently read with a bare `String(x ?? "")` — at minimum `summary`, `location`, and `description`. General fix, not Arbiter-specific.

Do not change how `uid` or `status` are read unless the audit step turns up a concrete reason to.

---

# 4. Deliverable B — Empty-Calendar Handling (Bug 2), Corrected Specification

This replaces CPO's original draft, which only fixed the parser's classification and never reconciled it with the ingestion layer's own rejection of zero-event feeds — see the Revision Note above.

**B1 — Structural validity, at the parser layer.** In `normalizeIcsSchedule()`, replace the current `sawCalendarEvent`-only check with a structural-validity flag equivalent to: **the parsed result has a `VCALENDAR` component, OR it has at least one `VEVENT` component.** This must return `errors: []` for:

- a structurally valid, empty `VCALENDAR` (zero `VEVENT`s) — today incorrectly returns `not_ics`;
- the existing, already-tested bare-`VEVENT`-with-no-wrapper case — must continue working exactly as it does today, unchanged.

It must continue to return `errors: ["not_ics"]` for genuinely non-calendar input (arbitrary text that doesn't parse into anything resembling a `VCALENDAR` or `VEVENT` — confirm the exact shape `node-ical` returns for this case per Section 2's audit step before implementing, rather than assuming it's always `{}`).

**B2 — Initial connection must succeed on a structurally valid empty calendar.** In `ingestCorralioSchedule()` only (not `replaceCorralioSchedule()` — see B3): when `normalized.errors.length === 0` and `normalized.events.length === 0`, do **not** return `userSafeError("no_events")`. Instead, proceed through the existing `createSource()` → `persistIngestion()` path exactly as a non-empty result would (persisting zero events is fine — the store already supports zero-length `events` arrays), and return a success result. The caller (the `connectSchedule` server action and `ConnectScheduleForm.tsx`) must render a distinct, honest message for this case rather than the normal "`N` events imported" success copy — suggested wording, adjust for house style: **"Schedule connected — no upcoming events were found yet."** This is not a `no_events` *failure* being relabeled; it's a genuine success state that happens to have zero events, and the source must be persisted so it continues to be refreshed by the existing cadence/manual-refresh logic (Slice 3.5.5) exactly like any other connected source — no new refresh logic is needed, only allowing the initial connection through.

**B3 — Replacement keeps the existing, stricter rule, unchanged.** `replaceCorralioSchedule()` must continue rejecting an empty feed via `no_events` exactly as it does today — do not change this function's behavior. The existing code comment there ("Intentional pilot constraint: do not replace a working connection unless the submitted feed currently proves it contains usable events") states the reasoning and remains correct: replacing a previously-working, event-bearing connection with a feed that suddenly has zero events is a different, higher-risk signal (more likely a wrong URL or a broken feed) than a first-time connection to a legitimately empty one. Preserve this asymmetry exactly.

---

# 5. Deliverable C — Narrow Migration: Extend the Platform Analytics Constraint

`corralio_schedule_connection_events_platform_check` (defined in `supabase/migrations/20260827_corralio_slice34_schedule_connection_activation.sql`) currently restricts the `platform` column to `'gamechanger', 'teamsnap', 'stack_team_app', 'other'`. Without extending it, every analytics write (`platform_selected`, `instructions_viewed`, `link_submission_failed`, `feed_validation_failed`) for the two new tiles will fail the check constraint. This fails open — it will not block a connection or surface an error to the parent — but it will silently drop all interaction measurement for both new tiles and generate avoidable error logs. That's not acceptable for a feature the founder wants real usage signal on.

Add an unapplied migration that does exactly one thing: extend `corralio_schedule_connection_events_platform_check` to also allow `'arbiterlive'` and `'arbiter_officials'`. No new columns, tables, events, or writers — this is a pure constraint-widening migration, the same minimal shape as 3.5.5's grant-only migration.

Add both verifier scripts, following the existing `scripts/analysis/corralio_slice46_catalog_verification.sql` / `corralio_slice46_behavioral_verification.sql` pattern already established in this repo:

- **Catalog verifier:** confirms the constraint's allowed-value list includes exactly the six expected platform keys (the four existing plus the two new ones) and nothing else.
- **Rollback-only behavioral verifier:** proves an analytics event can be inserted with `platform = 'arbiterlive'` and with `platform = 'arbiter_officials'`, and that both roll back cleanly with zero retained rows — same disposable-fixture discipline as every other Stage 1 migration this session.

No new analytics fields, event types, or reason values are needed — the existing `event_name`/`reason` constraints already cover everything this slice needs.

---

# 6. Deliverable D — Two New Picker Tiles

Add two new entries to `SCHEDULE_PLATFORM_KEYS` / `SCHEDULE_PLATFORMS` in `apps/corralio/lib/schedules/platforms.ts`, following the exact existing shape.

**D1 — ArbiterLive** (parent/team-following):

- `key`: `"arbiterlive"`
- `name`: `"ArbiterLive"`
- `recognition`: `"For school team schedules"` — use this neutral description rather than making an unverified market-reach claim; do not claim a school count or imply any partnership.
- `tier`: `"COMPATIBLE"` (matching existing providers; not `"VERIFIED"`, which no current provider uses).
- `instructions` (real flow, screenshot-confirmed): sign in or create a free ArbiterLive account; find the school and team and tap Follow; in the popup set Role to Parent and check "Email me the iCal link," then tap Subscribe; check email within a couple minutes and copy the link; return here and paste it below.
- `caveat`: honest note about the email step, e.g. "ArbiterLive emails your calendar link rather than showing it on screen — check your inbox a minute or two after subscribing."

**D2 — Arbiter Officials** (a parent-official's own assignments):

- `key`: `"arbiter_officials"`
- `name`: `"Arbiter (Officials)"` — use the word "Officials" explicitly rather than a paraphrase like "Officiating Assignments." ArbiterSports itself distinguishes its fan/parent-facing product (ArbiterLive) from its officials-facing assigning product by that exact word, and a parent who also officiates will be scanning for it — don't make them infer which tile is theirs from different wording than the vendor uses. Keep it visually paired with D1's `"ArbiterLive"` so the two read as a matched, deliberately distinct set, not two unrelated entries.
- `recognition`: `"For officials — syncs your own accepted game assignments"`.
- `tier`: `"COMPATIBLE"`.
- `instructions` (from Section 0's vendor documentation, not yet hands-verified — flag this in `notes.md`): sign in to ArbiterSports; click Settings, then Preferences; under Calendar Sync click "Send Email"; check email for the iCal link ArbiterSports sends; return here and paste it below.
- `caveat`: **this is the required, explicit, founder-mandated disclosure of the outstanding UAT status** — use this exact wording: *"This connects your own officiating assignments. We haven’t yet confirmed how ArbiterSports reports declined, reassigned, or canceled games in this feed. Until that’s verified, double-check any important change directly in ArbiterSports."* Do not soften this into vague language like "may take time to update" — that would understate what's actually unverified (whether it updates correctly at all, not just how fast).

Since a connected Officials source is meant to stay unassigned (it's the parent's own commitment, not a child's), confirm the connected-schedule list's "Not assigned" label still reads sensibly for this case, or make the smallest possible copy adjustment if it reads as an error state rather than an expected one — do not build new UI for this; a label tweak only if genuinely needed.

Bump `SCHEDULE_PLATFORM_CATALOG_VERSION` if that's the existing convention for a catalog change (confirm before assuming).

---

# 6a. Related Finding — Out of Scope, Worth Knowing While Implementing

A same-day, independent fix (commit `0d5c6cac`, unpushed) repaired a real production bug in a *second* schedule-connection surface: `connectTeamSchedule` (triggered from the team editor in `FamilySection.tsx`, not from `ConnectScheduleForm.tsx`/`platforms.ts`). That path lets a parent paste a calendar link directly against an existing team, and was passing both `child_id` and `team_id` into `createSource`, violating the `num_nonnulls(child_id, team_id) <= 1` constraint (Postgres `23514`) — discovered when a real household attempted to connect an ArbiterSports calendar through it in production and hit a hard failure at the `create_source` stage, before any ICS content was ever fetched or parsed. That fix is unrelated to this slice's work and does not need to be touched here.

Two things worth knowing while building this slice, not additional deliverables:

1. **`connectTeamSchedule` shares the same underlying ingestion pipeline** (`ingestCorralioSchedule` → `normalizeIcsSchedule`) as the picker flow this slice modifies — so the fixes in Sections 3 and 4 protect both connection surfaces equally, including the empty-Officials-calendar fix. Good; no extra work needed for that to be true.
2. **`connectTeamSchedule` has no `platform` concept and never touches `platforms.ts`** — it's a generic "paste a link for this team" shortcut with no guided instructions and no caveat text, and it does not write to `corralio_schedule_connection_events` with a `platform` value at all (confirm this in the audit step — if it does, Section 5's migration needs to account for it too). A parent who connects an Arbiter Officials feed through *that* surface instead of the picker will never see the D2 caveat disclosing that lifecycle behavior is unverified. This is a real gap, but closing it is a distinct, separate piece of scope — do not fold it into this slice without explicit direction. Flag it in `notes.md` as a known limitation so it isn't silently forgotten.

---

# 7. Scope Discipline

This slice MAY:

- add the generic parameterized-property unwrap helper (Section 3);
- add the structural-validity fix in `normalizeIcsSchedule()` and the corrected initial-connection-vs-replacement behavior in `ingestCorralioSchedule()`/`replaceCorralioSchedule()` (Section 4);
- add the one narrow migration extending `corralio_schedule_connection_events_platform_check`, plus its catalog and rollback-only behavioral verifiers (Section 5);
- add regression tests for all of the above;
- add the two new `SCHEDULE_PLATFORMS` entries (ArbiterLive, Arbiter Officials) with accurate instructions and the required Officials caveat;
- make the smallest necessary copy adjustment to the "Not assigned" label, and add the new "connected, no events yet" success message, if genuinely required;
- make minor, necessary type additions strictly needed for the above.

This slice MUST NOT:

- add SignUpGenius as a picker option — no feed evidence exists for it at all;
- build any Arbiter-specific ingestion path, authentication flow, or API integration — the existing generic ICS pipeline is the only ingestion mechanism, per ADR-019;
- claim or imply a partnership with ArbiterSports/Arbiter, in code comments, UI copy, `recognition`, or `caveat` text;
- claim or imply, anywhere, that Arbiter Officials' decline/reassignment/cancellation behavior has been verified — it hasn't, and the caveat in D2 exists specifically to say so;
- change `weekendPlan.ts` conflict-detection logic or the household/event schema — both are already confirmed sufficient as-is;
- add any new analytics event types, reason values, columns, or tables beyond the single constraint widening in Section 5;
- change the freshness/refresh cadence, manual-refresh behavior, or any other Slice 3.5.5 territory;
- touch `ConnectScheduleForm.tsx`'s structure/behavior beyond what rendering two more tiles, and the new zero-events success message, already requires — if larger changes turn out to be needed there, stop and report why before proceeding.

---

# 8. Privacy / Security

Unchanged boundaries from prior slices, with one wording correction from CPO's original draft: "never expose the raw ICS/calendar URL client-side" was imprecise — the parent necessarily types it into a client-rendered form to submit it. The actual rule:

- After submission, never return, render, or expose the persisted calendar URL back to the browser — transmit it only to the existing server action, store it through the established private boundary, and never log it.
- Never expose provider fetch/parse errors verbatim to the parent.
- No new logging of schedule URLs.
- Both fixtures used in tests are either public school athletics data or a fully generic empty-calendar shape — no household, family, or individual-child/official identity attached. Do not add any further identifying detail beyond what's in Section 9.

---

# 9. Tests

Add/update deterministic tests for:

- the parameterized-`SUMMARY` fixture (real ArbiterLive excerpt below), asserting correct title extraction — not `"[object Object]"`;
- a synthetic parameterized-`LOCATION` fixture, proving the unwrap fix is generic, not summary-only;
- the parameterized-property helper's exact fallback contract from Section 3 (plain string passthrough; object with string `.val` → `.val`; object with missing/non-string `.val` → `""`; never a stringified object). Keep the helper internal if possible: prove the contract through focused normalizer fixtures, or place it in a deliberately internal module if direct unit access is materially cleaner. Do not expand the package's public API solely for this test;
- three explicit structural-validity cases per Section 4/B1: (a) a structurally valid, empty `VCALENDAR` (real Arbiter Officials shape below) → `errors: []`; (b) malformed/arbitrary non-calendar text → `errors: ["not_ics"]`, unchanged from today; (c) the existing bare-`VEVENT`-with-no-wrapper case → unchanged from today (do not regress this);
- at the `ingest.ts` layer: `ingestCorralioSchedule()` on the empty-but-valid fixture succeeds and creates a source, while `replaceCorralioSchedule()` on the same fixture still returns `no_events` and does not replace the existing source (proving B3's asymmetry holds);
- at the Server Action/UI boundary: `connectSchedule()` returns the exact success copy **"Schedule connected — no upcoming events were found yet."** for an imported count of zero, and `ConnectScheduleForm.tsx` renders that successful state without entering error recovery;
- no regression to existing plain-string-property fixtures already in the suite;
- both new `platforms.ts` entries appearing correctly via `parseSchedulePlatform`/`getSchedulePlatform`, and rendering via `ConnectScheduleForm.tsx`'s existing test coverage if any exists — note rather than invent new UI test infrastructure if none does;
- the Section 5 migration: both the catalog verifier and the rollback-only behavioral verifier, run for real once the migration is applied (Stage 2, not this prompt's deliverable, but write the scripts now);
- unassigned-event participation in conflict detection — this does **not** require a live database fixture: either (a) a controlled query-adapter test proving an active, unassigned source's event is retained by the relevant fetch/query layer, or (b) an existing-boundary source-shape test plus a deterministic `buildWeekendPlan()`/`deriveConflictPairs()` unit test using in-memory fixtures. Either is acceptable; do not require a live database fixture for this slice.

**Fixture — real ArbiterLive excerpt (parameterized `SUMMARY`):**

```
BEGIN:VCALENDAR
PRODID:-//ArbiterSports Calendar//EN
VERSION:2.0
X-WR-CALNAME: ArbiterSports
BEGIN:VEVENT
SUMMARY;LANGUAGE=en-us:Jamboree Volleyball - HS @ Joel E. Ferris High School
CLASS:PUBLIC
DTSTAMP:20260828T153001Z
DTSTART:20260903T230000Z
DTEND:20260904T030000Z
UID:G-100027364
LOCATION: 3020 E. 37th Ave., Spokane Washington  99223
DESCRIPTION:Sport: Volleyball - HS\nLevel: Jamboree\nTeam: Mt. Spokane High School\nSite: Ferris High School\nSubsite: Gym\n
END:VEVENT
END:VCALENDAR
```

**Fixture — real Arbiter Officials empty-calendar shape (structurally valid, zero events):**

```
BEGIN:VCALENDAR
PRODID:-//ArbiterSports Calendar//EN
VERSION:2.0
X-WR-CALNAME: ArbiterSports
END:VCALENDAR
```

---

# 10. Verification

Before declaring completion, run:

- focused affected tests;
- complete Corralio test suite;
- TypeScript;
- zero-warning lint;
- `git diff --check`;
- all four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`).

The Section 5 migration is real and required — this is unlike CPO's original draft, which incorrectly claimed no schema change was needed. It stays unapplied for this prompt's scope (Stage 1) — do not apply it, do not run the verifiers against a live database. Write and locally sanity-check the verifier SQL, but actual execution against the database is Stage 2, gated on a human applying the migration.

---

# 11. Notes, Commit, and Deploy Sequencing

Update `apps/corralio/notes.md` with: the audit findings from Section 2, the final shape of Sections 3/4's fixes, the exact migration added in Section 5, both new `platforms.ts` entries' final copy (including the exact Officials caveat text used), tests/builds result, and Stage 1 verdict.

**Include a clearly labeled section — "Outstanding UAT — Arbiter Officials Lifecycle Semantics" — that states plainly:** decline/reassignment/cancellation behavior for Arbiter Officials feeds is unverified; the Officials sample feed available during this slice had zero games and could not exercise this; this must be tested against a populated feed via bounded live UAT before it can be called verified; until then, the in-product caveat (Section 6, D2) is the operative disclosure. This is a tracked follow-up, not a resolved item.

Commit locally with a focused commit message (or a small number of commits if Sections 3/4/5/6 warrant separating them).

**Do not push. Do not deploy. Do not apply the migration.** Founder has not yet given a push/deploy instruction for this slice — hold locally, same discipline as every other Stage 1 slice this session, pending explicit sign-off and a human-applied migration.

---

# 12. Completion Standard

Three questions this slice has to answer:

> **ArbiterLive:** If a parent connects a real ArbiterLive team calendar, does every event display with its real title, and do the picker's instructions accurately describe the real steps required — including the email round-trip ArbiterLive itself requires?

> **Arbiter Officials, empty case:** If a parent-official connects their real, currently-empty Officials calendar, does the connection actually succeed and persist — not just display a friendlier error — with an honest "no games yet" state, while a *replacement* of a previously-working connection with an empty feed still correctly gets rejected?

> **Arbiter Officials, disclosure:** Does the product openly disclose, rather than silently assume, that decline/reassignment/cancellation behavior is not yet verified — both in the picker's caveat copy and in `notes.md`'s Outstanding UAT section?

A slice that fixes the parser's classification but not the ingestion-layer rejection leaves the Officials audience still unable to connect at all — the exact failure this founder decision was meant to solve. A slice that adds the platform keys without the migration will silently lose analytics for both new tiles. A slice that adds the Officials tile without the caveat violates the founder's explicit instruction. All of Sections 3, 4, 5, and 6 are load-bearing.

---

# 13. Final Verdict

Return exactly one:

`SLICE 3.7 READY FOR DATABASE VERIFICATION`
`SLICE 3.7 BLOCKED BY AUDIT FINDING`
`SLICE 3.7 NOT READY`

(`SLICE 3.7 COMPLETE LOCALLY` does not apply to this prompt — a real migration is required and must go through Stage 2 database verification before this slice can be called complete.)

Report: audit findings from Section 2, the final shape of every fix in Sections 3–6, the exact migration and both verifier scripts, both new `platforms.ts` entries' final text (including the exact Officials caveat), tests/builds result, local commit hash(es), the Outstanding UAT note as filed in `notes.md`, and explicit confirmation that nothing was pushed, deployed, or applied to the database.
