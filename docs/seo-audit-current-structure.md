# SEO Audit (Current Structure) — TournamentInsights (TI)

This document audits what exists in code today. It does **not** propose a redesign. Where behavior is unclear without runtime inspection (crawl/build output), it is called out explicitly.

Primary app audited:
- `apps/ti-web` (Next.js App Router) — public marketing + tournament/venue directory for `tournamentinsights.com`.

Secondary reference (sitemap implementation comparison only):
- `apps/referee` (RI) — has a more robust paginated sitemap approach; included briefly in an appendix.

## What Was Verified vs Unclear

Verified (from code):
- Route structure (App Router folders), metadata exports (`metadata` / `generateMetadata`), `robots.ts`, `sitemap.ts`, and where JSON-LD is rendered.
- Presence/absence of internal links based on direct code references (`Link href=...`, `a href=...`).

Unclear without running/crawling:
- Actual indexation status in search engines (depends on deployment, headers, and whether crawlers can reach pages).
- Whether any platform-level settings (e.g. Vercel project “Output Directory”, headers, redirects, rewrites) affect canonical/robots beyond what’s in-app.
- Whether `tournaments_public` contains more than 2000 rows in production (impacts sitemap completeness).

## Route Inventory (By Page Type)

### Tournament Pages
- Tournament directory (multi-sport): `/tournaments` (`apps/ti-web/app/tournaments/page.tsx`)
- Tournament detail: `/tournaments/[slug]` (`apps/ti-web/app/tournaments/[slug]/page.tsx`)
- Sport hubs (directory by sport): `/tournaments/{soccer|baseball|softball|lacrosse|basketball|hockey|ayso}` (`apps/ti-web/app/tournaments/*/page.tsx`, uses `SportHubPage`)
- Hub “filters” routes exist but appear **not linked** anywhere in TI code:
  - `/tournaments/hubs/[sport]` (`apps/ti-web/app/tournaments/hubs/[sport]/page.tsx`)
  - `/tournaments/hubs/[sport]/[state]` (`apps/ti-web/app/tournaments/hubs/[sport]/[state]/page.tsx`)

### Sport + State Pages
- Sport+state landing pages: `/{sport}/{state}` (e.g. `/soccer/california`) (`apps/ti-web/app/[sport]/[state]/page.tsx`)
  - Sports/states come from `apps/ti-web/lib/seoHub.ts` (slug normalization + curated lists).

### Venue Pages
- Venue directory: `/venues` (`apps/ti-web/app/venues/page.tsx`)
- Venue detail: `/venues/[venueId]` (`apps/ti-web/app/venues/[venueId]/page.tsx`)
- Venue review submission tool: `/venues/reviews` (`apps/ti-web/app/venues/reviews/page.tsx`) **noindex**
- Venue map artifact viewer: `/venues/maps/[venueId]` (`apps/ti-web/app/venues/maps/[venueId]/page.tsx`) (no explicit metadata/noindex)

### Organizer Pages
- No dedicated organizer/director profile pages found in TI routes.
  - Director fields exist in DB usage (e.g. `tournament_director`, `tournament_director_email`), but there are no `/organizers/...` routes in `apps/ti-web/app`.

## Required Table (Current State)

Notes on columns:
- `indexable` is based on in-app metadata + robots rules **only** (not actual engine behavior).
- `internal_links_in/out` lists **observed** linking sources/targets from code.

| page_type | route_pattern | indexable | metadata_source | schema_present | internal_links_in | internal_links_out | notes |
|---|---|---:|---|---:|---|---|---|
| Home | `/` | Yes | `apps/ti-web/app/page.tsx` (`metadata`) | Yes | (Entry) | `/tournaments`, `/signup`, `/premium` | JSON-LD `WebSite` + `SearchAction` targets `/tournaments?q=` |
| Tournament directory | `/tournaments` | Yes | `apps/ti-web/app/tournaments/page.tsx` (`metadata`) | No | Header nav | `/tournaments/[slug]`, filter query params | Canonical is `/tournaments` even when filters use query params |
| Tournament detail | `/tournaments/[slug]` | Yes (if found) | `apps/ti-web/app/tournaments/[slug]/page.tsx` (`generateMetadata`) | Yes | `/tournaments`, sport hubs, `/{sport}/{state}`, venue cards (upcoming tournaments) | `/tournaments`, `/venues/[venueId]`, external official/source URLs | JSON-LD `SportsEvent` is present but minimal (no organizer/offers/streetAddress) |
| Sport hub (soccer/baseball/...) | `/tournaments/{sport}` | Yes | `getSportHubMetadata()` in `apps/ti-web/app/tournaments/_components/SportHubPage.tsx` | Yes | `/`, `/tournaments`, sitemap | `/tournaments/[slug]`, `/{sport}/{state}` | Canonical ignores `?page=` pagination |
| Sport+state hub | `/{sport}/{state}` | Yes (if valid sport/state) | `apps/ti-web/app/[sport]/[state]/page.tsx` (`generateMetadata`) | Yes | Sport hub “Browse by state”, sitemap | `/tournaments/[slug]`, other `/{sport}/{state}` | JSON-LD `FAQPage` (static Q/A copy) + tournament cards; canonical ignores `?page=` |
| Venue directory | `/venues` | Yes | `apps/ti-web/app/venues/page.tsx` (`metadata`) | No | Header nav | `/venues/[venueId]`, `/tournaments/[slug]`, `/venues/reviews?venueId=` | Canonical is `/venues` even when filters use query params |
| Venue detail | `/venues/[venueId]` | Yes (if found) | `apps/ti-web/app/venues/[venueId]/page.tsx` (`generateMetadata`) | No | `/venues`, `/tournaments/[slug]` | `/tournaments/[slug]`, `/venues/reviews?venueId=`, external map links | Route uses UUID ids, not name-based slugs (SEO tradeoff) |
| Venue reviews (tool) | `/venues/reviews` | No | `apps/ti-web/app/venues/reviews/page.tsx` (`metadata`) | No | Venue cards “Review” link | (Redirects to login/account) | Explicit `robots: { index:false, follow:false }` |
| Venue map artifact | `/venues/maps/[venueId]` | No | `apps/ti-web/app/venues/maps/[venueId]/page.tsx` (`metadata`) | No | None found in TI code | External only | Explicit `noindex,nofollow` (thin utility route) |
| Account | `/account` | No (via robots.txt) | None (layout defaults) | No | Header (account menu), login redirects | `/tournaments/[slug]` (saved) | Disallowed by `robots.ts` (path `/account`) |
| Admin | `/admin/*` | No (via robots.txt) | `apps/ti-web/app/admin/layout.tsx` etc | No | (Manual) | (Admin UI) | Disallowed by `robots.ts` (`/admin`) |
| API routes | `/api/*` | No (via robots.txt) | `apps/ti-web/app/api/**/route.ts` | N/A | (Fetch only) | N/A | Disallowed by `robots.ts` (`/api/`) |
| Auth pages | `/login`, `/signup`, `/join`, `/verify-email`, etc. | Mixed | `/login` + `/signup` layouts and various page exports | No | Header CTA + home CTAs | `/account` (post auth), tournament pages | `/login`, `/signup`, `/join` are `noindex,nofollow`; other auth/verify pages may still be indexable unless similarly tagged |

## Metadata Implementation Audit

### Patterns observed
- Global defaults come from `apps/ti-web/app/layout.tsx`:
  - `metadataBase` = `https://www.tournamentinsights.com`
  - Default title template, OG + twitter defaults, global `robots: { index:true, follow:true }`
- Key SEO pages override metadata via:
  - `export const metadata = { ... }` for static routes (e.g. `/tournaments`, `/venues`, `/about`)
  - `export async function generateMetadata(...)` for dynamic routes (notably `/tournaments/[slug]`, `/venues/[venueId]`, `/{sport}/{state}`)

### Canonical handling
Verified:
- `/tournaments`, `/venues`, sport hubs, and sport+state hubs set canonical **without** query parameters.
  - This reduces duplicate-index risk from filter/pagination parameters, but does not prevent crawling/indexation of parameterized URLs by itself.

Potential issues / inconsistencies
- Many “utility” pages (e.g. `/login`, `/signup`) have **no page-level metadata** and will inherit global defaults, which can cause:
  - Generic titles/descriptions in SERPs if indexed.
  - Duplicate title/description across many thin pages.
- `/tournaments/hubs/[sport]/[state]` uses `getHubMetadata(hub)` (sport-only) and does **not** appear to generate state-specific canonical/title/description. If this route is crawlable, it is likely duplicate/incorrect metadata.
- OpenGraph `url` is sometimes absolute (e.g. tournament detail) and sometimes relative (e.g. venue detail). With `metadataBase`, relative URLs should resolve correctly, but the inconsistency is worth standardizing.

## Sitemap + Robots Audit

### Robots
- `apps/ti-web/app/robots.ts`
  - Allows: `/`
  - Disallows: `/account`, `/api/`, `/admin`
  - Sitemap: `/sitemap.xml`

Gaps / risks
- Auth/marketing/tool pages are **not** disallowed (e.g. `/login`, `/signup`, `/join`, `/outreach/preview`, `/unsubscribe-outreach`, `/verify-your-tournament`).
  - If these should not rank, add `noindex` metadata and/or extend `robots.ts` disallow list.

### Sitemap
- `apps/ti-web/app/sitemap.xml/route.ts` builds a sitemap **index** that points to:
  - `apps/ti-web/app/sitemaps/static.xml/route.ts` (static pages + sport hubs)
  - `apps/ti-web/app/sitemaps/hubs.xml/route.ts` (curated `/{sport}/{state}` hubs)
  - `apps/ti-web/app/sitemaps/[name]/route.ts` (paged tournament detail URLs, `tournaments-<n>.xml`)

Gaps / risks (verified)
- Venue detail pages (`/venues/[venueId]`) are not included.
- Only curated sport/state combinations are included, not full coverage of all states/sports.

## Structured Data (JSON-LD) Audit

Verified JSON-LD emitters (TI):
- Home (`/`): `WebSite` + `SearchAction` (`apps/ti-web/app/page.tsx`)
- About (`/about`): `Organization` (`apps/ti-web/app/about/page.tsx`)
- Tournament detail (`/tournaments/[slug]`): `SportsEvent` (`apps/ti-web/app/tournaments/[slug]/page.tsx`)
- Sport hubs (`/tournaments/{sport}`): `ItemList` (`apps/ti-web/app/tournaments/_components/SportHubPage.tsx`)
- Hub directory (`/tournaments/hubs/...`): `ItemList` (`apps/ti-web/app/tournaments/hubs/HubTournamentsPage.tsx`)
- Sport+state hubs (`/{sport}/{state}`): `FAQPage` (`apps/ti-web/app/[sport]/[state]/page.tsx`)

Gaps / risks
- No `BreadcrumbList` schema (and no breadcrumb UI found).
- Venue detail pages have no schema (`Place` / `SportsActivityLocation` could be appropriate if desired later).
- `SportsEvent` schema is minimal:
  - Uses city/state/zip only (no street address).
  - No `organizer`, `eventStatus`, `offers`, `performer`, etc.

## Internal Linking Audit

Verified “spines” (what links to what)
- Global header nav (`apps/ti-web/app/layout.tsx`):
  - Links to `/tournaments`, `/venues`, `/how-it-works`, `/list-your-tournament`
- Tournaments directory (`/tournaments`) links out to:
  - Tournament detail pages (`/tournaments/[slug]`)
  - Sport hub pages (`/tournaments/{sport}`) via the sport hub link rail
  - Filter query params (form submits) back to `/tournaments?...`
- Sport hubs link out to:
  - Tournament detail pages (`/tournaments/[slug]`)
  - Sport+state hubs (`/{sport}/{state}`) via “Browse by state”
- Sport+state hubs link out to:
  - Tournament detail pages (`/tournaments/[slug]`)
  - Other sport+state hubs (cross-link sections)
- Tournament detail links out to:
  - `/tournaments` (back to directory)
  - Venue detail pages (`/venues/[venueId]?...`) for linked venues
  - External official/source URLs
- Venue directory links out to:
  - Venue detail pages (`/venues/[venueId]`)
  - Tournament detail pages in the “Coming up at this venue” section
  - Review tool (`/venues/reviews?venueId=...`) (but that page is `noindex`)

Gaps / risks
- No breadcrumb trail UI or linking hierarchy (even though breadcrumb CSS exists in `apps/ti-web/app/tournaments/tournaments.css`).
- “Orphan-ish” public routes with no internal links found:
  - `/venues/maps/[venueId]`
  - `/tournaments/hubs/...`
  - (Likely others like `/outreach/preview`)
  - These should either be linked intentionally (with correct metadata) or protected/noindexed.

## Technical SEO Risks (Current State)

Highest risk (verified)
- Sitemap coverage: tournament pages are paginated (no 2000 cap), but venue pages are missing and hubs are curated (not exhaustive).
- Thin/utility pages:
  - `/login`, `/signup`, `/join`, `/outreach/preview`, `/unsubscribe-outreach`, `/venues/maps/[venueId]`, and `/tournaments/hubs/*` are explicitly `noindex,nofollow`.
  - Remaining candidates to evaluate: `/verify-email`, `/verify-your-tournament` (and any other one-off tool/flow pages).
- Duplicate/incorrect metadata risk is mitigated by `noindex` on `/tournaments/hubs/*`, but should be addressed if these routes become primary SEO pages later.

Medium risk / quality issues (verified)
- Venue pages use UUIDs, not descriptive slugs. This is valid but limits “keyword-in-URL” and human readability.
- Metadata coverage inconsistency: many pages rely on layout defaults; SERP titles/descriptions may be generic.
- Structured data is present but shallow; may not fully qualify for rich results where applicable.

## Quick Wins (No Redesign Required)

1) Fix sitemap completeness
- Consider adding venue detail URLs to sitemap if they should be discoverable/indexed.

2) Tighten indexability
- Add `robots: { index:false, follow:false }` to utility/auth/tool pages that should not be indexed (e.g. remaining candidates like `/verify-email`, `/verify-your-tournament`).
- Alternatively extend `apps/ti-web/app/robots.ts` disallow list (note: robots.txt disallow does not guarantee deindexing, but reduces crawl).

3) Stabilize metadata for “secondary” routes
- Ensure every public route has an intentional title/description (even if `noindex`).
- If `/tournaments/hubs/*` is intended to be public SEO, implement state-aware `generateMetadata` (title/desc/canonical) and add internal links + sitemap entries; otherwise consider noindex.

4) Add breadcrumbs (later) — but audit note now
- There is breadcrumb styling but no breadcrumb component usage; adding breadcrumbs would improve internal linking and future `BreadcrumbList` schema. (Implementation not done in this audit.)

## Files Inspected (Relevant)

TI core SEO + routes:
- `apps/ti-web/app/layout.tsx`
- `apps/ti-web/app/robots.ts`
- `apps/ti-web/app/sitemap.xml/route.ts`
- `apps/ti-web/app/sitemaps/static.xml/route.ts`
- `apps/ti-web/app/sitemaps/hubs.xml/route.ts`
- `apps/ti-web/app/sitemaps/[name]/route.ts`
- `apps/ti-web/app/page.tsx`
- `apps/ti-web/app/about/page.tsx`
- `apps/ti-web/app/how-it-works/page.tsx`
- `apps/ti-web/app/tournaments/page.tsx`
- `apps/ti-web/app/tournaments/[slug]/page.tsx`
- `apps/ti-web/app/tournaments/soccer/page.tsx` (representative of sport hubs)
- `apps/ti-web/app/tournaments/_components/SportHubPage.tsx`
- `apps/ti-web/app/tournaments/hubs/HubTournamentsPage.tsx`
- `apps/ti-web/app/tournaments/hubs/[sport]/page.tsx`
- `apps/ti-web/app/tournaments/hubs/[sport]/[state]/page.tsx`
- `apps/ti-web/app/[sport]/[state]/page.tsx`
- `apps/ti-web/app/venues/page.tsx`
- `apps/ti-web/app/venues/[venueId]/page.tsx`
- `apps/ti-web/app/venues/reviews/page.tsx`
- `apps/ti-web/app/venues/maps/[venueId]/page.tsx`
- `apps/ti-web/components/venues/VenueCard.tsx`
- `apps/ti-web/app/login/page.tsx` (rep utility/auth indexability)
- `apps/ti-web/lib/seoHub.ts`

Secondary reference (RI sitemap approach):
- `apps/referee/app/robots.ts`
- `apps/referee/app/sitemap.xml/route.ts`
- `apps/referee/app/sitemaps/static.xml/route.ts`
- `apps/referee/app/sitemaps/hubs.xml/route.ts`
- `apps/referee/app/sitemaps/[name]/route.ts`

## Files Changed

- `docs/seo-audit-current-structure.md` (added)

## Appendix: RI Sitemap Contrast (Why TI Might Want Similar)

Verified in RI:
- RI uses a sitemap index + paged tournament sitemaps (instead of a single capped list), which avoids the “2000 row” truncation issue:
  - `apps/referee/app/sitemap.xml/route.ts` (sitemap index)
  - `apps/referee/app/sitemaps/[name]/route.ts` (paged tournament sitemap files)

This is not a recommendation to copy RI exactly, but it is a verified example in-repo of a scalable sitemap approach.
