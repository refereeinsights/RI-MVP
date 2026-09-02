# WeatherAPI.com Migration — Implementation Design + Migration Prompt

**Date:** 2026-09-02
**Status:** Founder-directed implementation sequence, CPO-verified against live provider terms and filed for Codex. This is a build authorization for the sequence below — narrower than "go build weather," and gated at each phase.
**Supersedes:** the AUDIT/P1 "resolve Open-Meteo licensing" item in `docs/reports/portfolio-api-economics-register-stage2-2026-09-02.xlsx` and the corresponding Section 3 verdict in `docs/reports/portfolio-api-economics-stage2-2026-09-02.md`. The founder chose to retire the ambiguity rather than resolve it — a legitimate and, per the verification below, well-supported call.

---

## 0. CPO verification of the founder's premise

Before filing this as a build prompt, the choice of WeatherAPI.com was checked against its own live terms rather than accepted on the name alone (2026-09-02, `weatherapi.com/pricing.aspx` and `weatherapi.com/docs/`):

- **Commercial use is explicitly permitted on the free tier** ("Commercial Use: Yes — permitted on the free plan") — this is the exact fact that resolves Open-Meteo's unresolved compliance question (Stage 2 Section 3), not just a provider swap for its own sake.
- Free tier: 100K calls/month. This is **lower** than Open-Meteo's 300K/month — the one real trade-off, flagged here rather than glossed over. It should be a non-issue once the shared persistent cache (Phase 3 below) is live, since the entire point of that cache is to collapse raw provider-call volume well under either ceiling — but it's worth watching, not assuming.
- Paid headroom is cheaper than Open-Meteo's: Starter plan $7/mo for 3M calls, vs. Open-Meteo's Standard ~$29/mo for 1M calls (Open-Meteo figure third-party-sourced per Stage 1; WeatherAPI.com figure verified directly on its own pricing page this pass).
- Hourly forecast data is supported (matches Open-Meteo). 14-day forecast horizon (exceeds the ~7–10 day V1 need already established for Corralio).
- **Severe weather alerts are supported** (`alerts=yes` parameter, government-issued alerts/warnings) — Open-Meteo did not have this, and the Corralio requirements doc (2026-09-01) correctly excluded it for exactly that reason. This is a genuine new capability, not requested by this task, and **not authorized for building here** — noted for a future product decision, not part of this migration.
- The API key is transmitted as a **query parameter**, not a header. This raises the same class of exposure risk flagged in the Owl's Eye admin-token finding (Stage 2 Section 11) if handled carelessly — a query-param key is more prone to landing in access logs, CDN cache keys, or referrer headers than a header-based one. Phase 1 below makes server-only handling and log hygiene an explicit requirement, not an assumption.

Conclusion: the founder's decision is sound on the evidence and directly resolves the item this session had flagged as the top P1 audit finding. This document proceeds as an implementation design, not a second provider audit, per the founder's own instruction.

---

## 1. Scope and sequence (founder-specified, reproduced here as the authorized order)

1. Add WeatherAPI.com with **server-only credentials** and **usage tracking** (reuse `trackExternalCall()` / `public.external_api_calls`, the shared portfolio pattern — do not build a second Corralio-style parallel tracking table for this; that fragmentation was flagged, not endorsed, in Stage 2 Section 12).
2. Replace TI's Open-Meteo route **without changing the existing UI contract**, if practical.
3. Add the shared persistent cache (venue/grid-keyed, per the design in `docs/reports/portfolio-api-economics-stage2-2026-09-02.md` Section 4).
4. Add Corralio event-aware weather.
5. Add RI weather **only where it improves the venue/travel experience** — not a blanket rollout.
6. Once the migration is verified in production, **retire Open-Meteo** — remove its call sites and its (currently-unused) `trackExternalCall` enum entry, so the portfolio isn't carrying two weather systems.

Each phase below ends with an explicit gate. Do not proceed past a gate without it passing.

---

## Phase 1 — Add WeatherAPI.com (server-only, instrumented, not yet wired to any UI)

**Build:**
- A new server-only module (mirroring the shape of `apps/referee/src/lib/google/timezoneFromCoordinates.ts`'s already-correct pattern, not TI-web's uninstrumented `planner/timezone` route — that file is the example of what *not* to do) that calls WeatherAPI.com's forecast endpoint, wrapped in `trackExternalCall()` from its very first call site. Add a `weatherapi` (or equivalent) entry to the shared `EXTERNAL_API` enum in `trackExternalCall.ts` alongside the existing `open_meteo` entry — do not remove `open_meteo` yet (Phase 6).
- API key read from a server-only environment variable, never a `NEXT_PUBLIC_`-prefixed one. Confirm no code path logs the full outgoing request URL (the key rides in the query string) — redact or omit the query string from any request/error logging this module adds.
- Request the `daily` fields TI already consumes today (temperature max/min, precipitation probability, conditions/weathercode-equivalent, wind) plus `hourly` blocks scoped to a reasonable window (this module should support requesting hourly, but doesn't need to fetch a full 16-day hourly pull by default). Do **not** request or surface `alerts=yes` in this phase — that's the new capability flagged in Section 0 as out of scope here.

**Gate 1:** module compiles, a manual/scripted call against a real coordinate returns a parsed forecast, and a row appears in `public.external_api_calls` with `api = 'weatherapi'` (or the chosen enum value). No UI wired yet. No Open-Meteo code touched yet.

---

## Phase 2 — Replace TI's Open-Meteo route, preserving the UI contract

**Build:**
- Swap `apps/ti-web/app/api/weather/ten-day/route.ts`'s data source from Open-Meteo to the Phase 1 module, keeping the route's existing response shape (field names, units, the ten-day window) unchanged wherever practical, so the consuming client component(s) need no changes. If any field genuinely cannot be preserved 1:1 (e.g., a WeatherAPI condition-code taxonomy differing from Open-Meteo's WMO weathercode mapping), document the mapping decision inline rather than silently reinterpreting it, and flag it in the PR description for CPO review rather than deciding unilaterally that it's fine.
- Geocoding leg: TI's route currently falls back to Open-Meteo's own geocoding endpoint for city/state/zip inputs. Check whether WeatherAPI.com's `location=` parameter accepts free-text city/zip directly (its docs support this) before building a separate geocoding step — reuse over rebuild.
- Leave the existing time-based (30-minute) cache/CDU headers in place for this phase; the shared persistent cache is Phase 3, not bundled into this swap, so this phase stays a narrow, verifiable substitution.

**Gate 2:** TI's weather UI renders identically (or with an explicitly documented, CPO-reviewed field difference) against WeatherAPI.com in a staging/preview environment. Side-by-side manual comparison against the prior Open-Meteo output for at least a handful of real venues, across a range of conditions if possible (clear, rain, high wind) — not just one happy-path check. Open-Meteo code in this route is not yet deleted (kept as an inert fallback or simply left unreached — implementer's call — but not removed until Phase 6).

---

## Phase 3 — Shared persistent cache

**Build**, per the design already on record (`docs/reports/portfolio-api-economics-stage2-2026-09-02.md` Section 4):
- A new table keyed by `(venue_id_or_provisional_id, forecast_date)`, falling back to a rounded lat/lng grid cell + date where no venue match exists (reuse the 4-decimal rounding convention already used in `apps/ti-web/app/api/planner/timezone/route.ts`'s in-memory cache, applied here to a real persisted table instead).
- A freshness window measured in hours (weather forecasts don't need minute-level freshness) — pick a specific number as part of this build, document the choice, don't leave it implicit.
- Serve from cache on a fresh hit; call WeatherAPI.com only on a miss or stale entry; on a provider error, serve the last-known-good cached value rather than a blank state (explicit failure-behavior requirement from the Section 4 design).
- TI's route (Phase 2) now reads through this cache rather than the raw 30-minute time-based CDN cache alone.

**Gate 3:** a repeated request for the same venue within the freshness window produces zero new WeatherAPI.com calls (confirm via `external_api_calls` row counts before/after). A cache-cold request still resolves correctly and populates the cache. A simulated provider error still serves a usable (even if stale) result rather than nothing.

---

## Phase 4 — Corralio event-aware weather

**Build:**
- Corralio's weekend-forecast feature, reading from the Phase 3 shared cache (venue-matched where possible, grid-cell fallback otherwise, per Corralio's own venue-matching maturity — provisional venues included, per the existing Corralio venue architecture). This is new Corralio-facing product surface, not a new weather-fetching path — it should not add a second call site to WeatherAPI.com; it should read the same cache TI now reads.
- Match the Corralio requirements already on record (2026-09-01 requirements doc): weekend forecast by event location, temperature, precipitation probability, basic conditions, hourly around event time where available, ~7-day horizon, venue-level (not per-family) caching — all of which Phase 3's cache already satisfies structurally.

**Gate 4:** a Corralio household with an upcoming weekend event sees a forecast sourced from the shared cache, with zero new direct WeatherAPI.com call sites added in Corralio's own codebase (confirm via code review, not just testing — the point of Phase 3 is exactly to prevent a second parallel weather-fetching path from emerging, the same fragmentation pattern flagged for Corralio's Geocodio/OpenRouteService tracking in Stage 2 Section 12).

---

## Phase 5 — RI weather, conditionally

**Do not build a default RI rollout.** Per the founder's own framing, this is scoped to specific cases where weather visibly improves the venue/travel experience RI already offers — evaluate against RI's actual existing venue/travel surfaces before writing any code, and treat "add it everywhere RI shows a venue" as explicitly out of scope unless a specific surface is named and justified. If no clear case presents itself during this phase, it is acceptable — expected, even — to conclude "not yet" and move to Phase 6 without RI changes.

**Gate 5:** either a specific, justified RI surface is identified and built against the same Phase 3 cache (no new call site), or this phase is explicitly closed with "no RI surface justified at this time" recorded in the migration's completion notes.

---

## Phase 6 — Retire Open-Meteo

**Only after Gates 1–4 pass in production** (Gate 5 may close without a build, per above, and does not block this phase):
- Remove the Open-Meteo call sites in `apps/ti-web/app/api/weather/ten-day/route.ts` (both the forecast and geocoding-fallback legs).
- Remove the now-genuinely-unused `open_meteo` entry from the `EXTERNAL_API` enum in `trackExternalCall.ts` — confirm via a repo-wide grep that no call site references it before deleting.
- Update `docs/reports/portfolio-api-economics-register-stage2-2026-09-02.xlsx`'s Open-Meteo row `active` field to `No — retired 2026-XX-XX` (do not delete the row; keep it as a historical record, consistent with this register's existing convention of correcting rather than erasing).

**Gate 6:** a repo-wide search confirms zero remaining references to `api.open-meteo.com` / `geocoding-api.open-meteo.com` / the `open_meteo` enum value. Production has been running on WeatherAPI.com for a founder-determined verification period (this document does not set that number — it's a product/risk call, not an engineering one) with no regression reported.

---

## Explicit restrictions (carried forward from this session's standing execution-gate convention)

- Complete phases in order; do not skip a gate.
- Server-only credentials, always — no `NEXT_PUBLIC_` exposure of the WeatherAPI.com key, and no query-string key values in logs.
- No push, no deploy, beyond whatever the existing CI/staging pipeline already does as part of normal development — this document does not authorize a production deploy step itself; that's a separate founder call at Phase 6's gate.
- Preserve all uncommitted/unrelated working-tree changes exactly as found (per this session's standing discipline — at time of filing, `apps/corralio/app/api/gate3/sms-hook/route.ts` and two SMS durable-safety files are modified and uncommitted; do not touch them).
- If Phase 2's UI-contract preservation turns out not to be practical for some field, stop and flag it for CPO/product review rather than deciding silently — this document explicitly calls that out as a decision point, not a rubber stamp.
- Update the API economics register (already updated as part of filing this document) rather than creating a second, disconnected weather-tracking document.
