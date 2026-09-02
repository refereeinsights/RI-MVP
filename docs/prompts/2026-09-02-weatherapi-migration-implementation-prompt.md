# WeatherAPI.com Migration — Implementation Design + Migration Prompt

**Date:** 2026-09-02 (revised same day, incorporating founder feedback on the first draft)
**Status:** Founder-directed implementation sequence, CPO-verified against live provider terms, revised per founder review, filed for Codex.
**Supersedes:** the AUDIT/P1 "resolve Open-Meteo licensing" item in the API economics register, and the first draft of this document (same filename — this is a full rewrite, not an addendum, so Codex should treat this version as authoritative).

---

## 0. Revision note — the founder was right on three points

The first draft of this document got three things wrong, corrected by the founder before this went to Codex. Recording the correction plainly rather than quietly editing it in, because it's a useful check on this session's own judgment, not just the founder's:

1. **I over-engineered Phase 3.** The first draft proposed building a persistent shared cache (new schema, migrations, venue/provisional/grid identity resolution, stale-fallback semantics, cross-app access) *before* any evidence it was needed. WeatherAPI's Starter tier is $7/month for 3M calls — the founder's math is correct that this is potentially thousands of dollars of engineering effort to optimize a bill that starts at $7. This is exactly the "test this before engineering it" standard this CPO role is supposed to hold *other* proposals to, and I didn't apply it to my own. Corrected: measure first, build the smallest cache actually justified by the measurement.
2. **Phase 4's "zero new direct WeatherAPI.com call sites" over-specified the mechanism.** The actual invariant is *one* portfolio WeatherAPI integration, not three independently-built provider clients — not "Corralio must depend on a database cache to show weather." Corrected: Corralio calls the same shared client Phase 1 builds; how that call is served (direct passthrough, an internal endpoint, a future cache) is an engineering decision, not a product requirement.
3. **The document contradicted itself on deployment authorization.** It required "Gates 1–4 pass in production" at Phase 6 while separately saying no production deploy was authorized — never actually establishing when or how production deployment gets authorized. Corrected: an explicit STOP gate, with production deployment and Open-Meteo retirement as two separate, later, explicit founder authorizations.

The founder also moved Corralio's weather feature earlier in the sequence — Phase 3 instead of after a caching/observation phase — on a straightforward product argument: weather is core to Corralio's actual promise ("what does my family need to know about this weekend?"), not speculative infrastructure, so there's no reason to delay customer-facing value behind an optimization that hasn't even been shown to be necessary yet. That's a sound product-sequencing call, and it's consistent with, not in tension with, correction #1 — ship the client + TI + Corralio on normal caching, then decide whether the persistent cache is worth building from real data. One small, explicit trade-off worth naming rather than glossing over: this bundles TI's swap and Corralio's new feature into the same pre-deploy review and the same STOP gate, so if one needs to roll back, review carefully whether the other should ship anyway or wait with it — not a reason to reorder, just worth having in mind at the STOP gate below.

Section 0 of the first draft (live verification of WeatherAPI.com's terms/pricing) is unchanged and still holds — reproduced below for completeness.

---

## 0a. CPO verification of the provider choice (unchanged from the first draft)

Checked against WeatherAPI.com's own live terms before recording it in the register, not accepted on the name alone (2026-09-02, `weatherapi.com/pricing.aspx` and `weatherapi.com/docs/`):

- **Commercial use is explicitly permitted on the free tier** ("Commercial Use: Yes — permitted on the free plan") — the exact fact that resolves Open-Meteo's unresolved compliance question.
- Free tier: 100K calls/month (lower than Open-Meteo's 300K/month — see Section 0's correction #1 for why this matters less than it might seem: at $7/mo for 3M calls, headroom past the free tier is cheap, not a reason to over-build).
- Paid: Starter $7/mo for 3M calls, Pro+ $25/mo for 5M, Business $65/mo for 10M — all cheaper per-call than Open-Meteo's ~$29/mo for 1M.
- Hourly forecast supported (matches Open-Meteo). 14-day horizon (exceeds the ~7–10 day V1 need).
- **Severe weather alerts supported** (`alerts=yes` parameter) — a capability Open-Meteo lacked. Noted, **not authorized for build** in this migration.
- API key is a **query parameter**, not a header — server-only handling and log hygiene are explicit Phase 1 requirements below, echoing the Owl's Eye admin-token finding (Stage 2 Section 11: never let a bearer credential reach a client bundle or an unredacted log).

---

## 1. Scope and sequence (revised, founder-authorized)

```
Phase 1: Shared WeatherAPI client + instrumentation
Phase 2: TI swap, preserve existing contract
Phase 3: Corralio event-aware weather (same shared client)
  → tests
  → preview verification
  → STOP
  → founder authorizes production deployment
Phase 4: Production observation (usage, cost, latency, cache behavior) — 30 days
Phase 5: Persistent shared cache — only if Phase 4 data justifies it
Phase 6: RI weather — only if a specific surface is justified
  → founder authorizes Open-Meteo retirement
Phase 7: Retire Open-Meteo
```

Each phase below ends with an explicit gate. Do not proceed past a gate without it passing. **No phase in this document authorizes a production deployment or a push** — that authorization is a single, explicit founder decision at the STOP gate after Phase 3, separate from and in addition to completing Phases 1–3's own build/test/preview gates.

---

## Phase 1 — Shared WeatherAPI client + instrumentation

**Build:**
- **One** server-only module — used by TI, Corralio, and (later, conditionally) RI. Not three separately-implemented clients. This module is the "one portfolio WeatherAPI integration" invariant from Section 0's correction #2; every later phase that needs weather data calls into this module, not a copy of it.
- Wrapped in `trackExternalCall()` from its first call site. Add a `weatherapi` entry to the shared `EXTERNAL_API` enum in `trackExternalCall.ts` alongside the existing (soon-to-be-retired) `open_meteo` entry — do not remove `open_meteo` yet (Phase 7).
- API key from a server-only environment variable, never `NEXT_PUBLIC_`-prefixed. Confirm no code path logs the full outgoing request URL (the key rides in the query string) — redact or omit the query string from any request/error logging this module adds.
- Request the `daily` fields TI already consumes (temperature max/min, precipitation probability, conditions, wind) plus `hourly` blocks scoped to a reasonable window. Do not request or surface `alerts=yes` — out of scope per Section 0a.
- **Caching in this phase is deliberately lightweight, not absent:** apply the same short-TTL Next.js `fetch`-revalidate / CDN `Cache-Control` pattern TI's current Open-Meteo route already uses (30-minute-class TTL), inside this shared module, so a burst of near-simultaneous requests for the same location doesn't multiply live calls. This is ordinary request caching, not the schema/migrations/persistent-cache work Section 0 correction #1 deferred — no new database table in this phase.
- **Design the module's internals so a persistent cache can be inserted later without changing its external interface** (Phase 5, conditional) — e.g., a single internal "fetch forecast for this key" function that Phase 5 can point at a cache-then-provider lookup instead of a direct provider call, without every caller needing to change.

**Gate 1:** module compiles; a manual/scripted call against a real coordinate returns a parsed forecast; a row appears in `public.external_api_calls` with `api = 'weatherapi'`. No UI wired yet. No Open-Meteo code touched yet.

---

## Phase 2 — TI swap, preserve existing contract

**Build:**
- Swap `apps/ti-web/app/api/weather/ten-day/route.ts`'s data source to the Phase 1 module, keeping the route's existing response shape (field names, units, ten-day window) unchanged wherever practical, so consuming components need no changes. If any field genuinely can't be preserved 1:1 (e.g., a condition-code taxonomy difference from Open-Meteo's WMO weathercode mapping), document the mapping decision inline and flag it in the PR for CPO review rather than deciding unilaterally.
- Check whether WeatherAPI.com's `location=` parameter accepts free-text city/zip directly before building a separate geocoding step for TI's existing city/state/zip fallback — reuse over rebuild.

**Gate 2:** TI's weather UI renders identically (or with an explicitly documented, CPO-reviewed field difference) against WeatherAPI.com in a preview environment. Side-by-side manual comparison against prior Open-Meteo output for a handful of real venues across a range of conditions, not just one happy path. Open-Meteo code in this route is not yet deleted.

---

## Phase 3 — Corralio event-aware weather

**Build:**
- Corralio's weekend-forecast feature, calling the **same** Phase 1 shared client directly (per Section 0 correction #2 — no separate Corralio-specific WeatherAPI integration, no requirement to route through a database cache that doesn't exist yet). Match the requirements already on record (2026-09-01 requirements doc): weekend forecast by event location, temperature, precipitation probability, basic conditions, hourly around event time where available, ~7-day horizon.
- Venue matching follows Corralio's existing venue architecture (provisional venues included) for resolving a coordinate to request from the client; where no venue match exists, fall back to the raw event location's coordinates, same as the client would for any other caller.
- This is the customer-facing reason for this entire migration cycle, per the founder's framing — treat it as first-class scope in this cycle, not a stretch goal.

**Gate 3:** a Corralio household with an upcoming weekend event sees a forecast sourced from the Phase 1 shared client, with zero separate WeatherAPI.com integration code in Corralio's own codebase (confirmed by code review — one shared module, called from two apps, not two implementations).

---

## STOP — founder authorizes production deployment

Phases 1–3 complete, tested, and verified in preview. **This document does not authorize production deployment.** That is a single, explicit founder decision made at this point, separate from and in addition to Phases 1–3's own gates. Do not deploy TI's swap or Corralio's new feature to production without it. If the founder's authorization covers only one of the two (e.g., ship TI's swap, hold Corralio back a cycle), that's a legitimate outcome of this gate — the phases above are built and tested together but the deploy decision doesn't have to be all-or-nothing.

---

## Phase 4 — Production observation (30 days)

**After founder-authorized production deployment:**
- Observe real usage via `external_api_calls` (`api = 'weatherapi'`): 30-day call volume, error rate, latency, and — the number that actually matters for Phase 5's decision — how close call volume comes to the 100K/month free-tier ceiling or, if already on a paid plan, how the volume tracks against the next pricing-tier boundary.
- This is a measurement window, not a build phase. No new caching infrastructure is built here.

**Gate 4:** 30 days of production `external_api_calls` data exists for `api = 'weatherapi'`, reviewed by the founder/CPO together with Phase 5's justification question below.

---

## Phase 5 — Persistent shared cache, only if justified

**Do not build this by default.** Build it only if Phase 4's data shows a concrete reason: call volume approaching or exceeding the free tier (or the current paid tier) such that the *next* tier up would otherwise be needed, a latency problem the provider's own response time is causing for users, or an error/rate-limit pattern the current lightweight caching doesn't absorb. If Phase 4 shows comfortable headroom under $7–25/month with no latency or error issues, the correct conclusion is **don't build this**, not "build it anyway since we're here" — revisit only if volume grows later.

**If justified, build:** the venue/grid-keyed persistent cache design from the original weather audit (`docs/reports/portfolio-api-economics-stage2-2026-09-02.md` Section 4) — keyed by `(venue_id_or_provisional_id, forecast_date)`, falling back to a rounded lat/lng grid cell + date, with a multi-hour freshness window and last-known-good-on-error fallback — inserted behind Phase 1's client interface so TI and Corralio's calling code doesn't change.

**Gate 5:** either the cache is built and a repeated request for the same venue within the freshness window produces zero new WeatherAPI.com calls (confirmed via `external_api_calls` counts), or this phase is explicitly closed with "not justified by Phase 4 data, revisit at N calls/month" recorded in the migration's completion notes — either outcome is an acceptable close to this phase.

---

## Phase 6 — RI weather, conditionally

**Do not build a default RI rollout.** Scoped only to specific cases where weather visibly improves a venue/travel experience RI already offers — evaluate against RI's actual existing surfaces before writing any code. "Not yet, no surface justified" is an acceptable close to this phase.

**Gate 6:** either a specific, justified RI surface is identified and built against the Phase 1 client (and Phase 5's cache, if it exists), or this phase closes with "no RI surface justified at this time" recorded.

---

## Founder authorizes Open-Meteo retirement

A second, separate, explicit founder authorization — not automatic once Phase 4's observation window closes. Production experience (Phase 4, and Phase 5/6 if built) should inform this decision, but it is the founder's call when to make it, not a fixed day-count.

---

## Phase 7 — Retire Open-Meteo

**Only after the above authorization:**
- Remove the Open-Meteo call sites in `apps/ti-web/app/api/weather/ten-day/route.ts` (forecast and geocoding-fallback legs).
- Remove the now-genuinely-unused `open_meteo` entry from the `EXTERNAL_API` enum in `trackExternalCall.ts` — confirm via repo-wide grep that no call site references it before deleting.
- Update the API economics register's Open-Meteo row `active` field to `No — retired [date]`. Do not delete the row; keep it as a historical record, consistent with the register's existing convention of correcting rather than erasing.

**Gate 7:** a repo-wide search confirms zero remaining references to `api.open-meteo.com` / `geocoding-api.open-meteo.com` / the `open_meteo` enum value.

---

## Explicit restrictions (carried forward from this session's standing execution-gate convention)

- Complete phases in order; do not skip a gate.
- No production deployment anywhere in Phases 1–3 without the explicit STOP-gate founder authorization above. No Open-Meteo retirement (Phase 7) without the separate authorization above.
- Server-only credentials, always — no `NEXT_PUBLIC_` exposure of the WeatherAPI.com key, and no query-string key values in logs.
- Preserve all uncommitted/unrelated working-tree changes exactly as found (per this session's standing discipline — at time of filing, several unrelated files elsewhere in the repo are modified and uncommitted; do not touch them).
- If Phase 2's UI-contract preservation turns out not to be practical for some field, stop and flag it for CPO/product review rather than deciding silently.
- Do not build Phase 5's persistent cache, or Phase 6's RI rollout, without the justification each phase's gate requires — "we're already in the codebase" is not justification.
- Update the API economics register (already updated as part of filing this document) rather than creating a second, disconnected weather-tracking document.
