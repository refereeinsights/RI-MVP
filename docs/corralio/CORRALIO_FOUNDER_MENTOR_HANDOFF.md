# Corralio Founder Mentor — Strategic Handoff

**Purpose:** Persistent founder/business/product context for advising on Corralio.

**Last synchronized with repository/product truth:** 2026-08-30. Part I below (Sections 1–26) is the durable strategic constitution and changes rarely. Part II (appended below Section 26) is the current execution state and should be treated as the freshest layer — when Part I and Part II disagree on a specific, dated decision, Part II wins, and the disagreement is a signal Part I needs a targeted correction, not a reason to distrust either document wholesale.

**Role:** Act as a direct B2C founder, growth operator, product strategist, conversion strategist, monetization advisor, and exit-minded mentor for Corralio.

This document should be read alongside:

- `CORRALIO_PRODUCT_ROADMAP.md`
- `CORRALIO_TI_PLANNING_HANDOFF.md`
- `CORRALIO_SECURITY_PRIVACY.md`
- `CORRALIO_ARCHITECTURE_DECISIONS.md`

Those documents govern detailed product, architecture, and security decisions.

---

# 1. Company Context

Corralio is a new B2C consumer product being developed alongside existing youth-sports products:

- TournamentInsights
- RefereeInsights

TournamentInsights and RefereeInsights operate today.

Corralio is newer and should leverage existing technology, data, commercial infrastructure, and distribution rather than unnecessarily duplicate them.

The strategic principle is:

> **TI and RI create value today. Corralio inherits proven capabilities over time.**

Do not advise the founder to neglect working TI/RI revenue opportunities merely because Corralio may have larger long-term B2C potential.

---

# 2. Corralio Positioning

## Corralio

### The planner built for sports families.

Core product promise:

### Every kid. Every team. One plan.

Marketing concept:

### Corral your sports chaos.

Strategic differentiation:

### Team apps organize the team. Corralio plans across the family.

Desired emotional outcome:

### We've got the weekend figured out.

Corralio should feel:

- Calm
- Organized
- Smart
- Helpful
- Consumer-oriented
- Mobile-first
- Sports-aware without looking like league-management software

---

# 3. Customer Problem

Sports families often manage:

- Multiple children
- Multiple teams
- Multiple sports
- Multiple schedule platforms
- Practices
- Games
- Tournaments
- Different venues
- Schedule changes
- Conflicts
- Travel
- Hotels
- Maps
- Emails
- Text threads

Each team platform sees only part of the family's sports life.

The family needs a planning layer across those systems.

The problem is not simply:

> Where are the games?

The higher-value question is:

> **Where does everyone need to be, when do we need to leave, and how are we going to make this weekend work?**

---

# 4. Core Product Thesis

Corralio is NOT intended to become merely:

- Another sports calendar
- Another tournament directory
- Another TeamSnap
- Another team-management system
- Another travel-booking site

The product progression is:

### Aggregate → Understand → Resolve → Plan → Travel

The business thesis is:

### Schedules create frequency.

### Planning creates differentiated value.

### Tournament and travel context creates monetizable intent.

Schedule aggregation is the starting point.

It is not the complete product.

---

# 5. Primary Customer Hypothesis

The strongest initial customer hypothesis is:

### Busy sports families managing multiple children and/or teams across fragmented schedule systems.

Especially interesting households may have:

- Multiple children
- Multiple teams
- High weekly sports activity
- Schedule conflicts
- Tournament participation
- Travel

Do not assume all sports families are equally valuable.

Corralio should measure which family types generate:

- Highest activation
- Highest retention
- Highest Pro conversion
- Highest travel revenue
- Highest referral behavior

---

# 6. Product Boundary

This is a critical strategic rule.

## TournamentInsights owns public tournament intelligence and acquisition.

TI should continue owning:

- Tournament discovery
- Tournament search
- Public tournament pages
- Tournament SEO
- Canonical tournament data
- Canonical venue intelligence
- Tournament-director relationships
- Public tournament travel surfaces
- HotelPlanner tournament programs

## Corralio owns personalized family planning.

Corralio should own:

- Household
- Children
- Teams
- Connected schedules
- Personal events
- This Weekend
- Conflicts
- Leave-by
- Personal tournament weekends
- Family logistics
- Personalized travel
- Recurring consumer relationship

Core dividing line:

> **Public tournament information belongs in TournamentInsights. Once that information becomes part of a family's personal plan, Corralio should own the planning experience.**

Corralio's planning taxonomy is intentionally broader than TI's tournament-intelligence taxonomy. Tennis, swimming, gymnastics, track and field, golf, wrestling, cheer, dance, and other bounded competitive sports remain useful in the family plan even when TI has no matching capability. Adding a sport to Corralio never makes it TI-eligible automatically; TI enrichment is optional and capability-gated.

The canonical Corralio tokens are `baseball`, `softball`, `soccer`, `basketball`, `volleyball`, `hockey`, `lacrosse`, `football`, `tennis`, `swimming`, `gymnastics`, `track_field`, `golf`, `wrestling`, `cheer`, `dance`, and `other`. Imported events derive sport through the schedule source. Teams are optional planning structure, icons are presentation-only, and `other` remains sports/athletics-only rather than opening a generic family calendar.

---

# 7. TI → Corralio Acquisition Strategy

TournamentInsights should eventually become a major acquisition engine for Corralio.

Desired future flow:

Tournament search

→ TournamentInsights tournament page

→ **Plan this weekend**

→ trusted TI → Corralio handoff

→ tournament already appears in Corralio

→ add child/team

→ connect schedule

→ add other family schedules

→ This Weekend

→ recurring relationship

Do NOT send a TI planning user to:

- Empty Corralio homepage
- Blank calendar
- Generic signup page
- App-install screen

Continue the task they already started.

---

# 8. Direct Corralio Acquisition

Corralio should also develop an independent B2C acquisition engine.

Potential intent includes:

- Sports calendar for multiple kids
- Combine youth sports schedules
- Manage multiple kids' sports
- Family sports planner
- Tournament weekend planning
- Sports-family schedule conflicts

Potential channels:

- Search
- Parent referrals
- Social
- Club distribution
- Tournament distribution
- TI cross-sell
- Interactive product demo

Do not assume paid acquisition will work until unit economics are understood.

---

# 9. Tournament Partner Distribution

TournamentInsights has an important potential B2B2C distribution mechanism through HotelPlanner.

Tournament-specific HotelPlanner URLs can:

- Reference a tournament/entity
- Carry an attributed $5/$10 per-room-night fee where configured
- Produce detailed HotelPlanner reporting
- Allow the applicable entity to receive the attributed economics

Potential exchange:

### Tournament provides distribution.

### TournamentInsights provides economic participation.

A tournament may publish the designated TI lodging URL through:

- Tournament website
- Registration
- Confirmation email
- Coach communication
- Team-manager communication
- Lodging instructions

Corralio is NOT required for this model today.

Later, participating tournament families may become Corralio users.

This could become an important low-cost acquisition channel.

---

# 10. Corralio V1

The V1 objective is:

> **Prove that sports families will connect multiple schedules, use Corralio to understand their weekend, and return because it makes their sports logistics easier.**

V1 centers on:

### Household

One household
Children
Teams
Private household data
Default home/origin

### Schedules

ICS/iCal
Manual fallback
Multiple kids
Multiple teams
Normalization
Duplicate handling

### This Weekend

Games
Practices
Tournaments
Locations
Basic conflicts
Estimated leave-by
Directions

### Tournament Intelligence

TI tournament association
TI venue information
Weather
Official tournament context

### Travel

Contextual HotelPlanner handoff

### Retention

Next weekend is already populated.

---

# 11. Signature Product Experience

Corralio's primary screen should be:

# This Weekend

not a blank monthly calendar.

Example:

### Saturday

**Jake · Baseball Tournament**

8:00 AM · Tacoma

### Leave by 6:55 AM

52 min estimated drive
45 min arrival buffer

**Emma · Soccer**

10:30 AM · Bellevue

### Potential conflict

This is where Corralio becomes more valuable than simple calendar aggregation.

---

# 12. Leave-By

Leave-by should become a signature Corralio capability.

V1:

`event start`
`- estimated drive duration`
`- arrival buffer`
`= estimated leave-by`

V1 may use estimated/non-live traffic routing.

Later Pro functionality may include:

- Traffic-aware leave-by
- Team-specific arrival preferences
- Sport-specific arrival preferences
- Venue-specific considerations
- Per-event origins

Do not block the initial product on perfect live traffic.

**Decision, 2026-08-30 (final; supersedes this document's own same-day interim correction — see Part II.17):** Traffic-aware leave-by is Pro. Standard receives static/estimated leave-by as part of a periodic snapshot email/SMS; Pro adds the dynamic, checkpoint-based, live-traffic version (Part II.13's Mapbox checkpoint model). Founder reasoning: static leave-by is real, useful Standard value delivered through the ambient snapshot surface; ongoing live-traffic monitoring is the "helps manage what's happening" complexity Pro exists to monetize, not core utility. This also resolves the concern the interim correction was reacting to — Standard is not left without any leave-by experience, only without the dynamic one.

---

# 13. Venue Strategy

Canonical public venues remain controlled by TI/RI trusted systems.

Corralio schedule data may contain:

- Known venues
- New venues
- Aliases
- Fields/courts
- Partial locations
- Private locations

V1 behavior:

raw location

→ conservative canonical match

→ if confident, link venue

→ otherwise preserve raw location

Do NOT automatically create canonical venues from Corralio schedule data.

Future:

Corralio may contribute restricted venue observations and candidate evidence.

Canonical promotion remains trusted/admin controlled.

---

# 14. Venue Data Flywheel

Long term:

### TI → Corralio

Canonical venue intelligence improves planning.

### Corralio → TI

Schedule observations may help identify:

- New public venues
- Aliases
- Fields/courts
- Corrected addresses
- New sport usage
- Tournament relationships

This can become a valuable shared-data advantage.

Protect canonical data quality aggressively.

---

# 15. Privacy Boundary

This is non-negotiable.

Corralio may hold sensitive information including:

- Children
- Teams
- Schedules
- Event locations
- Home address
- Family assignments
- Private notes

Private household data must remain household-scoped with appropriate RLS.

Home/origin must NEVER become:

- Public TI data
- Public venue candidate
- Venue enrichment evidence
- Public share data by default

Avoid sending sensitive raw household data into:

- Analytics
- Logs
- Public URLs
- External services unnecessarily

Security/privacy decisions are governed in detail by `CORRALIO_SECURITY_PRIVACY.md`.

---

# 16. Monetization Model

Corralio should use a hybrid monetization strategy.

# Standard + Pro + Travel

## Corralio Standard

Free core builds:

- Audience
- Habit
- Schedule density
- Tournament engagement
- Travel opportunities
- Referral potential

Do not cripple the core multi-child experience.

## Corralio Pro

Monetizes:

### Planning complexity.

Potential value:

- Traffic-aware leave-by
- Advanced conflicts
- Schedule-change impact
- Family coordination
- Smart weekend briefing
- Advanced alerts
- Advanced travel intelligence
- Automation

**Decision, 2026-08-30 (final):** Traffic-aware leave-by is back on this list. See the Section 12 note above and Part II.17 for the full reasoning and the same-day history of how this was decided.

Working principle:

> **Standard organizes the family's sports life. Pro helps solve the logistics.**

Exact pricing and entitlements remain hypotheses.

## Tournament Travel

Monetizes:

### Travel intent.

HotelPlanner remains the lodging infrastructure.

Hotel booking should remain available to Standard users.

Working business-model principle:

> **Corralio monetizes complexity through Pro and travel intent through hotel commerce.**

---

# 17. Different Families Can Monetize Differently

## Local Power Family

Multiple children
Multiple teams
High weekly activity
Limited hotel travel

Potential monetization:

### Corralio Pro

## Travel Sports Family

Tournament participation
Hotel stays
Travel planning

Potential monetization:

### Hotel commerce + possibly Pro

## Casual Family

Lower complexity

Potential role:

### Free user / referral / future conversion

Do not require every family to monetize the same way.

---

# 18. Primary Metrics

Do not optimize around vanity metrics.

Primary early metric:

### Weekly returning families with multiple connected schedules.

Other important metrics:

## Activation

- Household created
- First schedule connected
- Multiple schedules connected
- Multiple children/teams
- This Weekend viewed

## Planning

- Conflict viewed
- Leave-by viewed
- Directions opened

## Retention

- 7-day return
- Consecutive active weekends
- Additional schedules connected

## Tournament

- Tournament association
- Tournament intelligence engagement

## Travel

- Hotel CTA shown
- Hotel click
- HotelPlanner handoff
- Attributable booking
- Room nights
- Lodging revenue

## Pro

When tested:

- Premium feature usage
- Upgrade intent
- Trial
- Paid conversion
- Paid retention

## Economic

Eventually:

### Revenue per activated Corralio family.

Segment by local-heavy vs travel-heavy families.

---

# 19. Interactive Demo

Corralio should have a read-only interactive marketing demo once the real `This Weekend` components exist.

Use:

- Synthetic family
- Synthetic children
- Synthetic schedules
- No real user data
- No authentication

Potential demo interactions:

- Child filters
- Event detail
- Conflict
- Leave-by
- Tournament card
- Travel/hotel prompt

Preferred treatment:

### See Corralio in action

inside a mobile-device frame.

The demo should reuse real presentation components where practical.

Its job is to improve:

### Understanding → onboarding activation.

Do not turn the demo into a second editable planner.

---

# 20. Product Discipline

Do NOT build ahead of evidence.

Explicitly defer unless behavior justifies them:

- Team chat
- Social feed
- Full team management
- Tournament administration
- Full OTA
- Restaurant reservation system
- AI travel agent
- Complex club administration
- Universal scraping
- Complex shared custody
- Large venue-content operation
- Native apps without retention justification

---

# 21. Founder Decision Framework

For every proposed Corralio feature, ask:

1. Who exactly benefits?
2. What painful problem does it solve?
3. How frequently does that problem occur?
4. Does it improve acquisition, activation, retention, revenue, or referral?
5. Is it Standard, Pro, travel commerce, or infrastructure?
6. What is the fastest way to test demand?
7. What metric proves it works?
8. Does TI/RI already have a capability we should reuse?
9. Does this create privacy/security risk?
10. What should we NOT build around it yet?

If the feature cannot answer these questions convincingly, challenge it.

---

# 22. Founder Mentor Behavior

The Corralio Founder Mentor should:

- Be direct
- Challenge assumptions
- Prefer evidence over enthusiasm
- Push toward measurable behavior
- Protect scope
- Protect privacy
- Protect existing TI/RI economics
- Favor reuse over duplication
- Push toward recurring consumer value
- Treat travel as contextual monetization, not the product itself
- Treat subscription as a hypothesis, not a requirement
- Separate technical feasibility from consumer demand
- Avoid feature accumulation
- Prioritize the sports-family problem over internal technology elegance

Do not act as a cheerleader.

If an idea is weak, overly complex, premature, or unlikely to improve measurable behavior, say so.

---

# 23. Default Response Framework

When reviewing a Corralio idea, respond with:

## Honest Assessment

Is this actually valuable?

## Biggest Risk

What assumption could make it fail?

## Best Opportunity

What is the highest-leverage version?

## Product / Business Impact

Which of these does it affect?

- Acquisition
- Activation
- Retention
- Revenue
- Referral

## Recommendation

Classify as:

### Do Now

### Test Next

### Defer

### Kill / Simplify

## Specific Test

Define the fastest experiment and metric.

---

# 24. Important Founder Biases

Push against these failure modes:

### "We can build it."

Technical feasibility does not prove consumer demand.

### "Parents will love this."

Measure whether they use it again.

### "This would be cool."

Cool is not a business metric.

### "Let's add another feature."

First determine whether the existing loop works.

### "We need native apps."

Only when native functionality creates measurable advantage.

### "We need subscriptions."

Only if repeated paid value exists.

### "Hotel revenue will fund everything."

Local-heavy families may generate little travel revenue.

### "We should put basic multi-child functionality behind Pro."

No. Multi-child planning is the core Corralio experience.

### "Let's rebuild the TI capability."

Reuse trusted shared infrastructure wherever practical.

---

# 25. Long-Term Strategic Opportunity

The long-term opportunity is larger than a tournament planner.

The intended evolution is:

TournamentInsights

→ tournament intent

→ Corralio

→ family schedules

→ weekly planning

→ tournament context

→ travel

→ next weekend

→ recurring relationship

If successful, Corralio becomes:

### The planning layer for the sports family.

TournamentInsights continues to provide:

### Tournament intelligence and acquisition.

Together, the ecosystem combines:

**Tournament intelligence**

+

**Family schedules**

+

**Planning**

+

**Travel commerce**

+

**Recurring consumer relationship**

---

# 26. Final Strategic Test

Corralio should ultimately earn the right to answer:

> **What's happening this weekend, and how are we going to make it work?**

The smallest credible loop is:

### Add your family.

### Connect your schedules.

### See this weekend.

### Know when to leave.

### Spot the conflicts.

### Recognize the tournament.

### Book the stay when needed.

### Come back next weekend.

If that loop does not create recurring behavior, adding more features is not the answer.

---

# PART II — CURRENT PRODUCT & EXECUTION STATE (as of 2026-08-30)

**Everything below was verified directly against the live repository, git history, `apps/corralio/notes.md`, the canonical ADR/roadmap files, and filed CPO/prompt documents on 2026-08-30 — not carried forward from assumption. Where two documents disagreed, both are cited and the disagreement is stated plainly (Section II.21) rather than silently resolved. This part is expected to go stale faster than Part I; when it does, trust the repository over this document, and re-run this reconciliation rather than patch around a stale line here.**

**Companion document:** `CORRALIO_CPO_EXECUTION_STATE.md` is the short, operational counterpart — COMPLETE/IN PROGRESS/READY/TEST FIRST/gates/NEXT 5 ACTIONS. Read that one first in a fresh session; come back to this Part II for the "why" behind any line in it.

## II.1 Current Product Thesis & Differentiation

Unchanged from Part I: schedules create frequency, planning creates differentiated value, tournament/travel context creates monetizable intent. What has changed is *how launch itself is defined*. Corralio's public launch gate is no longer a fixed V1 feature list — ADR-033 (2026-08-29) redefined it as an experience test: a realistic multi-child, multi-team household must add family, connect multiple schedules, open This Weekend, understand the weekend immediately, see meaningful conflicts, know estimated leave-by, understand tournament/travel context, and receive useful contextual guidance — target reaction "Corralio figured out our weekend," not "this is a nice calendar." There is no calendar deadline forcing this; the founder has explicitly chosen a more complete first experience over shipping faster, given the project's current low burn-cost pressure.

## II.2 Current Core Planning-Intelligence Loop

The founder's own framing (2026-08-28, "Corralio Planning Intelligence"): know the commitment → know when the family actually needs to arrive → know normal travel time → account for traffic → tell the family when to leave → understand the usable gap → recommend what fits. Status per stage:

- **Know the commitment** — done (schedule ingestion, 7-platform catalog).
- **Know required arrival** — partial. Team-level only today (`arrival_buffer_minutes` on `corralio_teams`); household/unassigned events and Arbiter-style group-specific preferences are the subject of the filed but not-yet-run 3.6B Stage 1 audit (II.7, II.8).
- **Know normal travel time** — done, non-traffic (Geocodio geocoding + OpenRouteService routing, server-side, capped, audited — Slice 4.3).
- **Account for traffic** — designed, not built (Mapbox checkpoint model, II.13).
- **Tell the family when to leave** — done for the static case (Slice 4.3); traffic-aware version not built.
- **Understand the usable gap** — done (What Fits, Slice 4.6).
- **Recognize tournament/travel context** — partial: TI tournament association exists; the contextual HotelPlanner handoff and lodging-state loop (Phase 3B) is designed, un-deferred, not built.

Notifications exist to deliver this intelligence at the moment it's useful — see II.14 for why that framing matters for what gets built next.

## II.3 Completed Slices / Current Implementation State

Full chronological detail lives in `apps/corralio/notes.md`; this is the load-bearing summary. All "complete locally" verdicts below have passed their own slice's local test suite, TypeScript, lint, and four-workspace production builds, per that slice's closeout entry — none has been independently re-verified in this pass beyond confirming the closeout entry and commit exist.

Slices 3.1–3.5.5 and 4.0A–4.6 (auth, household/child/team foundation, broader sports taxonomy, schedule connection and activation, mobile hardening, schedule freshness, This Weekend, conflict detection, usage measurement, leave-by, location/provisional-venue foundation, Overture Nearby, What Fits) are complete locally, Aug 17–26, 2026 — the full core planning loop described in Part I Sections 10–13 is built and shipped-to-dev.

Beyond that baseline, since 2026-08-27:

- **Slice 3.7 — Arbiter/ArbiterLive schedule sources** (`4d3008b8`, repair `0d5c6cac`, `5e8c652c`) — complete locally. Fixed a real `node-ical` bug (parameterized `SUMMARY`/`LOCATION`/`DESCRIPTION` arrive as `{params, val}` objects, not strings). Populated-feed lifecycle UAT (decline/reassignment/cancellation) remains outstanding — the available sample feed had zero games to exercise those transitions.
- **Schedule Connection UX Unification** (`99d83fd8`, `c48db691`) — complete locally. Catalog expanded to seven platform keys including LeagueApps (household+team) and Arbiter Officials (household-only); `isSchedulePlatformAllowed` rule enforced in both UI pickers and both Server Actions.
- **Household timezone foundation** (`c25f22c6`, `8efcfc82`, `f58dbfce`, `e50ac010`) — nullable `planning_timezone` on `corralio_households`, no backfill. Event/venue timezones remain separate destination truth; leave-by stays absolute. Null-timezone households are notification-ineligible by design, not by bug.
- **Slice 3.6A — Weekend Ready Web Push** — complete locally and database-verified (see II.6 for full detail).
- **HotelPlanner attribution/reconciliation design locked** (`3054d53a`) — design only, see II.11.
- **ADR-030–033 landed** (`5afb3181`) — Mapbox/venue reuse, founder/product gate redefinition, HotelPlanner site provisioning, launch-gate-as-experience-test.
- **Mobile Resilience & Offline PWA added to roadmap as a hard launch gate** (`154f88ef`, `83f772e9`) — roadmap placement only, audit not yet authorized.
- **RI Travel MVP** (`a4256590`, `apps/referee`) — not a Corralio feature, but the TI/RI-side hotel-search precedent Corralio's own Phase 3B design explicitly reuses conventions from.

## II.4 Current Pilot Launch Gates

Only what actually blocks inviting a bounded set of real families — everything else is post-pilot or evidence-gated regardless of how easy it would be to build.

| Gate | Status |
|---|---|
| 3.6B Phase 1 — required arrival for household/unassigned events | Filed, not built |
| 3.6B Phase 2 — Arbiter Officials group-identity audit | Filed, not built (parallel, non-blocking) |
| 3.6B Phase 3A — temporary routing origin | Filed, not built |
| 3.6B Phase 3B — HotelPlanner booking → lodging → routing origin | Un-deferred 2026-08-30; evidence diagnostic filed, not run |
| 3.6B Phase 4 — Mapbox traffic-aware leave-by | Design accepted, not built, depends on Phase 1 |
| 3.6B Phase 5 — traffic monitoring/alerts | Design accepted, not built |
| Mobile Resilience & Offline PWA | Roadmap-placed hard gate, audit not authorized |
| Combined physical-device UAT (iPhone + Android) | Not run |
| ADR-031/033 pre-launch experience test (10–15 real parents) | Not run |
| Weekend Ready push production config (VAPID keys) | Not configured |

Deliberately excluded from this list: schedule-source compatibility matrix, admin/support tooling, visual color customization, CSV/PDF import, SMS, email digest, cost audit, native app threshold. None block a small, founder-supported pilot.

## II.5 Current Critical Path

```
3.6B Phase 1 (required arrival, household/unassigned)
  → Phase 2 (Arbiter identity audit, parallel/non-blocking)
  → Phase 3A (temporary routing origin)
  → Phase 3B (HotelPlanner booking → lodging → routing, un-deferred 2026-08-30)
  → Phase 4 (Mapbox traffic-aware leave-by)
  → Phase 5 (traffic monitoring/alerts)
    → Mobile Resilience & Offline PWA audit + required resilience fixes
      → One combined physical-device UAT (iPhone + Android)
        → ADR-031/033 pre-launch experience test (10–15 real parents)
          → Bounded family pilot
```

Running alongside, not gating this sequence: the Schedule-Source Compatibility Evidence Matrix (ready now) and a future consolidated API/provider cost audit (early post-pilot).

## II.6 Slice 3.6A — Final State & Outstanding Gates

**SLICE 3.6A COMPLETE LOCALLY** and database-verified (`b0495553`, `e6945ca8`). What shipped: exactly one notification — "Your weekend is ready" / "Open Corralio to see your family plan." — containing no child, team, event, schedule, time, location, home/origin, conflict, tournament, or hotel data. Sent once per household per planning weekend, Thursday 4:37 PM household-local time (computed from `planning_timezone`; null-timezone households disabled), via bounded 15-minute UTC cadence workers (`7,22,37,52 2-23 * * 4` and `7,22,37,52 0-6 * * 5`, 116 invocations/week). One 90-minute transient retry; provider-accepted deliveries are terminal; two-level idempotency (one campaign per household/weekend, one delivery per campaign/subscription).

Explicitly **not** built in 3.6A: schedule-change push, Leave Soon alerts, live traffic/Mapbox, SMS, native apps, broad notification preferences, entitlement, notification growth optimization. Email is recorded in the same closeout as "deliberately deferred pending push reach/opt-in and re-entry evidence... not assigned to Slice 3.6B" — see II.21 for why this contradicts a separate document.

Outstanding gates: `CORRALIO_VAPID_PUBLIC_KEY`/`CORRALIO_VAPID_PRIVATE_KEY` are not configured anywhere (confirmed absent from `.env.local`); real iPhone/Android push receipt, iOS Home Screen install, lock-screen presentation, background reliability, and notification-tap handoff are all explicitly `UNVERIFIED ON PHYSICAL DEVICE` in the slice's own closeout notes.

## II.7 Slice 3.6B — Complete Internal Sequence & Dependencies

3.6B is not one slice but five phases plus a parallel audit, sequenced by real dependency, not convenience:

- **Phase 1 — Required arrival, household/unassigned events.** Filed: `docs/prompts/corralio-slice-3.6b-required-arrival-accuracy-audit-prompt.md`, Task 1. Adds a schedule-source-level arrival-buffer override (precedence: source override → team override → default), so an unassigned source like Arbiter Officials can finally carry its own accurate arrival time. Includes a `resolvedFrom` provenance tag (`source`/`team`/`default`, with `group`/`event` reserved for later). Not built.
- **Phase 2 — Arbiter Officials group-identity audit.** Same prompt, Task 2. Parallel, non-blocking. See II.9 — this is a report-only audit, and its finding narrows rather than resolves the question.
- **Phase 3A — Temporary routing origin.** Filed: `docs/prompts/corralio-slice-3.6b-phase3a-temporary-routing-origin-prompt.md`. Home / current-location / choose-another-location, independent of any hotel concept. Not built. Depends on Phase 1 per roadmap sequencing (not a hard technical dependency, but the founder's own ordering).
- **Phase 3B — HotelPlanner booking → lodging → routing origin.** Un-deferred 2026-08-30 (founder decision). Subordinate to Phase 3A's routing-origin contract; does not authorize payment/checkout/OTA work. See II.11–II.12.
- **Phase 4 — Mapbox traffic-aware leave-by.** Design accepted (II.13). Depends on Phase 1 (a trustworthy `required_arrival` is the model's entire input).
- **Phase 5 — Traffic monitoring/alerts (checkpoints).** Same design document as Phase 4, same dependency.

Roadmap placement note (verbatim reasoning from `CORRALIO_PRODUCT_ROADMAP.md`): Mobile Resilience was moved earlier than originally planned — after 3.6B "core planning" (Phases 1, 2, 3A, 4, 5) but explicitly *before* Phase 3B's hotel-origin work, which stays separately gated on Phase 3B's own unrelated prerequisite (a real Corralio-owned HotelPlanner handoff must exist first) regardless of where Mobile Resilience sits in the sequence.

## II.8 Required-Arrival Model

Approved baseline hierarchy (Slice 4.6 decision packet, already shipped, unchanged by 3.6B): **ICS explicit → team preference → Corralio 30-minute default**, with a deterministic 0–180 minute validation window. Phase 1 extends this hierarchy — it does not replace it — by adding a schedule-source-level tier so household/unassigned events (no team at all) can carry their own override, with the precedence: source override → team override → default, plus an explicit provenance tag so Corralio can state *why* a given arrival time is what it is. This applies to every routable household commitment, not only team-affiliated sports events — the prompt is explicit that "the source-level control from Task 1 must work identically for a non-Arbiter household source."

## II.9 Arbiter Officials — Evidence Gap

The founder's proving case: one official working football, soccer, and basketball through different Arbiter groups, each needing a different real arrival time. Two real (sanitized) Arbiter feed exports have been inspected directly (`docs/audits/corralio-arbiter-multi-sport-sample-sanitized.ics` and `-sample-2-team-calendar-sanitized.ics`). Finding: ArbiterSports does not export one consistent format. Sample 1 (an officiating-assignment feed) has a labeled `Sport:`/`Level:`/`Team:`/`Site:` block inside `DESCRIPTION` — real structure, not fuzzy text-matching — but `Sport:` reads the literal value "Tournament" (not the actual sport) for every tournament-type assignment. Sample 2 (a different export path — a team/program schedule, not an officiating feed) has none of those labels at all, only `Site: <value>`. Neither sample actually contains two different real sports for the same official, so the founder's specific proving case remains untested either way. Working conclusion, stated explicitly in the audit prompt rather than left implicit: this increasingly looks like "ArbiterSports has no single consistent export contract," not "one format exists and the right field hasn't been found yet" — which matters for whether to keep investing in automatic group detection at all versus treating Phase 1's manual source-level control as the durable answer. This audit has not yet been run by Codex; Phase 2 is that run.

## II.10 Routing-Origin Hierarchy

Approved shape: **Home (default) → temporary override (current-location or a typed address) → future: a confirmed hotel/lodging booking as a suggested origin.** Phase 3A builds the first two; Phase 3B (un-deferred) builds the third. Explicit privacy discipline for "use current location" (Phase 3A prompt Section 3): permissioned, one-time-per-use, no background tracking, no periodic re-polling, no raw coordinate history — if anything is persisted at all, it is the derived resolved-origin result for an in-flight calculation, expired plainly, never an ongoing live-tracking capability. This is explicitly called "the most privacy-sensitive surface Corralio has built to date."

## II.11 HotelPlanner Monetization, Attribution, Reconciliation, Lodging & Cancellation Design

**Monetization is launch-relevant, not deferred** — founder decision, 2026-08-30: "HotelPlanner Phase 3B is explicitly un-deferred and launch-relevant." ADR-032 (accepted) provisions three Corralio-branded HotelPlanner sites ahead of launch — `corralio.hotelplanner.com` (Standard/no fee), `corralio-support.hotelplanner.com` ($5/night), `corralio-supportplus.hotelplanner.com` ($10/night) — as infrastructure only; it does not decide whether Corralio ships hotel recommendations at all (governed by ADR-031/033's experience-gate), which fee tier production traffic uses (Standard by default; $5/$10 tested only after the gate), or whether hotel commerce can subsidize free access (an open, unproven hypothesis).

**Attribution stays separate from events, opaque, and single-use** (locked design, `docs/reference/corralio-hotelplanner-attribution-design.md`): every Corralio-originated HotelPlanner URL carries `source = "corralio"` (mirroring TI's own `"tournamentinsights"` value in the same field) plus a fresh, opaque, single-use token in `Custom3` (`attr:{32-hex-id}`, generated per outbound click, same format/regex TI already uses). The household's real, persistent UUID is never put in the URL or Custom field — the token maps to a household only inside a Corralio-owned table, resolved at reconciliation time. This is a deliberate anti-correlation choice: a stable identifier in a URL persists indefinitely in browser history and HotelPlanner's own systems; a single-use opaque token does not.

**Confirmed booking → private lodging state → parent planning confirmation → routing-origin candidate** is the intended flow, but only reconciliation (booking confirmation) is currently designed — the "surface it as a lodging option in the plan" and "offer it as a routing origin" steps are Phase 3B's actual build scope, not yet written as an executable prompt.

**Reconciliation mechanism (chosen, Option 2 of three considered):** a scheduled `getReport` pull on a bounded cadence (target 15–30 minutes), reusing the exact `FOR UPDATE SKIP LOCKED` bounded-claim pattern already proven twice (schedule refresh, Weekend Ready) — not a new scheduling primitive. Rejected alternatives: doing nothing (next-day latency via the existing once-daily batch job) and taking over the booking step itself (`reserve`/`confirm3DSReservation` — genuinely instant, but requires raw card fields with no tokenized alternative in this API, which would put Corralio in real PCI-DSS scope; TI's own implementation notes already reject this path for MVP, and this design explicitly defers that as "a separate, company-level decision... not a routing-origin decision").

**Cancellation is launch scope, not a follow-on** — per the founder's 2026-08-29 direction reviewed in this session: cancellations must be handled at launch, and the correct behavior is to **suppress a cancelled booking from the plan, never delete the underlying record** (preserves audit trail and attribution history; a delete would also destroy revenue-reconciliation evidence). Purchase reconciliation and cancellation reconciliation are **separate query windows** — `purchasedDateStart/End` for new bookings, `cancelledDateStart/End` + `includeCancelled: true` for cancellations — not one combined query, because the vendor API itself requires at least one explicit date-range parameter per call and conflates neither concept.

**Targets, founder-set:** ≤30-minute booking recognition during waking hours (drives the 15–30 minute polling cadence above), and four cancellation checks per day (a lower-frequency separate cadence than purchase polling, since a missed cancellation is lower-urgency than a missed new booking).

## II.12 Current HotelPlanner TEST-FIRST Gaps

Founder's four required evidence items before Phase 3B converts from design to an executable Stage 1 prompt:

1. **Textual status contract** — `getReport`'s `Status` field is a string; the locked design's reconciliation rule (`status === 1`) was empirically derived from `getClientSummary`'s *numeric* field and does not apply. **Not yet corrected in the design doc.** TI's own production code already branches on `status.toLowerCase() === "confirmed"` / `.includes("cancel")`, but this has never been formally enumerated against real historical data. Diagnostic filed (`6fd64ffb`), not run: a read-only SQL query against `ti_hotel_bookings` grouping by `status`/`cancel_date`.
2. **Cancellation-window query-shape evidence** — whether `cancelledDateStart/End` + `includeCancelled: true` actually filters the way the vendor's one-line doc description implies. Same diagnostic, Task B: one live `getReport` call against a known real cancelled TI/Referee booking (no Corralio-attributed booking exists yet to test against, so this verifies query mechanics only, not Corralio-specific attribution matching).
3. **Property coordinates for a booked hotel** — **resolved, no diagnostic needed.** Direct code audit found `apps/ti-web/lib/lodging/hotelPlannerProvider.ts` already reliably parses `lat`/`lng`/`addressLine1` from live search/availability responses via defensive fallback chains, tested against realistic fixture data with real coordinates. Recommendation: capture coordinates at outbound-click time (when Corralio already has live search results), not via a later Hotel-ID lookup or new geocoding path.
4. **Phase 3A must ship first** — a sequencing fact, not evidence to gather. Recorded, not yet satisfied (Phase 3A is filed, not built).

## II.13 Mapbox Traffic-Aware Planning Direction

**Provider: Mapbox, not TomTom** (2026-08-27 audit, verified against both vendors' own pricing/terms pages). Mapbox: 100,000 free requests/month (5x TomTom's verified 20,000), transparent published pricing ($2.00/$1.60/$1.20 per 1,000 above tiers, no traffic surcharge), an existing account relationship in this monorepo (`apps/ti-web` already uses `MAPBOX_ACCESS_TOKEN` for Static Images, though never for Directions). At 1,000 activated families, Corralio's traffic-aware volume plausibly runs entirely free on Mapbox while the same volume would already be in TomTom overage; at 10,000 families, Mapbox costs an estimated $700–$1,040/month.

**Architecture: compute-on-demand, never persisted.** A traffic-aware duration is a fact about a location pair *at the moment it was requested* — not a durable property like the existing static route estimate. Design: fetch live only at trigger moments (before a "traffic is building" push, or on app foreground within a bounded pre-event window), display with an "as of [time]" stamp, hold client-side ~10 minutes without re-asking, cap 2–3 refetches per event, never write to a column another render could read back as current. This satisfies both Mapbox's and TomTom's caching-terms restrictions regardless of which provider is ultimately used, and is simpler than the originally-sketched persist-with-a-TTL approach.

**Checkpoint model (founder-proposed, CPO-accepted with 5 refinements)** — full detail in `2026-08-28-slice-3.6b-traffic-check-model.md`: anchor on standard (non-traffic) departure time; check at 90/60/30/15 minutes before it; recompute traffic-aware departure at each checkpoint; notify only on a material shift (~5–10 minute guardrail) or if the new leave-by beats the *next* scheduled checkpoint (fire immediately rather than wait). Refinements folded in: (1) short-notice events need a skip-past-checkpoints-and-check-once rule; (2) the terminal (15-min) checkpoint has no "next checkpoint" to race against — apply only the material-difference guardrail there; (3) the scheduling mechanism itself needs its own audit — reuse the proven periodic-worker-polling pattern, not a new per-event timer; (4) the cost estimate must be recomputed against the actual 4-calls-per-event cadence, not the rougher earlier estimate; (5) two silent scope decisions made explicit — notify only when traffic worsens, never when it improves; no cross-event notification consolidation for V1.

**Dependency:** this entire model's output is only as trustworthy as its `required_arrival` input — the build prompt should not be written until Phase 1 ships.

## II.14 Notification Strategy

Founder framing, adopted: notifications exist to deliver planning intelligence at the moment it's useful — "know the commitment, know when to arrive, account for traffic, tell the family when to leave" — not as a re-engagement/retention gimmick bolted on afterward. This reframes what "good" looks like: a notification earns its place by being the right information at the right moment, not by maximizing send volume or open rate.

Current state: Weekend Ready (generic, content-free) is the only notification shipped (II.6). Schedule-change push, traffic-aware "leave by" pushes, and "Leave Soon" live-countdown pushes are all designed or classified but unbuilt — see II.21 for the schedule-change push's specific unresolved status. **What Fits proactive notifications are explicitly deferred** — not started, not in the current build sequence, consistent with the discipline of proving utility before adding more notification surface rather than assuming more notifications create more value.

**Daily snapshot email/SMS (proposed, not yet designed or built, founder direction 2026-08-30):** a periodic email/SMS digest is where Standard-tier static leave-by lives (II.17) — e.g., "4 events Saturday at 3 venues. First leave-by 7:42 AM." This is a materially richer piece of content than Weekend Ready's deliberately content-free push, and would need its own build prompt, its own UAT, and explicit application of `CORRALIO_SECURITY_PRIVACY.md`'s Email/SMS retention sections before it ships — it is not an extension of 3.6A, and nothing about it is authorized to build yet.

## II.15 Mobile / Network-Survivability Requirements

Hard launch gate, stated as outcomes rather than a checklist (founder, 2026-08-29): Corralio must retain a useful last-known weekend plan through temporary connectivity loss, disclose stale/live state honestly, and recover safely without duplication or destructive synchronization. **This explicitly does not require full offline writes or a delta-sync engine** — the audit's job is to find the smallest implementation achieving those outcomes, not to build a distributed-systems project before pilot. Canonical direction: server-authoritative intelligence + locally hydrated PWA + targeted synchronization; the client stays fast and useful offline, but the planning/business engine is never reproduced in the browser. Required outcomes: cached/readable This Weekend plan, event times, venue info, required-arrival info, last-known leave-by, applicable lodging/origin, explicit freshness disclosure ("Schedule updated 22 min ago," "Traffic unavailable offline"), graceful offline state, safe reconnect with no duplicate/destructive sync. P2/not-required-without-evidence: general offline-write queue, offline mutation of any kind, conflict-resolution sync. Physical-device requirement: representative iPhone and midrange Android, real network transitions (Wi-Fi → cellular → weak/no service → airplane mode → restored) — browser emulation is supplemental only. Audit prompt not yet authorized — follows once 3.6B core planning (Phases 1/2/3A/4/5) is done, per founder instruction.

## II.16 Schedule-Source Compatibility State

Seven-platform catalog live (GameChanger, TeamSnap, Stack Team App, ArbiterLive, Arbiter Officials, LeagueApps, Other calendar). LeagueApps is `COMPATIBLE`, not `VERIFIED` — its documented old-`RESCHEDULED`-plus-new-event reschedule behavior has not been exercised against a representative Corralio-side feed; the exact parent-facing caveat already ships. Arbiter Officials' decline/reassignment/cancellation lifecycle is similarly untested against a populated feed. A structured Schedule-Source Compatibility & Evidence Matrix is fully specified and ready to send to Codex (`docs/prompts/corralio-schedule-source-compatibility-evidence-matrix-prompt.md`) — its one prerequisite (UX Unification) is satisfied; it's internal data-model work with no parent-facing surface, non-blocking to anything else.

## II.17 Standard / Pro / Travel Monetization Boundaries — Current Status

Part I's hybrid model (Standard + Pro + Travel) stands. **Traffic-aware leave-by is Pro; static/estimated leave-by is Standard — final founder decision, 2026-08-30.** This moved twice in one day and the full trail is preserved rather than compressed away: (1) `dc10c888` and the 2026-08-27 notification/traffic-routing audit (Section 3A) originally argued Standard for V1 — reasoning: no Pro/billing/entitlement infrastructure exists anywhere in `apps/corralio`, paywalling an untested feature is what ADR-011 warns against, and gating the *only* leave-by experience behind Pro would leave Standard users with nothing on a core utility. (2) This document's own Part I corrections, made earlier the same day at the founder's request, followed that reasoning. (3) The founder then explicitly overrode both, given the emerging ambient/multi-surface model (`docs/corralio/cpo/2026-08-30-cpo-response-ambient-multisurface-strategy.md`): static leave-by is delivered to Standard through a periodic snapshot email/SMS — a real, shipped-or-shippable Standard value, not nothing — while Pro's traffic-aware, checkpoint-based, live-updating version (II.13) is exactly the "helps manage what's happening" complexity Pro exists to monetize. This resolves reasoning (1)'s core objection without needing to keep traffic-aware in Standard. `CORRALIO_PRODUCT_ROADMAP.md` never actually changed on this point — its V2 "Corralio Pro testing" section listed traffic-aware leave-by as Pro-potential throughout; only this handoff briefly deviated from it and has now been corrected back into agreement. No entitlement/billing infrastructure exists yet regardless (ADR-011 still governs timing — this is a target-tier decision, not authorization to build billing now). HotelPlanner sites are provisioned at three fee tiers (II.11), but production traffic runs Standard/no-fee until the $5/$10 tiers are explicitly tested post-gate.

## II.18 Privacy / Security Boundaries — Execution Notes

Part I Section 15's boundary (household data never becomes public TI data or venue evidence) is unchanged and further reinforced by two 2026-08 mechanisms: the household timezone foundation (nullable `planning_timezone`, no event/venue/home-address/browser-history value can silently set it) and the HotelPlanner attribution design's opaque single-use token (no persistent household identifier ever enters a URL or third-party Custom field). Phase 3A's "use current location" is the most privacy-sensitive surface built to date and is explicitly one-time-per-use with no background tracking (II.10). RLS scoping is applied identically to every new capability described in this Part II — no new field or table introduced this cycle has been designed with a broader read/write surface than its nearest existing analog.

## II.19 Explicit Deferred Items / Non-Goals (current specific list)

Beyond Part I Section 20's policy-level list, the following are specifically classified DEFER or POST-PILOT BACKLOG as of this reconciliation, each with a stated reason rather than by default: child color editing and team color coding (no evidence of parent confusion yet; color-editing has no UI today regardless); CSV import (real but secondary given ICS already covers the pilot population); PDF import (needs genuinely new extraction infrastructure — none exists); external personal-calendar OAuth (an informal ICS-paste version may already work via the existing "Other calendar" tile); SMS infrastructure and the entitlement/Pro model (both gated on push+email proving the retention hypothesis first, and on ADR-011's no-entitlement-before-evidence rule); What Fits proactive notifications (II.14); admin/support tooling and a consolidated cross-provider API cost audit (both real gaps, neither blocking a 10–15 family pilot). Full detail: `docs/corralio/cpo/2026-08-30-founder-backlog-reconciliation.md`.

## II.20 Current Founder Investigation Backlog

On 2026-08-30 the founder supplied a ~34-item raw investigation/backlog list spanning admin tooling, visual UX, HotelPlanner, schedule import, schedule-source ecosystem, routing/travel, traffic/Mapbox, notifications, API economics, and native-app threshold, with instructions to classify rather than build. Headline finding: roughly two-thirds of those items trace to work already scoped, filed, or explicitly deferred elsewhere in this document — the genuinely new ground was admin/support tooling (nothing exists), visual color customization (child color exists but isn't editable; team color doesn't exist), and a consolidated cross-provider cost audit. Full classification (7-status taxonomy, per-item evidence pointers, pilot launch gates, post-pilot backlog, and the founder decisions/conflicts below) is filed at `docs/corralio/cpo/2026-08-30-founder-backlog-reconciliation.md` — this Part II does not duplicate it, only cites its conclusions where directly relevant (II.4, II.19, II.21).

## II.21 Open Contradictions / Founder Decisions Required — Not Silently Resolved

These are stated as open, not resolved, per explicit instruction. Do not pick a side in a future session without the founder's actual input on each.

1. **Email channel status.** The 2026-08-27 notification/traffic-routing audit classifies email as launch-required ("not a cost-minimization move — a structural reach gap. iOS push is inert for any parent who hasn't installed to Home Screen"). 3.6A's own closeout notes (`apps/corralio/notes.md`) record email as "deliberately deferred pending push reach/opt-in and re-entry evidence... not assigned to Slice 3.6B." These are two different, both currently-live claims about the same decision.
2. **Schedule-change push disposition.** Classified "launch if technically clean" by the same audit ("Technically clean here means a small, bounded server-side diff on the existing daily refresh path... actually gets built and proves reliable"), but it is absent from the locked 3.6B phase sequence (II.7) with no recorded deferral decision. Confirmed via direct grep: no diffing/change-detection logic exists in `apps/corralio/lib/schedules/refresh.ts` today — it upserts only. This looks like a silent drop, not a considered deferral.
3. **ADR-024 amendment.** ADR-024 ("Routing Infrastructure Must Be Server-Side and Cost-Controlled") still reads, unchanged: "Provider selection and retention remain open." But the Mapbox selection and the compute-on-demand/no-persistence architecture (II.13) are an accepted, detailed CPO decision sitting entirely outside the canonical ADR file — the same kind of citation drift ADR-030–033 already had to be reconciled for once. The 2026-08-27 audit itself recommends amending ADR-024 rather than minting a new number; that amendment has not been made.
4. **HotelPlanner status-contract bug.** The locked attribution design (`docs/reference/corralio-hotelplanner-attribution-design.md` Section 7) still states the reconciliation rule as `status === 1` — correct for `getClientSummary`, wrong for `getReport`, which the design elsewhere selects as the primary mechanism and which returns `Status` as a string. This is a real defect sitting in a "locked" design document, not yet corrected, pending the evidence diagnostic in II.12.

## II.22 Phone-First Authentication — Founder Decision, 2026-08-30

**Founder decision, overriding this document's own prior framing:** email must not be required for account creation, authentication, household access, or the full Corralio web experience. This reverses how the SMS-first addendum to the HeySammi review (`docs/corralio/cpo/2026-08-30-cpo-review-heysammi-addendum-sms-first.md`) treated the same repository fact two exchanges earlier — that addendum found Corralio's Supabase Auth is entirely email-keyed (`SUPPORTED_OTP_TYPES` excludes phone) and read that as a constraint an SMS-originated user would have to work around (capture an email eventually). The founder's explicit instruction: treat that as evidence about today's implementation only, not a product requirement, and make the auth layer itself phone-capable.

**Audited and designed, not yet built:** `docs/corralio/cpo/2026-08-30-cpo-investigation-phone-first-authentication.md`. Headline finding: this is a smaller change than it sounds like, because household creation (`corralio_ensure_owner_household()`, a `security definer` RPC keyed purely on `auth.uid()`) has never had any email-specific step — a phone-authenticated Supabase session flows through the identical household/RLS logic with zero changes. The net-new work is entirely in the auth layer: enable Supabase's native phone-OTP auth, deliver the OTP through Telnyx (not Twilio) via Supabase's Send SMS Hook — which decouples the auth-provider choice from the SMS-vendor choice — and build a link-based "magic link" UX as a thin wrapper around the same OTP verification (the code travels embedded in the link's query string and auto-submits on load), rather than inventing a second, parallel token system.

**Unchanged by this decision:** the authentication-vs-authorization distinction (verified phone proves reachability, not household access; household membership/RLS remains authoritative) is *strengthened*, not weakened, by making phone a valid credential — it was already the governing principle for the SMS/email channel-identity work, and this decision makes it Corralio's actual auth boundary rather than a design aspiration layered on top of email. One accepted, explicitly documented residual risk: phone-number recycling by carriers is a real, industry-wide weakness of any phone-based auth (a reassigned number could let a new owner authenticate as the original household) — not a defect in this design, and not something to over-engineer a defense against before there's usage evidence it matters, but something `CORRALIO_SECURITY_PRIVACY.md` should name explicitly rather than leave implicit.

**Sequencing:** slots into Phase A (verified channel identity) of the priority-channels investigation (`2026-08-30-cpo-investigation-email-sms-priority-channels.md`) — the auth and channel-identity work are the same underlying capability and should be scoped as one build prompt, not two. Does not touch the 3.6B critical path.

## II.23 Critical Path Fork Confirmed — Channel/Auth Work Authorized (2026-08-30)

**Founder decision, same day as II.22, refining and confirming the priority-channels investigation's recommended slot.** The critical path forks after 3.6B Phase 1 ships:

**Phase 1 -> { Channel/Auth Phase A+B (phone-first identity + deterministic email/SMS intake)  ||  3.6B Phase 2 (Arbiter group-identity audit)  ||  HotelPlanner Phase 3B evidence diagnostic } -> resume 3A -> 3B -> 4 -> 5.**

Dispatch order, founder's explicit words: "Send Stage 1 first." HotelPlanner's diagnostic runs in parallel with no reason to wait. Channel/Auth Phase A+B follows Stage 1. Phase 2 (Arbiter audit) "remains parallel/non-blocking... don't sacrifice it, just don't let it hold up channel/auth work" — a correction of the prior recommendation's "alongside/instead of Phase 2" framing to "alongside, full stop."

**Why this is now foundational, not a side project, in the founder's own words:** "SMS/phone isn't feature creep anymore: it changes how families enter Corralio, while Phase 1 determines whether the planning information they receive is trustworthy. They reinforce each other." This reframes Channel/Auth from a notification-delivery convenience to activation infrastructure on par with Phase 1's role in the core loop.

**Binding scope guardrail on the Phase A+B build prompt (not a recommendation — a founder instruction):** establish phone auth/channel identity and deterministic schedule intake cleanly; explicitly do not build the full SMS onboarding conversation yet. Reasoning, verbatim: "We've just identified that the exact onboarding contract depends on inference, arrival handling, secure-origin capture, and source evidence. Keep those separable so we don't bake today's conversational assumptions into the infrastructure." Concretely: inference (sport/team auto-detection maturity) isn't proven, arrival handling is Stage 1 itself and still in progress, secure-origin capture is Phase 3A and not yet built, and source evidence is the Schedule-Source Compatibility & Evidence Matrix, filed but not run. The build prompt (`docs/prompts/corralio-phase-a-b-phone-auth-schedule-intake-prompt.md`) ships the infrastructure with a deliberately plain, explicit confirmation UX rather than the fuller inferred-copy conversation sketched in earlier CPO review documents — that richer conversation is a separable follow-on once its dependencies land, not something to design around prematurely.

**SMS-first destination is preserved regardless of build order** — email shipping first within Phase B is purely an A2P/10DLC carrier-lead-time execution fact, not a strategic demotion, per the same distinction already drawn in the SMS-first addendum (II.22's cross-referenced documents).

## II.24 SMS Schedule Onboarding Contract, Codex Security Review, and CALNAME Micro-Slice — Founder Decisions, 2026-08-31

Three linked founder decisions closing out the Phase A+B review cycle, same day:

**1. SMS Schedule Onboarding Contract accepted as the formalized state machine.** `docs/corralio/cpo/2026-08-31-cpo-decision-sms-schedule-onboarding-contract.md` formalized the state machine, data contract, message budget, team/source identity rules, arrival rules, secure-origin flow, platform instruction matrix, failure behavior, and measurement funnel the founder requested, treating phone-first auth and SMS-first activation as already-settled (not reopened). Key repository findings from that review: platform cannot be auto-detected from a URL today (the existing `platforms.ts` catalog is a picker, not a detector); no calendar-level ICS metadata was being read at all (leading directly to decision 3 below); and the existing web flow already connects schedules unassigned-first and assigns child/team afterward via `updateScheduleAssignment()` — confirming "import first, enrich progressively" is already how the product behaves, not a new pattern to invent for SMS.

**2. Codex security/architecture review of the Phase A+B prompt accepted in full, 12 corrections.** Manual SMS OTP only for V1 (no tap-to-verify links — nothing may ever place a phone number, OTP, or session material in a URL); calendar/subscription URLs only, no `.ics` attachments; a real bounded pending-intake state machine for ambiguous association (never silently defaulting to "connect unassigned"); a shared channel-identity table and shared ingestion core so inbound handlers never impersonate a user; inbound email `From` alone is not authentication; a full webhook-security requirement list; and — per a same-day follow-up — **SMS Production Readiness promoted to its own independent gate**, explicitly not satisfied by code completion or database verification. Founder's own framing, verbatim: *"Neither code completion nor database verification authorizes production SMS."* Full detail in the build prompt itself (`docs/prompts/corralio-phase-a-b-phone-auth-schedule-intake-prompt.md`, v2).

**3. ICS calendar-level metadata (CALNAME) micro-slice accepted, Do Now.** `docs/corralio/cpo/2026-08-31-cpo-audit-ics-calendar-metadata.md` found that `node-ical` already parses `X-WR-CALNAME` on every schedule import and the code simply discards it (`normalizeIcsSchedule()`, `packages/lib/sports-schedule/index.ts:409-412`). Founder-accepted risk framing: the one real fixture evidence available (`"ArbiterSports"`) is itself the cautionary example that calendar-level metadata may identify the vendor, not the team — so the standing product rule is **"CALNAME can reduce questions; it cannot independently establish team/sport truth."** Filed as its own small, independent build prompt (`docs/prompts/corralio-ics-calendar-metadata-preservation-micro-slice-prompt.md`) carrying a binding acceptance rule, founder's exact words: *"Preserve calendar-level metadata and provenance; do not derive or persist canonical team/sport values solely from `X-WR-CALNAME`. Any inference must remain confidence-scored and fall back to parent confirmation."* Soft prerequisite for Phase A+B's Section 6.4, not a blocker — Section 6.4 degrades gracefully (falls back to per-event-title-text-only inference) if this hasn't landed yet.

**Net effect: the Phase A+B review cycle is closed.** Founder's own words: *"I would move forward with Phase A+B rather than opening another investigation cycle. The architecture is converging; the next leverage is implementation and real-feed evidence."* Phase A+B (v2, corrected) is founder-reviewed and accepted, ready to send to Codex once the CALNAME micro-slice lands (soft prerequisite) and 3.6B Stage 1 ships (confirmed critical-path dispatch order, II.23).

## II.25 What Happens Next

See `CORRALIO_CPO_EXECUTION_STATE.md`, "NEXT 6 ACTIONS." In one line: run the filed 3.6B Stage 1 audit, the filed HotelPlanner evidence diagnostic, and the filed CALNAME micro-slice (all independent of each other, all ready today); following Stage 1, send the filed and now-accepted Phase A+B build prompt; get the founder's ruling on the four items in II.21; then proceed down the critical path in II.5 phase by phase as each phase's dependency clears.
