# Book Travel CRO / SEO / Affiliate Audit

## Executive Summary
The `/book-travel` page has a solid “two-panel” UX (Hotels vs Vacation Rentals) and uses safe partner redirect routes (`/go/hotels`, `/go/vrbo`) that log outbound clicks to `ti_outbound_clicks`. The most likely driver of “clicks but low conversions” is **weak intent qualification + limited measurement visibility**:

- The page is intentionally generic (“any event”), which may attract **low-intent or wrong-intent traffic** for youth sports tournament travel, and may also reduce SEO alignment for tournament-specific queries.
- Client events exist (e.g. `book_travel_hotels_clicked`) but **are not persisted to Supabase** by `/api/analytics`, which means we can’t reliably diagnose drop-off points (destination empty, dates missing, hotel vs rental choice, upsell interactions).
- Hotel/rental partner handoff is mostly correct, but a meaningful share of clicks likely happen **without dates** (or with invalid dates), which can reduce partner-side conversion.

## Current Page Observations

**Routes / files reviewed**
- Page: `apps/ti-web/app/book-travel/page.tsx`
- Shared UI used by `/weekend-planner`: `apps/ti-web/app/weekend-planner/page.tsx`
- Client UI: `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- Hotels redirect: `apps/ti-web/app/go/hotels/route.ts`
- Vrbo redirect: `apps/ti-web/app/go/vrbo/route.ts`
- Affiliate disclosure component: `apps/ti-web/components/AffiliateDisclosure.tsx`
- Analytics client helper: `apps/ti-web/lib/analytics.ts`
- Typed analytics events: `apps/ti-web/lib/tiAnalyticsEvents.ts`
- Analytics ingestion route: `apps/ti-web/app/api/analytics/route.ts`
- Entitlements (Weekend Pro): `apps/ti-web/lib/entitlements.ts`, `apps/ti-web/lib/entitlementsServer.ts`

**What exists today**
- `/book-travel` renders a header block with:
  - H1: “Book travel for your tournament or event”
  - Supporting copy about hotels + vacation rentals, and that events don’t need to be listed.
  - Affiliate disclosure rendered below the planner UI.
- The main UI is a two-card grid:
  - **Hotels** card → CTA opens `/go/hotels` in a new tab.
  - **Vacation Rentals** card → CTA opens `/go/vrbo` in a new tab.
- Secondary cards provide internal funnel links:
  - “Browse tournaments” → `/tournaments`
  - “Add event” → `/list-your-tournament?source=book_travel`
  - Weekend Pro upsell via `UpgradeWeekendProButton`
  - Share link block (copy + native share)
- Canonical is set to `/book-travel`.

## Priority Findings

### 1) Travel analytics events are typed but not persisted
- **Severity:** High
- **Category:** Tracking
- **Evidence from code:**
  - Client fires events like `book_travel_hotels_clicked`, `book_travel_vrbo_clicked`, `book_travel_shared`, etc: `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
  - These events are included in `TiAnalyticsEventName`: `apps/ti-web/lib/tiAnalyticsEvents.ts`
  - `/api/analytics` only persists:
    - `QUICK_CHECK_EVENTS` to `venue_quick_check_events`
    - `MAP_EVENTS` to `ti_map_events`
  - `MAP_EVENTS` does **not** include any `book_travel_*` events: `apps/ti-web/app/api/analytics/route.ts`
- **Why it matters:**
  - We can’t answer basic CRO questions (destination filled? dates present? hotel vs rental preference? where users bail?) using our own analytics tables.
  - We’re largely blind except for outbound click logs (`ti_outbound_clicks`), which are late-funnel.
- **Recommended fix (minimal):**
  - Persist `book_travel_*` events in `/api/analytics` (either add them to `MAP_EVENTS` or create a small `TRAVEL_EVENTS` set stored into a dedicated table like `ti_travel_events` or reuse `ti_map_events` with `page_type='book_travel'`).
  - Add properties like `has_destination`, `has_dates`, `travel_type`, `cta_location`.
- **Effort:** Small code

### 2) SEO intent is broad; weak youth-sports tournament keyword alignment
- **Severity:** Medium
- **Category:** SEO
- **Evidence from code:**
  - Title/description are generic “Book Travel for Your Event”: `apps/ti-web/app/book-travel/page.tsx`
  - H1 is “Book travel for your tournament or event” and doesn’t strongly anchor “youth sports tournaments” or “team travel”: `apps/ti-web/app/book-travel/page.tsx`
  - No FAQ content or structured data: `apps/ti-web/app/book-travel/page.tsx`, `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- **Why it matters:**
  - This page may not rank well for the actual high-value queries (e.g., “soccer tournament hotels”, “team travel hotels”, “hotels near tournament venue”), and may instead attract generic travel intent.
  - Generic intent tends to convert poorly for affiliate travel searches without a specific event/venue.
- **Recommended fix (minimal):**
  - Adjust metadata/H1/subcopy slightly to clearly target “youth sports tournament travel” and “team/family travel”.
  - Add a compact FAQ section (below the form) targeting common questions; optionally add FAQ schema.
  - Add internal links to sport directories (soccer/baseball/etc.) as “browse tournaments” shortcuts.
- **Effort:** Small code / mostly content

### 3) Date capture is optional; likely low conversion when dates are missing/invalid
- **Severity:** Medium
- **Category:** CRO / Affiliate
- **Evidence from code:**
  - Dates are optional inputs on both cards: `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
  - `/go/hotels` uses tournament dates when called with tournament context, but for generic mode it may fall back to computed dates if explicit dates are invalid/missing: `apps/ti-web/app/go/hotels/route.ts`
  - `/go/vrbo` passes dates only when provided/valid: `apps/ti-web/app/go/vrbo/route.ts`
- **Why it matters:**
  - Partner search pages with no dates can be significantly less likely to convert (more browsing, less booking intent).
  - Invalid dates silently falling back can create confusing handoffs.
- **Recommended fix (minimal):**
  - Add a lightweight hint near CTAs: “Add dates for better prices/availability.”
  - Track `has_dates` in analytics + compare conversion proxy (`ti_outbound_clicks` + partner performance) by `has_dates`.
- **Effort:** No-code (copy) + Small code (tracking)

### 4) Internal funnel exists but is not “next best action” by intent state
- **Severity:** Medium
- **Category:** Internal Funnel / CRO
- **Evidence from code:**
  - There is an internal link to `/tournaments` (“Planning around a listed tournament?”): `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
  - There is a Weekend Pro upsell card: `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- **Why it matters:**
  - Users who only know “city/state” may be too early to go outbound; routing them into the tournament/venue map flow can increase intent and downstream conversion.
- **Recommended fix (minimal):**
  - Keep the current layout, but add one more intent-building line near the directory link that clarifies the benefit (“…to get venue-level directions + nearby stays”).
  - Track clicks on these internal CTAs and compare to outbound clicks.
- **Effort:** No-code / Small code

### 5) Disclosure exists, but placement may be late for trust
- **Severity:** Low
- **Category:** CRO / Compliance
- **Evidence from code:**
  - `AffiliateDisclosure` is rendered below the main planner UI: `apps/ti-web/app/book-travel/page.tsx`
- **Why it matters:**
  - A small disclosure near the outbound CTAs can improve transparency and reduce “surprise redirect” distrust.
- **Recommended fix (minimal):**
  - Consider reusing the same disclosure component closer to the CTAs (still lightweight, no redesign).
  - Avoid duplicating disclosure if the same text is already visible.
- **Effort:** Small code

## Affiliate Handoff Review

### Booking.com (Hotels)
- Handoff path: `/go/hotels` via a client-opened new tab: `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- Key behaviors:
  - Destination passed via `ss` (user input) for generic mode.
  - Dates:
    - Uses explicit dates when valid.
    - Otherwise may use tournament dates (when tournament context is provided).
    - Otherwise uses fallback computed dates (route code includes a fallback path): `apps/ti-web/app/go/hotels/route.ts`
  - Affiliate wrapper: Awin wrapper is applied (do not change IDs): `apps/ti-web/app/go/hotels/route.ts`
  - Logging: inserts `ti_outbound_clicks` with `destination_type='hotels'` and `partner='booking'`: `apps/ti-web/app/go/hotels/route.ts`

### Vrbo (Vacation rentals)
- Handoff path: `/go/vrbo` via a client-opened new tab: `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- Key behaviors:
  - Destination passed via `destination` param.
  - Optional dates passed when present/valid.
  - Affiliate wrapper: CJ wrapper is applied (do not change IDs): `apps/ti-web/app/go/vrbo/route.ts`
  - Logging: inserts `ti_outbound_clicks` with `destination_type='vrbo'` and `partner='cj'`: `apps/ti-web/app/go/vrbo/route.ts`

## Tracking Review

### Existing events found (client)
From `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx` and `apps/ti-web/lib/tiAnalyticsEvents.ts`:
- `book_travel_viewed` (typed, but not clearly fired in current client)
- `book_travel_hotels_clicked`
- `book_travel_vrbo_clicked`
- `book_travel_shared`
- `book_travel_search_by_city_clicked`
- `book_travel_add_event_clicked`
- `book_travel_tournament_directory_clicked`
- `book_travel_weekend_pro_upsell_clicked` (typed; upsell uses `UpgradeWeekendProButton`, tracking depends on that component)

### Major gap
- `/api/analytics` does **not** persist `book_travel_*` events into Supabase tables. It logs them to console only. See: `apps/ti-web/app/api/analytics/route.ts`.

### Outbound click logging (server-side)
- Partner redirects log to `ti_outbound_clicks` in both `/go/hotels` and `/go/vrbo`.
- These logs are valuable, but they’re late-funnel and don’t capture page-level intent or friction.

## SEO Recommendations

### Title + meta description (minimal)
- Consider tightening the title to explicitly mention tournament travel:
  - Example direction: “Tournament Travel Hotels & Rentals | TournamentInsights”
- Add “youth sports”, “team travel”, “tournament weekends” cues in the meta description.

### H1 clarity
- Current H1 is good, but can be slightly more specific (youth sports tournament travel).

### FAQ content + schema opportunities
Low-engineering FAQ section candidates:
- “Should I search by venue address or city?”
- “Hotels vs vacation rentals for teams”
- “How to pick dates for tournament weekends”
- “How TournamentInsights helps vs a generic city search”
Add FAQ schema only if we’re confident in stable Q/A content.

### Internal linking opportunities
- Add a small list of sport-specific entry links (soccer/baseball/softball/basketball/volleyball/lacrosse) to send high-intent users into `/tournaments/<sport>` flows.

## CRO Recommendations

### Keep the existing layout; add small “confidence builders”
- Add a single sentence clarifying “Destination can be: city, venue name, or address”.
- Encourage dates (“Dates help show real availability/prices”) without forcing them.
- Make the internal “Browse tournaments” option more visible for users who are early in planning (but do not remove outbound CTAs).

## Minimal Implementation Plan (5–10 fixes)
1) Persist `book_travel_*` events in `/api/analytics` (or a dedicated travel events table). (Small code)
2) Ensure `book_travel_viewed` fires on page load (client). (Small code)
3) Add `has_dates`, `has_destination`, and `travel_type` properties to click events (client). (Small code)
4) Slightly improve title/meta/H1/subcopy to target “youth sports tournament travel”. (Small code / content)
5) Add a compact FAQ block below the planner with 4–6 questions. (Small code / content)
6) Add 6 sport links under “Browse tournaments” (no redesign). (Small code)
7) Consider showing `AffiliateDisclosure` closer to the outbound CTAs (without duplication). (Small code)

## Optional Follow-Up Implementation Prompts (do not implement)

### Prompt A — Persist /book-travel analytics in Supabase
Add a small `TRAVEL_EVENTS` allowlist in `apps/ti-web/app/api/analytics/route.ts`, persist the payload with tight field limits, and include `page_type='book_travel'`. Ensure local dev remains fail-closed unless explicitly enabled.

### Prompt B — Add minimal FAQ + internal sport links to /book-travel
Add a small FAQ section and a sport link row under the existing “Browse tournaments” card; keep styling consistent and avoid layout churn.

