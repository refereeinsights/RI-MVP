## 2026-02-25
- TI verify-email completion fix (confirmation links now complete auth):
  - Added:
    - `apps/ti-web/app/verify-email/VerifyCodeExchange.tsx`
  - Updated:
    - `apps/ti-web/app/verify-email/page.tsx`
  - `/verify-email?code=...` now exchanges the code for a session via Supabase and redirects to `returnTo` (or `/account`).
  - Expired/invalid links surface inline error text while preserving resend verification workflow.

- TI venue reviews parking model update (backend-only, UI labels unchanged):
  - Added migration:
    - `supabase/migrations/20260225_venue_reviews_parking_distance_backend.sql`
  - Data model changes:
    - added `public.venue_reviews.parking_distance` (`Close|Medium|Far`)
    - converted `public.venue_reviews.parking_convenience_score` to integer scoring (`5/3/1`)
  - Aggregate extension:
    - added `public.venues.parking_convenience_score_avg`
    - recompute function updated to populate this field from active reviews
  - Submit RPC contract update:
    - `public.submit_venue_review` now requires `p_parking_distance` and numeric `p_parking_convenience_score`
    - enforces mapping consistency (Close=5, Medium=3, Far=1)
  - TI API route updated:
    - `apps/ti-web/app/api/venue-reviews/route.ts`
    - maps existing parking radio selection to numeric score for RPC submit.

- TI public beta smoke test pack added (auth/join/tier gating):
  - Added Playwright smoke test infra:
    - `playwright.smoke.config.ts`
    - `tests/smoke/ti-auth-join-gating.spec.ts`
    - `tests/smoke/ri-auth-join-gating.spec.ts` (cross-app auth sanity)
  - TI smoke assertions now cover:
    - logged-out `/venues/reviews` -> `/login?returnTo=/venues/reviews`
    - Explorer gate -> `/account?notice=Insider required...`
    - Insider access to `/venues/reviews`
    - `/join?code=...` code preservation through login round-trip
    - `/join` missing-code friendly state (non-crash UX)
  - Added deterministic TI smoke-user provisioning:
    - `apps/ti-web/scripts/seed_smoke_test_users.ts`
    - creates/updates `explorer_test`, `insider_test`, `weekendpro_test` as confirmed users.
  - Added run/documentation wiring:
    - root scripts: `seed:smoke:users`, `test:smoke`, `test:smoke:ui`
    - `docs/qa/public-beta-smoke-test.md`
    - `.env.local.example`

- TI confirmation redirect reliability fix:
  - Updated:
    - `apps/ti-web/app/signup/page.tsx`
    - `apps/ti-web/app/verify-email/ResendVerificationForm.tsx`
  - Both signup and resend now compute a TI-safe `/verify-email` redirect origin and prefer:
    - `NEXT_PUBLIC_TI_SITE_URL` (new explicit TI env)
    - then safe TI/local/vercel fallbacks
    - finally `https://www.tournamentinsights.com`.
  - Prevents confirmation links from drifting to `refereeinsights.com` when shared env values are misconfigured.

- TI admin operations surfaced in RI admin:
  - `apps/referee/app/admin/ti/page.tsx`
  - Added TI-user delete workflow with two scopes:
    - TI-only delete (removes `ti_users` + `ti_saved_tournaments`)
    - optional full cross-app auth delete (`auth.users`) for RI+TI account removal.
  - Added required confirmation checkbox to reduce accidental destructive actions.
  - Refined TI-user table UX:
    - delete controls moved under user identity,
    - subtle zebra striping and row separators for readability in larger TI-user lists.
  - UI follow-up refinement:
    - delete options consolidated into one horizontal action row under user identity,
    - zebra striping contrast increased for clearer row-to-row separation.

- TI signup confirmation redirect hardening (shared Supabase project safety):
  - `apps/ti-web/app/signup/page.tsx`
  - signup now computes a TI-safe `emailRedirectTo` target for `/verify-email` and avoids accidental RI-domain redirect fallback when env values drift.
  - Added friendly existing-email signup message (log in / forgot password guidance).

- TI signup profile capture for future review attribution:
  - `apps/ti-web/app/signup/page.tsx`
  - added optional signup inputs + validation for:
    - full name
    - handle (`^[a-z0-9_]{3,20}$`)
    - ZIP (`12345` or `12345-6789`)
  - values are written to Supabase auth metadata:
    - `display_name`
    - `handle`
    - `zip_code`

- TI user-profile persistence wiring:
  - `apps/ti-web/app/account/page.tsx`
  - `apps/ti-web/lib/types/supabase.ts`
  - account bootstrap/update path now hydrates `ti_users` from auth metadata:
    - `display_name`
    - `reviewer_handle`
    - `zip_code`

- TI DB migration for attribution-ready profile fields:
  - `apps/ti-web/sql/20260225_ti_users_profile_fields.sql`
  - adds:
    - `public.ti_users.display_name`
    - `public.ti_users.reviewer_handle`
    - `public.ti_users.zip_code`
  - adds reviewer handle constraints/indexing:
    - format check (`^[a-z0-9_]{3,20}$`)
    - unique partial index on non-null handles.

- TI venue-review security hardening note:
  - `supabase/migrations/20260225_venue_reviews_phase1.sql`
  - policy scope tightened to own-row select and submit RPC now enforces authenticated + confirmed-email requirement.

- Validation:
  - `npm run build --workspace ti-web` passed.

## 2026-02-24
- Cross-app venue quality update (RI admin changes benefiting TI venue integrity):
  - Added duplicate-venue review panel in RI `/admin/venues` with suggested keep-target and one-click merge.
  - Duplicate groups are now surfaced by normalized:
    - exact address/city/state
    - same name + street/state
  - Verified and merged real duplicate venue case:
    - `1200 Alimagnet Pkwy, Burnsville, MN`
  - Effect for TI:
    - less fragmented venue coverage,
    - better Owl's Eye continuity on canonical venue IDs.

- TI/RI field inventory export added for product/review planning:
  - Added:
    - `docs/ti_ri_tournament_venue_fields.csv`
  - Captures tournament + venue fields with:
    - TI/RI scope flag,
    - access-tier classification,
    - data type metadata.

- Cross-app ops note (RI admin/ingest changes that improve TI venue quality downstream):
  - Added safer venue cleanup and dedupe tooling in RI:
    - safe removal of junk venue links when a clean linked venue already exists,
    - orphan junk venue cleanup for unlinked/no-Owl's-Eye rows.
  - Strengthened crawler matching before venue creation across deep/AYSO/USSSA venue ingest:
    - multi-key reuse of existing venues (`address/city/state`, `name/city/state`, ZIP/street fallbacks),
    - preference for venues with Owl's Eye run history and populated venue URL.
  - Added deep-crawler mode for tournaments that currently only have junk-linked venues:
    - `--include-junk-linked`, with timeout guards for crawl stability.
  - Net effect for TI:
    - better reuse of canonical venues already enriched with Owl's Eye data,
    - fewer duplicate/invalid venue rows flowing into TI-facing tournament detail coverage.

- Cross-app operational note (RI-side enrichment improvements that directly affect TI venue coverage):
  - Missing-venues scrape pipeline in RI now has stronger venue discovery and linking support:
    - pre-hunt URL seeding for venue pages (`fields/venues/locations/maps/directions`),
    - fallback web-search for venue pages when crawl is sparse,
    - map-link parsing (Google/Apple/Waze) into venue candidates,
    - strict auto-linking to existing canonical venues on exact `street+city+state` match.
  - Result for TI:
    - faster growth of linked venue coverage feeding TI tournament detail pages,
    - fewer manual merges for exact-match venue duplicates,
    - clearer admin scrape telemetry for venue candidate throughput.
  - Visibility telemetry now surfaced in enrichment status:
    - parsed/inserted venue candidates,
    - auto-linked existing venues,
    - venue URL backfills.

## 2026-02-23
- TI design sizing clarification (card vs hero):
  - Confirmed from CSS that tournament listing cards are responsive, not fixed 1200-wide assets:
    - `apps/ti-web/app/tournaments/tournaments.css`
    - `.grid` uses `minmax(290px, 1fr)` and `.card` uses `border-radius: 14px`.
  - Detail hero remains large-format:
    - `.detailHero` max-width `1200px`, min-height `320px`, border-radius `22px`.
  - Guidance updated:
    - card/container backgrounds should be designed for small responsive cards (around 290-360px rendered width).
    - detail hero backgrounds should remain larger source artwork (e.g., 1200x1000) for cover crop flexibility.
- TI art integration updates:
  - Added `apps/ti-web/public/textures/ti_baseball_hero_bg_1200x1000.svg` and wired baseball detail hero to use it.
  - Added `apps/ti-web/public/textures/ti_soccer_hero_bg_1200x1000.svg` and wired soccer detail hero to use it.
- TI tournament detail hero refreshes (new sport-specific assets):
  - Soccer hero switched to:
    - `apps/ti-web/public/textures/ti_soccer_hero_2_bg_1200x1000.png`
  - Basketball hero switched to:
    - `apps/ti-web/public/textures/ti_basketball_hero_bg_1200x1000.png`
  - Lacrosse hero enabled with dedicated mapping + texture:
    - `apps/ti-web/public/textures/ti_lacrosse_hero_bg_1200x1000.png`
    - `lacrosse -> bg-sport-lacrosse` in `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Hockey hero enabled with dedicated mapping + texture:
    - `apps/ti-web/public/textures/ti_hockey_hero_bg_1200x1000.png`
    - `hockey -> bg-sport-hockey` in `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Volleyball hero pre-wired (for future volleyball tournaments):
    - `apps/ti-web/public/textures/ti_volleyball_hero_bg_1200x1000.png`
    - `volleyball -> bg-sport-volleyball` in `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Hero CSS updates in:
    - `apps/ti-web/app/tournaments/tournaments.css`
- TI tournament listing card support for volleyball:
  - Added shared container artwork:
    - `shared-assets/svg/sports/volleyball_container.svg`
  - Synced to app public SVGs via:
    - `node scripts/copy-shared-svg.js`
  - Added listing class mapping:
    - `volleyball -> bg-sport-volleyball` in `apps/ti-web/app/tournaments/page.tsx`
  - Added listing card style:
    - `.card.bg-sport-volleyball` in `apps/ti-web/app/tournaments/tournaments.css`
  - Build verification completed after each change:
    - `npm run build --workspace ti-web`
- Volleyball counter badge prep + sizing benchmark:
  - Added raw + optimized volleyball counter assets:
    - `shared-assets/svg/sports/volleyball_count_badge.raw.svg`
    - `shared-assets/svg/sports/volleyball_count_badge.svg`
  - Optimization pass performed (safe whitespace/comment/header cleanup) and XML validated with `xmllint`.
  - Size reduced from `1,168,899` to `1,099,021` bytes (~6%).
  - Relative size check vs current counter assets:
    - smaller than soccer/basketball/lacrosse/total counters
    - slightly smaller than softball badge
    - larger than baseball badge
  - Decision note:
    - asset is acceptable to keep as volleyball counter source for now; can be re-optimized later with SVGO when package install/network is available.
- TI header auth icon follow-up:
  - Added signed-out circular signup bug (`+`) beside account icon.
  - Updated sign-out return path behavior to avoid landing on protected routes after sign out.
  - Kept icon ring state by auth tier; insider ring changed to mint green for consistency.

## 2026-02-19
- Hockey counter tile background update:
  - Added dedicated hockey summary-counter background style using:
    - `/svg/sports/hockey_container.svg`
  - File:
    - `apps/ti-web/app/tournaments/tournaments.css`

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

## 2026-02-19
- TI premium detail + demo visibility update:
  - `apps/ti-web/app/tournaments/[slug]/page.tsx` now loads Owl's Eye nearby data (food, coffee, hotels) for linked venues from the latest run and renders it in Premium Planning Details.
  - Premium behavior remains paid-gated, with demo tournament pages now always allowed to show premium details for showcase use.
  - Nearby rows render with place links (Google Maps URL when present) and distance labels in miles.
  - Removed now-obsolete `demoPremium` URL toggle requirement from the TI detail page logic.
  - Added hockey counter icon support on TI tournaments summary cards:
    - `apps/ti-web/app/tournaments/page.tsx` now maps `sport=hockey` to `/svg/sports/hockey_puck_icon.svg`.
    - New shared icon asset: `shared-assets/svg/sports/hockey_puck_icon.svg`.
  - Validation:
    - `npx tsc -p apps/ti-web/tsconfig.json --noEmit` passed.

## 2026-02-20
- Cross-app operational note (RI-side infra that affects TI premium venue data freshness):
  - Owl's Eye hotel discovery pipeline was hardened in RI backend:
    - hotel radius increased to 30 miles
    - hotel output capped to 5 closest rows
    - Places API result-count bug fixed (maxResultCount clamped to 1..20)
    - added lodging text-search fallback/supplement when nearby results are sparse.
  - This improves likelihood that TI paid venue premium details show hotel rows after fresh Owl's Eye runs.

- TI SEO hardening pass (App Router metadata routes + dynamic detail metadata):
  - Global metadata defaults refined in `apps/ti-web/app/layout.tsx`:
    - canonical host pinned to `https://www.tournamentinsights.com`
    - `metadataBase` set to canonical domain
    - title template/default refreshed for TI directory positioning
    - default OG/Twitter image fallback added: `/og-default.png`
  - Added OG fallback asset:
    - `apps/ti-web/public/og-default.png`
  - Static route metadata copy/canonical updates:
    - `apps/ti-web/app/page.tsx`
    - `apps/ti-web/app/tournaments/page.tsx`
    - `apps/ti-web/app/how-it-works/page.tsx`
    - `apps/ti-web/app/list-your-tournament/page.tsx`
  - Tournament detail SEO improvements in `apps/ti-web/app/tournaments/[slug]/page.tsx`:
    - `generateMetadata` now returns cleaner title/description and canonical path
    - Open Graph/Twitter include fallback image
    - missing slug metadata returns noindex
    - render path now uses `notFound()` for missing tournaments
    - existing SportsEvent JSON-LD retained (name/date/location/url/sameAs)
  - Metadata routes aligned to canonical domain:
    - `apps/ti-web/app/sitemap.ts` absolute URLs on `www.tournamentinsights.com`
    - `apps/ti-web/app/robots.ts` with sitemap link and global allow rule

- TI tournaments filter update:
  - `apps/ti-web/app/tournaments/page.tsx`
  - Replaced `includeAYSO` with exclusive `aysoOnly` behavior.
  - UI now uses `AYSO only` control (non-additive mode):
    - default directory excludes AYSO tournaments
    - enabling `AYSO only` shows only tournaments with `tournament_association = AYSO`.
  - Summary-card links preserve `aysoOnly` in query params.

- TI venue-level premium detail UX update on tournament detail page:
  - `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Moved venue-specific premium content behind a per-venue expandable **Premium planning details** control on each venue card (instead of one long combined venue section).
  - Demo tournament preview now opens premium details per venue context only.
  - Reformatted Owl's Eye nearby listings under `Food`, `Coffee`, and `Hotels` as one-business-per-line clickable direction links with distance metadata.
  - Kept `Travel/Lodging Notes` in the main premium panel and added guidance to use per-venue premium controls.
  - Styling updates in:
    - `apps/ti-web/app/tournaments/tournaments.css`
- TI tournament card/detail follow-up polish:
  - `apps/ti-web/app/tournaments/page.tsx`
  - `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - `apps/ti-web/app/tournaments/tournaments.css`
  - Restored sport icon placement to the tournament card footer row.
  - Added stronger Owl's Eye badge detection/fallback so demo and linked Owl's Eye venues surface the badge consistently.
  - Set demo tournament official site behavior to show `TBD` on directory cards and hide public official-site link on detail.
  - Tuned venue-card Owl's Eye badge sizing/position so it sits left of venue identity without clipping and aligns with the venue block.

## 2026-02-21
- TI tournament detail venue link UX:
  - `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - `apps/ti-web/app/tournaments/tournaments.css`
  - Replaced raw venue URL display with centered `Venue URL/Map` button under venue address on linked venue cards.
  - Button uses same visual treatment as Google/Apple/Waze buttons and opens in a new tab.
  - Kept this venue URL button public (no login/pay gate).
  - Removed stale per-venue `Travel/Lodging Notes` row and removed unused paid tournament fetch wiring.

- TI venue sport labeling:
  - `apps/ti-web/app/venues/page.tsx`
  - Added `Futsal` display label mapping so venue sport tags render in title case consistently.

- TI state filter behavior:
  - `apps/ti-web/app/tournaments/StateMultiSelect.tsx`
  - Selecting any specific state now auto-clears `All states`; selecting `All states` clears specific state checks.

- Cross-app dependency note for TI venue data hygiene:
  - RI venue/admin APIs and DB constraints were updated to normalize/enforce venue values used by TI surfaces:
    - `restrooms`: `Portable | Building | Both | NULL`
    - `sport`: `soccer | baseball | lacrosse | basketball | hockey | volleyball | futsal | NULL`
  - Migration file: `supabase/migrations/20260221_venues_restrooms_and_sport_allowed_values.sql`.

- TI contact email routing update:
  - `apps/ti-web/app/list-your-tournament/page.tsx`
  - Updated the list-your-tournament CTA mailto target to `rod@refereeinsights.com`.

- TI legal pages (RI baseline adapted for TI) + legal UX visibility:
  - Added TI legal routes:
    - `apps/ti-web/app/terms/page.tsx`
    - `apps/ti-web/app/privacy/page.tsx`
    - `apps/ti-web/app/disclaimer/page.tsx`
  - Added shared legal module:
    - `apps/ti-web/app/(legal)/LegalPage.tsx`
    - `apps/ti-web/app/(legal)/LegalPage.module.css`
    - `apps/ti-web/app/(legal)/legalContent.ts`
  - Added TI-specific addenda:
    - Terms: Third-Party Links and Directory Accuracy
    - Disclaimer: Owl’s Eye Venue Insights informational-only guidance
    - Privacy: data collected/cookies-analytics clarification and venue coordinates note.
  - Added global legal links in TI layout footer:
    - `apps/ti-web/app/layout.tsx`
    - `apps/ti-web/app/globals.css`
  - Added subtle legal reminders on:
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
    - `apps/ti-web/app/venues/page.tsx`

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

- TI sport hub pages (SEO hub implementation, TI-only):
  - Added dedicated sport hub routes with tournament-directory matching UI and behavior:
    - `/tournaments/soccer`
    - `/tournaments/baseball`
    - `/tournaments/lacrosse`
    - `/tournaments/basketball`
    - `/tournaments/hockey`
    - `/tournaments/ayso`
  - Implemented shared hub renderer/config:
    - `apps/ti-web/app/tournaments/hubs/HubTournamentsPage.tsx`
    - `apps/ti-web/app/tournaments/hubs/config.ts`
  - Hub pages intentionally hide the sport filter control (sport is fixed by route) while keeping the same listing/filter/card visual system as TI tournaments.
  - Added per-hub SEO metadata + canonical and ItemList JSON-LD on hub pages.
  - Updated TI sitemap to include hub URLs:
    - `apps/ti-web/app/sitemap.ts`
  - Build verification completed successfully:
    - `npm run build --workspace ti-web`

## 2026-02-22
- TI deploy fix for sport hub routes:
  - Updated hub route files:
    - `apps/ti-web/app/tournaments/soccer/page.tsx`
    - `apps/ti-web/app/tournaments/baseball/page.tsx`
    - `apps/ti-web/app/tournaments/lacrosse/page.tsx`
    - `apps/ti-web/app/tournaments/basketball/page.tsx`
    - `apps/ti-web/app/tournaments/hockey/page.tsx`
    - `apps/ti-web/app/tournaments/ayso/page.tsx`
  - Changed async hub rendering call pattern to avoid JSX on async function component:
    - `return await HubTournamentsPage({ hub: "...", searchParams });`
  - Fixes Vercel build error:
    - `HubTournamentsPage cannot be used as a JSX component`.

- TI signup production configuration guidance (operational):
  - Required TI env in Vercel:
    - `NEXT_PUBLIC_SITE_URL=https://www.tournamentinsights.com`
  - Supabase Auth URL configuration should include TI verify redirect:
    - `https://www.tournamentinsights.com/verify-email`
    - recommended additionally: `https://tournamentinsights.com/verify-email`
  - Browser auth continues to use `NEXT_PUBLIC_SUPABASE_ANON_KEY` (service role remains server-only).

- TI production env correction + redeploy result:
  - Fixed env typo in TI Vercel project:
    - from `EXT_PUBLIC_SUPABASE_ANON_KEY`
    - to `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - This resolved production error:
    - `Your project's URL and Key are required to create a Supabase client!`
  - Post-redeploy verification confirmed TI tournament detail and signup pages were working.

- TI manual test-user invite/entitlement seed and premium-interest lock artifact reference:
  - `apps/ti-web/scripts/seed_test_users.ts`
  - `apps/ti-web/sql/20260221_ti_premium_interest_lockdown.sql`

- TI Save Tournament MVP implemented (detail page only; no `/tournaments` listing changes):
  - DB migration added:
    - `supabase/migrations/20260222_ti_saved_tournaments.sql`
    - table `public.ti_saved_tournaments` + `unique(user_id,tournament_id)` + RLS own-row select/insert/delete.
  - Save API route added:
    - `apps/ti-web/app/api/saved-tournaments/[tournamentId]/route.ts`
    - `GET` saved state, `POST` save, `DELETE` unsave.
    - Auth required; unverified users blocked for write with `EMAIL_UNVERIFIED`.
  - Shared server helper:
    - `apps/ti-web/lib/savedTournaments.ts`
  - UI component + integration:
    - `apps/ti-web/components/SaveTournamentButton.tsx`
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Account page shows saved count:
    - `apps/ti-web/app/account/page.tsx`
  - Return path continuity through auth/verify:
    - `apps/ti-web/app/login/page.tsx`
    - `apps/ti-web/app/signup/page.tsx`
    - `apps/ti-web/app/verify-email/page.tsx`
    - `apps/ti-web/app/verify-email/ResendVerificationForm.tsx`
  - Build verification completed:
    - `npm run build --workspace ti-web`

- TI tournament detail premium CTA cleanup (duplicate block removal):
  - `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Removed the extra per-venue upgrade CTA under venue map buttons so premium upgrade/notify lives only in the bottom Premium Planning Details card.
  - Updated nearby teaser copy to direct users to the bottom premium section.
  - Build verification completed:
    - `npm run build --workspace ti-web`

- TI header auth control converted to single account icon menu:
  - Added:
    - `apps/ti-web/components/AccountIconMenu.tsx`
    - `apps/ti-web/components/AccountIconMenu.module.css`
    - `apps/ti-web/lib/returnTo.ts`
  - Updated:
    - `apps/ti-web/app/layout.tsx`
    - `apps/ti-web/app/logout/route.ts`
    - `apps/ti-web/app/login/page.tsx`
    - `apps/ti-web/app/signup/page.tsx`
    - `apps/ti-web/app/verify-email/page.tsx`
    - `apps/ti-web/app/verify-email/ResendVerificationForm.tsx`
  - Behavior:
    - Removed header text links (`My account`, `Log out`, `Sign in`, `Create free account`).
    - Added single user icon with ring-color state:
      - red signed out, amber unverified, blue insider, purple weekend_pro.
    - Menu options vary by state and include `returnTo` for login/signup/logout/verify.
  - Security hardening:
    - Centralized `returnTo` sanitization for auth/logout redirect paths to allow only safe relative routes.
  - Build verification completed:
    - `npm run build --workspace ti-web`
  - Follow-up polish:
    - Centered the account icon under the mobile `List your tournament` CTA.
    - Increased icon contrast with white fill + dark glyph for readability on blue header gradients.
    - Fixed dropdown menu text readability by overriding inherited header link styles in the popup.
    - Updated Insider ring color to mint green (`#6ee7b7`) to match Insider badge styling.
    - Added signed-out circular signup bug (`+`) next to account icon and kept sign-out return path on public pages (fallback `/` when signing out from protected pages).

- TI tournament detail hero background updates (sport-specific):
  - Added new texture assets:
    - `apps/ti-web/public/textures/ti_baseball_hero_bg_1200x1000.svg`
    - `apps/ti-web/public/textures/ti_soccer_hero_bg_1200x1000.svg`
  - Updated detail hero CSS in:
    - `apps/ti-web/app/tournaments/tournaments.css`
  - Baseball detail pages now use `ti_baseball_hero_bg_1200x1000.svg`.
  - Soccer detail pages now use `ti_soccer_hero_bg_1200x1000.svg`.
  - Build verification completed:
    - `npm run build --workspace ti-web`

## 2026-02-23

- TI join/event-code funnel wiring:
  - Added:
    - `apps/ti-web/app/join/page.tsx`
  - Updated:
    - `apps/ti-web/app/login/page.tsx`
    - `apps/ti-web/app/signup/page.tsx`
  - Behavior:
    - `/join` accepts `?code=` and prefills Event Code.
    - Logged-out users get `Create account` / `Log in` links preserving `code`.
    - Logged-in users can `Activate Trial`; server action calls `redeem_event_code` RPC and redirects to `/account?activated=1` on success.
    - Login/signup auth handoff preserves event code and routes users back into `/join?code=...`.

- Smoke verification (join/event):
  - Build + typecheck passed:
    - `npm run build --workspace ti-web`
  - Route output includes `/join`, `/login`, `/signup`, `/verify-email`, `/account`.

- TI admin functions now accessible from RI admin portal (single admin login path):
  - Added TI-blue `TI Admin` button to RI admin nav:
    - `apps/referee/components/admin/AdminNav.tsx`
  - Added RI route `/admin/ti` for TI operational administration:
    - `apps/referee/app/admin/ti/page.tsx`
  - Includes:
    - TI user management (`ti_users` fields: plan, subscription_status, trial_ends_at, current_period_end)
    - Event code management (create/list/status update)
  - Event code source compatibility:
    - Uses `create_event_code` RPC when available.
    - Falls back to `ti_event_codes` or `event_codes` table inserts/updates.
  - Build verification:
    - `npm run build --workspace referee-app` passed.

- TI signup source attribution tracking added:
  - Added `ti_users.signup_source` and `ti_users.signup_source_code` via migration:
    - `supabase/migrations/20260223_ti_users_signup_source.sql`
  - `/join` now stamps attribution after event-code redemption:
    - `signup_source='event_code'`
    - `signup_source_code=<submitted code>`
    - File: `apps/ti-web/app/join/page.tsx`
  - RI `/admin/ti` TI user table now displays source attribution:
    - `Source`
    - `Source code`
    - File: `apps/referee/app/admin/ti/page.tsx`
  - TI supabase type definitions updated for the new fields:
    - `apps/ti-web/lib/types/supabase.ts`
  - Build checks passed:
    - `npm run build --workspace ti-web`
    - `npm run build --workspace referee-app`

- Shared enrichment pipeline update (RI admin fees/venue scraper):
  - `apps/referee/app/api/admin/tournaments/enrichment/fees-venue/route.ts` now uses content-keyword fallback for venue page detection.
  - Venue extraction can trigger from page text/heading signals (`field/fields/map/venues/location/facility/directions`) even when URL path does not include venue terms.
  - Intended impact: improve venue-candidate yield for tournaments with non-obvious URL structures.

- Event Code Admin form clarity update (served from RI `/admin/ti`):
  - Added visible labels and required/optional indicators in the create-event-code form.
  - File: `apps/referee/app/admin/ti/page.tsx`

- Venue scrape effectiveness update:
  - Fees/venue enrichment now force-fetches and parses discovered internal venue landing pages for multi-venue extraction.
  - File: `apps/referee/app/api/admin/tournaments/enrichment/fees-venue/route.ts`
  - Intended impact: improve conversion from `venue_url` discovery into actual venue/address candidates.

- Event Code Admin enhancement in RI-hosted TI admin (`/admin/ti`):
  - Existing event codes are now editable in-place with row-level save.
  - Editable fields include duration, redemption counts/limits, status, dates, notes, and code value.
  - File: `apps/referee/app/admin/ti/page.tsx`
  - Build check passed (`npm run build --workspace referee-app`).

## 2026-02-24

- Venue linking workflow improvements from RI admin (used for TI venue quality):
  - Tournament edit “Add venue” now supports inline existing-venue suggestions and direct linking.
  - Added:
    - `apps/referee/components/admin/TournamentVenueMatcher.tsx`
  - Updated:
    - `apps/referee/app/admin/page.tsx`
  - Added linked-venue `Unlink` action in tournament edit panel.

- USSSA venue backfill run completed (one-time cleanup to improve venue coverage):
  - Added ingest utility:
    - `scripts/ingest/link_usssa_missing_venues.ts`
  - Apply run result:
    - 163 USSSA tournaments scanned, 109 missing linked venues targeted
    - 187 venues created
    - 625 tournament↔venue links upserted
    - 0 failures

- Validation:
  - `npm run build --workspace referee-app` passed.

## 2026-02-25

- TI SEO sport+state hub pages added (TI-only, no RI changes):
  - New dynamic route:
    - `apps/ti-web/app/[sport]/[state]/page.tsx`
  - URL behavior:
    - Supports sport+state slug URLs (examples: `/soccer/oregon`, `/basketball/idaho`, `/volleyball/washington`)
    - Normalizes sport slug via `normalizeSportSlug(...)`
    - Normalizes state slug or 2-letter code via `mapStateSlugToCode(...)`
    - Invalid sport/state returns `notFound()`
  - Data behavior:
    - Server-side Supabase query against `tournaments_public`
    - Upcoming only (`end_date >= today`)
    - Sort: `start_date ASC`, then `name ASC`
    - Pagination enabled with `?page=` and page size `60` using `.range(...)`
    - “Load more” CTA renders when additional pages exist
  - UI/layout behavior:
    - Reuses TI homepage global class patterns (`page`, `shell`, `hero`, `muted heroCopy`, `ctaRow`, `cta primary/secondary`, `bodyCard`, `bodyCardCenteredList`, `list`, `notice`, `clarity`)
    - Reuses existing tournament card class structure from TI tournaments styles (`tournaments.css`)
    - Includes empty-state fallback with curated nearby-state links and back link to `/tournaments`
    - Includes FAQ section and matching FAQ JSON-LD on the page
  - Metadata/SEO behavior:
    - Implements `generateMetadata()` with canonical set to `/{sport}/{stateSlug}`
    - Title format includes state, sport, and “Updated {Month YYYY}”
    - Adds OG title/description/url

- TI sitemap extended with sport+state SEO hubs:
  - Updated:
    - `apps/ti-web/app/sitemap.ts`
  - Added all `/{sport}/{state}` combinations from `curatedSports x curatedStates` to sitemap output.

- Build verification (TI):
  - `npm run build --workspace ti-web` passed.

- Cross-app venue schema rename (RI DB change consumed by TI premium venue details):
  - `public.venues` columns renamed:
    - `player_parking` -> `player_parking_fee`
    - `food_concessions_quality_score` -> `vendor_score`
    - `shade_weather_protection_score` -> `shade_score`
  - TI detail page updated to select/render `venues.player_parking_fee` in Premium planning details.
  - Files:
    - `supabase/migrations/20260225_venues_field_renames.sql`
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`

- Tournyx bridge-domain update (separate app, no TI/RI runtime changes):
  - Tournyx (`apps/corp`) homepage converted to a minimal bridge with outbound links to TI and RI.
  - Added `noindex,follow` metadata and robots route in Tournyx app to avoid search competition with TI/RI.
  - Added Tournyx redirects:
    - `/tournaments` + `/tournament/:path*` -> TI tournaments
    - `/referees` -> RI
    - `/about` + unknown paths -> Tournyx `/`

- TI Insider-gated venue review tool (Phase 1) added at `/venues/reviews`:
  - New route/page:
    - `apps/ti-web/app/venues/reviews/page.tsx`
    - `apps/ti-web/app/venues/reviews/_components/VenueReviewsClient.tsx`
    - `apps/ti-web/app/venues/reviews/_components/VenueReviews.module.css`
  - Access control:
    - server-side auth + TI tier gate (Insider+ required)
    - unauthenticated -> `/login?returnTo=/venues/reviews`
    - non-Insider -> `/account` with friendly notice
  - UX flow:
    - Step 1 tournament identify by code or debounced name search
    - Step 2 venue selection from `tournament_venues`
    - Step 3 review form with required validation and post-submit redirect to `/tournaments/[slug]`
  - Gauge reuse:
    - reused RI segmented gauge (`WhistleScale`) by import (no component recreation)
  - Secure server path:
    - `apps/ti-web/app/api/venue-reviews/route.ts`
    - server-enforced Insider auth on lookup + submit endpoints
    - submit calls Supabase RPC `submit_venue_review` (no service role exposed in browser)
  - Supporting TI files for shared RI imports/assets:
    - `apps/ti-web/lib/badges.ts`
    - `apps/ti-web/lib/types/refereeReview.ts`
    - `apps/ti-web/public/shared-assets/svg/ri/{red_card_transparent,yellow_card_transparent,green_card_transparent}.svg`

- Venue reviews DB migration (append-only + aggregates + RLS + RPC):
  - Added:
    - `supabase/migrations/20260225_venue_reviews_phase1.sql`
  - Includes:
    - new `public.venue_reviews` table
    - unique `(user_id, venue_id)` upsert key (MVP “one active review per user per venue”)
    - aggregate columns on `public.venues`
    - `recompute_venue_review_aggregates(...)` + trigger refresh
    - RLS policies (authenticated select, own insert/update)
    - security-definer RPC `public.submit_venue_review(...)`

- SQL migration fix (function defaults):
  - Resolved PostgreSQL error:
    - `input parameters after one with a default value must also have defaults`
  - Fix:
    - removed default from `p_tournament_id` in `submit_venue_review(...)` so only trailing param keeps default (`p_venue_notes`).

- TI `/venues/reviews` gauge visual refinement (Insider venue form):
  - Updated review gauge styling to match intended TI venue-review UX:
    - selected segments use solid color fills
    - unselected segments now have a visible dark border + light gray fill for click affordance
    - removed inner icon/white center rendering from TI venue review bars
  - Added TI-local gauge assets/support used by the page:
    - `apps/ti-web/public/whistle-score.png`
    - `apps/ti-web/public/shared-assets/svg/ri/*`

- TI admin user management UI compaction + readability:
  - Updated:
    - `apps/referee/app/admin/ti/page.tsx`
  - Reworked TI user rows into collapsible `details/summary` cards showing:
    - top-line name/email and plan/subscription badge text
    - expanded metadata and edit controls on demand
  - Added derived display name helper from email local-part for faster scanning.
  - Styled alternate-row card backgrounds/borders for more apparent zebra-style separation.
  - Kept existing update/delete actions intact while moving destructive controls into a condensed section inside each expanded card.
