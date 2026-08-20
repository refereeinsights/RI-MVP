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

## Future possibilities, not commitments

- Corralio begins as a mobile-first web/PWA experience. Native apps should earn their cost through measurable value from push, device integration, widgets, background refresh, or similar capabilities.
- Native iOS and Android apps
- Push notifications and leave-now alerts
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
