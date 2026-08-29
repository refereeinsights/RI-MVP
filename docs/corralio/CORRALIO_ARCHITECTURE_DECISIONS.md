# Corralio Architecture Decisions

**Status:** Canonical decision record
**Last reviewed:** August 29, 2026

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

**Status:** Accepted (revised August 29, 2026 — documentation correction reflecting the already-implemented Slice 4.4B/4.4C provisional-venue authority; the canonical-write prohibition itself is unchanged)

**Decision:** Corralio does not directly create or modify canonical venue records. Trusted TI/RI/shared services remain authoritative. Corralio separately holds its own authority — implemented in Slices 4.4B and 4.4C — to create and maintain structurally isolated provisional venue identities and to attach typed, versioned evidence to them, including automated corroboration evidence from external sources. This provisional authority is distinct from canonical authority and does not extend to it.

**Consequences:** Provisional venues and their evidence live in separate Corralio-owned tables, never a status flag on `public.venues`, and can never appear in public TI/RI surfaces, sitemaps, search, or exports, nor overwrite canonical data. Creating or evidencing a provisional venue is never itself a canonical write. Promotion from provisional to canonical remains a distinct, separately-gated authority (see ADR-021 and the reserved Slice 4.5B) — this ADR's boundary does not change based on how much evidence a provisional venue accumulates.

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

## ADR-030 — Reuse TI Mapbox, Canonical Venue, and POI Infrastructure

**Status:** Accepted

**Decision:** Corralio consumes TournamentInsights' existing Mapbox-based venue mapping, canonical venue coordinates, and already-stored venue-local context (for example, nearby coffee and restaurants, confirmed present on TI venue and weekend pages) through the narrow read-only TI contract (ADR-005) rather than building a second mapping or points-of-interest stack. Live HotelPlanner availability, room rates, Hotel Program resolution, and attribution (ADR-006) remain the lodging path.

**Consequences:** Corralio's navigation, venue-context, and travel work (roadmap V2) is scoped as a consumer of existing TI/HotelPlanner capability, not a rebuild. Corralio must not introduce an alternate mapping provider or POI data source without evidence the existing capability is insufficient, and must not add an alternate lodging provider (for example VRBO) without a separately justified product/commercial case covering demand, conversion evidence, inventory gaps, economics, and attribution complexity. This ADR governs venue/place/POI data specifically; the road/traffic-routing provider decision is separate (see ADR-033).

## ADR-031 — Founder/Product Gate Before Tournament and Travel Work

**Status:** Accepted; amended by ADR-033 — the evidence-before-expansion principle stands, but the boundary line it draws has moved. See ADR-033.

**Decision:** After estimated leave-by ships (roadmap V1/V2 boundary), Corralio requires an explicit founder/product review against a realistically complex multi-child, multi-team household — multiple connected schedules, overlapping weekend events, mixed assignment states — before tournament intelligence or travel-commerce work begins. The review asks whether Corralio materially reduces the mental work required to plan the family's weekend. A negative or ambiguous result returns investment to the core planning experience rather than proceeding into tournament/travel scope, additional integrations, native apps, AI, or Pro.

**Consequences:** Tournament and travel work is evidence-gated, not calendar-gated. Basic activation and retention instrumentation must exist before this gate is evaluated — sequenced alongside conflict detection and leave-by, not deferred until after tournament/travel work — so the review is measured rather than anecdotal.

## ADR-032 — Corralio Gets Independent HotelPlanner Sites and Attribution, Provisioned Ahead of Launch

**Status:** Accepted

**Decision:** Create three Corralio-branded sites at HotelPlanner now — `corralio.hotelplanner.com` (Standard/no fee), `corralio-support.hotelplanner.com` ($5/night), and `corralio-supportplus.hotelplanner.com` ($10/night). Site creation is self-service within Corralio's existing HotelPlanner partner relationship, not an external request or a contract change, reusing the same trusted server-side program-resolution and Custom-field attribution architecture TI already built and validated (see ADR-030; TI's `hotel_program_type`/`ti_tournament_hotel_programs` mechanism). Unlike TI's program, Corralio's economic attribution is independent, not tournament-keyed: `source_product = corralio` is the required attribution field, with tournament and venue context optional, because a valid Corralio hotel need can originate from an unmatched tournament, an away game, a showcase, a camp, or a manually entered family event with no canonical TI tournament/venue row at all. Corralio is the economic owner of any hotel transaction it generates, absent a future explicit partner agreement saying otherwise. This attribution architecture — the opaque per-click token in Custom3, `source = "corralio"`, and reconciliation via a scheduled `getReport` pull — is documented in full in `docs/reference/corralio-hotelplanner-attribution-design.md`; that document's design and this ADR's business/provisioning decision are complementary, not two separate answers to the same question.

**Consequences:** Provisioning these three sites is infrastructure only and explicitly does not decide three separate questions this ADR keeps distinct: whether Corralio ships hotel recommendations at all (governed by ADR-031's founder/product gate and normal roadmap sequencing — travel appears only once Corralio has enough context to make a recommendation genuinely useful, per the existing "recognize a need, don't advertise" principle), which fee tier (if any) production traffic is routed through (Standard by default; $5 tested only after the gate and only as a controlled experiment measuring total per-family hotel economics, not booking-conversion rate alone; $10 tested only if $5's economics justify it), and whether hotel commerce can meaningfully subsidize free Corralio access (an open, unproven hypothesis, not a committed business model). No Corralio code, hotel search, or checkout surface is built by this decision. Reusing HotelPlanner's shared account, authentication, attribution conventions, fee/commercial logic, and white-label checkout throughout means none of this constitutes a duplicate OTA/payment implementation — Corralio's own opaque attribution mapping and private booking reconciliation identify Corralio-generated intent and personalize the family plan; they do not replace any part of HotelPlanner's commercial or payment surface. When 4.5 is eventually implemented, the attribution reconciliation path (HotelPlanner's booking report keyed by Custom3 → `outbound_attribution_id` → Corralio household/event) should be designed before launch, not after, so booked lodging can eventually surface back inside `This Weekend` as a reservation object rather than an ordinary calendar event. Implementation note for whoever eventually builds the resolver: TI's existing attribution helper (`hotelPlannerAttribution.ts`) already has a `sourcePageType` field with `"referee"` as a precedent for a cross-product value; reconcile whether Corralio's `source_product` reuses that same field/enum or is a genuinely new dimension before building anything, rather than shipping two parallel attribution concepts.

## ADR-033 — Launch Gate Redefined as a Contextual-Intelligence Experience; Moves ADR-031's Boundary, Does Not Remove Its Discipline

**Status:** Accepted

**Decision:** Corralio's public launch gate is redefined from a fixed V1 feature list to an experience test: a realistic multi-child, multi-team household must be able to add family, connect multiple schedules, open This Weekend, understand the weekend immediately, see meaningful conflicts, know estimated leave-by times, understand tournament/travel context, and receive useful contextual guidance around the weekend — the target reaction being "Corralio figured out our weekend," not "this is a nice calendar." There is no calendar deadline forcing this decision; the founder has assessed this project's current engineering capacity as carrying no meaningful burn-cost pressure to launch faster, and has explicitly chosen to delay launch for a materially more complete first product experience over shipping quickly. Reaching that experience requires Slice 4.3 (estimated leave-by — revised to add conservative venue matching ahead of geocoding, see notes) plus a scoped Contextual Intelligence slice: privacy-classified event-location resolution; persistent geocoding via Geocodio; conservative, high-confidence-only venue matching (never automatic canonical-venue creation or overwrite from schedule data — TI/RI remain the canonical venue authority regardless of where this code is built, per the existing venue-ownership principle); a small POI-backed Nearby experience limited to Food/Coffee/Essentials with a list-first UI; available-time-between-events calculation; home/base-based local-vs-travel classification; and a contextual handoff into the existing HotelPlanner attribution/fee infrastructure when travel intent is detected — never a new, parallel hotel-commerce implementation. Explicitly excluded from the launch gate and left for after it: sophisticated personalization, a persistent preference graph, machine learning, live/traffic-aware routing, background GPS, proactive location notifications, comprehensive POI ingestion, and full travel planning. Geocoding (Geocodio) and road/traffic routing (candidates: OpenRouteService for normal routing, TomTom for traffic-aware routing) are separate, independently swappable provider decisions behind a common interface; selecting one does not commit the other. Distance determines when Corralio proactively suggests travel; explicit user search intent ("hotel," "lodging," "where to stay," and near-variants) always routes to the travel experience regardless of the distance classification. Before public launch, run a moderated test with roughly 10–15 real sports parents against a realistic complex household schedule, observing whether the experience is self-evidently useful without being walked through it.

Separately, and in addition to this experience-test gate: physical mobile quality and network survivability are also launch requirements, not merely a quality preference. Corralio must retain a useful last-known weekend plan through temporary connectivity loss, disclose stale/live state honestly, and recover safely without duplication or destructive synchronization before any pilot expands beyond a tightly controlled initial cohort. That does not require full offline writes or a delta-sync engine — the Mobile Resilience & Offline PWA audit (roadmap, Launch Readiness) determines the smallest implementation that achieves those outcomes. This physical-device/network-survivability requirement and the contextual-intelligence experience test above are two independent launch gates, both must be satisfied, and neither substitutes for the other.

**Relationship to ADR-031:** ADR-031's evidence discipline — tournament/venue/travel work should be justified by evidence, not calendar sequencing — stands. What changes is *when* the first, conservative slice of that work happens: rather than waiting for a post-4.3 gate before touching venue/travel scope at all, a deliberately narrow slice of it (high-confidence venue matching, basic Nearby, travel classification, a HotelPlanner handoff) now ships as part of the launch-gate experience itself, justified by the pre-launch parent test as its evidence rather than by post-launch data. ADR-031's gate still governs everything beyond that narrow slice — full POI/venue-intelligence expansion, personalization, traffic-awareness, deeper travel commerce, and Pro — which remains evidence-gated on real post-launch usage (Slice 4.2A) and the founder/product review, exactly as ADR-031 specified. ADR-031 is amended, not repealed: its principle carries forward: what starts pre-launch is intentionally narrow, and going further than that narrow slice still requires evidence.

**Consequences:** This is a genuine scope and schedule expansion versus the prior V1 plan, accepted deliberately rather than incrementally. No calendar deadline anchors it, which the founder judges an acceptable risk given the current cost structure — the CPO recommends checking progress against phase-boundary milestones (Location Foundation → Minimal Contextual Nearby → Schedule-Aware Nearby → Travel Intent) rather than a purely open-ended "launch when it feels right" standard, using the pre-launch parent test itself as the readiness signal rather than a date. Slice 4.3 (estimated leave-by) ships unrevised and self-contained: it geocodes event locations directly via Geocodio, with no dependency on venue matching or privacy classification. This resolves an internal inconsistency between the founder's Section 9 pipeline description (which orders venue matching before leave-by) and Section 23's phase breakdown (which orders leave-by as Phase A, before Phase B's location foundation) — Section 23's phase order governs actual build sequencing, both because it is the more specific implementation-sequencing statement and because Section 23 itself requires phases to remain independently testable and rollback-safe, which a leave-by slice dependent on unbuilt venue-matching infrastructure would violate. Once Phase B ships, it may overwrite an event's `location_lat`/`location_lng` with a matched canonical venue's coordinates when a confident match exists — an additive improvement to already-working leave-by, not a rebuild of it; until Phase B ships, Slice 4.3/4.4/4.4B's already-implemented behavior stands unchanged — provisional and canonical venue matching enrich identity and evidence without touching an event's persisted Geocodio coordinates. The TI Weekend Planner pilot (Slice 4.2A) is unaffected and continues to run in parallel, independent of this launch-gate timeline, per the roadmap's existing pilot carve-out. On mobile/network survivability specifically: the Physical-Device Evidence Boundary discipline already used for Slices 3.6A/3.6B (real-hardware verification required; automated/browser tests cannot certify real-device behavior) extends to this gate's physical-device requirement as well — one combined field UAT pass, not a separate one per workstream.

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
