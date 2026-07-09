You are working in the TournamentInsights repo.

Goal:
Implement Stage 3.7B Discovery — identify the safest, highest-impact contextual Weekend Planner CTA placements before making product code changes.

This is an inspection + recommendation pass only.

Hard constraints:
- Do not add or change UI CTAs in this stage.
- Do not change planner behavior.
- Do not change auth, entitlement, Stripe, travel-provider, affiliate, or analytics persistence behavior.
- Do not introduce new query-param contracts unless they already exist and are already safely ignored/consumed.
- Keep recommendations aligned with current behavior. Do not promise save/prefill behavior that does not exist.

Business context:
- Weekend Planner engagement is low relative to TI traffic.
- Real user intent is concentrated on tournament detail pages, weekend pages, sport/state hubs, metro hubs, the tournament directory, and `/book-travel`.
- Activation should be contextual and surgical, not global.

Discovery principle:
- Prefer reusing existing tournament/weekend planning paths over inventing a new planner-prefill system.
- If a page already has a stronger planning action, recommend keeping it instead of layering another planner CTA on top.
- If a route only supports generic travel context, recommend generic CTA copy.

Definitions:
- `weekend_planner` means the calendar/schedule hub at `/weekend-planner`.
- `weekend page` means `/weekend/[slug]`.
- `tournament detail` means `/tournaments/[slug]`.
- `sport/state hubs` includes both `/<sport>/<state>` and `/<sport>/<state>/<metro>`.

Routes to inspect:
1. Tournament detail pages: `/tournaments/[slug]`
2. Weekend-specific pages: `/weekend/[slug]`
3. Sport/state hubs: `/<sport>/<state>`
4. Sport/state/metro hubs: `/<sport>/<state>/<metro>`
5. Tournament directory: `/tournaments`
6. Travel page: `/book-travel`

Required output:

1. Route inventory
For each target page type, provide:
- route pattern
- main file/component
- render model: server / client / mixed
- whether user auth state is available in that route today
- existing planner/travel/save actions already present
- whether Stage 3.7A analytics can be attached cleanly on an added CTA
- mobile/layout constraints
- safest compact CTA insertion point

2. Existing action inventory
Find current actions/components related to:
- save tournament
- save weekend plan
- continue/view/edit weekend plan
- venue map
- book travel
- team hotel blocks
- saved tournament planner actions
- planner entry CTAs

For each, provide:
- file/component
- current copy
- destination/action
- logged-out behavior
- auth redirect behavior, if any
- whether it carries tournament/weekend/travel context
- whether it is reusable for Stage 3.7B

3. Public context inventory
For each route type, document what safe public context exists at render time:
- tournament name / slug / ID
- dates
- city/state
- venue references
- sport / state / metro context
- whether card-level tournament context exists
- whether `/book-travel` can safely receive city/state/checkin/checkout

Also call out what should not be passed because it is private, brittle, or not already supported.

4. Safest linking recommendation
Choose one primary recommendation per route family:
- A. Reuse an existing saved/planning action
- B. Link to `/weekend-planner` with already-supported safe query params
- C. Plain link to `/weekend-planner`
- D. Tiny bridge only if partially implemented already

Do not recommend a new planner-prefill system unless a narrow bridge already exists.

5. Ranked Stage 3.7B recommendations
Rank the top 3–5 placements by activation impact vs implementation risk.
For each include:
- route
- exact file/component
- exact placement
- suggested heading/body/button copy
- logged-out behavior
- logged-in behavior
- analytics events for impression + click
- expected intent
- complexity: low / medium / high
- risk: low / medium / high

Copy rules:
- Use `Add this tournament to Weekend Planner` only if the flow actually saves or carries tournament context.
- Otherwise prefer:
  - `Start a weekend plan`
  - `Plan this weekend`
  - `Open Weekend Planner Beta`

6. Where not to add CTAs yet
Explicitly list surfaces where a new planner CTA would be redundant, noisy, or higher-risk than value.

Deliverable requirements:
- Write the findings as a repo artifact, not just an inline reply.
- Keep recommendations concrete and file-anchored.
- End with a short “recommended implementation order” list for the future build pass.
