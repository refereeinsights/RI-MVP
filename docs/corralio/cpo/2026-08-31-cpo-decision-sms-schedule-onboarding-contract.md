# Corralio CPO Decision — SMS Schedule Onboarding Contract

**Product-contract and roadmap-reconciliation decision. Not authorization to build.** Phone-first authentication and SMS-first activation are treated as settled founder decisions throughout — not reopened here. Nothing in this document authorizes code, schema, or ADR changes; Section 11 lists what should change *if* this contract is accepted.

Verified against the live repository rather than assumed — every claim below that could be checked, was. Where evidence doesn't exist yet, this document says so explicitly rather than filling the gap with a plausible-sounding assumption.

## 0. What Changed From Assuming to Knowing

Before the state machine, three findings from this review materially change how "easy" parts of the founder's desired flow actually are. None of these block the contract — they change what belongs in which phase (Section 10) and what this document can honestly promise (Section 8).

- **Platform cannot be auto-detected from the URL today.** `apps/corralio/lib/schedules/platforms.ts` is a picker catalog with parent-facing instructions per platform — it is consumed only by `ConnectScheduleForm.tsx` and `FamilySection.tsx` as UI copy. There is no `detectPlatform`/`inferPlatform` function anywhere in the ingestion pipeline (`ingest.ts`, `refresh.ts`, `packages/lib/sports-schedule/*`). Today, a parent picks their platform from a list on the web form; nothing inspects the URL to guess it. The founder's flow's step "Detects platform" is new capability, not a port of something that exists (Section 10).
- **No calendar-level metadata is extracted from a feed today.** `normalizeIcsSchedule()` (`packages/lib/sports-schedule/index.ts:316`) reads only per-event `SUMMARY` (as event title) and `LOCATION`. It does not read `X-WR-CALNAME` or any other calendar-level property — the standard ICS field most platforms populate with something like "Spokane Select - Baseball" and the single richest signal a team/sport inference step would want. "Infer team/sport from feed where evidence is sufficiently reliable" (the founder's principle 4) has no extraction code to build on; it starts from per-event title text only, which is a weaker and less reliable signal than calendar-name would be.
- **The existing web flow already connects unassigned-first, then assigns.** `connectSchedule()` (`apps/corralio/app/actions.ts:287`) takes only `sourceUrl`, `displayName`, and an optional `sport` — no `childId`/`teamId` at all. Every schedule connected via the web form today lands as an unassigned/household-level source. A separate action, `updateScheduleAssignment()` (`actions.ts:360`), calling RPC `corralio_update_schedule_source_assignment_v1`, is what later attaches a source to a specific child/team. **This is good news, not a gap**: the founder's principle 3 ("import first, enrich progressively") is not a new pattern to invent for SMS — it is exactly how the existing web product already behaves. The SMS state machine below is designed to call the same two-step primitive (connect, then assign), not a new one.
- **`corralio_teams.child_id` is `not null`.** A team cannot exist independent of a child in the schema today (`supabase/migrations/20260818_corralio_household_rls_foundation.sql:66-70`). This means the founder's disambiguation example (Jake→Spokane Select→Baseball vs. Jake→Mead Panthers→Baseball) is already structurally guaranteed by the schema once a schedule is assigned to a specific team — the risk is entirely in the *resolution* step (matching an inbound message to the right existing team), not in the data model.
- **Most per-platform capability evidence is honestly "untested."** The filed-but-not-run `corralio-schedule-source-compatibility-evidence-matrix-prompt.md` documents that, beyond LeagueApps' known reschedule-duplication caveat and Arbiter Officials' known reassignment/cancellation gaps, Corralio has not verified how reschedules, cancellations, or duplicate handling behave on most of these feeds. Section 7 below reflects that honestly rather than promising reliability the product hasn't earned.

## 1. Final SMS Onboarding State Machine

```
[S0] IDLE
  parent texts intent ("connect my son's calendar" / any recognizable variant)
  → [S1]

[S1] PLATFORM RESOLUTION
  if inbound message already contains a recognizable calendar/subscription URL:
      → skip directly to [S3] (do not ask platform — Section 2, principle 1)
  else:
      Corralio asks which platform (GameChanger / TeamSnap / LeagueApps /
      Stack Team App / ArbiterLive / Arbiter Officials / Other)
      parent replies with a platform name or number
      → [S2]
  failure: unrecognized reply after 1 retry → hand off to "type or paste your
  calendar link" fallback, still counted as [S2] exit

[S2] PLATFORM GUIDANCE
  Corralio sends the shortest truthful instructions for that platform
  (reused verbatim from the existing `platforms.ts` catalog entry) plus a
  link to the fuller mobile instruction page for that platform
  → parent goes and gets their link (unbounded real-world wait — a
  pending-intake record, not a live SMS session, per the Phase A+B design)
  → [S3]

[S3] URL RECEIPT
  parent sends the calendar/subscription URL (Task 2/3 of Phase A+B:
  requires an already-resolved, authorized channel identity — Section 4.1
  of that prompt — before anything past this point touches data)
  validate: is this a plausible calendar/subscription URL (scheme, host
  shape, not a bare word)?
      no → [F1] Invalid URL
      yes → [S4]

[S4] FEED RETRIEVAL & PARSING
  fetch and parse via the existing pipeline (`ingest.ts`), authorization
  resolved before fetch (Phase A+B Section 8: authorization before URL
  retrieval)
      fetch/parse fails (unreachable, malformed, unsupported feed type)
          → [F2] Feed Inaccessible / Unsupported Platform
      fetch succeeds, zero events
          → [F3] No Events
      fetch succeeds, events present
          → [S5]

[S5] CONTEXT RESOLUTION (person / team / sport)
  evaluate confidence using only the event-title text available today
  (Section 0 — no calendar-name signal exists yet):
    high confidence (an existing child+team combination is clearly and
      uniquely implied) → auto-associate, [S6], mention it plainly in the
      confirmation copy so the parent can correct a wrong guess (Section 2,
      principle 2 — confirm at medium confidence, not silently at any
      confidence)
    medium confidence (a likely child or team, but not certain — e.g. one
      existing child, sport inferable, team name not matched to an
      existing team) → state the guess, ask for one-word confirm/correct
      → [S6]
    low confidence / no existing entities match / ambiguous (Section 4:
      same child, same sport, two teams) → ask the one deterministic
      question offering only the household's existing entities (or "new
      child") as reply options → [S6]
  every branch persists a bounded pending-intake record (Phase A+B Section
  6.3: opaque ID, expiry, replay protection, idempotency) — this state
  machine does not introduce a second correlation mechanism
  failure: no reply within the pending-intake expiry window → [F7]

[S6] SCHEDULE CONNECTION
  connect now, at whatever resolution [S5] reached — including "unassigned/
  household" if the parent explicitly chose that, or if S5's ambiguity
  couldn't be resolved and the parent was offered "connect without
  assigning yet, fix it later" as an explicit option (Section 2, principle
  3: a valid schedule does not fail onboarding over unresolved context)
  connect = call the same `ingest.ts`/`createSource` path the web form
  uses today, then, if [S5] resolved a child/team, call
  `corralio_update_schedule_source_assignment_v1` (the same RPC
  `updateScheduleAssignment()` already calls) — not a new assignment path
  → [S7]

[S7] ARRIVAL PREFERENCE
  resolve via the precedence chain (Section 5): trustworthy explicit
  schedule value → saved team/source preference → ask → 30-min fallback
  if a live schedule value or saved preference already answers it: skip
  straight to [S8], mention the value used, don't ask
  otherwise ask the one bounded question ("How early should Jake arrive
  for Spokane Select? Reply minutes, or SKIP for 30.")
  parent replies a number, "SKIP", or something unparseable
      unparseable after 1 retry → default to 30, note it plainly, → [S8]
      (arrival never blocks connection — [S6] already happened)
  → [S8]

[S8] SECURE ORIGIN OFFER (web handoff, not SMS — Section 6)
  Corralio sends one SMS containing a plain navigational link (no
  sensitive data in the URL) to a minimal, purpose-specific web page
  if the browser has a valid session: origin form directly
  if not authenticated: phone-OTP auth (Phase A+B Section 5, manual OTP)
  required before the form is reachable
  parent may skip this step entirely and nothing above is blocked by that
  → [S9] once origin is saved (may happen minutes, hours, or days later,
  or never — this is not a synchronous SMS-session step)

[S9] FIRST LEAVE-BY
  shown immediately on the same secure web page once origin saves (This
  is a web-page render, using the existing on-demand Geocodio +
  OpenRouteService leave-by calculation already in `leaveBy.ts` — no new
  compute path)
  → [S10]

[S10] SECOND SCHEDULE PROMPT
  sent once, not repeated on a timer in this phase: "Got another kid or
  team? Reply YES to connect another schedule."
  YES → back to [S1] for a second source, same household/channel identity
  no reply / anything else → end state, household is left in a genuinely
  useful state regardless (an activation objective, not a requirement —
  Section 2, principle 7)
```

**Failure/ambiguity paths** ([F1]–[F9]) are specified in full in Section 8, not duplicated here — the state machine above references them by label so the two sections stay one source of truth, not two that can drift.

## 2. Minimum Data Contract

| Field | Classification | Basis |
|---|---|---|
| Phone identity (verified channel) | **Required, established before S1** | Phase A+B Section 4.1/4.2 — nothing in this flow proceeds without an already-resolved, authorized channel identity; this document does not re-specify that mechanism |
| Platform | **Inferred if URL received first; asked otherwise; never confirmed as a separate step** | No auto-detection from URL exists (Section 0) — "inferred" here means "the parent told us via the picker reply," not code-level detection, until/unless URL-pattern detection is separately built (Section 10) |
| Calendar/subscription URL | **Required** | No connection is possible without it; V1 is URL-only, no attachments (Phase A+B Section 2) |
| Person/child | **Confirmed-if-uncertain; inferred only at genuinely high confidence** | Section 0's evidence gap (no calendar-name extraction) means "high confidence" will be rarer in practice than the founder's example copy implies until title-text inference is built and evaluated per platform |
| Team/schedule identity | **Confirmed-if-uncertain; inferred only at genuinely high confidence** | Same basis as person/child; existing schema (`corralio_teams.child_id not null`) already guarantees stable identity once resolved (Section 0) |
| Sport | **Inferred where feed evidence supports it; optional otherwise** | `sport.ts` is a closed 17-value enum with no fuzzy-matching logic today — inference must map free event-title text to one of those values or leave it null; leaving it null is safe (sport is nullable on `corralio_teams` and unused by ingestion) |
| Arrival preference | **Confirmed-if-uncertain; defaulted otherwise (30 min)** | Precedence chain, Section 5 |
| Home/default origin | **Optional; securely collected outside SMS entirely** | Never requested in the SMS stream (Section 6); connection value does not depend on it |
| Timezone | **Never requested from the parent** | Comes from the feed/event data via existing enrichment, unchanged by this work |
| Event locations | **Never requested from the parent** | Comes from the feed (`LOCATION` property, already parsed) and existing venue-matching, unchanged |

## 3. Message Budget

Estimates below are grounded in drafted, character-counted candidate copy (not aspirational placeholders) — every Corralio-authored message listed fits one GSM-7 segment (≤160 characters) as drafted. This validates the founder's working estimate; it does not independently re-derive it from nothing.

| Scenario | Parent messages | Corralio messages | Billed segments (parent + Corralio) | Notes |
|---|---|---|---|---|
| **Best case** (URL sent first, high-confidence single existing child/team, arrival answered) | 3 (URL, name-confirm reply, arrival minutes) | 3 (found-events+confirm, arrival ask, connected+origin-link) | ~6–7 | Skips [S1]/[S2] entirely per principle 1; URL segment count is the open variable (below) |
| **Typical** (platform asked, URL sent, one clarifying question, arrival answered) | 5 (platform name, URL, child name, team disambiguation or confirm, arrival minutes) | 5 (platform ask, guidance+link, found-events+question, arrival ask, connected+origin-link) | ~10–11 | Matches the founder's working estimate (5–6 parent / 5 Corralio / 10–11 total) |
| **Worst-reasonable** (platform asked, long/multi-segment URL, ambiguous team requiring a retry, arrival unparseable requiring a retry) | 6–7 | 6–7 | ~14–16 | Every retry costs one segment each direction; this is why S5/S7 cap at one retry before defaulting, not an open-ended back-and-forth |

**At the founder's $0.0082/segment planning rate** (verified in the prior monetization review as "base + typical carrier fee," not raw Telnyx list price): typical case ≈ **$0.082–$0.090**, worst-reasonable ≈ **$0.11–$0.13**. This is consistent with, not a correction to, the founder's own $0.08–$0.09 estimate for the typical case.

**Open item, as explicitly requested: the calendar-URL segment risk is real and not yet resolved by evidence.** No real captured URLs from any of these platforms exist in the repository today — this document's illustrative URL-length reasoning (constructed examples in the 75–120 character range for GameChanger/TeamSnap/LeagueApps, and up to ~115 characters for a token-bearing ArbiterLive iCal link) is *reasoning*, not observation, and should not be treated as verified. **Recommend the vendor/evidence spike (already planned for the Schedule-Source Compatibility & Evidence Matrix and the Phase A+B Task 0 vendor spike) capture real, representative calendar-URL lengths per platform** before this budget is treated as load-bearing for a cost model. If a real URL turns out to run long (a plausible risk for ArbiterLive's token-bearing links specifically, per its existing "emails your calendar link" caveat suggesting a non-trivial token), the parent's single URL-submission message could cost 2–3 segments on its own — worth knowing before, not after, volume exists.

## 4. Team/Source Identity Rules

- **One child on multiple teams in the same sport** (the founder's Jake/Spokane Select/Mead Panthers example): resolved by requiring child *and* team match, never child+sport alone, at [S5]. The schema already prevents ambiguity once resolved (`corralio_teams.child_id not null`, Section 0) — the only real risk is in *resolution*, i.e., correctly matching an inbound feed/message to the right existing team, not in storage. If the household has two same-sport teams for one child and evidence doesn't clearly indicate which, this is a **low-confidence** case per Section 1 — ask, using the existing team names as reply options, never guess.
- **Two children on similarly named teams** (e.g., two kids each on a team called "Select" in different sports or leagues): same resolution logic — team name alone is not the disambiguator, child+team pair is. If the household has multiple children, [S5] must establish the child first (or use both signals together) before assuming a team match, not resolve team first and assume the obvious child.
- **Household/adult schedules**: fully supported by the existing schema without inventing anything — `corralio_schedule_sources` already allows both `child_id` and `team_id` null (Section 0's prior finding, reconfirmed), and `corralio_teams.child_id not null` means an adult/referee schedule structurally *cannot* be forced into the team model even if someone tried — it must be unassigned. [S5]/[S6] should offer "not tied to a specific child" as an explicit, first-class reply option at the same weight as naming a child, not a fallback only reached after every child-matching attempt fails.
- **Feeds with weak/no team metadata** (Section 0: this is the *default* case today, not an edge case, since no calendar-name extraction exists): [S5] degrades to asking, using only event-title text as a weak hint if any. Do not present a low-confidence guess as though it were a finding — "Found 24 events. Who's this for?" (no team/sport claim) is more honest than fabricating "Found Jake's Spokane Select baseball schedule" when the underlying signal doesn't support that specificity yet.

## 5. Arrival Rules

Reconciles the 30-minute fallback with progressive collection, per the founder's explicit instruction, against the **actual current status** of 3.6B Phase 1: **not yet shipped**. `CORRALIO_CPO_EXECUTION_STATE.md` lists it as the first item in the critical path, with the founder's own most recent instruction being "send Stage 1 first" — it is a filed prompt, not verified-complete work, as of this writing.

Precedence chain (identical to Phase A+B Section 6.5 — restated here for this document's own completeness, not a second independent design):

1. A trustworthy explicit schedule value, from the 3.6B Phase 1 required-arrival model, if the feed itself carries one.
2. A saved team/source arrival-buffer preference (`corralio_teams.arrival_buffer_minutes`), if this source is already team-attached and a value exists.
3. A parent-provided value, collected via the one bounded [S7] question.
4. The 30-minute fallback constant (`LEAVE_BY_ARRIVAL_BUFFER_MINUTES`, `leaveBy.ts`).

**Binding rule, restated because it's easy to violate under implementation pressure: arrival resolution must never block [S6] (schedule connection).** The 30-minute default exists so a parent's progress is never lost waiting on a value Corralio doesn't have yet — not as a reason to stop asking. Once 3.6B Phase 1 ships and step 1 becomes real, [S7] should re-evaluate silently (no new SMS) whenever a schedule already has a step-1-quality value, and only fall to steps 2–4 when it doesn't. **Until 3.6B Phase 1 ships, step 1 of this chain does not exist — this state machine must not simulate it or build a provisional version; it starts at step 2 for any already-team-attached source and step 3/4 otherwise, exactly as Phase A+B's Section 6.5 already specifies ("stop and flag" if the foundation is absent).**

## 6. Secure-Origin Flow

Specifies the same interaction already designed in Phase A+B Section 6.6 — restated here in this document's own terms per the required output, not re-litigated:

- The SMS message ([S8]) contains only a plain navigational link — no home address, phone number, OTP, auth token, household identifier, or other sensitive state in the URL itself.
- If the browser already holds a valid Corralio session (same device, already authenticated this session), the origin form shows directly.
- If not authenticated, the normal phone-OTP flow (manual entry, per Phase A+B Section 5.3's correction — no tap-to-verify link) gates access to the form. This is a deliberate friction point, not an oversight: home/default origin is exactly the kind of highly sensitive data the founder named as the one thing that must never ride the SMS channel itself, and the correct trade is "gate it behind real auth," not "make it convenient at the cost of the SMS never-place-sensitive-data-in-a-link rule."
- The page itself is minimal and single-purpose — one field, nothing that resembles a general onboarding form (explicitly not a place to add scope later without separate review).
- After saving, the resulting drive duration and leave-by ([S9]) render immediately on that same page, using the existing on-demand Geocodio geocode + OpenRouteService route calculation (`leaveBy.ts`) — no new compute path, no new provider.

**This document adds no new requirement beyond what Phase A+B already specified for this step.** Restating it here exists only to satisfy this document's own required-output list and confirm the two documents agree — a genuine second design here would be exactly the kind of duplication Section 10 warns against.

## 7. Platform Instruction Matrix

| Platform | Can identify platform from URL today? | Verified connection instructions exist? | Known limitations | What parent sends back |
|---|---|---|---|---|
| GameChanger | **No** — no URL-pattern detection exists (Section 0); would need new, separately-verified regex/host matching against real GameChanger calendar URLs | Yes — existing `platforms.ts` catalog entry, tier `COMPATIBLE` | Capability-matrix evidence largely `untested` (reschedules, cancellations, duplicate handling not yet verified against a live feed, per the filed evidence-matrix prompt) | The calendar/subscribe link, copied from GameChanger's own subscribe/export option |
| TeamSnap | **No**, same basis | Yes — `platforms.ts`, tier `COMPATIBLE` | Existing caveat already documented: an imported event appearing at midnight should be double-checked in TeamSnap directly; broader capability evidence otherwise `untested` | The web calendar link from TeamSnap's subscribe/export option |
| Stack Team App (Sports Connect) | **No**, same basis | Yes — `platforms.ts`, tier `COMPATIBLE` | Capability evidence `untested` | The calendar subscription link from Events/Schedule |
| ArbiterLive | **No**, same basis | Yes — `platforms.ts`, tier `COMPATIBLE`, with a real, non-trivial instruction sequence (subscribe, set role to Parent, request iCal by email, then retrieve it from email) | The link isn't shown on-screen — it's emailed, meaning the parent's fastest path to Corralio may actually be *forwarding that email* rather than copy-pasting into SMS; this is worth designing for explicitly (Section 10) rather than assuming SMS is always the fastest path in for every platform | The iCal link retrieved from ArbiterLive's own confirmation email |
| Arbiter (Officials) | **No**, same basis | Yes — `platforms.ts`, tier `COMPATIBLE`, household-context only (correctly excluded from "team" context — this is an individual's own assignment feed, not a team roster) | Explicitly documented, existing caveat: reschedule/reassignment/cancellation reporting in this feed is unverified — the catalog's own caveat text already tells the parent to double-check important changes directly | The iCal link ArbiterSports emails after enabling Calendar Sync |
| LeagueApps | **No**, same basis | Yes — `platforms.ts`, tier `COMPATIBLE`, with a live official support URL | Existing, specific documented gap: a rescheduled game may appear as both an old (marked RESCHEDULED) and new event in the feed, with Corralio's handling of that not yet verified | The calendar link from Subscribe to Calendar → Copy Link |
| Other / generic ICS | N/A — this tier exists precisely because platform can't always be named | Yes — generic instructions (look for Subscribe/Export/iCal/ICS/webcal) | Broadest tier, `MANUAL` — no platform-specific caveats can apply because there's no platform-specific knowledge to apply | Any public iCal/ICS/webcal subscription link |

**Do not promise verified reliability this catalog doesn't have.** Every platform above is `COMPATIBLE`, not `VERIFIED`, in the existing tier system, and the filed evidence-matrix work (not yet run) exists specifically to make the honest distinction between "we can connect to this" and "we've verified schedule changes come through correctly" visible and structured instead of buried in prose. The SMS onboarding copy in Section 1/8 should reflect `COMPATIBLE`-tier honesty (a plain "connected — we found N events," never an implied "and every future change will be reported correctly") until that matrix says otherwise per platform.

## 8. Failure Behavior

Referenced by label from Section 1's state machine:

| Label | Trigger | Behavior |
|---|---|---|
| **F1** Invalid URL | Submitted text doesn't parse as a plausible calendar/subscription URL | One plain reply asking the parent to check the link and resend, or reply for platform instructions again — never a raw error message or stack-trace-adjacent text |
| **F2** Unsupported platform / feed inaccessible | Fetch/parse fails against a URL that did parse as a URL | Distinguish, if the failure signal allows it: "we can't reach that link right now" (transient) vs. "we don't support that yet" (structural) — do not present a transient failure as permanent, since that would push a recoverable case toward abandoned onboarding |
| **F3** No events | Feed fetches and parses, zero events returned | **Connect anyway** — "no events found yet" is a legitimate outcome for an off-season or newly-created team schedule, consistent with the existing web flow's own `imported === 0` success-with-zero-events case (`actions.ts:316-321`) — do not treat this as a failure requiring parent action |
| **F4** Unknown child/person | [S5] can't match any existing child at any confidence, and the parent's reply to the clarification doesn't resolve it either | Offer "new child" as an explicit reply option, or "not tied to a specific child" — never silently guess an existing child, and never dead-end with no path forward |
| **F5** Ambiguous team | [S5] finds more than one plausible existing team | Present the specific candidates by name (never generic "which team?") and require a specific reply; degrade to "connect unassigned for now, sort it out later" if the parent doesn't resolve it after one retry — per principle 3, a valid schedule should not fail to connect over this |
| **F6** Unknown sport | Feed evidence doesn't support any of the 17 closed sport values | Connect with `sport: null` — sport is nullable and unused by ingestion itself; never block on it, never ask about it via SMS (not on the founder's required-fields list, Section 2) |
| **F7** Missing locations | Feed lacks `LOCATION` on some/all events | No parent-facing behavior change needed — this already degrades gracefully in the existing pipeline (locations are used for routing where present, simply absent otherwise) |
| **F8** Arrival unanswered | No reply to [S7]'s question within the pending-intake expiry | Default to 30 minutes, note the default plainly in the next message rather than silently, and connection already happened at [S6] regardless |
| **F9** Secure-origin step skipped | Parent never opens the [S8] link | No further SMS follow-up in this phase (a reminder/nudge cadence is notification-delivery scope, out of bounds here per Phase A+B's non-goals) — the household is left in a fully functional, if less complete, state: schedule connected, arrival known, no drive-time/leave-by yet |

**Governing principle across every row: degraded usefulness over failed activation**, per the founder's explicit instruction — a schedule that connects with some fields unresolved is always preferred over a flow that dead-ends waiting for information Corralio doesn't strictly need to be useful.

## 9. Measurement

Minimum funnel, matching the founder's required list exactly, plus the two duration/effort metrics requested:

```
connect intent
  → platform selected/inferred
  → instructions opened
  → URL received
  → feed parsed
  → schedule connected
  → questions required (count, and which: person / team / arrival)
  → arrival preference captured / defaulted
  → origin captured
  → first leave-by produced
  → second schedule connected
  → This Weekend viewed
```

Additional:

- **Time to first connected schedule** — clock start at [S0] intent, stop at [S6].
- **SMS segments to first connected schedule** — sum of billed segments through [S6], distinct from segments to first leave-by (which includes the web-side origin step and isn't itself an SMS-segment cost, but is worth tracking as a separate "time to first leave-by" duration metric alongside it).
- **SMS segments to first leave-by** — through [S9], as requested.
- **Percentage requiring manual/support intervention** — needs an explicit operational definition before it can be instrumented (e.g., a support ticket referencing a phone number with an open pending-intake record past its expiry); flagging this as needing a definition, not proposing one unilaterally, since "support intervention" isn't yet a defined event anywhere in the product.

**Every event name and property must exclude URLs, phone numbers, message bodies, and child/team names** — sanitized IDs only, consistent with `CORRALIO_SECURITY_PRIVACY.md` and every prior document this session that touches analytics. No exception for this funnel.

## 10. Roadmap / Build Recommendation

Mapped against the workstreams already in flight, explicitly to avoid duplicating capability across them:

| Piece | Belongs in | Why |
|---|---|---|
| Phone-capable channel identity, manual-OTP auth, pending-intake state machine, shared ingestion core, webhook security | **Phase A+B, as already scoped** (v2, corrected) | Already fully specified there; this document changes nothing about that scope |
| URL receipt → feed parse → connect-unassigned-or-resolved ([S3]–[S6]) | **Phase A+B, Task 2/3** | This is the "deterministic schedule intake" the prompt already covers — [S5]'s resolution logic is the concrete content of Phase A+B Section 6.4, not new scope beyond it |
| Platform-name question + reused instruction copy ([S1]–[S2]) | **Phase A+B, small addition to Task 2/3**, using the existing `platforms.ts` catalog verbatim | No new content to write — the instructions already exist; this is wiring, not authorship |
| **Platform detection from URL (auto-skip [S1]/[S2] when the parent leads with a link)** | **New, small, separately-scoped slice — not yet in any filed prompt** | Section 0's finding: this capability doesn't exist. It's plausibly cheap (host/path pattern matching against a handful of known platforms) but needs its own verification against real captured URLs per platform before being trusted, and should not be assumed "basically done" because the picker catalog already lists the platforms |
| **Calendar-name (`X-WR-CALNAME`) extraction** | **New, small, separately-scoped slice — not yet in any filed prompt** | Section 0's finding: no calendar-level metadata is read today. This is the single highest-leverage piece of new work for making [S5]'s "high confidence" branch actually reachable at meaningful frequency, rather than mostly falling to "ask" |
| Arrival precedence chain (Section 5, steps 1–2) | **Depends on 3.6B Phase 1 for step 1; step 2 already exists** | Do not build a provisional step-1 substitute — stop and flag per Phase A+B Section 6.5, unchanged recommendation |
| The one bounded [S7] arrival question | **Phase A+B, Task 2/3** | Already specified there verbatim |
| Secure-origin web page, phone-OTP gate, immediate leave-by render | **Phase 3A (temporary routing origin) + Phase A+B's link-out to it** | Phase 3A owns the "collect a routing origin securely" capability generally (home / current-location / choose-another); this SMS flow's [S8]/[S9] is a consumer of that capability, not a reason to build a second, SMS-specific version of it |
| Second-schedule prompt ([S10]) | **Phase A+B, trivial addition** | One more state-machine step reusing [S1] — no new capability |
| Full conversational/inferred-copy layer, general assistant, message-based management commands | **Explicitly not this contract, not Phase A+B** | Unchanged from every prior document this session — this contract formalizes the deterministic version, not the richer conversation those documents already deferred |

**Nothing above authorizes engineering work.** This table exists so that when Phase A+B (or a follow-on prompt implementing [S1]/[S2]/[S5]'s specific copy) is eventually authorized, it's clear which pieces are "already scoped, just wire it" versus "genuinely new, needs its own verification pass" — conflating the two would understate the real cost of platform-detection and calendar-name-extraction specifically.

## 11. Canonical-Document Reconciliation

No code or canonical document was modified in producing this review. If this onboarding contract is accepted, the following should be updated:

- **`CORRALIO_CPO_EXECUTION_STATE.md`** — the "CRITICAL PATH — CONFIRMED FORK AFTER PHASE 1" section's Phase A+B reference should gain a pointer to this contract document as the source for [S1]/[S2]/[S5]/[S7]'s specific copy and resolution logic, and OPEN items should gain two new entries: (a) platform-detection-from-URL as unbuilt, separately-verifiable capability (Section 0/10 of this document), and (b) calendar-name extraction as the same.
- **`CORRALIO_FOUNDER_MENTOR_HANDOFF.md`** — Section II's running decision log should gain an entry recording this contract's acceptance (or requested revisions), consistent with how every other founder decision this session was recorded, so the "why does [S1]/[S5] work this way" trail survives independent of this document surviving in the founder's own memory.
- **`docs/prompts/corralio-phase-a-b-phone-auth-schedule-intake-prompt.md`** (v2) — Section 6.4 currently describes association resolution in general terms; if this contract is accepted, that section should be tightened to cite the specific existing primitive (`corralio_update_schedule_source_assignment_v1` via the same pattern `updateScheduleAssignment()` already uses) rather than describing "use existing primitives" abstractly. This is a precision improvement to an already-accepted document, not a scope change.
- **`docs/prompts/corralio-schedule-source-compatibility-evidence-matrix-prompt.md`** — unaffected in scope, but its eventual results (once run) should feed back into this contract's Section 7/8 — specifically, any platform that surfaces a new known-caveat should get that caveat reflected in this document's failure-behavior table, not left only in the evidence matrix's internal representation.
- **No stale statement was found in `CORRALIO_ARCHITECTURE_DECISIONS.md` or `CORRALIO_SECURITY_PRIVACY.md`** specific to this contract's content — the security/privacy requirements this document relies on (channel-identity authorization, no-sensitive-data-in-links, sanitized analytics) are already correctly stated there and unchanged by this review.

## Final Product Test

The desired experience, restated as the test this contract should be measured against: *"I told Corralio I wanted to connect my kid's schedule, and it walked me through the minimum necessary steps until it could tell me when we need to leave."* Not *"I filled out Corralio's signup form over text messages."*

Two honest caveats this review surfaces that the founder's own framing didn't fully anticipate: first, "minimum necessary steps" will, in practice, include more clarifying questions than the founder's example transcript shows, until platform-detection and calendar-name extraction (Section 10, both currently unbuilt) exist — the example flow is the *best case*, not the *typical case*, per Section 3's own numbers. Second, "it walked me through" is only as trustworthy as the underlying platform's capability evidence (Section 7) — most of that evidence is honestly `untested` today, which argues for onboarding copy that stays accurate about what Corralio has verified ("connected — found 24 events") rather than copy that implies more confidence than the evidence supports.
