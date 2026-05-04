# Prompt — TI Directory Cards: Replace “Official site” With Internal Planning CTA (V1.1)

You are working inside the TournamentInsights (TI) codebase.

--------------------------------------------------
SCOPE (NON-NEGOTIABLE)
--------------------------------------------------
TI ONLY.

Do NOT modify:
- `apps/referee/**`
- `/go/*` routes
- Booking/VRBO redirect logic
- Stripe logic
- entitlement logic
- global styles / typography
- tournament detail page organizer link behavior (keep it)

Allowed:
- Tournament directory/list pages in `apps/ti-web`
- Tournament card/listing components used by:
  - `/tournaments` directory
  - sport/state hubs (if they reuse the same card component)
  - search/listing views

--------------------------------------------------
GOAL
--------------------------------------------------
Keep users inside TournamentInsights longer and push them toward the map/planning flow (primary monetization surface), instead of sending them to organizer sites from directory cards.

Directory card = discovery entry point  
Map page = planning + monetization engine

--------------------------------------------------
SEARCH TARGETS
--------------------------------------------------
Search in `apps/ti-web` for:
- “Official site”
- “View details”
- tournament listing/directory card component(s)
- sport/state hub cards (if separate)

--------------------------------------------------
REQUIRED CHANGE (DIRECTORY CARDS ONLY)
--------------------------------------------------
On tournament directory/listing cards, remove the external “Official site” button/CTA.

Replace it with an internal planning CTA block:

Label text:
- “Stay near your fields”

CTA text:
- “See the closest options →”

--------------------------------------------------
BEHAVIOR (STRICT)
--------------------------------------------------
- The new CTA routes internally to the tournament map page:
  - `/tournaments/[slug]/map`
- Do NOT open the Weekend Pro modal from directory cards.
- Do NOT link to `/go/hotels` or `/go/vrbo` from directory cards.
- Do NOT remove or change the primary “View details” button.
- “View details” remains the primary action.

--------------------------------------------------
DATA / AVAILABILITY GUARDRAIL (CLARIFIED)
--------------------------------------------------
Render the planning CTA only when:
- tournament slug exists, AND
- existing listing data indicates the tournament has venues (e.g. `venue_count > 0`, or an equivalent already-selected field).

If listing indicates zero venues:
- hide the planning CTA
- keep “View details” only

Do NOT require coordinate data unless the listing already provides it reliably.
Do NOT add new API calls solely to determine map availability.

--------------------------------------------------
VISUAL PRIORITY / MOBILE UX
--------------------------------------------------
- Remove the “Official site” button entirely from directory cards.
- The new planning CTA must NOT overpower “View details.”
- Do NOT add a second “big/primary” green button in the card actions.

Preferred layout:
- Primary button: “View details”
- Secondary smaller link/button: “See the closest options →” (with the “Stay near your fields” label above it)

On small screens:
- allow wrapping/stacking
- avoid adding more than one extra row of actions

No new global styles; reuse existing card/button patterns.

--------------------------------------------------
COPY RULES
--------------------------------------------------
Use ONLY:
- “Stay near your fields”
- “See the closest options →”

Do NOT use:
- “Official site”
- “Best hotels”
- “Recommended”
- “Top-rated”

--------------------------------------------------
DETAIL PAGE NOTE (IMPORTANT)
--------------------------------------------------
Do not remove the organizer/official link from tournament detail pages.

If the detail page link text is touched, keep it as:
- “More details from organizer”

Open in a new tab.

--------------------------------------------------
ANALYTICS (RECOMMENDED, TI-ONLY)
--------------------------------------------------
Track existing TI event `tournament_map_cta_clicked` on the directory card CTA click.

Set:
- `source_context = "directory_card"`

Include:
- `tournament_slug`
- `sport` (if available)
- `cta_label`
- `href`

Do NOT introduce new event names.

Implementation note:
If the directory card is a Server Component, render the CTA via a thin `use client` wrapper component.

--------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------
1) Tournament directory cards no longer show “Official site.”
2) Cards show “Stay near your fields” + “See the closest options →” only when venues exist.
3) CTA routes to `/tournaments/[slug]/map`.
4) “View details” still works and remains primary.
5) No organizer external click from directory cards.
6) No changes to `/go/*` routes.
7) No changes to `apps/referee/**`.
8) Mobile cards remain clean and usable.
9) Build/typecheck passes for TI.

