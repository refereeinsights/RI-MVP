# Corralio CPO Audit — Weather Provider, Follow-up to the Portfolio External API Audit

**Date:** 2026-09-02
**Mode:** Follow-up discovery + requirements match + recommendation. No code, schema, or provider configuration changed.
**Relationship to prior work:** Deepens the weather line item in `docs/reports/portfolio-external-api-data-source-audit-2026-09-02.md`, which flagged Open-Meteo only briefly. This document also **corrects one claim in that report** — see Section 0.

---

## 0. Correction to the portfolio audit

That report's Section L implied Open-Meteo (`open_meteo`) was one of the providers actively tracked through `trackExternalCall()`/`external_api_calls`, because `open_meteo` appears in the `EXTERNAL_API` enum in `apps/ti-web/lib/trackExternalCall.ts`. Verified this pass: **the weather route never actually calls the wrapper.** `apps/ti-web/app/api/weather/ten-day/route.ts` calls `fetch()` directly against both `api.open-meteo.com` and `geocoding-api.open-meteo.com`, with zero `trackExternalCall(` call sites anywhere in the repo passing `"open_meteo"`. The enum entry exists (someone anticipated tracking it) but the instrumentation was never wired in. Practical effect: **there is currently no call-count visibility into Open-Meteo usage at all**, despite my own report's table structure implying otherwise. This is exactly the kind of thing Stage 1 discovery is supposed to catch, so I'm recording it plainly rather than letting the earlier table stand uncorrected.

## 1. Current portfolio weather (TI/RI)

**Provider:** Open-Meteo, used two ways: `geocoding-api.open-meteo.com/v1/search` (city/state/zip → lat/lng, only when lat/lng aren't already supplied) and `api.open-meteo.com/v1/forecast` (the actual forecast). No API key is sent with either call — confirmed by reading the full route; there is no `Authorization` header and no `OPEN_METEO_API_KEY`-style env var anywhere in the repository.

**What's actually requested today:** `forecast_days=10`, and only the **daily** parameter block — `temperature_2m_max`, `temperature_2m_min`, `precipitation_probability_max`, `windspeed_10m_max`, `weathercode`. No `hourly` parameter is requested, even though Open-Meteo's forecast endpoint supports hourly data for up to 16 days (verified live this session — see Section 3). So today's implementation is daily-resolution only by choice, not by provider limitation.

**API calls/month:** Unknown — cannot be measured, per Section 0's correction. This is a genuine gap, not an estimate I'm choosing to omit.

**Pricing/free tier — the important finding.** Verified live this session directly from Open-Meteo's own pricing page and corroborated by a third-party API directory: the free tier (300,000 calls/month, 10,000/day, 5,000/hour, 600/minute) is explicitly restricted — "You may only use the free API services for non-commercial purposes." TI and RI are commercial products (TI runs premium entitlements and HotelPlanner revenue; RI is the same business). **I found no evidence of a paid Open-Meteo subscription anywhere in the codebase** — no billing reference, no API key, no plan-tier configuration. I want to be precise about what this is and isn't: I cannot see billing/account state from the repository, so I can't confirm whether commercial licensing was arranged outside the code (a separate account-level agreement wouldn't necessarily show up here). But based purely on what's in the repository, **the current implementation as written appears to run on Open-Meteo's non-commercial free tier while serving a commercial product**, which is worth someone confirming directly with Open-Meteo or checking against any existing account/billing record before this audit's Corralio recommendation compounds the same exposure onto a second product. Paid tiers, per the same source (dollar figures via a third-party directory, flagged as unverified precision consistent with this session's pricing-citation practice elsewhere): Standard ~$29/month (1M calls), Professional ~$99/month (5M calls, adds historical/climate data), Enterprise custom (50M+).

**Cache behavior:** Time-based only, no persistent storage. Next.js `fetch` revalidation (1,800s / 30 min) plus a matching CDN `Cache-Control: s-maxage=1800, stale-while-revalidate=86400` header. Geocoding results get a longer 24-hour fetch-revalidate window. **There is no database table backing this** — confirmed by a repository-wide search for `weather_forecast`/`weather_cache`/`forecast_cache`-style tables, none found. This is a materially different pattern from the ZIP-centroid cache this session's portfolio audit praised for Google Places — that one is a permanent DB-backed cache with a hard structural bound (~41K ZIP codes); weather has no equivalent. Every cache-cold request (new edge node, or any request after the 30-minute TTL expires) is a fresh live call, for as long as anyone keeps requesting that location.

**Forecast horizon:** Currently configured for 10 days, daily. Provider supports up to 16 days.

**Hourly vs. daily:** Daily only, today, by configuration choice — see above.

**Geolocation inputs:** lat/lng directly (preferred), or city+state+zip resolved via Open-Meteo's own geocoding endpoint as a fallback. No venue-ID-based lookup — the route has no awareness of `public.venues` at all; each caller passes raw coordinates or a place-name string.

**Persisted?** No — confirmed above, this is pure request-time computation with edge caching only.

**Could the same forecast serve TI + RI + Corralio?** Yes, and more cleanly than most of the overlap cases in the portfolio audit. Weather is not proprietary, not user-specific, and not product-differentiated — a forecast for a given lat/lng and date is identical regardless of which product is asking. This is one of the cleanest SHARED_DATA_CANDIDATE cases found across either audit.

## 2. Corralio requirements, matched against what Open-Meteo actually supports

| Requirement | Open-Meteo support | Confidence |
|---|---|---|
| Weekend forecast by event location | Yes — lat/lng-based forecast, same mechanism TI already uses | Verified (existing TI usage) |
| Temperature | Yes | Verified |
| Precipitation probability | Yes | Verified |
| Basic conditions | Yes — WMO weather codes, already mapped to short labels in TI's `conditionFromWeatherCode()`, directly reusable | Verified |
| Hourly forecast around event time | Yes, up to 16 days out — **but TI's current implementation doesn't request it.** Corralio would need to add the `hourly` parameter itself; this isn't a gap in the provider, it's a gap in the one existing internal reference implementation | Verified live this session |
| Severe-weather info, only if reliably supported | **Not supported.** Verified live this session: Open-Meteo's forecast API has no dedicated severe-weather-alert product (it has separate flood-forecast and air-quality APIs, neither of which is a severe-weather alert). Your own requirement text already hedged this correctly ("only if the provider reliably supports it") — the right call here is simply: don't build it, the provider doesn't have it | Verified live this session |
| ~7-day horizon for V1 | Comfortably covered — provider supports up to 16 days, current TI config already requests 10 | Verified |
| Venue-level caching, not per-family/event | **Not currently true of TI's own implementation** — see Section 1. This is the one requirement Corralio should NOT copy from the existing reference implementation as-is; it needs new work, detailed in Section 3 | Gap, addressed below |

**Net match:** strong on data capability, weak on the one thing that actually determines cost at scale — caching architecture. The provider is not the risk here; the caching design is.

## 3. Cost architecture — the part worth getting right before writing any code

Your framing is correct and matches this session's own prior recommendation on the ZIP-centroid pattern: **cache by venue, not by family or event.** A tournament weekend routinely has dozens of families with events at the same handful of venues; a naive per-event or per-household forecast fetch multiplies calls by household count for information that's identical across all of them.

**Recommended design, reusing a pattern already proven in this repository rather than inventing a new one:** a Corralio-owned table keyed by `(venue_id_or_provisional_id, forecast_date)` — or, for the coarser precision weather genuinely needs, a rounded lat/lng grid cell and date, which sidesteps needing every event to already be venue-matched before it can get a forecast. Store the daily (and, where fetched, hourly-around-event-time) values with a `fetched_at` timestamp; serve any request for the same key from that table if `fetched_at` is within a defined freshness window (a few hours is more than adequate for weather — even TI's current 30-minute window is far tighter than weather forecasts actually change), and only call Open-Meteo on an actual miss or stale-refresh. This is the same shape as the `zip_centroids` table this session's portfolio audit already flagged as a good, underused pattern — reuse the pattern, don't reinvent it.

This has a second benefit beyond cost: because a venue-keyed forecast cache has no natural reason to be product-specific, **the same table and the same cache could genuinely serve TI, RI, and Corralio from one shared lookup**, which is a real, low-risk instance of the "shared canonical data" opportunity the portfolio audit could only speculate about for venues/POIs. Weather is simpler than venue matching because there's no ambiguity to resolve — a coordinate plus a date has exactly one right answer, regardless of which product is asking.

## 4. Recommendation

**BUILD, with one prerequisite decision the founder should make first, not Codex:** confirm Open-Meteo's commercial-use/licensing status before Corralio adds a second commercial product onto a provider whose free tier's own terms restrict it to non-commercial use. This should take one conversation or email to resolve, not an engineering cycle — either an existing commercial arrangement is confirmed (in which case proceed as planned), or the ~$29/month Standard plan gets budgeted (in which case, worth noting, that single subscription could reasonably cover TI, RI, and Corralio's combined weather usage under the shared-cache design above, not just Corralio's share).

Once that's resolved, the actual build is small and low-risk: reuse Open-Meteo (proven, already integrated once, free-or-cheap either way) with a venue/grid-keyed persistent cache table (new — this is the one genuinely new piece of infrastructure), a daily-plus-hourly request shape (a small addition to the existing `daily`-only pattern, add `hourly` params scoped to the event-time window), and explicitly no severe-weather feature (the provider doesn't support it reliably, so don't build toward it).

**Evidence vs. inference, since this is a decision document:** the provider's capabilities, its stated commercial-use restriction, and TI's current cache/tracking gaps are all evidence — verified directly against the code and, for pricing/terms, against Open-Meteo's own site this session. The claim that TI's current usage is actually out of compliance is inference, not confirmed fact — I can't see account/billing state from the repository, and I'm flagging it as something to confirm, not asserting a violation has occurred.
