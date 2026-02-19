## 2026-02-19
- Sport container background rollout for tournament cards:
  - Added new shared container assets and switched TI sport card containers to use them:
    - `soccer_container.svg`, `lacrosse_container.svg`, `basketball_court_container.svg`,
      `baseball_container.svg`, `softball_container.svg`, `football_container.svg`, `hockey_container.svg`.
  - Updated TI sport mapping to dedicated classes for lacrosse + hockey:
    - `lacrosse -> bg-sport-lacrosse`
    - `hockey -> bg-sport-hockey`
  - Updated TI container CSS to use zoomed fill (`230%`) so sport art fills the card container cleanly without gray framing:
    - `apps/ti-web/app/tournaments/page.tsx`
    - `apps/ti-web/app/tournaments/tournaments.css`
  - Shared asset source-of-truth:
    - `shared-assets/svg/sports/*_container.svg`

- TI tournament counters: new custom background assets by sport:
  - Added dedicated counter backgrounds for:
    - soccer (`/svg/sports/soccer_count_badge.svg`)
    - basketball (`/svg/sports/basketball_count_badge.svg`)
    - lacrosse (`/svg/sports/lacrosse_counter_badge.svg`)
    - total tournaments (`/svg/sports/total_tournaments_count.svg`)
  - Continued use of baseball/softball custom backgrounds from updated shared assets.
  - Introduced `summary-sport-*` and `summary-total` classes on summary tiles for independent counter styling.
  - Tuned soccer/baseball counter crop/zoom to hide source-image frame/shadow artifacts.
  - Removed baseball/softball badge overlay from tournament cards; counter backgrounds remain in summary grid only.
  - Files:
    - `apps/ti-web/app/tournaments/page.tsx`
    - `apps/ti-web/app/tournaments/tournaments.css`
    - `shared-assets/svg/sports/*`

- TI baseball/softball badge source replacements:
  - Updated baseball source artwork:
    - `shared-assets/svg/sports/baseball_badge.svg` (from `baseball_new_bg.svg`)
  - Updated softball source artwork:
    - `shared-assets/svg/sports/softball_badge.svg` (from `softball_new_bg.svg`)
  - Synced shared assets into TI public path with `node scripts/copy-shared-svg.js`.

- TI card/counter behavior refinement:
  - Kept baseball/softball badges on counter widgets as tile backgrounds.
  - Removed extra baseball/softball badge block overlay from tournament cards.
  - Preserved ball icons as foreground sport icons.
  - File:
    - `apps/ti-web/app/tournaments/tournaments.css`

- TI baseball/softball counter background refinement:
  - Kept baseball/softball balls (`⚾`, `🥎`) as the visible sport icons in summary/cards.
  - Applied baseball/softball SVGs as full summary-tile backgrounds for sport counters.
  - Replaced baseball badge source with a text-free file:
    - `/Users/roddavis/Downloads/artwork/baseball_new_bg.svg` -> `shared-assets/svg/sports/baseball_badge.svg`.
  - Improved summary tile clarity:
    - removed blur (`backdrop-filter`) from summary cards,
    - added stronger readability overlay above background art,
    - adjusted baseball background crop/zoom/position to remove frame/shadow artifacts.
  - Related files:
    - `apps/ti-web/app/tournaments/page.tsx`
    - `apps/ti-web/app/venues/page.tsx`
    - `apps/ti-web/app/tournaments/tournaments.css`
    - `shared-assets/svg/sports/baseball_badge.svg`

- TI sport badge/card refresh for baseball + softball:
  - Added shared badge assets:
    - `shared-assets/svg/sports/baseball_badge.svg`
    - `shared-assets/svg/sports/softball_badge.svg`
  - Replaced baseball tournament counter/card icon usage with `baseball_badge.svg`.
  - Added softball icon rendering in TI tournament + venue listing sport icons.
  - Added TI `bg-sport-softball` mapping and sport surface/card CSS treatment so softball cards/details get sport-specific presentation.
  - Updated files:
    - `apps/ti-web/app/tournaments/page.tsx`
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
    - `apps/ti-web/app/venues/page.tsx`
    - `apps/ti-web/app/tournaments/tournaments.css`
  - Asset sync run:
    - `node scripts/copy-shared-svg.js`

- Cross-app ops note:
  - Fixed RI `/admin/tournaments/sources` production render issue by avoiding closure-captured `URLSearchParams` in server actions.
  - RI-only runtime fix; no TI page behavior changes.

- Cross-app ops note:
  - RI admin home now includes an organized tournament/venue maintenance dashboard with missing-data widgets that deep-link into filtered edit/delete views.
  - This change is RI-only and does not alter TI pages/components.

- Cross-app ops note:
  - Added RI source-registry preservation of active filters after row actions (save/sweep/quick actions) so large source sets (including USSSA state sources) are manageable without losing selected sport/state filters.
  - RI-only change; no TI UI/behavior changes in this update.

- TI tournament detail access-tier update (paid planning fields):
  - Added a new **Premium Planning Details** section to `apps/ti-web/app/tournaments/[slug]/page.tsx` with a lock state for non-paid users.
  - Locked (public + free-login) behavior now shows:
    - "Locked — Upgrade to view Food vendors, restrooms, amenities, travel/lodging notes."
    - Upgrade CTA linking to `/pricing`.
  - Paid behavior now conditionally fetches and renders:
    - `tournaments.travel_lodging` (display label: "Travel/Lodging Notes")
    - `venues.food_vendors`
    - `venues.restrooms`
    - `venues.amenities`
  - Public/base detail query remains on `tournaments_public` and does not expose premium planning fields.
  - Added styling for the premium card in `apps/ti-web/app/tournaments/tournaments.css`.
  - Temporary entitlement stub added:
    - `TI_FORCE_PAID_TOURNAMENT_DETAILS=true` enables paid rendering path.
  - Validation:
    - `npx tsc -p apps/ti-web/tsconfig.json --noEmit` passed.
    - `next lint` for `ti-web` still requires initial ESLint setup prompt in this workspace.

## 2026-02-18
- Tournament directory summary tile updates:
  - Total tournaments tile now shows current on-page result count (post-filter), not global DB total:
    - `apps/ti-web/app/tournaments/page.tsx`.
  - Total tile icon switched to transparent TI mark:
    - `/svg/ti/tournamentinsights_mark_transparent.svg`.
  - Added new shared asset:
    - `shared-assets/svg/ti/tournamentinsights_mark_transparent.svg`.
  - Cropped transparent mark viewBox so the icon appears visually larger/centered in the tile.
  - Increased summary/tournament sport SVG icon sizes for better lacrosse visibility:
    - `apps/ti-web/app/tournaments/tournaments.css`.
- Homepage messaging update:
  - Committed `ed9cb02` (`TI: update homepage value props copy`) in `apps/ti-web/app/page.tsx`.
  - Replaced “What TournamentInsights provides” block copy with current value-prop language:
    - Verified tournament essentials — sport, dates, location, and official links
    - Clean filtering by sport, state, and month
    - Structured, moderated event insights
    - Logistics-focused detail pages built for real tournament planning
  - Replaced follow-up paragraph with:
    - “TournamentInsights delivers organized, moderated tournament intelligence designed to help families, coaches, and teams evaluate events faster and with greater confidence.”
  - Removed homepage defensive wording around “no ratings / no public reviews / not a review platform”.
- Homepage layout polish:
  - Center-aligned the “What TournamentInsights Provides” heading and bullet content (scoped styling only).
  - Files:
    - `apps/ti-web/app/page.tsx`
    - `apps/ti-web/app/globals.css`

## 2026-02-16
- TI branding: TI header/layout mirrors RI structure with TI colors and shared logo `shared-assets/svg/ti/tournamentinsights_logo.svg` (used in layout/home).
- TI pages: Added `/tournaments` (RI-style filters/cards, no ratings/reviews), `/tournaments/[slug]` (logistics-only detail), `/how-it-works`, `/list-your-tournament`, and updated home CTAs.
- Assets/infra: Copied shared logo to `apps/ti-web/public/brand/tournamentinsights_logo.svg`; build root `apps/ti-web`. Env needed: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (optional `NEXT_PUBLIC_SITE_URL`).
- Styling fixes: TI tournaments cards now use the same sport backgrounds/textures as RI, with `bg-sport-*` classes and copied textures under `apps/ti-web/public/textures/`.
- UI polish: Sport icon moved to bottom-center of TI cards; official/Details buttons centered with spacing to mirror RI layout.
- Filters/summary: TI tournaments filter bar uses RI-style Apply/Reset buttons; summary grid shows total tournaments and per-sport counts with sport icons (mirroring RI summary cards).
- Buttons: Card footers are bottom-aligned; both buttons are white; when official site is missing, the button still renders with a small “TBD” beneath the label.
- Header theme: TI header uses navy → electric blue gradient (`--ti-header-1/2/3`), white nav with blue hover, and yellow CTA (`--ti-cta`/`--ti-cta-text`), matching RI layout/behavior.
- Detail hero: TI tournament detail uses sport-based hero background; centered content; venue block with map links if address present; Google/Apple/Waze rendered as separate buttons; removed referee text. Official link matches directory styling; source link removed.
- Directory hero: Tournament directory intro panel uses a light TI gradient tint with soft blue border to keep text legible while matching the TI header theme.
- Detail buttons: Official site and map buttons use the white pill styling from directory cards; map buttons are hidden unless a real venue/address with city and state is available.
- Venue row: Detail venue section shows venue name + address with navigation buttons aligned to the right; nav buttons are suppressed when venue/address data is incomplete.
- Linked venues: Detail page now reads `tournament_venues -> venues` and renders all linked venues with address + map buttons; falls back to inline venue/address fields if no links exist.
- Header spacing: TI header now keeps Public Beta pill, nav links, and CTA on the same row for alignment.
- SEO: Added TI-specific metadata defaults (canonical, OG/Twitter), page-specific metadata, sitemap.xml and robots.txt, and JSON-LD (SportsEvent) on tournament detail pages.
- Analytics: Plausible script injected site-wide (configurable via `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, default `tournamentinsights.com`).
- Homepage: Added credibility/support band under hero with TI gradient tint and copy “Inspired by real tournament families…” (no referee mentions).
