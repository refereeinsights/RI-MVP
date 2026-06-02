# TournamentInsights Weekend Planner — GPT / Codex Memory Snapshot

Last updated: Post Stage 2.9B-4 partial validation (2026-06-02)

This document is the canonical working memory for TournamentInsights Weekend Planner planning, Codex prompts, Claude UAT prompts, GPT knowledge ingestion, and roadmap alignment.

It separates:
- implemented today
- active UAT
- near-term next steps
- future roadmap direction
- non-negotiable guardrails

This is not public marketing copy. It is an internal product/engineering memory file.

---

## 1. Product Identity

TournamentInsights Weekend Planner is a unified youth sports weekend operating system inside the existing TournamentInsights ecosystem.

It is not a standalone startup product, not a separate native app, and not merely a calendar-sync tool.

Weekend Planner lives inside the existing TournamentInsights web app and should continue using:

- existing Next.js app
- existing Vercel hosting
- existing Supabase database
- existing auth
- existing entitlement model
- existing TournamentInsights brand/system
- existing venue/tournament/Owl’s Eye infrastructure

Primary route:

- /weekend-planner

Compatibility route:

- /planner should redirect to /weekend-planner if implemented.

---

## 2. Core Product Principle

Reliability first. Responsive/mobile second. Family model third. Venue-aware intelligence fourth. Native app last.

The planner should evolve in this order:

1. Reliable feed sync and safe user overlays
2. Readable multi-feed planner UI
3. Mobile-first responsive command-center experience
4. Multi-child/player/team model
5. Venue-aware and travel-time intelligence
6. PWA shell polish
7. Native app only if usage proves the need

---

## 3. Entitlement Model

Use exact entitlement strings:

- explorer
- insider
- weekend_pro

Do not create new tiers.

### 3.1 /weekend-planner Access

/weekend-planner is not hard-gated.

The planner shell and public planning context should remain accessible according to existing auth behavior.

### 3.2 Explorer

Explorer includes:

- signed-out users
- signed-in but unverified users

Explorer can:

- view public TI surfaces where implemented
- browse public tournaments and venues
- use public travel/search surfaces where implemented
- see Weekend Planner value proposition

Explorer cannot:

- create durable planner events
- connect calendars
- save personalized planner data

Explorer messaging:

- signed-out: sign in or create an account
- unverified: verify email

Do not frame Explorer limitations as paid-upgrade limitations.

### 3.3 Insider

Insider can:

- use basic planner/list/manual-event functionality
- create/edit/delete manual events
- use Upcoming / This Weekend / Season List
- connect up to one calendar feed if verified
- refresh/manage the allowed feed
- use basic planning/travel/tournament/venue links

Insider is gated from:

- connecting more than one calendar feed
- full multi-feed family calendar aggregation
- source color coding where gated
- premium conflict intelligence where gated
- full Owl’s Eye / nearby venue intelligence
- future multi-child/team intelligence

### 3.4 Weekend Pro

Weekend Pro unlocks:

- multiple calendar feeds
- premium Season Calendar where implemented
- source/feed colors where implemented
- premium conflict/schedule intelligence where implemented
- richer calendar aggregation workflows
- full Owl’s Eye / nearby venue intelligence where implemented
- future multi-child/team planning tools
- future venue-aware and travel-time intelligence

Guardrails:

- existing over-limit feeds must not be deleted
- imported/source-linked/ICS events must not be deleted
- Weekend Pro users should not see irrelevant upgrade copy

---

## 4. Implemented Planner Foundation

### Stage 2.3 — ICS Refresh Behavior

Implemented foundation for refreshing connected calendar feeds.

Must preserve:

- source-linked events are not destructively deleted
- user edits survive refresh where implemented
- venue link and non-empty notes preservation where implemented
- imported/source-linked events remain private user data

### Stage 2.4A–2.4F — Duplicate Lifecycle

Implemented duplicate lifecycle through:

- duplicate discovery
- suppression persistence
- duplicate candidate detection
- Keep separate
- manual merge endpoint
- truncation disclosure
- merge confirmation UI
- optional manual-original cleanup

Canonical duplicate rules:

- duplicate detection is advisory only
- merge is manual only
- merge requires explicit confirmation
- no automatic merge
- no source event deletion
- Keep separate dismisses suggestions only
- Keep separate never hides events
- planner_event_duplicate_dismissals must never hide events from the main planner list
- planner_event_suppressions with reason merged_duplicate hides eligible source-linked/ICS originals
- manual originals are not automatically hidden
- manual cleanup is optional, explicit, and bounded to just-merged IDs

### Stage 2.5 — Bounded Pagination / Loaded-Event Reliability

Implemented bounded event loading and Load more.

Canonical rules:

- no unbounded planner event queries
- duplicate and conflict logic are loaded-event scoped unless explicitly expanded later
- UI must disclose loaded-event scope when incomplete
- Calendar/List/Map reflect loaded events only unless all events are loaded

### Stage 2.6A — Timezone-Correct Manual Events

Implemented timezone-safe manual event entry.

Canonical rules:

- use date/time pickers
- do not regress to datetime-local
- store starts_at and ends_at as UTC instants
- interpret input in the event/display timezone
- avoid date shifts on save/refresh
- smart end defaults to start + one hour until user override

### Stage 2.6B — Loaded-Event Conflict Highlighting

Implemented schedule overlap highlighting for loaded events.

Canonical rules:

- conflict highlighting is advisory
- not color-only
- loaded-event scoped
- disclose limitations when not all events are loaded
- future child/team color coding must remain visually separate from conflict styling

### Stage 2.6C — Schedule-First UX

Implemented returning-parent information architecture.

Canonical direction:

- planner is schedule-first
- Add Event is not dominant by default
- connected calendar status is surfaced early
- schedule/list/calendar is primary
- travel/tools/upsells are secondary
- Weekend Pro gates should not block basic schedule scanning

### Stage 2.6D — Calendar View + Source Color Coding

Implemented visual Season Calendar for entitled users.

Canonical rules:

- calendar uses loaded events only
- calendar must not independently fetch planner events
- List remains durable fallback
- source/feed color coding must not expose raw source IDs
- manual events use neutral color
- timezone override is session-only where implemented
- no drag/drop or rescheduling

### Stage 2.6E — Weekend Pro Entitlement Alignment

Implemented planner monetization alignment.

Canonical rules:

- /weekend-planner is not hard-gated
- Explorer messaging is sign-in/verify oriented
- Insider has basic planner/manual/list and limited calendar access
- Weekend Pro unlocks full calendar aggregation and premium schedule intelligence
- existing over-limit feeds are not deleted
- imported/source-linked/ICS events are not deleted

### Stage 2.7 — UAT Hardening + Typed Analytics

Implemented or finalized.

Analytics rules:

- typed analytics only
- privacy-safe payloads
- fail open
- no raw IDs
- no source URLs
- no source_event_uid
- no notes
- no addresses
- no event titles
- no exact private event times

### Stage 2.8 — UAT Findings Polish + Launch Readiness

Polish stage.

Scope:

- copy clarity
- empty states
- loading states
- mobile spacing/overflow
- entitlement gate clarity
- connected calendar status clarity
- calendar/list/map usability
- source color readability
- conflict wording
- loaded-event disclosure clarity
- analytics sanity checks

Non-goals:

- schema changes unless explicitly scoped
- OAuth/scraping
- multi-child profiles
- major new features

---

## 5. Current Stage 2.9 Feed Reliability Track

### Stage 2.9A — ICS Source Identity Audit + Sports Family UAT Prep

Status: complete.

Purpose:

- audit current ICS implementation
- document source identity behavior
- prepare compatibility matrix
- prepare Sports Family UAT checklist
- separate implemented behavior from future direction

No live feeds were required.

### Stage 2.9B-0 — Calendar Feed Labels + Kid/Team/Sport Identity Prep

Status: implemented and validated.

Purpose:

- feed-level labels so imported events show kid/team/sport/platform
- stable source/feed colors
- source/feed color distinct from future child/team color
- readable multi-feed UAT before importing additional Sports Family feeds

Labels are feed-level metadata, not full child profiles.

Current validated active feed:

- Platform: Team Connect / Team App
- Team: TI Owls 15U
- Display label: SC-Casey
- Recommended human labels:
  - Child/player: Casey Sports
  - Team: TI Owls 15U
  - Sport: Volleyball
  - Platform: Team Connect

Visual rules:

- source/feed color = calendar feed origin
- child/team label = human meaning
- conflict red = warning state
- future child/team color = separate identity system

Do not collapse these into one color system.

### Stage 2.9B-1A — Single Team Connect Feed Baseline UAT

Status: complete.

Active feed:

- Team Connect / Team App — TI Owls 15U

Observed:

- baseline import passed
- full season loaded
- three manual refreshes passed
- duplicate storm not observed
- event update landed in place
- updated time reflected correctly
- labels persisted after refresh
- Calendar/List remained consistent

Additional feeds were intentionally deferred until 2.9B-0 labels were implemented and validated.

### Stage 2.9B-1B — Team Connect Update / Overlay / Cancel UAT

Status: in progress (implemented pass/follow-up split).

Latest evidence snapshot (2026-06-02):

- Update/move baseline: **PASS**
  - `Practice A` change re-import not required.
  - Existing event updated in place; no duplicate created.
  - Time/location updates reflected after refresh.
  - Labels persisted after refresh.
  - Calendar/List remained consistent.
  - Repeated refreshes observed without duplicate storm.

In progress:

- Local note preservation after refresh: **PASS** (UAT confirmed overlay note persists on Practice A after refresh)
- Linked venue preservation after refresh: **PASS** (validated by Stage 2.10 recheck where linked venues persist after reload/refresh)
- Cancel/delete behavior for Team Event C: **pending**
- Whether canceled events are marked removed/unchanged: **pending**
- Source-linked hard-delete confirmation: **pending** (must remain false for PASS)

### Stage 2.9B-2 — GameChanger Single-Feed Baseline UAT

Status: partial PASS from first feed run; core UAT items complete with follow-up coverage for 2.9C.

Known available feeds:

- TI Owls 12U
- TI Owls 15U
- TI Robins 12U
- TI Robins 14U

Scope:

- import one feed only first
- baseline import
- repeated refresh
- duplicate-storm behavior
- update/move behavior
- cancel/delete behavior
- source_id + UID behavior where observable
- label rendering (kid/team/sport/platform)
- source/feed color stability
- loaded-event disclosure
- Practice A update/move control path
- Game B stable control behavior
- Team Event C cancel/delete behavior
- local note and linked venue preservation
- no raw source URLs/source_event_uid in UI

Observed (2026-06-02, TI Owls 12U):

- Baseline import: PASS (23 events; 0 errors)
- Repeated refresh storm checks: PASS (`imported=0`, `changed=23` x3)
- In-place update/move behavior: PASS (no duplicate storm; updates re-render without duplication)
- Overlay + venue persistence: PASS
- Loaded-scope disclosure: PASS
- Label display: Partial — rendered fallback `Connected calendar` (source label input was null)
- Privacy exposure: PASS (no raw source identifiers visible)
- Cancel/delete behavior: PENDING (not executed in this run)

### Stage 2.9B-3 — TeamSnap Feed UAT

Status: after GameChanger single-feed baseline.

Known available feed:

- TeamSnap — TI Strikers / TI Wolves

Scope:

- verify import method and transport type (webcal / https / signed / login-dependent)
- baseline import
- repeated refresh
- update/move behavior
- cancel/delete behavior
- UID stability
- location quality
- opponent/team/field quality
- source labels and source/feed color
- overlay and manual note preservation
- no duplicate storm
- no raw feed URL or source_event_uid in UI

Document TeamSnap quirks (refresh delay, update latency, etc.).

### Stage 2.9B-4 — SportsEngine / MySE Feed UAT

Status: partial PASS (SportsEngine/MySE coverage active for control baseline).

Known available feed:

- SportsEngine / MySE — TI Red Robins and TI Owls

Scope:

- verify import method and transport type (webcal / https / signed / login-dependent)
- baseline import
- repeated refresh
- update/move behavior
- cancel/delete behavior
- UID stability
- SEQUENCE / LAST-MODIFIED / DTSTAMP when observable
- location / venue text quality
- opponent/team data quality
- feed labels
- source/feed color
- overlay preservation
- no duplicate storm
- no raw feed URL or source_event_uid in UI

Documented in this pass:

- Protocol normalization: `webcal://` (and related `http://`) accepted and normalized to `https://`.
- Baseline import PASS (`Imported 6 · Updated 0 · Skipped 0`) with explicit source/team labels (`SportsEngine — TI Red Robbins`).
- Refresh dedupe: 3 rapid refreshes passed with `+0 new · 6 updated · 6 changes` pattern and no duplicate storm.
- Overlay + duplicate conflict behavior: PASS (cross-platform conflict badges worked; no Duplicate button on SE events).
- Loaded scope disclosure + privacy guardrails: PASS
- `Schedule refreshed` summary signal now appears in ADD MANUAL EVENT section header after refresh.
- Source-name fallback/collision handling: explicit source/team labels currently present when feed provides them.
- F3 limit gate: pre-existing issue still open — adding as a 4th feed on Insider still opens connect modal instead of explicit upgrade prompt.
- Open follow-ups: update/move, cancel/delete for Team Event C, and /account/logout 404 coverage remain pending.

Document SE/MySE quirks:

- Calendar cache/update timing: to be confirmed during update/delete actions.
- Fixture note: two `TI Feed Test Team Event C` entries at 2:00/2:30 are fixture data variants (not duplicate storm).
- Location quality: many fixture rows lacked address payloads.

### Stage 2.9B-5 — Sports Connect / Blue Sombrero / Team Stack Feed UAT

Status: only if clearly distinct from Team Connect / Team App.

Scope:

- determine if this is the same or distinct source family
- if distinct, run same baseline/update/cancel/overlay checklist
- document source family naming and ambiguity

### Stage 2.9B-6 — Remaining Accessible Platforms

Platforms:

- Google Calendar
- Apple Calendar
- Outlook
- generic ICS/webcal
- Spond or Heja if accessible

Scope:

- baseline import
- refresh behavior
- update/move behavior
- cancel/delete behavior
- UID stability
- overlay preservation
- label and source/feed color behavior
- no duplicate storm
- no raw URL / source_event_uid in UI

### Stage 2.9B-Later — Access-Blocked Platforms

Platforms:

- LeagueApps
- PlayMetrics

Current blockers:

- LeagueApps has documented subscription support but is blocked without org/admin/demo or participant access.
- PlayMetrics appears to require club/demo or participant-level access.

Do not claim support until verified.

### Stage 2.9B Incremental Platform Testing

Do not import all feeds at once.

Recommended order:

1. 2.9B-1A — Single Team Connect / Team App Feed Baseline UAT
2. 2.9B-1B — Team Connect Update / Overlay / Cancel UAT
3. 2.9B-2 — GameChanger Single-Feed Baseline UAT
4. 2.9B-3 — TeamSnap Feed UAT
5. 2.9B-4 — SportsEngine / MySE Feed UAT
6. 2.9B-5 — Sports Connect / Blue Sombrero / Team Stack Feed UAT
7. 2.9B-6 — Remaining Accessible Platforms
8. 2.9B-Later — Access-Blocked Platforms

Each platform batch should validate:

- can obtain usable ICS/webcal URL
- baseline import
- UID stability
- repeated refresh
- duplicate storm behavior
- moved and renamed event behavior where applicable
- location/field/court change behavior
- canceled/deleted event behavior
- SEQUENCE / LAST-MODIFIED / DTSTAMP if available
- loaded-event disclosure
- location/venue data quality
- source/feed labels
- source/feed colors
- overlay preservation
- suppressions and duplicate dismissals across refresh
- raw URL/UID privacy
- no unexpected source-linked/ICS hard deletes

Do not claim platform support before feed behavior is verified.

### Stage 2.9C — Source Identity Hardening Follow-Ups

Status: in-flight; Stage 2.9C follow-up currently has completed the temporary missing-source retention check for SportsEngine/MySE.

Prompt:
- `docs/prompts/ti-planner-stage-2.9c-source-identity-hardening-followups.md`

Likely scope:

- source_id + UID hardening
- moved-event behavior
- canceled-event handling
- missing-from-feed / inactive state
- SEQUENCE / LAST-MODIFIED / DTSTAMP
- content-diff fallback
- recurrence limits
- duplicate-storm prevention
- overlay/suppression preservation fixes

Current active open items carried into 2.9C:

- F3 at-limit behavior still should show upgrade path before modal import.
- Source name fallback stability (`Connected calendar`) needs final policy.
- Hard-delete behavior on source cancel/delete remains unverified after real-feed baseline.
- Missing-source handling behavior is now observed as retention during temporary source disable (events remained, no timestamp churn).

Non-goals:

- OAuth
- scraping
- private credentials
- native platform APIs
- push/live updates

### Recommended Stage Order

Near term:

1. 2.9B-1B — Team Connect update / overlay / cancel UAT (completion pass/follow-up)
2. 2.9B-2 — GameChanger single-feed baseline UAT
3. 2.9B-3 — TeamSnap feed UAT
4. 2.9B-4 — SportsEngine / MySE feed UAT
6. 2.9B-5 — Sports Connect / Blue Sombrero / Team Stack feed UAT
7. 2.9B-6 — Google / Apple / Outlook / generic ICS
8. 2.9B-Later — LeagueApps / PlayMetrics when access exists
9. 2.9C — source identity hardening from real feed findings
10. 2.10 — venue data capture from feed UAT
11. 2.10B — assisted venue linking

Product expansion:

12. 3.0 — responsive planner layout foundation
13. 3.0B — PWA shell / home-screen polish
14. 3.0C / 3.4 — multi-child profiles + team assignment
15. 3.1 — venue-aware planner integration
16. 3.2 — mobile venue / weekend command actions
17. Native app evaluation only if validated usage need exists

---

## 6. Sports Family Benchmark

Sports Family is the canonical stress-case UAT family.

Family:

- two parents
- six kids
- twelve sports schedules
- seven platform targets
- last name: Sports

Base inbox:

- rdtest1970@gmail.com

Use Gmail plus-addressing for parent/child/platform aliases.

Target platforms:

- GameChanger
- TeamSnap
- SportsEngine / MySE
- Sports Connect / Blue Sombrero
- PlayMetrics
- LeagueApps
- Spond or Heja
- Google Calendar
- Apple Calendar
- Outlook
- generic ICS/webcal

Seed event pattern:

- Practice A = baseline create/import and update/move test
- Game B = stable control event
- Team Event C = cancel/delete test

Naming safety:

- all team names start with TI Test
- all event titles start with TI Feed Test

Current platform notes:

- Team Connect / Team App feed is active and baseline passed
- GameChanger feeds exist but should be imported incrementally
- TeamSnap URLs exist and should be tested after current feed is complete
- SportsEngine URLs exist and should be tested after TeamSnap or as scheduled
- LeagueApps has documented calendar subscription support but access is blocked without org/admin/demo or registered participant account
- PlayMetrics likely requires club/demo access
- Sports Connect / Blue Sombrero may require org/admin access depending on portal

---

## 7. Venue / Map Roadmap

### Current Map Behavior

Current map behavior is event-level:

- external map/directions action
- mobile map-picker modal
- not a full in-planner map view unless explicitly added later

### Stage 2.10 — Venue Data Capture from Feed UAT

Runs alongside 2.9B.

Purpose:

- determine whether imported feed location data is good enough for venue linking

Capture per platform:

- venue name quality
- address quality
- city/state presence
- field/court details
- map URL if present
- whether location changes survive refresh
- whether user-selected venue override survives refresh

This is assessment first, not automatic matching.

### Stage 2.10A — Display Linked Venue Name

Status: implemented (2026-06-02), verified via Stage 2.10 UAT.

Purpose:

- if event already has selected TI venue, show venue name instead of MVP engineering placeholder

Scope:

- show linked venue name
- show city/state if available
- preserve Clear
- preserve Find venue
- preserve source location text
- no automatic venue matching
- no fuzzy matching
- no full Owl’s Eye cards yet

Product rule:

- feed location text = source data
- selected TI venue = planner context
- user-selected venue context wins and must survive refresh

### Stage 2.10B — Assisted Venue Linking

Future.

Scope:

- Find venue / Link venue from event card/detail
- prefill venue search from feed location text
- search TI venues by name/address/city/state
- user confirms selected venue
- preserve linked venue through feed refresh
- distinguish source location text from selected TI venue context

Do not silently auto-link.

### Stage 3.1 — Venue-Aware Planner Integration

Future.

Scope:

- known TI venue on event details
- venue page link
- directions
- parking / entrance / field notes where available
- tournament map link where relevant
- Owl’s Eye / nearby venue intelligence for Weekend Pro
- venue action cards inside event/weekend views

### Stage 3.2 — Mobile Venue / Weekend Command Actions

Future mobile command layer.

Mobile should answer:

- What is next?
- Where do we need to be?
- When should we leave?
- Which child/team is this?
- What venue?
- Where do we park?
- Where is food/coffee?
- What do we need to bring?

---

## 8. Responsive / PWA Roadmap

Weekend Planner should evolve into a responsive, mobile-first planning experience while staying inside the existing TournamentInsights web app.

This is not a separate native app or separate repo at this stage.

Architecture principle:

- same product
- same repo
- same database
- same auth
- same entitlement model
- different responsive layouts for desktop and mobile

### Stage 3.0 — Responsive Planner Layout Foundation

Desktop/tablet:

- season/calendar planning dashboard
- month/week/season views
- calendar source management
- duplicate review
- feed troubleshooting
- broader planning/debug workflows

Mobile:

- sideline-ready weekend command center
- scroll/card-based views
- Today
- This Weekend
- Upcoming
- later: By Child / By Team / By Venue
- sticky header
- bottom navigation
- safe-area padding
- touch-friendly cards

### Stage 3.0B — PWA Shell / Home-Screen Polish

Future.

Scope:

- web app manifest
- app icons
- theme color
- standalone display mode testing
- home-screen guidance
- mobile browser polish

Still same web app. No native repo.

External implementation note:

- PWA manifest details should be checked against current browser/Next.js guidance before implementation.
- Vercel Cron Jobs are available for scheduled tasks and can support future daily feed refresh MVP if/when scoped.

### Native App Stance

Native iOS/Android remains deferred.

Only consider native after usage proves need for:

- push notifications
- deeper offline support
- device-specific features
- app-store distribution
- repeated mobile weekend usage that PWA cannot satisfy

---

## 9. Future Family Model Roadmap

### Stage 3.0C / 3.4 — Multi-Child / Player Profiles + Team Assignment

Future, after feed reliability and feed labels are stable.

Scope:

- child/player profiles
- team assignment
- feed assignment to child/team
- manual event assignment to child/team
- child/team color coding
- filters by child/team
- family schedule view
- per-child view
- same-child vs sibling vs parent-logistics conflicts

Important visual rule:

- source/feed color = calendar/feed origin
- child/team color = identity
- conflict red = warning state

Do not collapse these into one system.

---

## 10. Tournament Schedule Integration Track

Tourney Machine should be on the targeted roadmap, but separate from private family calendar-feed UAT.

Tournament schedule source track includes:

- Tourney Machine
- Exposure Events
- GotSport
- SportsEngine tournament schedules
- LeagueApps tournament/event schedules
- other public tournament schedule providers

Architecture priority:

1. ICS/iCal subscription link if available
2. public schedule parsing if stable and permitted
3. official API/OAuth later only if justified

Avoid fragile scraping as the primary MVP path.

Purpose:

- tournament schedules
- bracket/game updates
- venue/field assignments
- multi-venue weekend context
- public tournament planning intelligence

---

## 11. Daily Auto-Refresh Direction

Daily auto-refresh is tabled for now.

Future possible stage:

- Scheduled Calendar Feed Refresh MVP

Recommended model:

- Vercel Cron hitting internal API route
- cron secret required
- bounded batch refresh
- safe logging
- no real-time claims
- no source-linked/ICS deletion
- preserve overlays/suppressions
- Weekend Pro multi-feed auto-refresh; Insider manual refresh for one feed

Do not implement until current single-feed update/cancel behavior is better proven.

---

## 12. Current Immediate Next Steps

Current immediate path:

1. Finish Team Connect update/overlay/cancel UAT
2. Document Team Connect compatibility result
3. Import one GameChanger feed only
4. Run GameChanger baseline/repeated-refresh/update/cancel tests
5. Continue to TeamSnap and SportsEngine incrementally
6. Capture venue/location quality during every feed test
7. Defer full multi-child profiles until feed reliability and labels are stable

---

## 13. Future Prompt Guardrails

Every future Weekend Planner Codex/GPT prompt should preserve these guardrails:

- do not hard-gate /weekend-planner
- use exact entitlement strings explorer, insider, weekend_pro
- Explorer messaging is sign-in/verify oriented, not paid framing
- Weekend Pro gates full calendar aggregation and premium intelligence
- do not delete source-linked/ICS events
- no automatic merge
- no automatic cleanup
- Keep separate never hides events
- suppressions hide eligible merged source-linked/ICS originals only
- manual cleanup is optional and explicit
- duplicate/conflict detection must disclose loaded-event scope unless full bounded coverage exists
- no unbounded planner event queries
- no unbounded recurrence expansion
- no raw IDs/source URLs/source_event_uid in UI or analytics
- preserve Stage 2.6A timezone-safe manual event entry
- preserve user edits through refresh
- calendar feeds are private user sources
- feed location text is source data
- selected TI venue is planner context
- no automatic venue matching until explicitly scoped
- do not claim unbuilt features exist
- no OAuth/scraping/private credential storage unless explicitly scoped later
- native app is deferred until usage validates need

---

## 14. Canonical One-Line Roadmap Principle

Reliability first. Responsive/mobile second. Family model third. Venue-aware intelligence fourth. Native app last.
