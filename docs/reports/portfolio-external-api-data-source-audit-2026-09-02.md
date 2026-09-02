# Portfolio External API & Data-Source Audit — Discovery Only

**Date:** 2026-09-02
**Mode:** Stage 1 discovery, per `docs/prompts/portfolio-external-api-data-source-audit-stage1-prompt.md`. No optimization, replacement, migration, provider-configuration change, production write, deploy, or push performed.
**Method:** Direct repository inspection (grep across code/migrations/env references, targeted file reads of call sites and admin tooling) in this session. Every claim below is either a direct repository citation or explicitly marked UNKNOWN/inference. This audit is thorough on the highest-signal surfaces (public-page render paths, Owl's Eye, HotelPlanner, weather, Corralio's own stack, existing cost instrumentation) but is not a byte-for-byte exhaustive scan of every script in the repository — residual gaps are named explicitly in Section P/O rather than papered over.

---

## A. Executive inventory

| Provider | API/product | TI | RI | Corralio | Shared | Active | Primary purpose |
|---|---|---|---|---|---|---|---|
| Google Places (New) | `places.googleapis.com/v1` (searchText, nearby) | Yes | Yes | No | Yes | **Yes** | Venue enrichment, nearby POI (Owl's Eye), ZIP→lat/lng fallback |
| Google Geocoding/Maps | Geocoding API, `googleapis` SDK | Yes | Yes | No | Yes | Yes | Venue coordinate geocoding, misc admin geo tasks |
| Google Custom Search (CSE) | `GOOGLE_CSE_API_KEY`/`GOOGLE_CSE_CX` | Unclear | Yes (referee) | No | No | Unclear | Web search for research/discovery — call sites not fully traced this pass |
| Google GenAI | `GOOGLE_GENAI_API_KEY` | Unclear | Yes (referee) | No | No | Unclear | AI/model API — call sites not fully traced this pass; **flag for Stage 1 follow-up**, this is a second AI/model provider beyond Perplexity that this audit did not fully decompose |
| Foursquare | Places API | Unclear | Yes | No | No | Unclear | POI/venue enrichment alternative to Google Places; env vars (`FOURSQUARE_API_KEY`, `FSQ_API_KEY`) present but call-site depth not fully traced |
| Mapbox | `mapbox-gl` tiles + geocoding | Yes | Unclear | No (not yet) | Possibly | Yes | Client-side map tiles (`ti-web` dependency confirmed); `MAPBOX_ACCESS_TOKEN`/`MAPBOX_SECRET_TOKEN` env vars exist server-side too |
| Overture Maps | Bulk open dataset (Parquet, no per-call fee) | No | No | Yes | No | Yes (batch) | Corralio Nearby (Food/Coffee) candidate pool + provisional-venue corroboration evidence |
| OpenStreetMap / Overpass | Overpass API (free/donation) | No | Yes | No | No | Yes | Sporting-goods/gear "nearby" lookups for Owl's Eye |
| Perplexity | Sonar Pro (chat completions) | Yes | Yes | No | Yes | Yes | Tournament/venue discovery research, AI-assisted enrichment content |
| Brave Search | Search API | Unclear | Yes (env present) | No | No | Unclear | Web search — call sites not fully traced this pass |
| Bing Search | Search API | Unclear | Yes (env present) | No | No | Unclear | Web search — call sites not fully traced this pass |
| SerpAPI | Search API | Unclear | Yes (env present) | No | No | Unclear | Web search — call sites not fully traced this pass |
| Open-Meteo | Geocoding + forecast (free) | Yes | No | No | No | Yes | 10-day weather forecast on tournament/venue pages |
| TimeZoneDB | Timezone lookup | Yes | No | No | No | Yes | Planner event timezone resolution (Stage 2.6A, per `docs/admin-reference.md`) |
| HotelPlanner | Hotel search/booking/report API | Yes | Yes (admin reporting) | No (not yet — attribution designed, no build) | Yes (shared account) | Yes | Hotel search, booking, revenue reconciliation — TI/RI's live revenue path |
| Resend | Transactional/marketing email | Yes | Yes | Yes | Yes | Yes | All application email; Corralio's `mail.corralio.com` (send, live) / `inbound.corralio.com` (receive, in progress per prior session record) |
| Telnyx | SMS/A2P messaging | No | No | Yes (spike-only) | No | **Not yet live** | Corralio phone-auth OTP + SMS schedule intake — no `TELNYX_API_KEY`-style env reference found in application code; only referenced directly by URL (`https://api.telnyx.com/v2`) inside isolated `scripts/analysis/corralio_sms_telnyx_*.mjs` spike scripts, consistent with the "not yet configured" state recorded in this session's prior reconciliation |
| Supabase Auth (phone/email) | Auth, Send SMS Hook | Yes | Yes | Yes | Yes | Yes | Application authentication for all three products |
| web-push (VAPID) | Browser Push protocol | No | No | Yes | No | Built, not deployed | Weekend Ready push notifications; not a billed third-party API (standard browser push), included because it has its own key material and quota/rate characteristics worth tracking |
| Geocodio | Geocoding (Corralio's selected provider per ADR-033) | No | No | Planned | No | **No env var found — not yet implemented in code**, only referenced in ADR-033/roadmap text and as a column default (`geocode_provider default 'geocodio'`) in a Corralio migration | Corralio's own future event-location geocoding, distinct from Google Geocoding used by TI/RI |
| OpenRouteService / TomTom | Routing/traffic | No | No | Planned, undecided | No | No | Candidate providers for Corralio's future traffic-aware leave-by (ADR-033) — not yet selected or implemented |
| Stripe | Payments | Unclear | Unclear | No | Unclear | Unclear | Only `STRIPE_WEBHOOK_SECRET_LOCAL` found — appears local/dev-only reference; no confirmed production call site traced this pass |

**Not yet fully decomposed this pass (named explicitly rather than omitted):** Google CSE, Google GenAI, Brave Search, Bing Search, SerpAPI, Foursquare, Mapbox server-side (vs. client tile) usage, Stripe. Environment variables for all of these exist in the codebase (Section M), confirming the integrations are real, but this pass did not trace every call site to the same depth as Google Places/Perplexity/HotelPlanner/weather. This is the single largest completeness gap in this report — see Section P.

## B. Call-surface inventory (highest-signal surfaces verified this pass)

| Provider | Product | Surface/job | File/function | Trigger | Sync/async | User waits? | Cached? | Persisted? |
|---|---|---|---|---|---|---|---|---|
| Google Places | Nearby/food enrichment | Owl's Eye batch run | `apps/referee/src/owlseye/nearby/upsertNearbyForRun.ts`, `.../upsertGearNearbyForRun.ts` | Admin-triggered `/api/admin/owls-eye/run` | Async job | No | N/A (write path) | Yes — `owls_eye_nearby_food` and related tables |
| Google Places | Public venue-page nearby display | TI venue page → `OwlsEyeVenueCard` | `apps/ti-web/app/api/venues/[venueId]/owls-eye-places/route.ts`, `.../owls-eye-premium/route.ts` | Page render (`/venues/[venueId]`) | Sync (page fetch) | Yes | Reads pre-computed rows only — **confirmed no live Google Places call on this path**; it queries `owls_eye_runs`/`owls_eye_nearby_food` by prior completed `run_id` | Yes — same tables as above |
| Google Places | Admin venue tools | Places lookup, refresh-coordinates, address-verify | `apps/referee/app/api/admin/venues/places/route.ts`, `.../[id]/refresh-coordinates/route.ts`, `.../address-verify/route.ts` | Explicit admin action | Sync | Yes (admin) | No | Writes to `public.venues` on save |
| Google Places | ZIP→lat/lng fallback | Tournament search-by-ZIP | `apps/ti-web/lib/lookupZipLatLng.ts`, called from `apps/ti-web/app/tournaments/page.tsx` | Public page render, **conditional on a `zip` query param** | Sync | Yes | **Yes — permanent DB cache**: checks `zip_centroids` table first ("free DB read"); only calls Google Places `searchText` on a cache miss, then upserts the result back for all future callers | Yes — `zip_centroids`, effectively bounded to the ~41K US ZIP code space |
| Open-Meteo | 10-day weather forecast | `apps/ti-web/app/api/weather/ten-day/route.ts` | Tournament/venue page render | Sync | Yes | Yes — `fetch` with `next: { revalidate }` **and** `Cache-Control: s-maxage=1800, stale-while-revalidate=86400` | No (recomputed on TTL expiry) |
| HotelPlanner | Outbound hotel handoff | `/go/hotels`, `/go/hotels/property`, `/go/hotels/checkout` | Explicit user click on a hotel/lodging CTA | Sync | Yes | No | Attribution token persisted (`ti_outbound_clicks`/Corralio equivalent) |
| HotelPlanner | Revenue reconciliation | Booking/cancellation report pull | `apps/referee/lib/hotelPlannerBookingSync.ts`, `hotelPlannerReportSafety.ts`, `scripts/ops/backfill-hotelplanner-bookings.ts` | Cron / admin-triggered backfill (confirmed via this session's prior review of commits `8f5ce53b`/`e5053302`) | Async batch | No | N/A | Yes — booking/reconciliation tables |
| Perplexity | Sonar Pro | TI discovery workbench | `apps/referee/lib/admin/tiDiscoveryPerplexity.ts`, `/api/admin/ti/discovery-v2/runs/[id]/perplexity/{search,run-all}` | Explicit admin action | Async (`maxDuration` 120–300s) | Admin waits | No (raw response stored, not treated as a cache) | Yes — full raw JSON persisted per call in `discovery_batches.raw_paste`, which is exactly what backs the existing `perplexity_usage_summary()`/`perplexity_usage_detail()` cost RPCs |
| Overture | Nearby (Food/Coffee) + venue corroboration | `apps/corralio/lib/overtureNearby.server.ts`, `scripts/ops/corralio_overture_refresh.ts` | Bounded internal batch job — Slice 4.5 explicitly prohibits calling Overture from a user request path | Async batch | No | N/A (bulk open data, not a metered per-call API) | Yes — Corralio-owned candidate/evidence tables |
| Telnyx | (spike only) | `scripts/analysis/corralio_sms_telnyx_readonly.mjs` and siblings | Manually invoked spike script, not application code | N/A | Async | No | Local test-fixture only; zero live production calls per this session's prior reconciliation |
| Overpass | Sporting-goods gear nearby | `apps/referee/src/owlseye/nearby/overpassSportingGoods.ts` | Owl's Eye batch run | Async batch | No | Unknown (not traced this pass) | Presumed yes, into Owl's Eye nearby tables — not independently confirmed this pass |

## C. Trigger classification

- **PASSIVE_RENDER:** Open-Meteo weather (tournament/venue pages); Owl's Eye nearby-places *read* (venue page — but this reads persisted data, not a live paid call); Mapbox client tile loading (`ti-web`).
- **EXPLICIT_USER_INTENT / TRANSACTION_INTENT:** HotelPlanner outbound handoff (`/go/hotels*`), lodging group-request form.
- **CONDITIONAL / mixed:** ZIP→lat/lng Google Places fallback — page-render-triggered but gated behind a query param and a permanent cache, so it behaves like PASSIVE_RENDER only on a true cache miss for a novel ZIP.
- **BATCH_ENRICHMENT:** Owl's Eye run (`/api/admin/owls-eye/run`), Overture refresh script, Perplexity discovery runs (admin-triggered, but async/batch in character).
- **ADMIN_OPERATOR:** Venue places lookup, refresh-coordinates, address-verify, venue import/merge tools.
- **BACKGROUND_REFRESH:** HotelPlanner booking/cancellation report sync (cron); Corralio's existing 4-hour schedule-refresh cron (confirmed in a prior session's review of `apps/corralio/vercel.json`, unrelated to venues but the same trigger category).
- **INGESTION:** `scripts/ingest/*` venue-linking and enrichment scripts (USSSA, AYSO, etc.) — largely operator-invoked, not scheduled, based on filenames; not independently confirmed this pass.

## D. Crawler amplification

| Call | Crawler-amplifiable? | Why |
|---|---|---|
| Owl's Eye nearby places on venue page | **NO** | Confirmed by direct code read: the route only queries `owls_eye_runs`/`owls_eye_nearby_food` for an already-`complete` run. A crawler hitting this page cannot cause a new Google Places/Foursquare call. |
| Weather 10-day forecast | **YES** | Any request (crawler or human) can trigger the fetch on a cache-cold path. **Not a cost risk**: Open-Meteo is free, and the route additionally sets `s-maxage=1800` CDN caching on top of the Next.js fetch-level revalidation, so actual origin calls are bounded regardless of request volume. |
| ZIP→lat/lng Google Places fallback | **CONDITIONAL** | Requires a `zip` query param a crawler would need to guess/enumerate to trigger at all, and even then only the *first* request for any given ZIP nationwide ever reaches Google — every subsequent request (from any user, any product surface, forever) is served from the `zip_centroids` table. Worst-case bound is ~41,000 U.S. ZIP codes, not unbounded. This is a genuinely well-built safeguard, not a gap. |
| HotelPlanner search/booking | **NO** for the outbound-handoff surfaces (require an explicit click through a signed/attributed link); **UNKNOWN** for whether `TournamentVenueMapClient.tsx` or `tournamentHotelSelection.ts` perform any live availability check on tournament-page render rather than only rendering a static CTA — this specific sub-question was not resolved to full certainty this pass and is named as a gap. |
| Mapbox client tiles | **CONDITIONAL** | A crawler that executes JavaScript (some modern crawlers do) could trigger tile loads; a simple HTML-only crawler would not. Not independently quantified this pass. |

**No urgent finding.** Nothing discovered this pass meets the Section 22 bar (crawler-triggerable, paid, and lacking any cache/rate-limit/cost cap) — the one candidate that looked concerning at first glance (ZIP→lat/lng) turned out to already have a well-designed, effectively-permanent cache with a hard structural bound. This is worth stating plainly rather than manufacturing urgency where the evidence doesn't support it.

## E. Cache/persistence map

| Data | Cache layer | TTL | Persisted? | Reuse scope |
|---|---|---|---|---|
| Weather forecast | Next.js `fetch` revalidation + CDN `s-maxage` | 1,800s (30 min) fresh, 86,400s stale-while-revalidate | No (recomputed) | All users of the page |
| ZIP centroid | Postgres table (`zip_centroids`) | Effectively permanent | Yes | TI-wide (and presumably RI, if it shares the table — not confirmed) |
| Owl's Eye nearby/gear | Postgres tables, keyed by `run_id` | Until next admin-triggered run | Yes | All viewers of that venue's public page |
| Perplexity discovery results | Full raw JSON in `discovery_batches.raw_paste` | Permanent | Yes | Admin/internal only |
| Overture Nearby/evidence | Corralio-owned Postgres tables | Per Slice 4.5's refresh cadence (not independently re-verified this pass) | Yes | Corralio only (structurally isolated, per ADR-008) |
| HotelPlanner attribution | Custom3 opaque token + booking-report reconciliation table | N/A (event-based, not TTL) | Yes | Product-scoped (TI's is tournament-keyed; Corralio's own design, per ADR-032, would be independent and not yet built) |

## F. Duplicate-work map

| Data need | Provider A | Provider B | Products | Independent calls? | Shared canonical data feasible? |
|---|---|---|---|---|---|
| Venue existence/coordinates | Google Places/Geocoding (TI/RI) | Overture (Corralio) | TI, RI, Corralio | Yes — Corralio never reads TI/RI's cached Google Places results, and TI/RI has no Overture integration | **Yes, plausible** — this is exactly the ZIP-geocoding pre-check pattern recommended in this session's prior venue-architecture review; the same "check the free/cached source first" pattern already proven by `lookupZipLatLng` could plausibly extend to venue-level geocoding, though this needs the Stage-1-deferred coverage test before committing |
| Nearby POI (Food/Coffee/gear) | Google Places + Foursquare + Overpass (Owl's Eye) | Overture (Corralio Nearby) | RI/TI, Corralio | Yes, fully independent pipelines | Partially plausible — same caveat as above; not yet tested |
| Geocoding provider selection itself | Google Geocoding (TI/RI, active) | Geocodio (Corralio, selected in ADR-033 but **not yet implemented in code** — no env var found) | TI, RI, Corralio (planned) | N/A yet — Corralio hasn't built this | **This is worth flagging even though nothing is duplicated yet**: the portfolio is on track to run two different geocoding vendors for conceptually the same operation (turning an address/location into coordinates) unless someone deliberately decides that's correct. Not a recommendation to unify — just naming the fork before it's built, per this audit's own discovery-only mandate. |
| Web search/research | Perplexity (TI/RI discovery) | Brave Search, Bing Search, SerpAPI (env vars present, call sites not fully traced) | RI (confirmed), others unclear | Unknown — this pass could not confirm whether Brave/Bing/SerpAPI are live, dead, or serving genuinely different purposes than Perplexity | **Gap** — see Section P |

## G. Overture overlap matrix

| Existing paid function | Provider | Data needed | Overture comparable? |
|---|---|---|---|
| Venue geocoding (admin refresh-coordinates) | Google Geocoding | Lat/lng for a named facility | Partial/Unknown — Overture's Places theme carries coordinates for places it has GERS-identified, but this audit did not re-verify current coverage against RI/TI's specific long-tail venue set (this was explicitly deferred to a bounded live sample in the Slice 4.5 prompt itself, and that sample's actual results were not located/read this pass) |
| Nearby Food/Coffee (Owl's Eye) | Google Places + Foursquare | Named nearby businesses by category | Partial — Corralio's own Slice 4.5 already limits Overture Nearby to Food/Coffee only, by explicit design, so even a full port would not cover Owl's Eye's broader category set (hangouts, sporting goods, hotels) without further scope |
| ZIP-level geocoding | Google Places `searchText` | Approximate ZIP centroid | Likely Exact-or-better — a ZIP centroid is coarse-grained enough that open data almost certainly covers it, but this is inference, not a verified test |
| Address verification (admin) | Google (unspecified endpoint, `address-verify` route) | Deliverability/validity signal | No — this is a distinct capability (mail deliverability validation) that a places-existence dataset like Overture doesn't provide at all |

## H. Owl's Eye decomposition

**Canonical venue hygiene** (duplicate detection, matching, candidate generation, geocode validation): `owls_eye_venue_duplicate_suspects` table, `/admin/venues/scan-duplicate-candidates`, `rebuild_owls_eye_venue_duplicate_suspects.ts`, `merge_duplicate_venues_by_fingerprint.ts`. Providers: primarily internal fuzzy-matching logic against `public.venues`, with Google Geocoding/Places as an input signal for address normalization. This function is **not** billed per-venue-view; it runs as admin-triggered batch/sweep operations.

**Venue enrichment** (places, nearby POI, gear, address research): `upsertNearbyForRun.ts`, `upsertGearNearbyForRun.ts`, `overpassSportingGoods.ts`, `runVenueScan.ts`, all under `apps/referee/src/owlseye/`. Providers: Google Places, Foursquare (env present, depth not fully traced), Overpass (free). Triggered only by an admin-initiated "Owl's Eye run," never by a public page view — **this is the same finding as Section D, restated**: the paid legs of enrichment are batch, not passive-render.

**Consumer content** (venue score, write-ups, weekend-guide content, premium): `owlsEyeScores.ts`, `OwlsEyeVenueCard.tsx`, `OwlsEyeWeekendGuideAccordion.tsx`, `OwlsEyeDemoScoresPanel.tsx`, the `-premium` route. This reads persisted enrichment results (Section B) — it is a display/entitlement layer (`getTiTierServer` gates premium content), not an independent source of external-API cost.

**Net finding on Owl's Eye specifically:** the name covers three genuinely different cost profiles. The consumer-facing product (what a visitor sees) has effectively zero marginal external-API cost per view because it only reads cached results. All the real metered spend is concentrated in the admin-triggered batch/run step, which means the actual lever for cost control is **how often and how broadly an Owl's Eye run is triggered**, not anything about public traffic volume. That's a materially different, and more reassuring, picture than "every venue page view costs a Google Places call," which was the shape of risk this audit was originally commissioned to check for.

## I. Venue lifecycle comparison

**RI/TI:** raw tournament/source location → candidate (`venue_inference_*` migrations, ingest scripts) → provider enrichment (Google Geocoding/Places at candidate-generation and admin-refresh steps) → human review (`missing-venues`, `enrichment` admin UI) → `public.venues` → Owl's Eye batch enrichment (Google Places/Foursquare/Overpass, admin-triggered) → public venue page (reads cached enrichment only) → travel handoff (HotelPlanner, explicit click).

**Corralio:** schedule raw location → canonical match attempt (read-only against `public.venues`, no external call) → provisional venue if unresolved (`corralio_provisional_venues`, geocoded — provider currently unconfirmed in code despite ADR-033 naming Geocodio) → evidence (Overture batch corroboration) → Overture Nearby (Food/Coffee, batch) → possible future promotion (not built).

**Where both systems purchase/compute equivalent information:** venue-level geocoding (Google on the RI/TI side; an as-yet-unimplemented Geocodio call on the Corralio side) and nearby-POI discovery (Google Places/Foursquare/Overpass on RI/TI; Overture on Corralio, Food/Coffee only). Both are legitimate candidates for the Section F duplicate-work analysis; neither is a recommendation here.

## J. Travel-provider map

| Surface | Trigger | User-triggered vs passive | Cache | Persisted | Revenue relationship | Crawler-triggerable |
|---|---|---|---|---|---|---|
| `/go/hotels`, `/go/hotels/property`, `/go/hotels/checkout` | Explicit click on a hotel CTA | User-triggered | No | Attribution token persisted | Direct — this is the revenue path | No (requires a click-through, not a bare page render) |
| Booking/cancellation report sync | Cron + admin backfill | Passive (scheduled) | N/A | Yes, into reconciliation tables | Indirect — enables revenue reporting, doesn't generate revenue itself | No (not a public-page trigger at all) |
| Lodging group-request | Explicit form submission | User-triggered | No | Presumed yes (not independently confirmed) | Indirect — a lead-gen signal | No |
| Venue/tournament page HotelPlanner display | Page render | **Unresolved this pass** — appears to be a static CTA/link, not a live search call, based on the absence of `searchHotels`/`getReport`-style calls in the page files checked, but this was not confirmed against every relevant component | Unknown | Unknown | Unknown until confirmed | Unknown until confirmed |

## K. Mapping/routing map

| Need | Provider | Where |
|---|---|---|
| Client map tiles | Mapbox (`mapbox-gl`) | `ti-web` (confirmed dependency) |
| Server-side geocoding (TI/RI) | Google Geocoding/Places | Venue admin tools |
| Timezone resolution | TimeZoneDB | TI Planner (Stage 2.6A, per `docs/admin-reference.md`) |
| Server-side geocoding (Corralio, planned) | Geocodio (ADR-033 selection) | **Not yet implemented** — no env var or call site found |
| Traffic-aware routing (Corralio, planned) | OpenRouteService or TomTom (undecided, ADR-033) | Not yet implemented |
| Corralio's current "This Weekend" leave-by | Confirmed server-authoritative in a prior session's review (`loadWeekendData()`), underlying geocode/routing provider for the *already-shipped* leave-by (Slice 4.3) not re-confirmed this pass | `apps/corralio/app/page.tsx` and related |

**Reuse note:** TI's Mapbox-based venue coordinates are already the reuse target named in ADR-030 for Corralio's future routing/venue-context work — this is an existing, already-decided shared-data intent, not a new finding, but it belongs in this map for completeness.

## L. Existing usage/cost instrumentation

This is more mature than credited in this session's prior venue-architecture review — worth correcting that record explicitly.

| Instrument | Provider(s) | Fields | Cost captured? | Call count? | Surface? | Product? | Date range possible? |
|---|---|---|---|---|---|---|---|
| `external_api_calls` table + `trackExternalCall()` wrapper | All 11 providers in the `EXTERNAL_API` enum (google_places, foursquare, mapbox, resend, open_meteo, brave_search, bing_search, serpapi, overpass, timezonedb, perplexity) | api, operation, surface, status, latency_ms, error | No (latency/error only, not $) | Yes | Yes (`EXTERNAL_API_SURFACE` enum: owls_eye_batch, owls_eye_gear, venue_geocode, venue_timezone, venue_places_lookup, venue_address_verify, tournament_enrichment, email_*, venue_field_map, atlas_search, tournament_scan, ti_discovery) | RI/TI | Yes, arbitrary — it's a normal timestamped table |
| `/admin/api-usage` dashboard | Same as above | Aggregated calls/errors/avg latency by api/operation/surface, plus a separate alarms system (`ApiUsageAlarms.tsx`, thresholds on calls/errors/error_rate per day/week/month with cooldown + email notify) | No ($ not shown) | Yes, with date-range filters (today/MTD/30d/week/custom) | Yes | RI/TI | Yes |
| `perplexity_usage_summary()` / `perplexity_usage_detail()` RPCs | Perplexity only | Total calls, input/output tokens, total cost USD (Sonar Pro pricing baked in: $3/1M input, $15/1M output) | **Yes — the only provider with real $ tracking found** | Yes | Implicit (all Perplexity calls, not surface-split) | RI/TI | Yes, via `from_ts`/`to_ts` params |
| HotelPlanner booking/report sync | HotelPlanner | Booking counts, revenue reconciliation | Yes (revenue, not API cost) | Indirect | N/A | RI/TI | Yes |
| Corralio | none found | — | No | No | — | Corralio has no equivalent to `external_api_calls`/`trackExternalCall()` for its own external calls (Resend, Supabase Auth, future Overture/Geocodio/Telnyx) — **this is a real instrumentation gap worth naming**, since Corralio is about to add several new metered dependencies (SMS, phone auth) with zero existing cost-visibility infrastructure of its own to reuse; adopting RI/TI's existing `trackExternalCall()` pattern rather than building a second one is the obvious low-effort option, though that's a Stage 2/build decision, not something to act on here. |

## M. Environment/configuration inventory (names only)

Grouped by apparent provider; full raw list of ~65 matched env-var names was captured during this audit and is available on request, but is condensed here for legibility.

**Places/geo:** `GOOGLE_PLACES_API_KEY`, `GOOGLE_MAPS_API_KEY`, `MAPBOX_ACCESS_TOKEN`, `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`, `MAPBOX_SECRET_TOKEN`, `FOURSQUARE_API_KEY`, `FSQ_API_KEY`, `FOURSQUARE_API_VERSION`, `TIMEZONEDB_API_KEY`.
**Search/research:** `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`, `GOOGLE_GENAI_API_KEY`, `BRAVE_SEARCH_API_KEY`, `BRAVE_SEARCH_KEY` (**note: two differently-named Brave keys found — flag as possible duplicate/legacy, not confirmed which is live**), `BING_SEARCH_KEY`, `SERPAPI_API_KEY`, `PERPLEXITY_API_KEY`.
**Travel:** `HOTELPLANNER_API_KEY`, `HOTELPLANNER_SECRET_KEY`.
**Messaging:** `RESEND_API_KEY`, `CORRALIO_SMS_CHANNEL_HMAC_SECRET`, `CORRALIO_SMS_SEND_HOOK_SECRET`, `CORRALIO_VAPID_PUBLIC_KEY`, `GCM_API_KEY` (**appears legacy — Google Cloud Messaging predates current web-push; not confirmed still referenced by live code path vs. a stale constant**).
**Auth/infra:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ROLE_KEY` (**two names for what may be the same credential — flag, not confirmed**), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CRON_SECRET`, `RI_CRON_SECRET`, `TI_CRON_SECRET` (**three cron secrets — plausibly intentional per-product separation, not confirmed either way**), `NEXT_PUBLIC_CORRALIO_GATE3_TURNSTILE_SITE_KEY`.
**Other/unclear-ownership:** `OWLS_EYE_ADMIN_TOKEN`, `NEXT_PUBLIC_OWLS_EYE_ADMIN_TOKEN` (**a `NEXT_PUBLIC_` prefix means this is client-exposed — worth confirming this token is not itself a capability that should stay server-only; not independently verified this pass, flagged per this audit's own Section 15 instruction to flag client-exposed paid-provider credentials**), `STRIPE_WEBHOOK_SECRET_LOCAL` (name implies local/dev-only), `GITHUB_TOKEN`, `CODE_BOT_TOKEN`, `FIGMA_PERSONAL_ACCESS_TOKEN` (developer tooling, not product runtime cost).

No values were read or printed at any point in this audit.

## N. Failure/fallback matrix

| Chain | Behavior |
|---|---|
| ZIP centroid cache miss → Google Places | Confirmed: DB cache checked first, live call only on miss, result persisted for all future callers |
| Weather fetch failure | Route returns nulls per-field (`parseNum` returns `null` on non-finite) rather than erroring the page — fails soft |
| Owl's Eye run failure | Not independently traced this pass — the public-facing read path simply finds no `complete` run and returns an empty `places: []` array, which is itself a graceful fallback regardless of why the run didn't complete |
| Overture miss → paid provider | **Not currently wired this way.** Corralio's Overture usage is scoped to its own Nearby/evidence features, with no fallback to a paid POI provider on a miss — if Overture has no match, Corralio simply has no Nearby suggestion for that spot, per Slice 4.5's explicit non-goals. This is a real design difference from the "Overture miss → paid provider" pattern the audit prompt asked about — worth naming since the pattern doesn't exist yet, not because it's wrong. |
| Google miss → Perplexity | Not confirmed as an automated fallback chain; these appear to be separately admin-invoked tools (venue geocoding vs. tournament/venue discovery research) rather than a chained retry, based on the surfaces checked this pass. |
| HotelPlanner attribution persistence failure | Not independently re-verified this pass; this session's prior reconciliation record (2026-09-01) referenced HotelPlanner reconciliation hardening work in commits `8f5ce53b`/`e5053302` that likely bears on this, but the specific fallback-to-standard-routing behavior described in the audit prompt's example was not re-traced against current code in this pass. |

## O. Preliminary substitutability classification

- **OPEN_DATA_CANDIDATE:** ZIP-level geocoding (already effectively free via caching, so low incremental value); venue-level geocoding (plausible, coverage unverified); Nearby POI for categories Overture already supports (Food/Coffee).
- **CACHE_CANDIDATE:** Owl's Eye nearby/gear (already well-cached at the read layer — the opportunity, if any, is in how often batch runs are triggered, not adding a new cache); weather (already well-cached).
- **SHARED_DATA_CANDIDATE:** Venue coordinates generally, given ADR-030 already establishes TI's Mapbox/canonical-venue data as Corralio's intended reuse target for a different purpose (routing/venue-context) — the geocoding-specific overlap in Section F is a related but distinct opportunity worth its own look.
- **PAID_PROVIDER_LIKELY_REQUIRED:** Address verification/deliverability (Google); AI-assisted tournament/venue discovery research where no structured open dataset exists (Perplexity); venue duplicate-detection fuzzy matching (this is proprietary logic against RI/TI's own data, not really a "provider" question at all).
- **TRANSACTION_PROVIDER:** HotelPlanner, unambiguously.
- **UNKNOWN:** Brave Search / Bing Search / SerpAPI / Google CSE / Google GenAI / Foursquare's actual current role — genuinely unresolved, see Section P.

## P. Stage 2 measurement plan

For every provider in Section A, Stage 2 should collect: calls/day and calls/month (from `external_api_calls`, already instrumented for 11 of the ~15+ providers found); unique entities enriched (venues, ZIPs, tournaments); cache hit/miss where a cache exists; actual $ cost (only Perplexity has this today — Stage 2 needs list pricing for Google Places/Geocoding, Mapbox, Foursquare, HotelPlanner, and to build Corralio's own equivalent of `trackExternalCall()` before Corralio has anything to measure at all); free-tier utilization; and product-surface/revenue linkage (straightforward for HotelPlanner, genuinely unclear for search/research providers until Section P's open items below are resolved).

**Named gaps to close before Stage 2 can be considered complete, not just "ready":**
1. Confirm whether Brave Search, Bing Search, SerpAPI, and Google CSE are live, dead, or serving distinct purposes from Perplexity — env vars exist but call sites were not traced to the same depth as other providers this pass.
2. Confirm Google GenAI's actual usage — this is a second AI/model provider this audit surfaced but did not decompose; if it's active, Stage 2's AI-cost picture is incomplete without it.
3. Resolve whether venue/tournament pages perform any live HotelPlanner availability call on render, versus only rendering a static CTA (Section J).
4. Confirm Foursquare's actual current role versus Google Places for the same nearby-POI need (both env vars and call sites suggest partial usage, not fully traced).
5. Resolve the duplicate-looking credential pairs named in Section M (`BRAVE_SEARCH_API_KEY`/`BRAVE_SEARCH_KEY`, `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ROLE_KEY`) — likely one is legacy/dead, not confirmed which.
6. Confirm whether `NEXT_PUBLIC_OWLS_EYE_ADMIN_TOKEN` is genuinely meant to be client-exposed or is a naming artifact worth a closer look.

---

## Final decision packet

**Providers discovered:** 19 distinct external providers/data sources with concrete evidence (env var and/or call site) — Google Places, Google Geocoding/Maps, Google CSE, Google GenAI, Foursquare, Mapbox, Overture, Overpass/OSM, Perplexity, Brave Search, Bing Search, SerpAPI, Open-Meteo, TimeZoneDB, HotelPlanner, Resend, Telnyx (spike-only), Supabase Auth, web-push/VAPID — plus Geocodio and OpenRouteService/TomTom as named-but-not-yet-implemented planned providers, and Stripe as an unconfirmed local-only reference.

**Active call surfaces discovered:** 19 distinct surfaces documented in Sections B/J/K with trigger/cache/persistence detail; several more (Brave/Bing/SerpAPI/GenAI/CSE/Foursquare call sites) confirmed to exist via env vars but not yet mapped to specific surfaces — see Section P.

**Paid/metered providers:** Google Places, Google Geocoding, Google CSE, Google GenAI, Foursquare, Mapbox, Perplexity, Brave Search, Bing Search, SerpAPI, TimeZoneDB, HotelPlanner (transactional, not a flat metered cost). No strategic recommendation attached, per Section 18.

**Open/free data sources:** Overture Maps, Overpass/OpenStreetMap, Open-Meteo.

**Largest apparent overlap areas:** (1) venue/place geocoding split across Google (RI/TI, active) and Geocodio (Corralio, planned but unbuilt); (2) nearby-POI discovery split across Google Places + Foursquare + Overpass (RI/TI) and Overture (Corralio, Food/Coffee-only). No replacement recommended — both are named as candidates for Stage 2 only.

**Crawler-amplifiable paid calls:** None found that lack a cache/bound. The one real candidate (ZIP→lat/lng Google Places fallback) already has a permanent, structurally-bounded cache. This is a genuine finding, not a non-finding — it means the specific fear that prompted this audit (uncontrolled per-view paid-API spend) does not appear to be happening on the surfaces checked.

**Shared-data opportunities:** Venue coordinates (ADR-030 already partially establishes this intent for a different purpose); ZIP-level and venue-level geocoding as a "check free/cached source first" pattern, mirroring the already-proven `lookupZipLatLng` design.

**Existing cost instrumentation:** `external_api_calls` table + `trackExternalCall()` wrapper (11 providers, call/error/latency tracking, not $ tracking) + `/admin/api-usage` dashboard with configurable alarms; `perplexity_usage_summary()`/`perplexity_usage_detail()` (the only provider with real dollar-cost tracking); HotelPlanner's own revenue reconciliation. Corralio has none of its own yet.

**Missing measurement:** Actual $ cost for every provider except Perplexity (list pricing exists for some, per this session's prior venue-architecture review, but isn't wired into `external_api_calls`); Corralio-side call tracking entirely; the six named gaps in Section P.

**Stage 2 readiness:**

`BLOCKED — INVENTORY GAPS REMAIN`

Not because this pass found nothing usable — it found a great deal, including one important reassuring result (no uncontrolled crawler-amplifiable spend) and one clear opportunity pattern (the ZIP-centroid cache-first design as a template). But six concrete open items are named in Section P, three of which (Brave/Bing/SerpAPI status, Google GenAI's role, Foursquare's actual current role) are "is this even active" questions that Stage 2 economics cannot be attached to responsibly until resolved — attaching a cost model to a provider without first confirming it's live would produce a confident-looking number built on a guess. Recommend a short, narrow follow-up pass targeting exactly those six items before declaring Stage 1 complete, rather than proceeding to Stage 2 with known blind spots.
