# Corralio Architecture Decisions

**Status:** Canonical decision record
**Last reviewed:** August 20, 2026

These concise ADRs memorialize accepted strategy. An accepted direction may still require an implementation ADR before code or schema work begins.

## ADR-001 — Corralio Owns Personal Planning

**Status:** Accepted

**Decision:** TournamentInsights owns public tournament intelligence and acquisition. Corralio owns personalized sports-family planning. Public tournament data remains authoritative in TI; personal family planning belongs in Corralio.

**Consequences:** Corralio consumes narrow TI contracts rather than copying canonical TI datasets. Corralio does not replace TI or RI.

## ADR-002 — Household-Owned Corralio Data

**Status:** Accepted — implementation details pending

**Decision:** New Corralio private planning data is household-owned rather than a direct reuse of TI's single-user Planner ownership model. Household-scoped RLS is required. Do not attempt an in-place conversion of TI Planner ownership in initial V1.

**Consequences:** A household and membership authorization model must be designed before production private data is stored. One owner can receive full V1 value without complex collaboration.

## ADR-003 — Do Not Copy TI Weekend Planner UI

**Status:** Accepted

**Decision:** Do not move or copy the large TI Weekend Planner UI wholesale into Corralio. Reuse product-neutral logic and services where appropriate, and build a dedicated Corralio **This Weekend** experience.

**Consequences:** Corralio receives its own family-first interaction model. TI UI internals do not become a permanent Corralio dependency.

## ADR-004 — Reuse Schedule Primitives Incrementally

**Status:** Accepted

**Decision:** Reuse proven ICS/iCal fetching, parsing, normalization, recurrence expansion, duplicate detection, suppression, overlap detection, and calendar serialization only as Corralio needs them.

**Consequences:** Avoid a large shared-services refactor before product behavior is proven. Extract product-neutral capabilities in bounded steps.

## ADR-005 — Read-Only Tournament Intelligence Contract

**Status:** Accepted — implementation details pending

**Decision:** Corralio consumes a narrow, product-neutral, read-only tournament-intelligence contract. TournamentInsights remains authoritative for canonical tournament data.

**Consequences:** Do not distribute service-role access or private TI-table queries throughout Corralio components. The contract, caching, and availability behavior require a later design.

## ADR-006 — Shared Server-Side HotelPlanner Handoff

**Status:** Accepted

**Decision:** Corralio reuses trusted HotelPlanner search, handoff, attribution, and Hotel Program logic. Commercial fee and beneficiary resolution remain server-side.

**Consequences:** Do not recreate HotelPlanner commercial rules in the Corralio client. Browser input cannot authorize fee-enabled routing.

## ADR-007 — Leave-By V1 May Be Estimated

**Status:** Accepted

**Decision:** V1 may calculate `event start - estimated route duration - arrival buffer`. Live traffic is not required.

**Consequences:** Non-live leave-by must be labeled as estimated. Traffic-aware routing may become V2 and/or Pro only if user value and API economics justify it.

## ADR-008 — Venue Canonical Authority Remains TI/RI

**Status:** Accepted

**Decision:** Corralio does not directly create or modify canonical venue records. Trusted TI/RI/shared services remain authoritative.

**Consequences:** Corralio may later contribute restricted evidence and candidate observations, but canonical writes require trusted controls.

## ADR-009 — Preserve Raw Location + Optional Canonical Venue

**Status:** Accepted

**Decision:** Corralio events preserve raw schedule location information while optionally linking to a canonical venue. Venue resolution must not block event usability.

**Consequences:** Ambiguous matches remain raw and usable. Canonical matching is enrichment, not a prerequisite for planning.

## ADR-010 — Private Household Locations Are Not Venue Evidence

**Status:** Accepted

**Decision:** Home addresses, pickup points, private residences, and routing-only locations never enter venue candidates, public venue search, venue enrichment evidence, or canonical promotion. Privacy classification occurs first.

**Consequences:** Repetition cannot turn a private location into a trusted public venue. These values remain in the protected household domain.

## ADR-011 — Pro Is a Product Hypothesis

**Status:** Accepted

**Decision:** Do not hard-code a permanent paywall, entitlement model, or final price before usage and willingness-to-pay testing. Pro should primarily monetize intelligence, automation, coordination, and convenience.

**Consequences:** Standard must provide enough multi-child and multi-team value to prove Corralio's core benefit.

## ADR-012 — Build for Recurring Weekend Usage

**Status:** Accepted

**Decision:** The primary experience is **This Weekend**, not a tournament-only saved plan, blank monthly calendar, or generic dashboard.

**Consequences:** Product structure and metrics optimize for recurring weekly family utility.

## ADR-013 — TI → Corralio Planning Handoff Must Preserve Context

**Status:** Accepted — implementation details pending

**Decision:** A TI personal-planning action should open Corralio with trusted tournament context already present. Do not send users to a blank homepage or trust sensitive/commercial browser parameters.

**Consequences:** The server-generated handoff, expiry, replay, revocation, and anonymous-preview contract require an explicit threat-reviewed design.

## ADR-014 — TI Planner Migration Must Be Staged

**Status:** Accepted

**Decision:** Build Corralio core, add it as a planning option, measure activation and retention, make it primary only after it proves better, preserve existing TI plans, and retire duplicate UX only after migration confidence is high.

**Consequences:** Do not immediately remove TI Weekend Planner or silently discard existing plans.

## ADR-015 — Corralio Standard Remains Broadly Useful

**Status:** Accepted

**Decision:** Do not limit Standard to one child or one team. Keep hotel discovery and booking accessible because travel commerce is itself a monetization engine.

**Consequences:** Users experience the core family-planning value before premium conversion is expected.

## ADR-016 — Hybrid Monetization Model

**Status:** Accepted

**Decision:** Standard creates free core utility and habit; Pro may monetize planning complexity; travel monetizes tournament intent through HotelPlanner.

**Consequences:** Corralio monetizes complexity through Pro and travel intent through hotel commerce. Exact Pro entitlements and pricing remain unapproved.

## ADR-017 — Interactive Demo Uses Synthetic Data Only

**Status:** Accepted

**Decision:** The marketing demo may reuse real presentation components but uses only synthetic fixture data, requires no authentication, creates no persistent personal data, and submits no venue evidence.

**Consequences:** The demo is a limited acquisition/activation experience, not a second editable planner or a path into private household data.

## ADR-018 — Household Collaboration Is Not a V1 Requirement

**Status:** Accepted

**Decision:** One household owner must receive full V1 value without inviting another adult. Second-adult collaboration, invitations, roles, and "Who's taking whom" are V2 unless exceptionally cheap and low-risk.

**Consequences:** Collaboration complexity does not block initial activation.

## ADR-019 — Direct Sports Platform APIs Are Not Required for V1

**Status:** Accepted

**Decision:** Existing generic ICS/iCal ingestion is sufficient for the smallest V1 if coverage is acceptable. Do not block launch on direct TeamSnap, GameChanger, or SportsEngine integrations.

**Consequences:** Prioritize later integrations using observed activation friction and usage data.

## ADR-020 — Canonical Venue Sub-Locations Are Deferred

**Status:** Accepted

**Decision:** The facility remains the canonical venue; field, court, rink, diamond, or gym remains an event-level label initially.

**Consequences:** Do not create reusable canonical sub-location entities until field-level routing or intelligence becomes a demonstrated need.

## ADR-021 — Venue Candidate Promotion Requires Trusted Review

**Status:** Accepted

**Decision:** Corralio-originated observations may become candidate evidence but cannot automatically create or overwrite canonical venues. Promotion requires trusted review or validated automation with provenance and audit history.

**Consequences:** Evidence must retain source and confidence, and repeated records from one user/feed are not independent verification.

## ADR-022 — Analytics Must Minimize Private Data

**Status:** Accepted

**Decision:** Measure behavior with stable IDs and sanitized taxonomy. Avoid raw home/private event addresses, child-sensitive schedule details, private notes, auth/share/handoff tokens, and trusted HotelPlanner or fee configuration.

**Consequences:** Analytics schemas and logs require explicit privacy review and redaction.

## ADR-023 — Cross-Domain Authentication Must Be Explicitly Designed

**Status:** Accepted — implementation details pending

**Decision:** Corralio may share the Supabase Auth tenant, but cross-domain authentication is not assumed. TI cookies on `.tournamentinsights.com` cannot simply be reused on `corralio.com`.

**Consequences:** Session, cookie, consent, and Corralio product-profile behavior require an intentional design enforced by server authorization and RLS.

## ADR-024 — Routing Infrastructure Must Be Server-Side and Cost-Controlled

**Status:** Accepted — implementation details pending

**Decision:** Future route-duration providers run server-side with caching, deduplication, timeouts, rate/cost controls, and staleness handling.

**Consequences:** Do not perform uncontrolled route calculations on every client render. Provider selection and retention remain open.

## ADR-025 — Private Planning Data Must Be Protected by RLS

**Status:** Accepted

**Decision:** Frontend filtering is insufficient. Household authorization must be enforced through server/database controls and RLS.

**Consequences:** Positive and negative access tests must prove one household cannot access another household's private planning data.

## ADR-026 — Tournament Matching Must Preserve Confidence and Provenance

**Status:** Accepted — implementation details pending

**Decision:** Explicit trusted TI handoffs are high-confidence associations. Inferred matches use conservative evidence; weak or ambiguous matches require user confirmation. Store method and confidence.

**Consequences:** Incorrect tournament intelligence or commercial attribution must not be attached silently.

## ADR-027 — Do Not Build Native Apps Until Native Capabilities Earn Their Cost

**Status:** Accepted

**Decision:** Corralio begins as a mobile-first web/PWA experience. Consider native iOS/Android only when push, device integration, widgets, background refresh, or similar capabilities create measurable retention or utility gains.

**Consequences:** Native apps are a future possibility, not a launch commitment.

## ADR-028 — TI and RI Continue Operating Independently

**Status:** Accepted

**Decision:** Corralio must not block valuable ongoing TI or RI work. Reuse shared capabilities where appropriate while preserving independent product roadmaps and current revenue opportunities.

**Consequences:** Shared work remains incremental and justified; Corralio is not a prerequisite for TI/RI progress.

## ADR-029 — Corralio Sports Taxonomy Is Broader Than TI Tournament Taxonomy

**Status:** Accepted

**Decision:** Corralio planning supports youth sports beyond the sports currently covered by TournamentInsights tournament intelligence. TI tournament support is optional enrichment. Corralio events and schedule sources remain usable without TI tournament matching, and adding a Corralio sport does not make that sport eligible for TI intelligence. Corralio owns an application-local 17-token taxonomy: `baseball`, `softball`, `soccer`, `basketball`, `volleyball`, `hockey`, `lacrosse`, `football`, `tennis`, `swimming`, `gymnastics`, `track_field`, `golf`, `wrestling`, `cheer`, `dance`, and `other`.

Teams are optional planning structure: a schedule may eventually be assigned directly to a child where a team is inappropriate. Imported events derive presentation sport through their schedule source instead of duplicating a sport field. Icons are replaceable presentation metadata; the canonical token is the sole identifier. `other` is a bounded fallback for another sport or competitive athletic activity, not a generic family-calendar category.

**Consequences:** Future tournament matching must be capability-gated and must never suppress an otherwise usable event. Conflict, leave-by, location, directions, weather, travel, and other planning capabilities should remain sport-agnostic. Manual-event sport modeling and schedule-to-child/team assignment remain deferred; free-form custom activities are not authorized by this decision.

## Open architecture questions

- Household schema, membership roles, and exact RLS policies
- Corralio product-profile relationship to shared Supabase Auth identities
- TI tournament-intelligence contract, caching, and availability
- TI-to-Corralio handoff transport and token lifecycle
- Anonymous preview-to-household claim semantics
- Route provider, caching, cost, and staleness model
- Schedule retention and source credential handling
- Existing TI Planner migration or retention mechanics
- Final analytics privacy contract
- Export, retention, and deletion semantics
