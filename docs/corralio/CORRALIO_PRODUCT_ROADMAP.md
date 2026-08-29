# Corralio Product Roadmap

**Status:** Canonical product strategy
**Last reviewed:** August 20, 2026

## Product boundary

TournamentInsights owns public tournament intelligence and acquisition. Corralio owns personalized sports-family planning.

TournamentInsights remains responsible for tournament discovery, search and public pages; canonical tournament and venue intelligence; SEO acquisition; tournament-director relationships; public tournament travel surfaces; and existing HotelPlanner tournament programs.

Corralio owns households, children, teams, connected schedules, personal events, **This Weekend**, conflicts, leave-by guidance, personal tournament weekends, family logistics, personalized travel context, and recurring family planning.

Corralio planning uses a broader sports taxonomy than TournamentInsights tournament intelligence. The planning taxonomy includes `baseball`, `softball`, `soccer`, `basketball`, `volleyball`, `hockey`, `lacrosse`, `football`, `tennis`, `swimming`, `gymnastics`, `track_field` (Track & Field), `golf`, `wrestling`, `cheer`, `dance`, and the bounded sports-only fallback `other`. Adding a sport to Corralio does not make it eligible for TI enrichment.

TI matching is optional and capability-gated. An absent or failed match must not suppress the private event, its raw location, or ordinary Corralio planning. Imported events derive their sport from the connected schedule source; manual-event sport modeling is deferred. Teams remain optional planning structure, and explicit source-to-child/team assignment remains a separate product slice.

> Public tournament information belongs in TournamentInsights. Once sports information becomes part of a family's personal plan, Corralio should own the planning experience.

TI and RI create value today. Corralio inherits proven capabilities over time; it does not replace TournamentInsights or RefereeInsights.

## Positioning and product thesis

- **Brand:** Corralio
- **Descriptor:** The planner built for sports families.
- **Core promise:** Every kid. Every team. One plan.
- **Marketing concept:** Corral your sports chaos.
- **Differentiation:** Team apps organize the team. Corralio plans across the family.
- **Emotional outcome:** We've got the weekend figured out.

These statements guide product intent; they are not substitutes for product requirements.

The product thesis is:

- Schedules create frequency.
- Planning creates differentiated value.
- Tournament and travel context creates monetizable intent.

Corralio is not intended to become another calendar, tournament directory, team-management platform, or travel site. Schedule aggregation is the starting point, not the entire product.

## Primary recurring experience: This Weekend

The home experience should lead with the family's next sports weekend, not a blank monthly calendar.

```text
Multiple children + multiple teams + multiple schedule sources
                              ↓
         Games + practices + tournaments + locations
                              ↓
        Conflicts + leave-by + tournament context + travel
                              ↓
                       One family plan
```

## V1 — Prove the Habit

### Objective

> Determine whether sports families will connect multiple schedules, use Corralio to understand their weekend, and return repeatedly because the product makes family sports logistics easier.

### Household foundation

- Establish an explicit Corralio authentication and profile boundary.
- Support one household with one owner.
- Support children, teams, and household-owned private planning data.
- Support a protected home/default origin.
- Enforce household ownership with appropriate RLS.
- Do not require complex household collaboration for initial activation.

### Schedules

- Reuse proven ICS/iCal ingestion capabilities.
- Provide manual event fallback.
- Support multiple children and teams.
- Normalize events and handle duplicates.
- Expose schedule freshness and error states.
- Preserve source and raw location information where appropriate.

Direct TeamSnap, GameChanger, and SportsEngine API/OAuth integrations are not required for V1 if ICS coverage is sufficient.

### This Weekend

- Family-first weekend feed
- Games, practices, and tournaments
- Child/team visual differentiation
- Basic overlap conflicts
- Locations and directions
- Basic estimated leave-by with an arrival buffer

### Leave-by V1

V1 may calculate:

```text
event start - estimated drive duration - arrival buffer = estimated leave-by
```

Traffic-aware routing is not required for V1. Non-live results must be labeled as estimates.

### Tournament intelligence

- Explicit association with a TI tournament
- Conservative inferred association where appropriate
- Tournament and venue details from TI
- Official tournament links
- Weather when useful and appropriate

TournamentInsights remains authoritative for canonical tournament data.

Tournament intelligence is enrichment rather than a prerequisite. Sports outside TI coverage remain fully valid Corralio planning sports and must degrade to the ordinary private event experience without a product error.

### Travel

- Present contextual HotelPlanner handoffs.
- Reuse existing trusted attribution and Hotel Program resolution.
- Preserve TI attribution where commercially appropriate.
- Do not create a duplicate Corralio HotelPlanner commercial implementation.

### Venue behavior

- Preserve the raw schedule location.
- Attempt conservative canonical venue matching.
- Link only high-confidence matches.
- Leave unresolved values as raw event locations.
- Do not automatically create canonical venues.
- Do not make the full venue-candidate workflow a V1 launch dependency.

### Interactive demo

**See Corralio in action** is a V1 marketing and activation asset, not a blocker for the core planner launch.

- Use a read-only synthetic family and no real user data.
- Require no authentication.
- Present the experience in a mobile-device frame.
- Reuse real Corralio presentation components where practical.
- Show multiple children and teams, a conflict, estimated leave-by, tournament context, and travel.
- Allow only limited interactions that help explain the product.
- End with a clear path into real onboarding.
- Launch on the Corralio homepage first; consider selected TI acquisition pages later.
- Never create private data, venue observations, or venue-candidate evidence.
- Do not let the demo become a second editable planner.

### V1 success measures

- Account and household created
- First schedule connected
- Multiple schedules connected
- Multiple children or teams added
- **This Weekend** viewed
- Weekly return
- Conflict engagement
- Leave-by engagement
- Tournament engagement
- Hotel click-through
- Attributable booking behavior
- Revenue per activated family, where measurable
- Demo opened
- Demo interaction
- Demo-to-onboarding conversion

The primary behavioral question is:

> Do families with multiple connected schedules come back because Corralio makes the weekend easier to manage?

App installs and raw registrations are supporting measures, not the primary success metric.

## V2 — Make Corralio Intelligent

V2 scope is hypothesis-driven and should follow evidence from V1.

### Household collaboration

- Second adult or household member
- Invitations and roles
- Shared editing
- "Who's taking whom"

### Planning intelligence

- Travel-time-aware conflicts
- Better leave-by guidance
- Team- or sport-specific arrival buffers
- Per-event origin overrides
- Schedule-change impact analysis
- Smart weekend briefings
- More useful conflict resolution

### Routing

- Cached server-side route duration
- Traffic-aware routing where economically justified
- Staleness indicators
- API cost controls

### Tournament intelligence

- Better inferred tournament matching
- Match provenance and confidence
- Tournament discovery inside Corralio
- **Add to my plan**

### Venue intelligence

- Restricted venue observations
- Candidate venues and provenance
- Alias suggestions
- External provider/place identities
- Trusted administrative review
- Canonical promotion only through trusted TI/RI/shared services

### Travel intelligence

- Recommendations informed by origin, distance, first game, venue, and tournament dates
- Better contextual HotelPlanner presentation
- Saved lodging and travel context

### Corralio Pro testing

Potential value includes traffic-aware leave-by, advanced conflict intelligence, household coordination, schedule-change intelligence, smart briefings, advanced alerts, and advanced travel intelligence. Exact entitlements and pricing are not finalized.

## Launch Readiness — Mobile Resilience & Offline PWA (added 2026-08-29, resequenced 2026-08-29)

> **Founder launch requirement (2026-08-29):** Corralio will not progress beyond a tightly controlled pilot until the physical mobile experience and network survivability are excellent. Browser-responsive compliance is insufficient. The product must remain useful during realistic sports-family connectivity conditions, including weak cellular service and temporary loss of network. The bounded/tiny pilot itself may proceed on the sequence below; anything beyond that pilot — a larger cohort, general availability — is gated on this bar being met, not merely attempted. "Excellent" should be given a measurable definition via the audit's own success measures rather than left as an adjective.

Audit-first launch-readiness item, not authorization for a comprehensive offline synchronization system. It protects value already built rather than adding new intelligence.

**Roadmap placement (resequenced, current slice sequence):** Slice 3.6A ✓ (Weekend Ready Web Push, complete locally) → required-arrival foundation (Slice 3.6B Phase 1 + Arbiter identity audit) → Slice 3.6B core planning (routing origin, HotelPlanner attribution, Mapbox traffic-aware leave-by, traffic monitoring/alerts) → **Mobile Resilience & Offline PWA: audit, then its P1 launch-blocking fixes** → physical-device end-to-end launch UAT (single combined pass covering 3.6A push/tap-handoff, 3.6B arrival/routing/traffic, and this workstream's offline/reconnect matrix) → tightly controlled/tiny pilot. Moved earlier than originally proposed (previously: after all of 3.6B) — the founder's own updated sequencing, and it has a real technical benefit beyond just founder preference: Phase 4/5's traffic-aware and traffic-monitoring work can be built against an already-settled freshness/staleness UI pattern from the start, rather than needing a second retrofit pass after the fact. (CPO note: "Slice 3.6B core planning" is read here as everything buildable now — Phase 3A temporary routing origin, Phase 4 Mapbox traffic-aware leave-by, Phase 5 traffic monitoring/alerts — excluding Phase 3B's hotel-origin auto-suggestion, which stays separately deferred on its own unrelated gate (a real Corralio-owned HotelPlanner handoff feature must exist first) regardless of where Mobile Resilience sits in this sequence. Flag if that reading is wrong.) Do not interrupt in-progress 3.6B work mid-slice to start this early unless the audit surfaces a prerequisite architectural blocker.

**Launch question:** if a parent loses connectivity during a sports weekend (fields, gyms, rinks, tournament complexes, hotels, road trips), can they still see enough of the plan to know where they need to be? A temporary connectivity loss should not reduce the product to an empty screen or a permanent loading state.

**Canonical direction:** server-authoritative intelligence + locally hydrated PWA + targeted synchronization. The client stays fast and useful with poor connectivity; Corralio's planning/business intelligence stays server-authoritative. Do not reproduce the planning engine in the browser.

**P1 (audit and, if necessary, enable):** cached/readable This Weekend plan, event times, venue names/addresses, required-arrival info, last-known leave-by, applicable planned lodging/origin, explicit freshness/staleness disclosure (e.g. "Schedule updated 22 min ago," "Traffic unavailable offline"), graceful offline state, safe reconnect/refetch, no duplicate/destructive sync after reconnect. Real-time information must never masquerade as current when offline.

**P2 — hypotheses, not launch requirements without evidence:** general offline-write queue, offline notes/checklist mutation, hide/unhide sync, offline origin changes, conflict-resolution sync, sophisticated merge logic. Read resilience matters more than offline mutation for launch.

**Explicitly preserved, not reopened by this audit:** Slice 3.5.5's approved schedule-refresh cadence (4-hour cron plus 3-hour freshness-eligibility gate — confirmed current in `apps/corralio/vercel.json`). Any 15–30/30–60 minute polling cadence is a future hypothesis only, requiring its own separate evidence-based decision.

**Server/client boundary:** server remains authoritative for schedule ingestion/normalization, event identity, schedule-change/cancellation semantics, required arrival, routing-origin decisions, HotelPlanner booking/lodging state, traffic-aware routing, What Fits, notification decisions, entitlement decisions, and source freshness/health. Client may own rendering, bounded local filtering/sorting, local countdowns, permissioned current-location capture, cached planning snapshots, offline/stale presentation, and lightweight reconnect behavior. (CPO note: verified directly — the current "This Weekend" implementation already respects this boundary; `apps/corralio/app/page.tsx` computes leave-by/freshness server-side via `loadWeekendData()` before the client component renders it, with no client-side raw Supabase querying found. This reduces this workstream's risk: the primary open question is how to cache already-correct server output, not how to fix a leaky boundary.)

**Physical-device requirement:** representative iPhone and midrange Android, testing real network transitions (Wi-Fi → cellular → weak/no service → airplane mode → cellular restored → Wi-Fi). Browser emulation is supplemental only.

**Privacy:** audit current caching/storage/persistence/sign-out/household-switching/shared-device exposure before adding any offline cache. Never cache private ICS subscription URLs, provider credentials, auth tokens beyond the existing secure framework, or unnecessary raw provider responses.

**Success standard:** not "Corralio works completely offline" — a parent who loses connectivity can still understand the last-known family plan, knows what may be stale, and safely reconnects. Not a distributed-systems project before pilot.

**Classification:** Launch Readiness / Mobile Resilience. Primary impact: Retention + Trust. Secondary: Activation. Not a monetization feature — protects the value already created by schedule aggregation, required arrival, routing, traffic-aware leave-by, HotelPlanner lodging context, What Fits, and notifications.

Full audit-deliverable specification and CPO review (ADR/prompt conflict check) recorded separately; this entry establishes roadmap placement only. Do not begin implementation from this entry — an executable Codex audit prompt has not yet been authorized.

## Future possibilities, not commitments

- Corralio begins as a mobile-first web/PWA experience. Native apps should earn their cost through measurable value from push, device integration, widgets, background refresh, or similar capabilities.
- Native iOS and Android apps
- Push notifications (Weekend Ready web push shipped, Slice 3.6A — pending physical-device UAT and production deployment) and leave-now alerts (traffic-aware departure notifications, not yet built — planned Slice 3.6B Phase 5)
- Advanced household permissions
- Shared-custody or multiple-household models
- Direct sports-platform APIs/OAuth
- Rich venue intelligence and reusable field/court entities
- Field-level routing and maps
- Parent-generated venue intelligence
- Tournament recommendations
- Club-sponsored distribution and subscription subsidies
- Advanced travel planning
- AI-assisted planning
- Calendar sharing/export
- More sophisticated family coordination

## Not yet / explicitly deferred

Do not build the following without supporting evidence:

- Team chat or a social feed
- A full team-management system
- Tournament administration
- A full online travel agency
- Restaurant reservations
- A generic family calendar
- An AI travel agent as the core early product
- Complex club administration
- Universal sports-platform scraping
- Complex shared-custody logic
- A large venue-content operation before usage supports it

This boundary is intentional and should constrain AI-assisted development as well as human planning.

## Monetization strategy

### Corralio Standard

The free core creates audience, utility, habit, and tournament/travel opportunities. Do not artificially cripple the multi-child or multi-team value that proves the product thesis.

### Corralio Pro

Pro may monetize planning complexity through intelligence, automation, coordination, and convenience rather than access to basic family schedule data.

> Standard organizes the family's sports life. Pro helps solve the logistics.

Pro remains a hypothesis requiring usage and willingness-to-pay testing. No price or entitlement set is approved by this document.

### Tournament travel

Tournament travel monetizes travel intent through HotelPlanner. Tournament discovery and lodging handoffs should not be placed behind the Pro paywall.

> Corralio monetizes complexity through Pro and travel intent through hotel commerce.

## Open questions and stage gates

- Which behaviors constitute V1 activation beyond the first connected schedule?
- What weekly-return cohort and observation window will determine habit formation?
- Which routing provider and cost controls are appropriate after V1?
- Which Corralio Pro hypotheses earn implementation through observed demand?
- What evidence is sufficient to invest in direct schedule-platform integrations?
- Which product/legal requirements govern retention, export, and deletion before scale?
