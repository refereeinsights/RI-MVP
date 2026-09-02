# Portfolio API Economics — Stage 2 Measurement & Decision Packet

**Date:** 2026-09-02
**Mode:** Stage 2 discovery, measurement, and decision-framework analysis. Executed directly against the repository and (where the task required it) live provider documentation. No provider replacement, product-gating change, HotelPlanner routing change, migration, deployment, or push was made. The API Economics Register (`docs/reports/portfolio-api-economics-register-stage2-2026-09-02.xlsx`) is updated in place as the operating artifact, per this task's own instruction, rather than creating a second disconnected inventory.

**Relationship to prior work:** builds on `docs/reports/portfolio-external-api-data-source-audit-2026-09-02.md` (Stage 1 discovery) and `docs/reports/portfolio-api-economics-register-2026-09-02.md` (Stage 1 register). This document also **corrects two claims made in the Stage 1 register** — see Sections 2 and 8.

**Evidence discipline, stated once up front:** every claim below is either (a) read directly from repository code/migrations this session, with file path and line context given, (b) verified live against a provider's own published terms/pricing this session or a prior session (cited with date), or (c) explicitly marked as inference or as blocked-and-unmeasured. Nothing quantitative was invented. Where this task asked for actual usage numbers and this session could not get them, that is stated plainly, with the exact query needed instead — not a number.

---

## 1. Actual 30/90-day usage — measurement attempt and result

This session's device shell was re-tested against the database this pass, independently of the Stage 1 attempt: a live `fetch()` to `https://example.com` from the same shell failed identically to the Supabase RPC calls (`TypeError: fetch failed`). This confirms the network-egress limitation found in Stage 1 is a persistent constraint of this session's environment, not a one-time fluke — running the same already-written, already-correct query script again would not have succeeded, so it was not repeated in a loop.

**Result: all 30/90-day call counts, error rates, latency, Perplexity token/cost figures, and per-surface call distributions remain `UNKNOWN` — blocked, not zero, not estimated.** Per this task's own instruction, here are the exact bounded, read-only operator queries required to produce them, the moment an environment with real database network access is available (also written into the register's new "Pricing & Method" sheet):

**Portfolio-wide call/error/latency summary**, 30-day and 90-day windows:
```sql
select * from api_usage_summary(now() - interval '30 days', now()) order by calls desc;
select * from api_usage_summary(now() - interval '90 days', now()) order by calls desc;
```
Returns `api, operation, surface, calls, errors, avg_latency_ms`, grouped, for every provider currently wrapped in `trackExternalCall()`. (Verified this pass by reading the RPC definition directly: `supabase/migrations/20260505_api_usage_summary_rpc_half_open.sql`.)

**Perplexity real-dollar cost** — the one provider in the portfolio with an actual-spend RPC already built and priced:
```sql
select * from perplexity_usage_summary(now() - interval '30 days', now());
select * from perplexity_usage_detail(now() - interval '30 days', now()) order by called_at desc;
```
Pricing is baked into the RPC itself (Sonar Pro $3/1M input tokens, $15/1M output tokens, as of 2026-05 — `supabase/migrations/20260507_perplexity_usage_rpc.sql`). This is the single highest-confidence, lowest-effort actual-dollar number available the instant DB access exists.

**Corralio geocoding/routing actuals** (Geocodio + OpenRouteService — see Section 8's correction: these are live, not planned):
```sql
select date_trunc('day', called_at) d, api, status, count(*)
from corralio_external_api_calls
where called_at >= now() - interval '30 days'
group by 1,2,3 order by 1,2,3;
```
This table is genuinely separate from `public.external_api_calls` — see Section 12.

**TI HotelPlanner booking/commission actuals** (small table, no need to window it — see Section 9):
```sql
select status, count(*), sum(total_usd), sum(expected_commission_usd), sum(paid_commission_usd)
from ti_hotel_bookings group by status order by count(*) desc;
```
Also run the already-filed, never-executed Phase 3B diagnostic (`docs/prompts/corralio-hotelplanner-phase3b-evidence-diagnostic-prompt.md`, commit `6fd64ffb`) for the `cancel_date`/`status` cross-check it specifies — it answers a real open question (whether `status.includes("cancel")` matches `cancel_date` presence) from months of already-synced production history, at zero additional engineering cost.

**A ready-to-run script already exists** for the first two queries above: `tmp/cpo_api_usage_query.mjs` (gitignored, left in the repo from Stage 1, using `@supabase/supabase-js` + `dotenv`, never printing secret values). It failed only on network egress, not on credentials or query correctness. Running it — or simply opening the existing `/admin/api-usage` dashboard — from any environment with real database access is the highest-leverage next action in this entire packet, named again in the Final Decision Packet below.

---

## 2. The API Economics Register — updated in place

Updated: `docs/reports/portfolio-api-economics-register-stage2-2026-09-02.xlsx`. Same 5-sheet structure as Stage 1 (API Portfolio, Usage & Cost, Surface Map, Decisions), with the legend sheet renamed **Pricing & Method** per this task's naming, and four new Stage 2 columns added to the API Portfolio and Usage & Cost sheets (dark-blue headers, light-blue cell tint): measurement status, confidence, rationale, and next test. The Decisions sheet now surfaces the Stage 2 recommendation and rationale as primary, with the Stage 1 action still visible in the "Current approach"/action columns for continuity.

No historical measured value was overwritten, because none existed to overwrite — every quantitative Stage 1 cell was already `UNKNOWN`, and remains `UNKNOWN` this pass for the same, now-confirmed-persistent, reason. What changed is not measured values but **evidence and classification**: several rows were corrected against code read directly this session (Section 8), one row's candidate action changed on new evidence (Foursquare, Section 10), and one new row was added for a security finding that isn't a paid provider but does need a decision (Section 11).

Full per-row detail lives in the workbook; the sections below summarize what's material.

---

## 3. Open-Meteo commercial licensing — verdict

**`UNRESOLVED — FOUNDER ACTION REQUIRED`**

This task's own three-option framing fits this case better than Stage 1's binary one did, and the honest answer sits in the middle. Repository evidence, re-confirmed this pass, still shows: Open-Meteo is active in TI (`apps/ti-web/app/api/weather/ten-day/route.ts`), calling unauthenticated public endpoints with no API key anywhere in the codebase; the free tier's own published terms restrict it to non-commercial use (verified live in the Stage 1 weather audit: "You may only use the free API services for non-commercial purposes"); and the repository's own internal `/admin/api-usage` reference table (`FREE_TIER_LIMITS`, last touched 2026-06-09) independently labels Open-Meteo `"Free (non-commercial)"` — meaning engineering already flagged this internally, in code, before this audit ever ran.

None of that is account or billing evidence, and this task explicitly asks for a determination "from available account/configuration/business records" — records this session cannot see (no billing-system access, no vendor-invoice access, no network egress to check for a paid-plan API key). It is entirely possible a commercial arrangement exists outside the repository (a company-card subscription, a separate agreement) that simply never needed a code change to activate, since Open-Meteo's paid tiers use the same unauthenticated request shape with a higher rate ceiling rather than a distinct API key. Absent that confirmation, asserting `NO COMMERCIAL LICENSE FOUND` would overstate what a code-only search can prove.

**Exact founder action needed:** check whichever billing/vendor system tracks company subscriptions (card statement, vendor list, or a direct account-dashboard login at open-meteo.com) for an active Standard (~$29/mo, 1M calls) or Professional (~$99/mo, 5M calls) plan. If none exists, the choice is binary and cheap either way: budget the ~$29/mo Standard plan (which, per Section 4's shared-cache design, could reasonably cover TI + RI + Corralio combined), or confirm current usage genuinely stays under the free tier's 300K/month ceiling and treat the "non-commercial" restriction as a compliance item to resolve directly with Open-Meteo. This should take one conversation, not an engineering cycle.

---

## 4. Weather architecture recommendation (design only, not built)

Assuming Section 3 resolves in Corralio's favor, the shared design from the Stage 1 weather audit still holds and is reaffirmed here with one refinement:

**Geographic/grid-key strategy:** key by `(venue_id_or_provisional_id, forecast_date)` where a venue match exists, falling back to a rounded lat/lng grid cell (4 decimal places, ~11m precision — the same rounding TI's own `planner/timezone` route already uses for its in-memory cache, Section 7) plus date, so a forecast never depends on venue-matching having already succeeded. This mirrors the existing `zip_centroids` permanent-cache pattern (Stage 1 finding) rather than inventing a new shape.

**Daily forecast:** reuse TI's existing daily parameter set (`temperature_2m_max/min`, `precipitation_probability_max`, `windspeed_10m_max`, `weathercode`) and its existing `conditionFromWeatherCode()` mapping — directly reusable, no redesign needed.

**Hourly forecast around event time:** genuinely new work — TI's current implementation requests `daily` only, despite Open-Meteo supporting `hourly` up to 16 days out (verified live, Stage 1). Add the `hourly` parameter scoped to a window around each event's start time, not a full 16-day hourly pull.

**Forecast horizon:** 7–10 days comfortably covers the stated V1 need; provider supports more.

**Freshness windows:** unlike TI's current 30-minute time-based-only cache (no DB persistence — confirmed absent via a repo-wide search for `weather_forecast`/`weather_cache`/`forecast_cache` tables, Stage 1), a persisted cache can safely use a multi-hour freshness window, since weather forecasts don't materially change minute to minute. This is the single largest call-reduction lever in this design: today, every cache-cold edge node or post-TTL request is a fresh live call, for as long as anyone keeps requesting that location.

**Provider-call reduction:** venue/grid-keyed persistence collapses "one call per family per event" (naive) or "one call per 30 minutes per location" (TI's current pattern) down to "one call per grid cell per freshness window," which for a tournament weekend with dozens of families at a handful of venues is a large, structural reduction — the same shape of savings the Stage 1 audit already validated for the `zip_centroids` pattern.

**Reuse across products:** a lat/lng-plus-date forecast has exactly one right answer regardless of which product asks — genuinely shareable across TI, RI, and Corralio from one table and (pending Section 3) one subscription.

**Instrumentation:** wrap the new cache-miss call path in the existing `trackExternalCall(EXTERNAL_API.open_meteo, ...)` pattern from day one — Section 12 already flags that today's implementation never does this, so a new build is the natural point to fix it rather than repeat the gap.

**Failure behavior:** on a provider miss or error, serve the last-known-good cached value if one exists (even stale) rather than showing nothing — weather is a "good enough to be useful" data type, not one where staleness is a correctness risk worth a blank state.

**Severe-weather alerts:** confirmed again this pass — not included, per this task's explicit instruction and Open-Meteo's own lack of a severe-weather-alert product (it has separate flood-forecast and air-quality APIs, neither of which is a severe-weather alert).

---

## 5. Overture vs. Foursquare bounded coverage experiment — design only

**Sample:** 100–250 representative youth-sports venues, stratified across the eight categories this task specifies (large tournament complexes, municipal parks, school fields, school gyms, private sports facilities, rec-league facilities, suburban, rural). The most defensible sampling frame already exists in the repository: pull from `public.venues` filtered to rows with both `latitude`/`longitude` populated and at least one linked `tournament_venues` row with `is_inferred = false` (i.e., real, human-confirmed venues, not inferred placeholders), stratifying manually by inspecting `city`/`state`/`zip` density and any existing venue-type signal Owl's Eye already carries, rather than sampling blind.

**Comparison categories:** Food and Coffee, matching the categories Foursquare's `OWL_FSQ_COSTS` table and Overture's existing narrow Corralio usage (`overtureNearby.ts`, `overtureQualityMetrics.ts` — both already exist and already have quality-metric scaffolding worth reusing rather than rebuilding) both already cover.

**What to measure per venue, per provider:** venue/location coverage (does the provider return any result at all for this exact venue), number of usable POIs returned within a fixed radius, category-accuracy (is a "coffee" result actually a coffee shop), distance relevance (is the nearest result genuinely near, or is the provider returning a citywide match), duplicate/noise rate, obvious-missing-businesses rate (spot-checked against a human's own knowledge of the area, not automatable), and a final consumer-display-quality judgment call (would this be embarrassing to show a parent).

**Explicit threshold for when an Overture-first architecture is justified:** Overture-first should be considered only if, across the full stratified sample, Overture's usable-POI rate is within a small margin of Foursquare's (a specific percentage threshold is a product call the founder should set once real numbers exist, not one this document should invent) **and** the duplicate/noise and missing-business rates are not meaningfully worse — because Foursquare's cost (per the Stage 1 `OWL_FSQ_COSTS` reference) is already bounded by admin batch cadence, not per-view traffic, so the business case for Overture-first is about coverage quality and long-term optionality (free, open, no vendor lock-in), not urgent cost pressure. If Overture's coverage is meaningfully worse in rural/suburban strata specifically (the categories most likely to expose open-data gaps), that alone should be reported as a finding even if the aggregate looks acceptable — averaging across strata could hide exactly the gap this experiment exists to find.

**The example waterfall architecture in this task** (persisted/shared POI → Overture on miss/stale → Foursquare on insufficient → Google Places on weak/unavailable) is a reasonable target shape to evaluate against the experiment's results, but building it is explicitly out of scope here — this section is the experiment design, not the pilot.

---

## 6. Search-provider consolidation

**Recommendation: cannot be made with confidence yet — usage data is the blocker, exactly as this task anticipated.** What Section 1's network-egress block prevents is precisely the evidence this section's instruction says to use ("use actual 30/90-day usage to determine..."). One concrete, code-level fact is available without DB access, and it changes the framing:

`apps/referee/src/server/atlas/search.ts:56` — `getProvider()` defaults to **`serpapi`**, not Brave, when the `ATLAS_SEARCH_PROVIDER` environment variable is unset: `const raw = (process.env.ATLAS_SEARCH_PROVIDER || "serpapi").toLowerCase();`. This is a genuine correction of framing — nothing in Stage 1 or this task's own text asserted Brave was the default, but it's worth stating explicitly since it changes which provider the consolidation question is really about. Whether the *deployed* production environment variable actually overrides this default to something else is unconfirmed — that's account/config state, not code, and needs the same operator check as the licensing question in Section 3.

Google CSE stays separate per this task's instruction (distinct PDF-heavy fallback role, confirmed in Stage 1 — triggered specifically on a Brave `no_match` result for PDF-heavy sites). Perplexity stays separate (AI-assisted structured research via `discovery_batches`, a categorically different job from `atlasSearch()`'s single-engine web search). Google GenAI is confirmed dead again this pass (zero call sites, unchanged from Stage 1) and is classified as cleanup, not a search-consolidation candidate.

**Preliminary, evidence-gated recommendation:** once usage data exists, if SerpAPI is confirmed as the actual production default and carries the large majority of real traffic, `KEEP PRIMARY + ONE FALLBACK` is the directionally likely outcome over `KEEP ALL` — but this is not authorized as a decision from code evidence alone, and no consolidation is authorized by this task regardless. The register's Brave/Bing/SerpAPI rows are marked `CONSOLIDATE (candidate, pending usage confirmation)` / `KEEP (apparent code-level default)` rather than a final call.

---

## 7. TimeZoneDB — KEEP, CACHE, or SWAP

**Recommendation: CACHE now, with SWAP TO OFFLINE/OPEN DATA worth testing as a stronger follow-on.** This is the strongest, most concrete finding in this entire pass, because it doesn't depend on usage numbers at all — it's a straightforward architecture defect found by reading the code directly.

`public.venues` has had a persisted `timezone` text column since `supabase/migrations/20260214_venues_enhancements.sql` — over six months old. `apps/ti-web/app/api/planner/timezone/route.ts` (TI-web's planner-facing timezone endpoint) queries that exact same `venues` row for `latitude,longitude` (`coordsForVenueId()`) but never selects or checks the `timezone` column already sitting on it — it unconditionally calls the live TimeZoneDB API every time, backed only by a process-local, in-memory `Map` cache that resets on every deploy or cold start and is never shared across server instances. Timezone-from-coordinates is deterministic — IANA timezone boundaries are essentially static, changing only for rare, publicly-announced political reasons — so a persisted cache here needs no freshness TTL at all, unlike weather or venue-quality data.

Separately, `apps/referee/src/lib/google/timezoneFromCoordinates.ts` (a different call site serving the same TimeZoneDB API, referee-side) **is** properly wrapped in `trackExternalCall()`. TI-web's `planner/timezone` route is not — a second, distinct instrumentation gap alongside Open-Meteo (Section 12).

No offline timezone-from-coordinates library (`geo-tz`, `tz-lookup`, or similar) is present anywhere in the monorepo's `package.json` files — so today the only alternative to a live API call is adding a new, well-established, free dependency, not swapping to something already installed.

**Recommended path:** immediate point-fix — read `venues.timezone` first, write it back on a successful API lookup, skip the API call entirely on a hit. This alone should eliminate the large majority of repeat calls for the same venue. **Worth testing separately:** replacing the live call with an offline IANA-timezone-boundary library, which would reduce TimeZoneDB calls for venue-based lookups to zero ongoing spend, reserving the live API only for raw lat/lng inputs with no venue match at all (a much smaller, genuinely necessary residual case).

---

## 8. Geocoding — a correction to this task's own premise, then the actual question

**Correction, stated plainly because it changes the shape of the question:** this task's Section 8 states "Corralio: Geocodio planned but not implemented." That is factually incorrect. Direct code read this session, `apps/corralio/lib/leaveBy.ts` and `apps/corralio/lib/leaveBy.server.ts` (Slice 4.3): Geocodio is **fully implemented and live** — `geocodeWithGeocodio()`, called from two places (household origin-address geocoding and per-event location geocoding), gated by a household-scoped daily cap of 50 combined Geocodio + OpenRouteService calls (`CORRALIO_DAILY_EXTERNAL_CALL_CAP_PER_HOUSEHOLD`), a separate per-mount event-geocode cap of 10 (`EVENT_GEOCODE_CAP_PER_MOUNT`), normalized-location-string dedup and reuse across a household's events, and its own dedicated, well-designed audit infrastructure (`corralio_external_api_calls`, a payload-free vendor-call log, plus `corralio_external_call_daily_quota`, an atomic per-household-per-day reservation table — see Section 12). This is not a speculative build; it is production-shaped code with real governance already in place.

The same file (`leaveBy.server.ts`) also fully implements **OpenRouteService** for Corralio's leave-by drive-time routing, sharing the identical cap/quota/audit machinery. Stage 1's register listed this row as "OpenRouteService / TomTom... undecided" — no evidence of TomTom exists anywhere in `apps/corralio`; that label appears to have been carried over from an unrelated TI/RI Mapbox-vs-TomTom decision note (Stage 1's Mapbox audit) and doesn't describe Corralio's actual code. Both corrections are now reflected in the register.

**The real Stage 2 question, given this correction:** not "should Corralio add Geocodio" — it already has, and is already spending on it — but "does Corralio's geocoding call chain check canonical data before paying for a live geocode." The answer, from reading the actual call path in `leaveBy.server.ts`, is: it checks for an already-geocoded result on a matching normalized-location string within the same household (a real, working cache layer), then goes straight to Geocodio. **It does not appear to check canonical TI venue coordinates (`public.venues`, which many Corralio event locations may exactly match) or Overture before calling Geocodio.** This is exactly the hierarchy this task's own Section 8 diagram describes (canonical venue → cached coordinates → open data → paid geocoder) — the cached-coordinates layer exists, the canonical-venue and open-data layers do not appear to.

**Recommendation: do not add a second geocoding provider (moot, since one isn't missing) — instead, test whether a meaningful share of Corralio's real event/origin address text already matches a canonical TI venue with existing lat/lng, before that address ever reaches Geocodio.** This is a cache-hierarchy question, not a build-vs-don't-build question, and it's a change to an already-shipped system, not new scope — worth scoping carefully, not authorized here.

---

## 9. HotelPlanner — commercial evaluation, not API-call minimization

Per this task's explicit instruction, HotelPlanner is evaluated on commercial return and qualified travel intent, not call-count efficiency, and defaults to `PROTECT / EXPAND` absent contradicting evidence — none was found.

**What's real and live today:** TI's own reconciliation pipeline has been syncing HotelPlanner `getReport` data into `public.ti_hotel_bookings` for months (migration `20260824_ti_hotel_bookings.sql`; comment: "Do NOT apply automatically — production DB is live"). The schema already carries `total_usd`, `expected_commission_usd`, `paid_commission_usd`, `commission_status`, `status`, `cancel_date`, and `outbound_attribution_id` — everything this section asks for is structurally present and has been for some time; it's the actual row values that are blocked by this session's network-egress limitation (Section 1's exact query would answer this in one call). A separate Awin/CJ affiliate-network rollup (`ti_affiliate_daily_metrics`) exists for other travel-adjacent commerce, worth noting as a distinct revenue stream, not part of the HotelPlanner picture itself.

**What's real and not yet live:** Corralio-side HotelPlanner attribution and booking capture (Phase 3B) is design-only, per project docs found this session (`docs/corralio/cpo/2026-08-28-hotelplanner-attribution-design.md`, `docs/corralio/cpo/2026-08-30-hotelplanner-booking-reconciliation-review.md`) — an empirically-verified `status` field mapping, a locked reconciliation rule, and a documented, real inconsistency already caught in an earlier CPO pass (the locked design's numeric `status === 1` rule doesn't apply to `getReport`'s string status field, which TI's own production code already correctly branches on via `status.toLowerCase() === "confirmed"`). None of Phase 3B has shipped. A filed, founder-approved, never-executed read-only diagnostic (`docs/prompts/corralio-hotelplanner-phase3b-evidence-diagnostic-prompt.md`, commit `6fd64ffb`) would close the one remaining textual-status evidence gap from real historical data at essentially zero cost, and is the natural next step before Phase 3B becomes an executable build prompt.

**Deterministic attribution coverage:** TI-side, attribution runs through `outbound_attribution_id` parsed from `getReport`'s `Custom3` field (`attr:{id}` token format) — a real, working, deterministic join, not a heuristic. Corralio has no attributed booking to test this against yet, since Corralio-side capture doesn't exist.

**Candidate action: `PROTECT / EXPAND`**, unchanged from this task's own default, because nothing found this pass contradicts it — the TI-side revenue mechanism is real, live, and already commission-tracked; the gap is entirely on the Corralio side, and it's a scoped, already-designed, not-yet-authorized build, not a commercial-viability question.

---

## 10. Owl's Eye entitlement economics — generation cost vs. viewing cost

Confirmed directly this pass, extending the Stage 1 finding: TI's premium venue-intelligence route (`apps/ti-web/app/api/venues/[venueId]/owls-eye-premium/route.ts`) gates access via `getTiTierServer()` (a subscription-tier check) but reads exclusively from persisted `place_*` columns already written by the admin batch run — no live provider call happens on this path regardless of which tier the viewer holds.

**Generation cost** (admin-triggered Foursquare-primary / Google-Places-fallback batch runs, `owls_eye_runs`) is a function of how often an admin triggers a run and how many venues that run covers — bounded by admin action frequency, not by how many parents subsequently view the result. **Viewing cost** (any user, free or Pro, loading a venue page that reads `owls_eye_nearby_food`/persisted places data) is a database read — the marginal external-API cost of one additional viewer, free or paid, is effectively $0.

**What this means for the entitlement question this section flags as informing a later decision:** gating already-generated Owl's Eye content behind a paywall creates **no cost savings**, because the cost was already incurred at generation time regardless of who ends up viewing it. Whatever the eventual TI/RI entitlement decision is, it should be made on product/monetization grounds (is persisted venue intelligence valuable enough to reserve for Pro, does giving it away free undermine conversion) — not defended on a cost-avoidance basis, because that basis doesn't hold up under the code as it actually works. This is a genuinely useful, low-effort finding for whoever makes that entitlement call later.

---

## 11. Security review — `NEXT_PUBLIC_OWLS_EYE_ADMIN_TOKEN`

**Classification: `SECURITY FIX REQUIRED`.**

Two files share an identical authorization pattern, read directly this session:

`apps/referee/app/api/admin/owls-eye/run/route.ts:144` (`ensureAdminRequest()`) and `apps/referee/app/api/admin/owls-eye/run/[runId]/route.ts:23-28` (`ensureAdmin()`):
```ts
const headerToken = headers().get("x-owls-eye-admin-token");
const envToken = process.env.OWLS_EYE_ADMIN_TOKEN;
if (headerToken && (!envToken || headerToken === envToken)) return true;
```

**Whether the token is actually exposed to client JavaScript:** yes, but only to an already-authenticated admin, not to the public. `adminToken` is computed server-side in two Next.js server components — `apps/referee/app/admin/owls-eye/page.tsx:23` and `apps/referee/app/admin/page.tsx:395` — both of which call `await requireAdmin()` first, unconditionally, before the token is ever read or passed anywhere. The value is then passed as a prop into `OwlsEyePanel`, a client component (`"use client"`), which attaches it as the `x-owls-eye-admin-token` header on requests it makes (`apps/referee/app/admin/owls-eye/OwlsEyePanel.tsx:377`). Because it's serialized into that page's React Server Component payload/HTML, it is visible in an authenticated admin's browser (page source, devtools, a browser extension) — but this session found no path by which a non-admin or unauthenticated visitor ever receives it, since `requireAdmin()` runs first in both cases.

**Which endpoints accept it:** the two above — `POST /api/admin/owls-eye/run` (triggers a real, paid Foursquare-primary / Google-Places-fallback batch enrichment run) and `GET /api/admin/owls-eye/run/[runId]` (reads a run's results).

**What operations possession permits:** triggering paid provider spend on demand (the POST route), and reading Owl's Eye run data (the GET route) — for whoever holds a valid token value, indefinitely, until it's rotated, since there's no expiry or per-use identity on this bearer-token path (unlike a session cookie).

**Whether server-side authenticated admin authorization is also required:** **not always** — this is the actual defect, not merely the static-token pattern. Read literally, `if (headerToken && (!envToken || headerToken === envToken)) return true;` grants access whenever a non-empty header is present **and either** it matches `envToken` **or** `envToken` itself is falsy (unset/empty). If `OWLS_EYE_ADMIN_TOKEN` (the private, non-`NEXT_PUBLIC_` server variable — distinct from the `NEXT_PUBLIC_` one referenced in the admin pages) is unset in a given deployment, **any non-empty string in that header satisfies the check, fully bypassing `requireAdmin()`/session/role authentication**, for anyone who discovers the endpoint path and sends any junk value. No `.env.example` or documentation file was found anywhere in the repository establishing that `OWLS_EYE_ADMIN_TOKEN` must always be set — meaning nothing in the codebase itself guarantees this fallback path is inert.

**This session cannot confirm whether `OWLS_EYE_ADMIN_TOKEN` is actually set in the production `apps/referee` environment** — that is account/config state, not code, and this is exactly the kind of claim that must stay separated from what the code proves. What the code proves, with certainty, is that the *possibility* of a full authorization bypass is built into both routes as written, contingent entirely on one environment variable's presence — a fail-open pattern where a missing secret should fail closed instead. That is a code defect independent of today's actual configuration, which is why this session classifies it as `SECURITY FIX REQUIRED` rather than the more conservative `HARDENING RECOMMENDED` — the risk isn't hypothetical "this static secret could leak someday," it's "this code has a real branch that grants access without checking the secret at all, under a condition this session cannot rule out."

**Potential provider-spend impact:** the POST route triggers real Foursquare/Google Places batch calls — an exploited bypass could be used to run up spend, not just read data.

**Smallest safe remediation** (not implemented here, per this task's restriction): change the condition so a missing `envToken` fails closed rather than open — e.g., require `envToken` to be non-empty for the header path to be considered at all, and always fall through to the real session/role check otherwise. This is a small, mechanical, one-line-per-file fix once authorized, with no token values printed and no rotation performed by this session.

---

## 12. API instrumentation gaps

Three concrete gaps found this pass, plus one structural fragmentation finding:

**Open-Meteo** (already known from the Stage 1 weather audit, restated for completeness): `apps/ti-web/app/api/weather/ten-day/route.ts` calls `fetch()` directly against both `api.open-meteo.com` and `geocoding-api.open-meteo.com`, with zero `trackExternalCall(EXTERNAL_API.open_meteo, ...)` call sites anywhere in the repository. The enum entry exists; the wrapper was never wired in. Reusing the existing pattern here is a small, additive change — wrap the two `fetch()` calls, no behavior change to what's returned to the client.

**TI-web's `planner/timezone` route** (new finding, Section 7): raw `fetch()` to `api.timezonedb.com`, no `trackExternalCall()`, only a process-local in-memory cache. The referee app's equivalent call site (`timezoneFromCoordinates.ts`) *is* properly wrapped — the gap is specific to this one TI-web route, not the provider as a whole. Same remediation shape as Open-Meteo: wrap the existing call, no behavior change.

**Mapbox static map tiles** (new finding): components including `OwlsEyeVenueCard.tsx`, `generatedFieldMaps.tsx`, and `staticTournamentMaps.ts` render Mapbox static-map images client-direct — the browser fetches tile/style URLs using a public Mapbox token, with no server request in the loop at all. This traffic is billable to Mapbox but **cannot** be wrapped in `trackExternalCall()` by construction, since there's no server-side call to wrap. Reusing the shared pattern isn't possible here; visibility into this specific cost has to come from Mapbox's own account-side usage dashboard, not a code change. Worth naming explicitly so it isn't mistaken for a fixable instrumentation gap later.

**Would adding instrumentation alter product behavior?** No, for the first two — wrapping an existing `fetch()` call in `trackExternalCall()` changes nothing about the request, response, or timing observable to a user; it only adds a database insert for tracking. This is exactly the kind of change safe to make without a product review, whenever engineering picks it up.

**Structural fragmentation finding (not exactly a "gap," but relevant to this section's intent):** Corralio does not use the shared `public.external_api_calls` / `trackExternalCall()` pattern at all. It built its own, separate, and — on inspection — genuinely well-designed parallel system: `corralio_external_api_calls` (a payload-free vendor-call audit log, comment: "one billable row equals one vendor request/quota unit") plus `corralio_external_call_daily_quota` (an atomic per-household-per-UTC-day reservation table, migration `20260825_corralio_slice43_leave_by.sql`). This is worth reporting evenhandedly rather than treating as simply wrong: it does something the shared TI/RI pattern does not — enforce a hard, atomic, real-time per-entity daily cap, not just after-the-fact observability. The portfolio now has two parallel instrumentation systems rather than one, which is the fragmentation this section was probing for, but Corralio's is not obviously the worse of the two. **Worth testing, not implementing:** whether Corralio's audit log could additionally dual-write into the shared `public.external_api_calls` table (for unified portfolio-wide reporting via the existing `api_usage_summary()` RPC) without giving up its own quota-enforcement layer — a design question for whoever eventually reviews instrumentation strategy portfolio-wide, not a call this document is making.

---

## 13. Business-value scoring

Full per-row detail is in the register's API Portfolio sheet. Portfolio-level pattern, stated once here rather than repeated 22 times: **CRITICAL** disable-impact is rare and concentrated — only HotelPlanner (TI's live revenue path) and Resend (transactional/marketing email delivery) carry it. Everything else, including the providers this pass corrected to "live" (Geocodio, OpenRouteService), disables to **MATERIAL** at worst — Corralio's leave-by feature would degrade, not the whole product break. Reusability skews toward **VENUE** or **PORTFOLIO** scope for the enrichment/geo providers (Foursquare, Overture, Overpass, Mapbox, TimeZoneDB, and — per Section 4's design — weather), meaning their cost-per-call amortizes across every future viewer of that venue, and toward **USER**/**TRANSACTION_SPECIFIC** for Corralio's household-scoped Geocodio/OpenRouteService calls, which is the correct scope for those (an origin address genuinely is per-household). Cost leverage is assessed **HIGH** wherever a persisted-but-unused cache column already exists and isn't being checked first (TimeZoneDB is the clean example — Section 7) — those are the cases where meaningful spend reduction requires no new infrastructure, only a code change to use what's already there.

---

## 14. Decision framework — portfolio summary

Every row's full framework (evidence, economic rationale, customer/product impact, confidence, next test) is in the register's Decisions sheet, which now leads with the Stage 2 recommendation. Portfolio-level distribution across the (now 22, including the security row) rows: 1 **KILL** (Google GenAI, code-certain), 1 **KEEP** upgraded from Stage 1's provisional CACHE (Foursquare, on the Section 10 finding that its caching gap doesn't actually exist), 1 **CACHE** confirmed with concrete evidence (TimeZoneDB), 2 rows newly corrected to **AUDIT** at **P1** priority on the "live, not planned" correction (Geocodio, OpenRouteService — the priority reflects that real, ungoverned-by-portfolio-standards spend may already be occurring on providers Stage 1 had marked HOLD as if they weren't live yet), 1 **SECURITY FIX REQUIRED** (the new Owl's Eye token row, P1), 1 **PROTECT/EXPAND** (HotelPlanner, per this task's own default, uncontradicted), the search-provider trio held at **CONSOLIDATE (candidate)** / **KEEP (apparent default)** pending the usage data this task rightly insists on before consolidating anything, and the remainder unchanged from Stage 1 pending the same blocked measurement. **No action in this packet is authorized for implementation** — every AUDIT, CACHE, and SECURITY FIX REQUIRED classification names a next test or a founder decision, not a green light.

---

## 15. Workbook update — confirmed

`docs/reports/portfolio-api-economics-register-stage2-2026-09-02.xlsx` — API Portfolio (32 columns including 4 new Stage 2 columns), Usage & Cost (16 columns including 2 new Stage 2 columns), Surface Map (unchanged structure, values corrected where Section 8 applies), Decisions (now Stage-2-primary), Pricing & Method (renamed from "Legend & Method," now includes the exact bounded operator queries from Section 1 inline, so a future reader doesn't need this narrative document to run them). Verified via direct `openpyxl` re-read: 5 sheets, 22 data rows, Geocodio/OpenRouteService corrections and the new security row all present at their expected cells.

---

## Final Decision Packet

**Actual 30-day external API activity, ranked by calls:** `UNKNOWN` — blocked by this session's confirmed lack of network egress to the database. Exact query: Section 1, query (1).

**Actual 90-day external API activity, ranked by calls:** `UNKNOWN`, same blocker, same query with a 90-day window.

**Known actual spend, ranked by dollars:** Telnyx $0 and web-push $0 (both confirmed pre-launch, Stage 1, unchanged). Everything else: `UNKNOWN`. No estimated-spend figure is offered in its place for any provider, because this task explicitly requires actual usage volume before an estimate is calculated, and no volume is known.

**Estimated spend:** not calculated for any provider this pass, kept explicitly separate from (and not a substitute for) actual spend, per this task's instruction.

**Free-tier utilization — providers approaching/exceeding included allowances:** cannot be determined without call counts. The one provider flagged as a compliance rather than a volume risk is Open-Meteo (Section 3) — its risk is the *type* of tier being used (non-commercial free tier under a commercial product), not proximity to a volume cap.

**Highest cost-reduction opportunities, ranked by estimated dollar savings:** cannot be dollar-ranked without usage data — stated as the headline Section 1/14 finding, not an omission. Ranked instead by structural confidence that a real reduction exists regardless of exact dollar size: (1) TimeZoneDB — a persisted, unused cache column already exists; this requires no new infrastructure and its savings are close to 100% of repeat-venue lookups, whatever the current call volume turns out to be. (2) Weather (Open-Meteo) — the shared-cache design in Section 4, once Section 3's licensing question resolves. (3) Geocodio/OpenRouteService canonical-venue-first check (Section 8) — real but unquantified, since it depends on how often Corralio event addresses already match a known TI venue.

**Highest product-value opportunities, ranked separately:** (1) HotelPlanner — Corralio-side attribution/booking capture (Phase 3B), because the underlying TI-side revenue mechanism is proven and live; Corralio is the one missing side of an already-working system. (2) Weather shared cache — genuine cross-product reuse from one build. (3) The Overture-vs-Foursquare experiment (Section 5) — optionality and long-term cost control on the enrichment layer, not urgent but structurally valuable.

**Overture opportunity:** `INSUFFICIENT COVERAGE` is not asserted (no evidence gathered this pass says coverage is poor) and neither is `EXPAND TESTING` alone strong enough — the right classification given what's on record is **`OVERTURE-FIRST PILOT` is premature; `EXPAND TESTING` via the Section 5 bounded experiment is the supported next step.** Overture is free, already integrated narrowly, and has existing quality-metric scaffolding (`overtureQualityMetrics.ts`) worth reusing for that experiment rather than building fresh.

**Weather:** licensing status `UNRESOLVED — FOUNDER ACTION REQUIRED` (Section 3); recommended provider Open-Meteo, unchanged (strong capability match, cheap-or-free either way); shared-cache recommendation: yes, venue/grid-keyed, one table potentially serving TI + RI + Corralio (Section 4); Corralio readiness: design-complete, blocked only on the founder licensing confirmation, not on any remaining technical unknown.

**Search providers:** consolidation recommendation cannot be finalized without usage data (Section 6); the one new fact is that SerpAPI, not Brave, is the code-level default absent an environment override — worth confirming the deployed value before assuming otherwise.

**Geocoding:** Corralio should **not** newly implement Geocodio — it already has, live, since before this audit (Section 8's correction). The real open question is whether its existing call chain should check canonical TI venue coordinates before paying for a live geocode — a scoping question for a future task, not a build-vs-don't-build question this task's own framing assumed.

**Timezone:** `CACHE`, with `SWAP TO OFFLINE/OPEN DATA` worth testing as a stronger follow-on (Section 7) — the single most concrete, immediately actionable finding in this packet, requiring no usage data to justify.

**HotelPlanner:** `PROTECT / EXPAND` (Section 9) — TI-side revenue mechanism is real and live; Corralio-side capture is a scoped, already-designed, not-yet-built opportunity, not a viability question.

**Owl's Eye gating economics:** viewing already-generated content costs ~$0 in external-API terms regardless of entitlement tier; all real cost sits at generation time, controlled by admin run cadence, not by who is allowed to view the result (Section 10). Any future entitlement decision should be argued on product/monetization grounds, not cost avoidance.

**Owl's Eye token:** `SECURITY FIX REQUIRED` (Section 11) — a fail-open authorization branch exists in code on two routes, one of which triggers real paid-provider spend; production exploitability depends on an environment-variable state this session cannot confirm, but the code defect itself is certain.

**Recommended next three implementations, ranked by business value, savings, risk, and engineering effort together:**

1. **Run the Section 1 usage queries** (or open `/admin/api-usage`) from an environment with real database access. Highest leverage-to-effort ratio of anything in this entire packet — it doesn't build anything, it just unblocks every ranked-by-dollars question above, at essentially zero engineering cost.
2. **Fix the TimeZoneDB cache gap** (Section 7) — small, mechanical, uses infrastructure that already exists (`venues.timezone`), and needs no usage data to justify since the defect (querying a row for coordinates while ignoring its own already-persisted timezone value) is self-evidently a real gap regardless of call volume.
3. **Resolve the Owl's Eye admin-token fail-open branch** (Section 11) — small, mechanical, and the one item in this packet where "we don't know the exact cost impact yet" is not a reason to wait, because the risk is an authorization bypass, not a spend-optimization nice-to-have.

Item 4, just past the top three but worth naming: confirm Open-Meteo's licensing status (Section 3) — one conversation, not an engineering task, and it unblocks the weather shared-cache build (Section 4) entirely.

**Portfolio recommendation, unchanged in shape from the strategic direction this task itself sketches, now with two corrections baked in:**

```
Shared/canonical data first
  → open data (Overture, pending the Section 5 experiment)
  → persisted cache (zip_centroids today; venues.timezone should join it; a new venue/grid-keyed weather cache pending Section 3)
  → paid deterministic fallback (Google Places/Geocoding, Foursquare, Geocodio/OpenRouteService — the latter two already live, already governed by real daily caps, not a future decision)
  → paid AI/research for unresolved high-value cases (Perplexity — the one provider with real-dollar cost visibility already built and ready to read)

Travel intent → HotelPlanner (TI side proven and live; Corralio side designed, not yet built)

Family planning → Corralio (leave-by/geocoding/routing already shipped with real governance; the opportunity is connecting it to canonical portfolio data, not adding new providers)
```

**No implementation is authorized by this document.**
