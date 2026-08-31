# Corralio Product Roadmap

**Status:** Canonical product strategy
**Last reviewed:** August 29, 2026

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

**Explicit compatibility note (2026-08-29):** Corralio having its own `source = "corralio"` value, its own opaque per-click attribution token, and its own private booking/lodging reconciliation (see ADR-032; design in `docs/reference/corralio-hotelplanner-attribution-design.md`) does not violate the line above. Those exist to identify Corralio-generated intent and personalize the family plan — they are not a second OTA/payment implementation. Corralio continues to reuse the shared HotelPlanner account, authentication, attribution conventions, fee/commercial logic, and white-label checkout throughout. Engineering should not read ADR-032 or the attribution design as authorization to build anything resembling a parallel booking/commerce system.

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
- Reuse TI's existing Mapbox-based venue mapping as the foundation for event navigation rather than building a second mapping stack (see ADR-030)

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
- An event location resolves into one of three treatments: a known canonical TI/RI venue (map, directions, trusted venue context, TI tournament association where applicable, existing nearby-venue context such as coffee/restaurants where already available), an unknown-but-plausible public venue (raw location stays usable and navigable while conservative matching fails safely and may enter restricted candidate review), or a private/non-venue location (household origin, pickup point — usable for navigation, never venue evidence). Privacy classification precedes candidate generation in all cases.
- Reuse TI's existing canonical venue coordinates and stored venue-local context (e.g., nearby coffee and restaurants, confirmed present on TI venue/weekend pages) where already available and inexpensive to surface; do not delay venue-context work to build new real-time POI infrastructure, and do not expand nearby-venue categories before usage data justifies the added cost and dependency. The map supports the family plan; it is not the product — prefer answering where we're going, what's happening there, and how we get there over a generic map full of nearby pins.

### Travel intelligence

- Recommendations informed by origin, distance, first game, venue, and tournament dates
- Better contextual HotelPlanner presentation
- Saved lodging and travel context
- Travel relevance should surface as soon as a plan implies it — often weeks or months out — which is why **Upcoming** (not only **This Weekend**) is an intended surface for early travel-need detection (e.g., an upcoming tournament shows "Travel may be needed" with a lodging entry point ahead of the event)
- Reuse TI's existing live HotelPlanner availability, room rates, Hotel Program resolution, and attribution (ADR-006, ADR-030) rather than a second commercial implementation; frame the moment as "we're going there on those dates - where can we stay?" rather than generic hotel browsing
- Do not add VRBO or another lodging provider on the basis of map/location context alone; an additional provider requires its own product/commercial case (demand, conversion evidence, inventory gaps, economics, attribution complexity)

### Corralio Pro testing

Potential value includes traffic-aware leave-by, advanced conflict intelligence, household coordination, schedule-change intelligence, smart briefings, advanced alerts, and advanced travel intelligence. Exact entitlements and pricing are not finalized.

### Sequencing and the founder/product gate

Corralio's public launch gate is defined by an experience, not a fixed feature list or date — see ADR-033. Reaching it requires Slice 4.3 (estimated leave-by, revised to add conservative venue matching ahead of geocoding) plus a scoped Contextual Intelligence slice: privacy-classified event-location resolution, persistent geocoding, high-confidence-only venue matching, a small Food/Coffee/Essentials Nearby experience, available-time-between-events calculation, home/base travel classification, and a contextual HotelPlanner handoff when travel intent is detected. The founder has explicitly chosen to delay launch for this fuller experience rather than ship faster, on the basis that this project carries no meaningful burn-cost pressure right now — the CPO's recommendation is to still track progress against phase-boundary milestones (location foundation → minimal contextual Nearby → schedule-aware Nearby → travel intent) and treat the pre-launch parent test as the actual readiness signal, rather than let this become open-ended.

Basic activation and retention instrumentation (Slice 4.2A) still ships ahead of and independent of this work, so the roadmap's primary early metric — weekly returning families with multiple connected schedules — is measurable from day one of whatever launches.

ADR-031's evidence-gated principle for tournament/venue/travel work stands, but its boundary line has moved (see ADR-033): a narrow, conservative slice of that work — high-confidence venue matching, basic Nearby, travel classification, a HotelPlanner handoff — now ships as part of the launch-gate experience itself, justified by a moderated pre-launch parent test rather than post-launch data. Everything beyond that narrow slice — full POI/venue-intelligence expansion, personalization, traffic-aware routing, deeper travel commerce, and Pro — remains gated on real post-launch usage data and a founder/product review, unchanged from ADR-031's original intent.

A small, informal exception: when an existing TI Weekend Planner user has already demonstrated planning behavior in TI (an authenticated, repeat planner), inviting them to continue that planning in Corralio is not a new integration and should not wait for launch. At the scale of a handful of people this is a personal invitation plus Corralio's existing sign-up and manual schedule-reconnect flow — no trusted anonymous-session handoff (ADR-013), no cross-domain auth work (ADR-023), and no dedicated product slice. New households created this way carry a lightweight, permanent, immutable `acquisition_provenance` tag (`direct` vs. `ti_weekend_planner_opt_in`) set once at household creation and never changed afterward, so the usage-measurement foundation can show whether this cohort activates and retains differently from direct signups. This tag shipped as part of Slice 4.2A itself (already complete locally and applied to production), not as a later fast-follow. This pilot runs in parallel with the launch-gate work above, independent of its timeline: the pilot's evidence should not depend on the pace of manually inviting and following up with a handful of people, and the launch-gate work should not wait on the pilot either. If the cohort shows a clear activation/retention difference by the time real usage data is reviewed, treat it as a second, corroborating input — not a precondition.

**Note:** this experience/evidence gate (ADR-031/ADR-033) and the Mobile Resilience network-survivability gate immediately below are two independent launch requirements. Both must be satisfied; neither substitutes for the other. This gate concerns whether the product experience is good enough to show real parents; the one below concerns whether the product keeps working when connectivity does not.

## Launch Readiness — Mobile Resilience & Offline PWA (added 2026-08-29, resequenced 2026-08-29, hard-gated 2026-08-29)

> **Founder launch requirement (2026-08-29):** Corralio will not progress beyond a tightly controlled pilot until the physical mobile experience and network survivability are excellent. Browser-responsive compliance is insufficient. The product must remain useful during realistic sports-family connectivity conditions, including weak cellular service and temporary loss of network. The bounded/tiny pilot itself may proceed on the sequence below; anything beyond that pilot — a larger cohort, general availability — is gated on this bar being met, not merely attempted. "Excellent" should be given a measurable definition via the audit's own success measures rather than left as an adjective.

> **Hard gate, stated as outcomes, not a checklist tier (founder, 2026-08-29):** Physical mobile quality and network survivability are launch requirements. Corralio must retain a useful last-known weekend plan through temporary connectivity loss, disclose stale/live state honestly, and recover safely without duplication or destructive synchronization. That does not mean full offline writes or a delta-sync engine are required. The audit determines the smallest implementation that achieves those outcomes. This replaces any prior "P1 launch-blocking fixes only" framing below with these outcomes directly — the audit's job is to find the smallest implementation that satisfies them, not to work through a fixed tier list.

Audit-first launch-readiness item, not authorization for a comprehensive offline synchronization system. It protects value already built rather than adding new intelligence.

**Roadmap placement (resequenced, current slice sequence):** Slice 3.6A ✓ (Weekend Ready Web Push, complete locally) → Slice 3.6B Phase 1 required-arrival foundation ✓ (dependency satisfied by `34d83cf4`; Arbiter identity evidence remains parallel/non-blocking) → Slice 3.6B core planning (routing origin, HotelPlanner attribution, Mapbox traffic-aware leave-by, traffic monitoring/alerts) → **Mobile Resilience & Offline PWA: audit, then the required resilience fixes that satisfy the hard-gate outcomes above** → one combined real iPhone/Android field UAT pass (covering 3.6A push/tap-handoff, 3.6B arrival/routing/traffic, and this workstream's offline/reconnect matrix) → bounded/tiny pilot. All downstream planning consumes the completed shared hierarchy `ics_explicit → source_preference → team_preference → corralio_default` and its existing source-preference boundary; this roadmap does not authorize another arrival schema or resolver. Moved earlier than originally proposed (previously: after all of 3.6B) — the founder's own updated sequencing, and it has a real technical benefit beyond just founder preference: Phase 4/5's traffic-aware and traffic-monitoring work can be built against an already-settled freshness/staleness UI pattern from the start, rather than needing a second retrofit pass after the fact. (CPO note: "Slice 3.6B core planning" is read here as everything buildable now — Phase 3A temporary routing origin, Phase 4 Mapbox traffic-aware leave-by, Phase 5 traffic monitoring/alerts — excluding Phase 3B's hotel-origin auto-suggestion, which stays separately deferred on its own unrelated gate (a real Corralio-owned HotelPlanner handoff feature must exist first) regardless of where Mobile Resilience sits in this sequence. Flag if that reading is wrong.) Do not interrupt in-progress 3.6B work mid-slice to start this early unless the audit surfaces a prerequisite architectural blocker. The audit prompt itself is not yet authorized to be written — it follows once 3.6B core planning is done, per founder instruction (2026-08-29).

**Launch question:** if a parent loses connectivity during a sports weekend (fields, gyms, rinks, tournament complexes, hotels, road trips), can they still see enough of the plan to know where they need to be? A temporary connectivity loss should not reduce the product to an empty screen or a permanent loading state.

**Canonical direction:** server-authoritative intelligence + locally hydrated PWA + targeted synchronization. The client stays fast and useful with poor connectivity; Corralio's planning/business intelligence stays server-authoritative. Do not reproduce the planning engine in the browser.

**Required outcomes (hard gate, not a tier list):** cached/readable This Weekend plan, event times, venue names/addresses, required-arrival info, last-known leave-by, applicable planned lodging/origin, explicit freshness/staleness disclosure (e.g. "Schedule updated 22 min ago," "Traffic unavailable offline"), graceful offline state, safe reconnect/refetch, no duplicate/destructive sync after reconnect. Real-time information must never masquerade as current when offline. The audit determines the smallest implementation that reliably achieves these outcomes — engineering judgment on mechanism, not a prescribed architecture.

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

**Fee mechanism and site provisioning:** Corralio's HotelPlanner economics run on their own independent attribution, not a join into TI's tournament-keyed fee program — see ADR-032 for the full decision, rationale, and explicit yes/not-yet boundaries. Three HotelPlanner sites are provisioned ahead of launch (Standard, $5/night, $10/night); provisioning is infrastructure only and commits Corralio to nothing about when or whether to launch hotel commerce, or which tier production traffic ever uses.

Corralio is on the equivalent of Standard/no-fee for now, which requires no new code — Standard is already the default when nothing is configured, and Corralio has no hotel-linking surface yet regardless. This is not a decision that zero-fee is the right long-term answer, and should not be read as one.

**Open hypothesis to test at the gate, not before:** when hotel-handoff work is actually planned (after ADR-031/033's founder/product gate), explicitly test the $5/night Corralio program as a possible mechanism for subsidizing a free core Corralio experience — an alternative or complement to Pro-gated monetization, not merely a second independent revenue line alongside it. Measure total hotel economics per eligible and per activated family, not booking-conversion rate alone. Test $10/night only if $5's economics justify escalating.

This reframes the Pro/travel relationship above from "two parallel revenue lines" to an open question: does travel revenue meaningfully offset the need for Pro conversion, or is it additive on top of a still-necessary Pro tier? Treat that as unresolved until tested, not assumed either way.

This hypothesis is unproven and the test should be designed to prove real unit economics, not just conversion rate. Family hotel bookings through Corralio will be occasional by nature (a handful of tournament weekends a year per household), so a healthy click-through or booking-conversion percentage is not by itself evidence that travel revenue can subsidize free access — the gate-time test should also estimate bookings per active household per year and margin per booking against the cost of serving a free household before treating this as viable, not lean on conversion rate alone.

## Open questions and stage gates

- Which behaviors constitute V1 activation beyond the first connected schedule?
- What weekly-return cohort and observation window will determine habit formation?
- Which routing provider and cost controls are appropriate after V1?
- Which Corralio Pro hypotheses earn implementation through observed demand?
- What evidence is sufficient to invest in direct schedule-platform integrations?
- Which product/legal requirements govern retention, export, and deletion before scale?
