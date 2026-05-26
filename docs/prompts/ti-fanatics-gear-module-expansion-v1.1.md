# TournamentInsights — Fanatics Gear Module Expansion (v1.1)
## Sport-Aware, DB-Driven, With Module-Level Affiliate Disclosure

You are working in the TournamentInsights Next.js App Router codebase under `apps/ti-web`.

Goal:
Expand the existing Fanatics partner module so tournament detail pages can show a sport-aligned Fanatics gear CTA for sports where `partner_links` exist, with an `all_sports` fallback.

Also ensure a clear affiliate disclosure is shown **inside every Fanatics module/card**, including the existing soccer World Cup Fanatics card.

Do NOT hardcode affiliate URLs in UI components.
Do NOT create a new `/go/fanatics` route.
Keep routing + tracking through the existing `/go/partner/[partnerLinkId]` redirect.

-------------------------------------------------------------------
CONFIRMED REALITY
-------------------------------------------------------------------

Partner config lives in Supabase tables:
- `public.partners`
- `public.partner_links`

Seeded by:
- `supabase/migrations/20260514_partner_management_v1.sql`
- `supabase/migrations/20260521_ti_fanatics_world_cup_fan_gear_link.sql`

Link selection logic:
- `apps/ti-web/lib/partners.ts`
  - `normalizeSportKey()`
  - `getPartnerLinkForSport()`
  - `getFanaticsLinkAndDisclosure()`

Known normalized sport keys:
- `soccer`
- `basketball`
- `hockey`
- `lacrosse`
- `baseball_softball`
- `all_sports`

Tracked redirect route:
- `apps/ti-web/app/go/partner/[partnerLinkId]/route.ts`
- Logs `partner_click_clicked` into `public.ti_map_events.properties`
- Redirects to `partner_links.url`
- Logs `outbound_url`
- Logs `source_component` mirroring placement

Existing UI modules:
- `apps/ti-web/components/partners/FanaticsGearModule.tsx`
- `apps/ti-web/components/partners/SoccerWorldCupFanGearCard.tsx`

Tournament detail page:
- `apps/ti-web/app/tournaments/[slug]/page.tsx`

There is no `/go/fanatics` route. Do not add one.

World Cup soccer link identity (do not rename):
- placement: `soccer_tournament_world_cup_fan_gear`
- campaign: `world_cup_2026`
- page_type in seeded row: `tournament_detail`

-------------------------------------------------------------------
SCOPE
-------------------------------------------------------------------

Add sport-aware Fanatics module support on tournament detail pages for supported sports.
Reuse the DB-driven partner link architecture.
Keep changes minimal and reversible.

Do NOT:
- change `partner_links` schema
- hardcode Fanatics affiliate URLs in React/UI components
- add new dependencies
- show duplicate Fanatics modules on the same tournament page
- change `/go/partner` behavior unless a clear bug is found

-------------------------------------------------------------------
IMPLEMENTATION TASKS
-------------------------------------------------------------------

## 1) Identify existing tournament detail placement
File:
- `apps/ti-web/app/tournaments/[slug]/page.tsx`

Find where partner/affiliate/extra/gear modules are rendered today.
Identify the existing soccer World Cup Fanatics placement.
Choose a single canonical placement for Fanatics on the tournament detail page.

Hard rule:
- The final tournament page must show **at most one** Fanatics module/card.

## 2) Render a generic Fanatics module for supported sports
Preferred approach:
- Reuse `FanaticsGearModule` for non-soccer sports (and for soccer only when the World Cup card is NOT rendered).
- Use `getFanaticsLinkAndDisclosure()` server-side.
- Render only if a valid `partnerLinkId` is returned.

De-dupe rules:
- If the World Cup soccer card is rendered (placement `soccer_tournament_world_cup_fan_gear` / campaign `world_cup_2026`),
  do NOT also render the generic Fanatics module on that page.
- For other sports, render the generic module when a link exists (sport-specific or `all_sports` fallback).

## 3) Make copy sport-aware (no URL hardcoding)
Copy can be determined in code with a small mapping (in `page.tsx` or a tiny helper).

Suggested copy by normalized sport key:

`soccer`
- Title: `Shop soccer fan gear`
- Subcopy: `Show your colors for tournament weekend.`

`basketball`
- Title: `Shop basketball gear`
- Subcopy: `Find fan gear for the season.`

`hockey`
- Title: `Shop hockey gear`
- Subcopy: `Get ready for rink weekends.`

`lacrosse`
- Title: `Shop lacrosse gear`
- Subcopy: `Shop gear for lacrosse weekends.`

`baseball_softball`
- Title: `Shop baseball & softball gear`
- Subcopy: `Gear up for tournament weekend.`

`all_sports`
- Title: `Shop tournament gear`
- Subcopy: `Find fan gear for your tournament weekend.`

For the existing soccer World Cup card:
- Keep current World Cup-specific copy.

## 4) Tracking and href requirements
All Fanatics CTAs must route through:

`/go/partner/<partnerLinkId>`

Include context query params when available:
- `tournament_id=<uuid>` if available
- `venue_id=<uuid>` if available
- `page_type=tournament_page` for the generic module (match existing conventions)
- `placement=gear_module` for the generic module
- For the World Cup card, keep using its existing placement value:
  - `placement=soccer_tournament_world_cup_fan_gear`
- `campaign=`:
  - For generic module, omit unless you have a strong reason; let the DB `partner_links.campaign` be logged
  - For World Cup card, keep `campaign=world_cup_2026` if already being passed

Important:
- Do NOT include a `sport=` query param expecting `/go/partner` to log it. `/go/partner` logs sport from the `partner_links` row.
- Preserve `rel="sponsored noopener noreferrer"` and open in a new tab as the module already does.

## 5) Module-level affiliate disclosure (Fanatics only) — ALWAYS visible
Every Fanatics module/card must show an affiliate disclosure **inside** the module (not tooltip-only; not page-level only).

Implementation requirements:
- Prefer using disclosure text from DB when available:
  - `getFanaticsLinkAndDisclosure()` returns `disclosureText` from `partners.disclosure_text`
- If DB disclosure text is missing, fall back to this constant:
  ```ts
  const FANATICS_AFFILIATE_DISCLOSURE_FALLBACK =
    "TournamentInsights may earn a commission from qualifying purchases through this link, at no additional cost to you.";
  ```
- Disclosure placement:
  - `FanaticsGearModule`: render disclosure below the CTA, small/muted but readable.
  - `SoccerWorldCupFanGearCard`: render the disclosure as **small muted text directly beneath the flags row** (or directly beneath the CTA if layout demands), readable on the dark background.
- Do not change any affiliate URLs or routing.

-------------------------------------------------------------------
ACCEPTANCE CRITERIA
-------------------------------------------------------------------
- Tournament pages show at most one Fanatics module/card (no duplicates).
- Supported sports show a sport-aware Fanatics module using DB-driven link selection with `all_sports` fallback.
- No Fanatics affiliate URLs are hardcoded in UI components.
- All Fanatics modules/cards show a visible affiliate disclosure inside the module (DB-driven preferred, fallback otherwise).
- Clicks go through `/go/partner/[partnerLinkId]` and log:
  - partner/link identity fields
  - campaign/placement/page_type
  - tournament_id / venue_id when provided
  - outbound_url + source_component (already logged)

-------------------------------------------------------------------
OUTPUT REQUESTED (after implementation)
-------------------------------------------------------------------
- Files changed
- Which placement(s) on tournament pages were used
- How soccer duplication was avoided
- Manual QA steps (soccer page with World Cup card, and one non-soccer tournament page)

Commit message:
`ti: expand fanatics gear module + add disclosure`

