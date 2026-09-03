# Founder Decision — Private Calendar Feed: Phase 1 Test Next, Phase 2/3 Deferred

**Date:** 2026-09-03
**Responds to:** `docs/corralio/cpo/2026-09-03-cpo-investigation-corralio-calendar-feed-travel-lifecycle.md`
**Status:** Decision recorded. Approves writing a Phase-1-only implementation prompt; does not authorize building it yet, and does not authorize Phase 2 or Phase 3 from this investigation.

## Disposition

| Item | Decision |
|---|---|
| Phase 1 — private household ICS feed, imported events only | **TEST NEXT** |
| Phase 2 — Corralio-generated planning reminders | **DEFER** |
| Travel/lodging planning reminder | **DEFER** |
| HotelPlanner reservation-state feed updates | **DEFER**, behind Phase 3B |
| General promotional/advertising calendar events | **KILL** |

This matches the investigation's own recommendation. The founder's refinement tightens two things: the framing of what Phase 1 is actually for, and the discipline of not letting the pilot answer two unproven questions at once.

## Reasoning (founder's own framing, captured verbatim in substance)

- **Cheaper is not the same as validated.** TI's existing production ICS serializer + token lifecycle lowers the *engineering* cost of Phase 1 substantially. It says nothing about whether publishing the family plan into Apple/Google Calendar helps or hurts the business. Retention is the actual hypothesis under test, not build cost.
- **The risk is real and specific:** if parents can see child/team/time/location ambiently and stop opening This Weekend, resolving conflicts, using leave-by, or entering travel flows, Corralio will have exported enough value to weaken the recurring relationship that is the whole point of the product. Fewer commodity "what time is practice?" opens is not itself evidence of harm — it's only harm if the *differentiated* planning surfaces (conflicts, leave-by, travel) go quiet too. Subscribed households must be measured as a separate cohort, not folded into the primary retention metric.
- **The bearer-URL architecture is a real decision, not an implementation detail.** A long-lived ICS URL lets a third party repeatedly retrieve household data without an authenticated Corralio session — qualitatively different from the RLS-protected model everywhere else in the product. This needs an explicit privacy/ADR decision before any code is written, consistent with the existing requirement that private planning data stay protected and that any sharing capability be narrowly scoped and revocable.
- **Do not validate two hypotheses at once.** The proposed travel-qualification rule (≥90 min drive + a second event within 40 hours) is a reasonable *hypothesis*, but it is itself unproven logic layered on top of another unproven distribution surface. Phase 1 must not be used to test it. Hold it entirely until Phase 1 has already answered the retention question on its own.
- **Impact ordering: retention first, referral second, revenue later.** Phase 1 is not an acquisition feature. Hotel revenue sits several dependencies downstream (HotelPlanner Phase 3B isn't even started). The near-term business question is only whether subscribed families stay engaged with Corralio's differentiated planning surfaces.

## Phase 1 scope, restated as boring on purpose

One household feed. Imported events only. Minimal child identity (first name + last initial). Team/sport, times, reduced venue (name + city, not full address), optional field/court, one Corralio deep link. Explicitly excluded: leave-by, conflicts, hotel status, planning reminders, notes, home/origin address, any promotional content. Port TI's proven serializer and token-lifecycle mechanics (`apps/ti-web/lib/planner/calendarFeeds.ts`) rather than inventing a new calendar subsystem.

## Decision gate — set before any code is written

- **Pilot cohort:** roughly 10–15 activated, multi-schedule households.
- **Primary evidence required is persistence, not adoption.** "X households subscribed" is not sufficient. The gate requires evidence of continued client fetches several weeks after subscribing — i.e., the feed is still actually being read, not just added once.
- **Comparison:** subscribed households' subsequent engagement with This Weekend, conflict resolution, and leave-by, measured against a matched cohort of similar non-subscribed households.
- **Win condition:** feed subscribers retain meaningful differentiated-planning engagement even if commodity schedule-lookup opens decline.
- **Stop condition:** if differentiated planning engagement collapses in the subscribed cohort, stop. Do not proceed to Phase 2. This is a hard gate, not a soft signal to weigh alongside others.
- **Travel-qualification logic is out of scope for this pilot entirely** — it is not being tested, hypothesized about, or instrumented during Phase 1.

## Sequencing

Approved to write a **Phase-1-only implementation prompt** now. **Not** approved to dispatch/build it yet — it stays queued behind the already-authorized, higher-confidence launch-critical work currently in flight or ahead in the queue: Phase A+B (phone auth/schedule intake, Gate 3 cleared), the CALNAME micro-slice, required-arrival accuracy follow-ons, the 3.6B Phase 3A routing-origin work, the HotelPlanner Phase 3B evidence diagnostic, traffic-aware leave-by/monitoring, mobile resilience, and physical-device UAT. Phase 2 and Phase 3 (travel reminders, hotel state) are **not authorized** by this decision under any circumstance — they require a passed Phase 1 gate first.

Promotional/advertising calendar content remains a flat KILL — the family calendar is a trust surface, and treating it as ad inventory would damage the exact product relationship Corralio depends on.
