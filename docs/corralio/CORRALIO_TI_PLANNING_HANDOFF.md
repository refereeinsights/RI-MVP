# TournamentInsights to Corralio Planning Handoff

**Status:** Accepted direction — implementation details pending  
**Last reviewed:** August 18, 2026

## Purpose

TournamentInsights owns public tournament intelligence and acquisition. Corralio owns the private family plan created from that intelligence. The handoff should make the transition feel continuous without duplicating ownership or trusting browser-supplied context.

> Any action that turns public sports information into a user's personal plan should preferentially route toward Corralio when that improves the user's task.

## Intended journey

```text
TI tournament page
       ↓
Planning action
       ↓
Trusted server-generated handoff
       ↓
Corralio opens with the tournament already present
       ↓
Family sees value, then personalizes the weekend
       ↓
Schedules + conflicts + leave-by + travel
```

The user must not land on an empty Corralio homepage or be required to create an account before seeing the transferred tournament context.

## Ownership boundary

### TournamentInsights remains authoritative for

- Canonical tournament identity and public details
- Canonical venue intelligence
- Tournament dates and official links
- Public discovery and SEO
- Tournament-director relationships
- Hotel Program and trusted HotelPlanner commercial resolution

### Corralio becomes authoritative for

- The household's saved tournament weekend
- Children and teams associated with that plan
- Connected and manual events
- Conflicts, leave-by, assignments, notes, and personal travel context

Corralio should consume a narrow tournament-intelligence contract rather than copy the TI tournament database or distribute TI service-role access throughout Corralio.

## Trusted handoff contract

The handoff must be generated and validated server-side. Browser parameters may identify an opaque handoff, but must not be authoritative for:

- Tournament identity without server verification
- Commercial program, rate, or beneficiary
- Hotel fee routing
- Privileged product state
- Sensitive household data

The context should contain or resolve only the minimum information needed to render the public tournament preview. Authentication can follow after the user sees the value of the handoff and chooses to save or personalize it.

### Open Question

The exact handoff transport, token lifetime, replay behavior, revocation model, and single-use/idempotency behavior are not finalized in the supplied strategy. They require an explicit implementation design and threat review before code is written.

## Cross-domain authentication

Corralio may use the same Supabase Auth tenant, but cross-domain SSO must not be assumed:

- TI cookies scoped to `.tournamentinsights.com` are not automatically available to `corralio.com`.
- Cookie/domain behavior must be intentionally designed.
- Product-profile and consent boundaries must remain explicit.
- Authorization must rely on server checks and RLS, not UI state.

The public tournament preview should therefore work without relying on a TI browser session.

## Existing plans and staged transition

Do not immediately remove the existing TI Weekend Planner or destroy existing TI plans.

1. **Parallel foundation:** build Corralio household and planning ownership while TI Planner remains intact.
2. **Contextual handoff:** add selected planning actions that open a useful Corralio tournament preview.
3. **Activation testing:** measure handoff arrival, preview engagement, save/personalize completion, schedule connection, and return behavior.
4. **Prefer Corralio where proven:** route more personal-planning actions only when Corralio clearly improves completion and retention.
5. **Legacy-plan decision:** design migration, export, read-only retention, or sunset behavior using observed usage; never silently discard existing plans.

## Tournament association

- An explicit trusted tournament association is preferred.
- Inferred association must be conservative and retain method/confidence provenance.
- Ambiguous associations must not silently alter the family plan.
- Corralio may save a stable TI tournament identifier and private planning metadata; it should resolve current public intelligence through the narrow TI contract.

## Venue and location behavior

- Preserve the event's raw schedule location.
- Treat canonical venue resolution as optional enrichment.
- Link only high-confidence canonical matches.
- Keep unresolved locations usable.
- Keep field/court labels at the event level initially.
- Never let a private household or routing origin enter public venue candidate generation.
- Corralio must not directly create or edit canonical TI venues.

## HotelPlanner boundary

Corralio should reuse existing safe HotelPlanner handoff and attribution logic rather than establish a second commercial program resolver.

- Program, fee, and beneficiary resolution remain server-side.
- Browser input cannot authorize fee-enabled routing.
- TI attribution should be retained where commercially appropriate.
- Tournament discovery and lodging handoffs remain available without Corralio Pro.

## Experience and failure behavior

- A failed or expired handoff should degrade to a safe public tournament lookup or clearly recoverable state, not fabricate context.
- A failed venue match must not block the plan.
- A failed commercial resolution must follow the established safe lodging fallback.
- An account prompt should appear only when saving or personalization requires ownership.
- The interface should distinguish public tournament facts from private family additions.

## Measurement

Use sanitized IDs and event taxonomy rather than private schedule content. Useful measures include:

- Planning action initiated on TI
- Valid handoff opened in Corralio
- Tournament preview rendered
- Save/personalize started and completed
- Household created after value was shown
- First and multiple schedules connected
- **This Weekend** viewed
- Weekly return
- Tournament and hotel engagement

Do not include child names, raw event locations, private notes, home/origin, auth tokens, or trusted commercial configuration in analytics.

## Open questions

- Exact server-to-server or signed-context contract
- Token expiration, replay, revocation, and key-rotation policy
- Anonymous preview persistence before account creation
- Existing TI Planner migration/retention policy
- Cross-domain authentication experience
- Availability and caching contract for TI tournament intelligence
- Product/legal consent requirements for transferring context between brands

