# TI Weekend Planner Stage 3.7B Discovery

Date: `2026-07-09`

Scope:
- inventory current high-intent TI routes
- identify existing planner/travel/save actions
- recommend the safest contextual Weekend Planner CTA placements
- no product code changes in this pass

## Summary

- The safest Stage `3.7B` path is to reuse the existing tournament → weekend planning flow, not to invent a new `/weekend-planner` tournament-prefill bridge.
- `/weekend/[slug]` already carries real tournament context, supports venue anchoring, and supports auth-aware weekend-plan saves.
- `/weekend-planner` currently supports only generic `city/state/checkin/checkout` prefill for travel-style planning. It does **not** save tournament context, prefill planner events, or preserve temporary guest planner state.
- Tournament detail pages are still the highest-impact implementation target, but they already have a strong planning module. Any new CTA there should extend existing planner analytics patterns and avoid duplicating `Plan this tournament`.
- Sport/state and metro hubs have strong engagement but weaker immediate intent. They should use softer generic planner copy if touched later.
- `/book-travel#team-hotel-blocks` is already a valid destination and can safely be used as a secondary travel CTA.

## Route Inventory

### 1. Tournament detail

- Route: `/tournaments/[slug]`
- Main file: `apps/ti-web/app/tournaments/[slug]/page.tsx`
- Render model: mixed server/client
- Auth state available: yes, via `createSupabaseServerClient()` and `loadViewerContext()`
- Existing planner-related actions:
  - `SaveTournamentButton`
  - `TournamentPlanningCtasClient`
  - `TournamentMapTeaser`
  - `QuickVenueCheck`
- Existing travel-related actions:
  - `Search travel`
  - venue map teaser / sticky map CTA
- Analytics attachability: high; route already uses typed TI analytics patterns
- Mobile/layout constraints:
  - hero/action stack is already dense
  - best insertion point is the existing action cluster, not a new global banner
- Lowest-risk CTA insertion point:
  - extend or refine `TournamentPlanningCtasClient`, or reuse the existing save/planning block near `SaveTournamentButton`

### 2. Weekend-specific page

- Route: `/weekend/[slug]`
- Main file: `apps/ti-web/app/weekend/[slug]/page.tsx`
- Render model: mixed server/client
- Auth state available: yes, via `createSupabaseServerClient()` and `getTiTierServer()`
- Existing planner-related actions:
  - `SaveWeekendPlanClient`
  - `Edit in Weekend Planner`
  - `WeekendPlanningCtasClient`
- Existing travel-related actions:
  - `Find hotels`
  - `Find rentals`
  - `Travel search`
  - venue map
- Analytics attachability: high; route already has typed click events
- Mobile/layout constraints:
  - action area is already crowded but coherent
  - planner/save UX already exists above the travel CTA row
- Lowest-risk CTA insertion point:
  - none needed in the first Stage `3.7B` pass; this page is already a planner bridge

### 3. Sport/state hub

- Route: `/<sport>/<state>`
- Main file: `apps/ti-web/app/[sport]/[state]/page.tsx`
- Render model: mostly server-rendered with linked cards
- Auth state available: no
- Existing planner-related actions: none
- Existing travel-related actions:
  - `Find Hotels`
  - `Find Rentals`
  - `Tournament Details`
  - venue map preview strip
- Analytics attachability: medium; would require new typed events or reuse of planner contextual CTA schema
- Mobile/layout constraints:
  - cards are already CTA-heavy
  - better insertion point is a compact module above results or a restrained per-card secondary action only after validation
- Lowest-risk CTA insertion point:
  - a small contextual module above the results grid, not a new button on every card

### 4. Sport/state/metro hub

- Route: `/<sport>/<state>/<metro>`
- Main file: `apps/ti-web/app/[sport]/[state]/[metro]/page.tsx`
- Render model: mostly server-rendered with linked cards
- Auth state available: no
- Existing planner-related actions: none
- Existing travel-related actions:
  - `Find Hotels`
  - `Find Rentals`
  - `Tournament Details`
- Analytics attachability: medium
- Mobile/layout constraints:
  - similar to state hubs; card CTA rows are already busy
- Lowest-risk CTA insertion point:
  - compact module near the hero or above results, not inside every card in the first pass

### 5. Tournament directory

- Route: `/tournaments`
- Main file: `apps/ti-web/app/tournaments/page.tsx`
- Render model: mixed server/client
- Auth state available: no
- Existing planner-related actions:
  - `PlanWeekendCtaClient` on each tournament card linking to `/weekend/[slug]`
  - no-results `Plan by city` link to `/weekend-planner`
- Existing travel-related actions:
  - `Find Hotels`
  - `Find Rentals`
  - `Tournament Details`
  - venue map preview strip
- Analytics attachability: high for card-level reuse; medium for any new soft module
- Mobile/layout constraints:
  - card rows are already full
  - no-results state already has a planner-safe fallback CTA
- Lowest-risk CTA insertion point:
  - keep card-level `Plan weekend` as the main planner activation
  - if needed later, add a soft module above results instead of another card button

### 6. Travel page

- Route: `/book-travel`
- Main file: `apps/ti-web/app/book-travel/page.tsx`
- Render model: mixed server/client
- Auth state available: no; current page hardcodes signed-out/unknown props into the client blocks
- Existing planner-related actions:
  - `WeekendPlannerClient`
  - generic travel-based planner/search experience
- Existing travel-related actions:
  - `BookTravelTeamBlockForm`
  - team hotel CTA section at `#team-hotel-blocks`
- Analytics attachability: high; route already fires `book_travel_*` and `team_hotel_*`
- Mobile/layout constraints:
  - flow is already planner/travel oriented
- Lowest-risk CTA insertion point:
  - none required for Stage `3.7B`; this page is already the travel-side bridge

## Existing Action Inventory

### `SaveTournamentButton`

- File: `apps/ti-web/components/SaveTournamentButton.tsx`
- Copy:
  - `Save`
  - `Saved`
  - auth prompts to sign up / verify
- Destination/action:
  - POST/DELETE saved-tournament API
- Logged-out support: yes
- Auth redirect behavior:
  - redirects to `/signup?returnTo=...` or `/verify-email?returnTo=...`
- Carries context into Weekend Planner: no
- Reusable for Stage `3.7B`: partial only; good for tournament saving, not planner activation

### `TournamentPlanningCtasClient`

- File: `apps/ti-web/app/tournaments/[slug]/TournamentPlanningCtasClient.tsx`
- Copy:
  - `Plan this tournament`
  - `Open venue map →`
  - `Search travel →`
- Destination/action:
  - `/weekend/[slug]`
  - `/tournaments/[slug]/map`
  - `/book-travel?city=...&state=...&checkin=...&checkout=...`
- Logged-out support: yes, plain links
- Auth redirect behavior: none at this layer
- Carries context into Weekend Planner: yes, via weekend-page route and optional `?venue=`
- Reusable for Stage `3.7B`: yes; this is the strongest existing contextual planner surface

### `SaveWeekendPlanClient`

- File: `apps/ti-web/app/weekend/[slug]/SaveWeekendPlanClient.tsx`
- Copy:
  - `Add to planner`
  - `Update planning anchor`
  - `View in Weekend Planner →`
- Destination/action:
  - server action saving `tournamentId` + optional `selectedVenueId`
- Logged-out support: yes, inline sign-in/create-account prompts
- Auth redirect behavior:
  - `/login?returnTo=...`
  - `/signup?returnTo=...`
- Carries context into Weekend Planner: yes, true weekend-plan save behavior
- Reusable for Stage `3.7B`: yes, but only on weekend pages where tournament context already exists

### `WeekendPlanningCtasClient`

- File: `apps/ti-web/app/weekend/[slug]/WeekendPlanningCtasClient.tsx`
- Copy:
  - `Find hotels`
  - `Find rentals`
  - `Open venue map →`
  - `Travel search →`
  - `Weekend Planner →`
- Destination/action:
  - travel partner links
  - `/tournaments/[slug]/map`
  - `/book-travel`
  - `/weekend-planner`
- Logged-out support: yes
- Auth redirect behavior: none
- Carries context into Weekend Planner: no; plain planner hub link
- Reusable for Stage `3.7B`: limited; already useful on weekend pages, but not a true context bridge

### `PlanWeekendCtaClient`

- File: `apps/ti-web/app/tournaments/PlanWeekendCtaClient.tsx`
- Copy: `Plan weekend`
- Destination/action:
  - `/weekend/[slug]`
- Logged-out support: yes
- Auth redirect behavior: none
- Carries context into Weekend Planner: yes, indirectly through the weekend page
- Reusable for Stage `3.7B`: yes, especially on tournament-card surfaces

### `SavedTournamentActionsClient`

- File: `apps/ti-web/app/weekend-planner/SavedTournamentActionsClient.tsx`
- Copy:
  - `Open tournament →`
  - `Weekend plan →`
  - `Venue map →`
  - `Travel →`
- Destination/action:
  - `/tournaments/[slug]`
  - `/weekend/[slug]`
  - `/tournaments/[slug]/map`
  - `/book-travel?...`
- Logged-out support: no; this is inside authenticated planner UI
- Auth redirect behavior: not needed
- Carries context into Weekend Planner: not directly; this is outbound from planner
- Reusable for Stage `3.7B`: as analytics/event-model precedent only

### `WeekendPlanActionsClient`

- File: `apps/ti-web/app/weekend-planner/WeekendPlanActionsClient.tsx`
- Copy:
  - `Continue plan →`
  - `Venue map →`
  - `Travel →`
  - `Edit notes`
  - `Add/Edit lodging details`
  - `Remove plan`
- Destination/action:
  - continues saved weekend-plan flow back into `/weekend/[slug]`
- Logged-out support: no
- Auth redirect behavior: not needed
- Carries context into Weekend Planner: yes, but only from existing saved plan state
- Reusable for Stage `3.7B`: not for public entry surfaces

### `WeekendPlannerEntryCtas`

- File: `apps/ti-web/app/weekend-planner/WeekendPlannerEntryCtas.tsx`
- Copy:
  - `Create account to test beta`
  - `Sign in`
- Destination/action:
  - `/signup?returnTo=%2Fweekend-planner`
  - `/login?returnTo=%2Fweekend-planner`
- Logged-out support: yes
- Auth redirect behavior: explicit
- Carries context into Weekend Planner: only return path to planner hub
- Reusable for Stage `3.7B`: yes, for generic logged-out planner entry, not tournament-specific context

### `BookTravelTeamBlockForm`

- File: `apps/ti-web/app/book-travel/BookTravelTeamBlockForm.tsx`
- Copy:
  - section anchored at `#team-hotel-blocks`
  - team hotel request messaging
- Destination/action:
  - POST `/api/lodging/group-request`
- Logged-out support: yes
- Auth redirect behavior: none
- Carries context into Weekend Planner: no
- Reusable for Stage `3.7B`: yes, as a secondary travel CTA target only

## Available Public Context

### Tournament detail

Available today:
- tournament `id`, `slug`, `name`
- `city`, `state`, `start_date`, `end_date`
- linked venues, including primary venue
- travel query construction from city/state/dates
- viewer auth state and saved status

Safe to carry:
- slug
- city/state
- dates
- primary venue ID only when already validated and linked

Do not newly carry:
- private contact fields
- viewer email
- claim/edit state

### Weekend page

Available today:
- tournament `id`, `slug`, `name`
- `city`, `state`, `start_date`, `end_date`
- selected venue, plan anchor, plan existence
- auth state and entitlement
- travel URLs derived from public tournament/venue context

Safe to carry:
- slug
- validated venue ID / slug
- city/state/dates

Do not newly carry:
- private lodging notes
- share tokens
- user-specific plan internals outside existing save actions

### Sport/state and metro hubs

Available today:
- sport
- state
- metro slug/name on metro hubs
- per-card tournament `id`, `slug`, `city`, `state`, `dates`
- card-level venue-count hints

Safe to carry:
- per-card tournament slug into `/weekend/[slug]`
- city/state into `/book-travel` or generic planner prefill

Do not newly carry:
- synthetic inferred planner state across cards
- bulk multi-tournament selection

### Tournament directory

Available today:
- filters/search state
- card-level tournament `id`, `slug`, `city`, `state`, `dates`
- no-results search query
- existing no-results planner prefill to `/weekend-planner` with `state`, optional parsed `city`, optional future-safe `sport`

Safe to carry:
- card slug into `/weekend/[slug]`
- city/state/checkin/checkout to `/book-travel`
- city/state to `/weekend-planner`

Do not newly carry:
- arbitrary filter blobs into planner

### `/book-travel`

Available today:
- generic destination/date inputs
- optional `city`, `state`, `checkin`, `checkout` prefill via `WeekendPlannerClient`
- valid team-hotel anchor: `/book-travel#team-hotel-blocks`

Safe to carry:
- `city`
- `state`
- `checkin`
- `checkout`

Not supported today:
- tournament save
- planner-event prefill
- planner guest/session state

## Safest Linking Behavior

### Current support

- Prefilled planner event creation: no
- Query params for planner/travel context: yes, but only generic `city/state/checkin/checkout` prefill on `/weekend-planner` and `/book-travel`
- Saved tournament actions: yes
- Redirect after auth: yes, for save flows and planner entry flows
- Auth-required planner flows: yes
- Temporary guest/session planner state: no

### Recommendation by route family

- Tournament detail: **A**
  - reuse existing planning path through `/weekend/[slug]`
- Weekend page: **A**
  - reuse existing save/edit weekend-plan actions
- Tournament directory cards: **A**
  - keep routing through `/weekend/[slug]`
- Generic directory no-results / soft browse modules: **B**
  - safe generic link to `/weekend-planner` with only already-supported query params
- Sport/state + metro hubs: **C** initially, optionally **B** if a small module uses only safe public city/state hints
- `/book-travel`: no new bridge needed; existing page already owns the travel/planner crossover

### Key conclusion

Do **not** recommend a new planner-prefill system for Stage `3.7B`.

The app does not currently support a true “Add this tournament to Weekend Planner” action from public non-weekend pages. The truthful current promise is:
- `Plan this tournament` or `Plan this weekend` when routing through `/weekend/[slug]`
- `Open Weekend Planner Beta` when linking generically to `/weekend-planner`

## Ranked Recommendations

### 1. Tournament detail action module refinement

- Route: `/tournaments/[slug]`
- File: `apps/ti-web/app/tournaments/[slug]/TournamentPlanningCtasClient.tsx`
- Placement: existing planning CTA block under the tournament summary
- Suggested heading: `Planning for this tournament?`
- Suggested body: `Use the weekend plan to organize venue, travel, food, and parent logistics around this event.`
- Primary button: keep `Plan this tournament`
- Optional secondary link: `Need rooms for the team? Request team hotel options`
- Secondary destination: `/book-travel#team-hotel-blocks`
- Logged-out behavior: plain links, no blocking
- Logged-in behavior: weekend page can then offer save/update planner actions
- Analytics:
  - impression: new `weekend_planner_contextual_cta_viewed` variant or route-specific typed event
  - click: existing `tournament_detail_weekend_plan_clicked` plus optional planner CTA schema
- Expected intent: highest
- Complexity: low
- Risk: low

### 2. Tournament directory above-results soft planner module

- Route: `/tournaments`
- File: `apps/ti-web/app/tournaments/page.tsx`
- Placement: above the results grid, below filters/analytics client
- Suggested heading: `Following multiple tournaments?`
- Suggested body: `Use Weekend Planner to keep tournament weekends, travel notes, and reminders in one place.`
- Primary button: `Open Weekend Planner Beta`
- Optional secondary link: none initially
- Logged-out behavior: direct link to `/weekend-planner`
- Logged-in behavior: direct link to `/weekend-planner`
- Analytics:
  - impression: `weekend_planner_contextual_cta_viewed`
  - click: `weekend_planner_contextual_cta_clicked`
- Expected intent: medium-high for active browsers
- Complexity: low
- Risk: low

### 3. State-hub soft planner module

- Route: `/<sport>/<state>`
- File: `apps/ti-web/app/[sport]/[state]/page.tsx`
- Placement: above the results section, below hub summary modules
- Suggested heading: `Following multiple tournaments?`
- Suggested body: `Use Weekend Planner to keep upcoming tournaments, travel notes, and reminders in one place.`
- Primary button: `Open Weekend Planner Beta`
- Logged-out behavior: direct link to `/weekend-planner`
- Logged-in behavior: direct link to `/weekend-planner`
- Analytics:
  - impression: `weekend_planner_contextual_cta_viewed`
  - click: `weekend_planner_contextual_cta_clicked`
- Expected intent: medium
- Complexity: medium
- Risk: medium

### 4. Metro-hub soft planner module

- Route: `/<sport>/<state>/<metro>`
- File: `apps/ti-web/app/[sport]/[state]/[metro]/page.tsx`
- Placement: below hero/market summary, above results
- Suggested heading: `Managing a busy tournament stretch?`
- Suggested body: `Open Weekend Planner to keep tournament weekends, travel notes, and reminders organized.`
- Primary button: `Open Weekend Planner Beta`
- Logged-out behavior: direct link to `/weekend-planner`
- Logged-in behavior: direct link to `/weekend-planner`
- Analytics:
  - impression: `weekend_planner_contextual_cta_viewed`
  - click: `weekend_planner_contextual_cta_clicked`
- Expected intent: medium
- Complexity: medium
- Risk: medium

### 5. Directory no-results CTA keep-as-is

- Route: `/tournaments`
- File: `apps/ti-web/app/tournaments/page.tsx`
- Placement: existing no-results card
- Suggested action: keep existing `Plan by city`
- Reason:
  - already truthful
  - already uses safe `city/state` prefill only
  - only shows when user has no immediate tournament match
- Complexity: none
- Risk: low

## Where Not To Add CTAs Yet

- `/weekend/[slug]`
  - already has save/edit planner actions; another planner CTA would be redundant
- `/book-travel`
  - already contains the planner/travel experience and team-hotel surface
- every sport/state card
  - card CTA rows are already dense
- every metro card
  - same density problem as state hubs
- global header/nav
  - already present; low-intent and not contextual
- footer-only placements
  - low visibility and low intent
- venue-map-heavy surfaces as a first Stage `3.7B` step
  - higher complexity and more action competition

## Recommended Implementation Order

1. Refine the existing tournament-detail planning block before adding any new generic planner CTA.
2. Add one soft planner module to `/tournaments` above results.
3. Validate activation before touching sport/state or metro hubs.
4. If expansion is warranted, add the softer state-hub module next.
5. Leave weekend pages and `/book-travel` unchanged in the first implementation pass.
