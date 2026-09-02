# Portfolio API Economics Register — Complete Discovery + Stage 2 Inputs

**Date:** 2026-09-02
**Mode:** Closes the six named Stage 1 gaps from `docs/reports/portfolio-external-api-data-source-audit-2026-09-02.md`, resolves the weather licensing question, and delivers the API economics register (spreadsheet attached, 5 sheets: API Portfolio, Usage & Cost, Surface Map, Decisions, Legend & Method). No provider replaced, cached, migrated, reconfigured, or killed. No production writes, deploys, or pushes.
**What changed since the last report:** deeper call-site tracing closed every named gap, and one new tool was found and used: `apps/referee/app/admin/api-usage/page.tsx` (an existing, already-built admin dashboard) carries a hand-maintained free-tier reference table for 10 providers — real, engineer-curated pricing/allowance figures, dated by its own last commit (2026-06-09). That table is the single best evidence source in this register and is cited throughout.

---

## 1. Stage 1 gaps — closed

1. **Brave Search — ACTIVE.** Confirmed call site: `apps/referee/src/server/atlas/search.ts`, one of three selectable web-search engines behind a single `atlasSearch()` function, used by the RI admin field-map/venue-discovery tool. Properly wrapped in `trackExternalCall`. 2K/mo free tier per the admin dashboard's own reference table.
2. **Bing Search — ACTIVE.** Same file, same function, same purpose — one of the three selectable engines. 1K/mo free tier.
3. **SerpAPI — ACTIVE.** Same file, same function, third selectable engine. 100/mo free tier — the smallest allowance of the three.
4. **Google CSE — ACTIVE**, but a distinct, smaller role: not one of `atlasSearch()`'s three selectable engines, but an explicit auto-fallback specifically for PDF-heavy sites when the primary engine returns `no_match` (confirmed in `apps/referee/app/admin/venues/field-maps/page.tsx`, which documents this behavior inline).
5. **Google GenAI — DEAD.** Confirmed by a repository-wide search: zero call sites anywhere reference `GOOGLE_GENAI_API_KEY`. The env var exists; nothing reads it. This corrects my prior audit's tentative "second AI provider" flag — there's no second AI provider in use, just an unused variable.
6. **Foursquare vs. Google Places — resolved, and it reverses what my first portfolio audit implied.** Foursquare is the **primary** nearby-POI provider for Owl's Eye (`upsertNearbyForRun.ts`, explicitly named `runFsqPrimary` in the admin dashboard's own code comments); Google Places is the **fallback**, used only "when FSQ weak/unavailable," capped at up to 7 calls per run on a separate budget. My first audit's framing (Google Places as the main enrichment leg) had this backwards — corrected in the register.
7. **HotelPlanner live-search on page render — NO.** Traced every caller of `searchHotelsWithHotelPlanner()`/`.searchHotels(`: the only real caller is `apps/ti-web/app/api/lodging/search/route.ts`, a dedicated API route, not a page-render path. Tournament/venue pages do not trigger a live HotelPlanner search on render.
8. **Duplicate credential names — resolved where traceable.** `BRAVE_SEARCH_API_KEY` (my first audit's guess) has zero call sites; `BRAVE_SEARCH_KEY` is the live one, used in `atlas/search.ts`. `SUPABASE_SERVICE_ROLE_KEY` has 253 call sites and is unambiguously canonical; `SUPABASE_ROLE_KEY` appears only in 3 files, all one-off `scripts/ingest/` tools — plausibly legacy, low-risk, not application-critical.
9. **`NEXT_PUBLIC_OWLS_EYE_ADMIN_TOKEN` — YES, this is a meaningful finding, worth a closer look.** It's used as a fallback bearer token (`process.env.NEXT_PUBLIC_OWLS_EYE_ADMIN_TOKEN ?? process.env.OWLS_EYE_ADMIN_TOKEN`) to authorize `/api/admin/owls-eye/run` and `/run/[runId]`. Because it's `NEXT_PUBLIC_`-prefixed, it is bundled into client-side JavaScript. The API route itself validates only the static token value against the request, per `apps/referee/app/api/admin/owls-eye/run/route.ts:144` — there is no additional session-based check visible in that specific validation. Practical effect: if this token is ever extracted from the client bundle (or from browser devtools/network logs), it would function as a standing credential capable of triggering costly Owl's Eye batch enrichment runs, independent of whether the holder has a valid admin session. This doesn't self-trigger from a bare page view — it requires someone to deliberately extract and reuse the token — so it isn't a Section-22-caliber urgent finding, but it's a real privileged-capability exposure worth a security review, not just a documentation footnote.
10. **Open-Meteo instrumentation — corrected, as flagged in the weather follow-up.** `open_meteo` exists in the `EXTERNAL_API` enum but has zero `trackExternalCall(` call sites. No usage visibility exists for weather at all.

## 2. Weather licensing verdict

**NO COMMERCIAL PLAN EVIDENCE FOUND.**

This is strengthened, not just repeated, by what this pass found: the existing `/admin/api-usage` dashboard's own hand-maintained reference table labels Open-Meteo `"Free (non-commercial)"` — meaning RI/TI's own engineering already documented, in code, that this is running on the non-commercial free tier. Combined with the complete absence of any API key, billing reference, or plan-tier configuration anywhere in the repository, the repository-only evidence available to this audit points the same direction from two independent angles. I still can't see account/billing state outside the repository, so I'm not escalating this past the verdict the prompt itself defined — but "the code's own documentation agrees with the absence of a paid-plan artifact" is about as strong as repo-only evidence gets.

## 3–11. Register

The full register — provider inventory, call surfaces, trigger economics, cache/persistence, usage/cost (with 30/90-day figures marked `UNKNOWN` where they are, per Section 4 below — nothing invented), Overture overlap classification, shared-portfolio-data opportunities, business-role classification, and preliminary candidate actions with one-sentence rationale — is in the attached spreadsheet, not reproduced here: `portfolio-api-economics-register-2026-09-02.xlsx` (5 sheets: **API Portfolio** — the full 31-column master register; **Usage & Cost** — the cost-focused subset; **Surface Map** — provider→surface→trigger→cache→business role; **Decisions** — function→approach→overlap→action→rationale→next test; **Legend & Method**).

**21 provider/function rows.** Every cell is either evidence-backed (with its source named in the Pricing/Usage source columns) or marked `UNKNOWN`/`TBD`/`N/A` per the task's explicit instruction not to invent values.

## 4. Why most 30/90-day usage and spend figures are UNKNOWN

The instrumentation to answer this exists and is more capable than my first audit credited — `api_usage_summary(from_ts, to_ts)` and `perplexity_usage_summary(from_ts, to_ts)` are already-deployed RPCs, purpose-built for exactly this question, with the RPC's own comment noting it aggregates server-side specifically "no raw-row fetch, no PostgREST max_rows=1000 cap." **This session's device shell has no network egress to the database** — a read-only query script (`tmp/cpo_api_usage_query.mjs`, written this session, gitignored, left in the repo for reuse) calling both RPCs for 30-day and 90-day windows failed with `fetch failed`, and a basic unrelated `fetch()` to `example.com` failed identically, confirming this is a network-access limitation of this session, not a problem with the query or the credentials. **This is the single highest-value next action**: running that script (or simply opening the existing `/admin/api-usage` dashboard) from anywhere with real database access would fill in the majority of the amber cells in the register directly, with no new code required.

## 5. Actual cost vs. list price

Kept separate throughout the register, per instruction. Actual spend is `UNKNOWN` for every provider except Telnyx and web-push (confirmed `$0`, since neither has any live traffic yet) and HotelPlanner (marked `N/A` as a spend line — it's a revenue provider, not a cost one). List-price economics are populated wherever found: the admin dashboard's free-tier table for 10 providers, this session's live-verified Google Places/Open-Meteo pricing, and repo-documented Google Geocoding/Perplexity/Telnyx figures from prior sessions' reviews — each cited to its specific source and date in the register's Pricing source/date column.

## 6. Overture comparison

Classified per function in the register (`Open-data overlap` column): Google Places nearby POI and Foursquare both **PARTIAL**; Google venue geocoding **PARTIAL**; the not-yet-built Geocodio **PARTIAL** (same underlying question as Google geocoding — see Section 11); ZIP geocoding not separately re-classified this pass (already covered in the venue-architecture review as "likely exact-or-better, inference not verified test"); Overpass/gear **NONE** classified as open-data overlap since it already *is* open data; TimeZoneDB **STRONG** (timezone-from-coordinate is a well-solved open-data problem, distinct from POI/venue matching). No replacement recommended anywhere — every PARTIAL/STRONG classification is flagged as needing the bounded coverage test this session's venue-architecture review already called for, not yet run.

## 7. Shared portfolio data opportunities

- **Venue coordinates:** ADR-030 already establishes TI's canonical venue data as Corralio's intended reuse target (for a different purpose — routing/venue-context). The register's `Shared-data opportunity` column flags this consistently across Google Places, Google Geocoding, and the planned Geocodio rows.
- **POI:** flagged Partial/Yes on Overture-related rows — Corralio's Food/Coffee output is structurally isolated per ADR-008 today, so "shared" here means *conceptual* reuse potential, not a currently-shared table.
- **Weather:** the cleanest case in the register. One venue/grid-keyed forecast cache could genuinely serve TI + RI + Corralio, since a forecast for a coordinate and date has no product ownership. Detailed already in the weather follow-up; the register's Open-Meteo row carries `Shared-data opportunity: YES` with that reasoning inline.
- **Timezone:** flagged `Yes` — a coordinate/venue-keyed persistent cache would remove nearly all repeat TimeZoneDB lookups for the same venue, and the underlying answer (timezone from coordinates) is deterministic open data, not something requiring a live API at all.

No shared infrastructure was implemented — this section is evaluation only, per instruction.

## 8. Weather row

Included as a first-class row in the register (see Section 2 above for the licensing verdict, and the register's Open-Meteo row for the full field set: TI active / Corralio proposed, not built / RI potential, not confirmed used; current daily-only TI implementation; provider's actual 16-day hourly capability; 30-minute request/CDN cache with no persistent forecast cache; call count `UNKNOWN` because instrumentation isn't wired; commercial licensing status per Section 2; ~$29/mo Standard-tier allowance if a commercial plan is purchased (third-party-sourced figure, flagged unverified precision); severe-weather alerts confirmed unsupported by the current forecast product). Recommendation candidate recorded as `AUDIT` (licensing question first) with `SHARED CACHE` and `ADD INSTRUMENTATION` as the follow-on candidates once the licensing question resolves — consistent with the weather follow-up's BUILD-gated-on-licensing recommendation. Not built in this task.

## 9. Business-role classification

Applied per row in the register (`Revenue/product role` and `What breaks if disabled?` columns). Headline pattern: HotelPlanner and Resend are the only two rows with a `CRITICAL`-tier disable impact; most enrichment providers (Google Places fallback, Overpass, Brave/Bing/SerpAPI, CSE) are `MINOR`; Foursquare is `MATERIAL` (it's the primary enrichment provider, not a fallback); Open-Meteo is `MATERIAL` for TI specifically. Google GenAI is the only row with a confirmed `NOTHING KNOWN` disable impact, consistent with it having no call site at all.

## 10. Candidate actions

Assigned per row with a one-sentence rationale each (register `Decisions` sheet). Distribution across the 21 rows: 1 `KILL` (Google GenAI — genuinely dead code), 5 `AUDIT` (Google Places fallback, Google Geocoding, Google CSE, Open-Meteo, Stripe — each has a real open question worth resolving before any other action), 3 `CONSOLIDATE` (Brave/Bing/SerpAPI — the clearest structural-duplication finding in the register, three metered search providers behind one selectable function), 2 `CACHE` (Foursquare, TimeZoneDB — cost-effective persistent-caching opportunities), 2 `EXPAND` (Overture, HotelPlanner — one because coverage is the only constraint on a free resource, one because it's revenue infrastructure), 7 `KEEP`/`HOLD` (Mapbox, Overpass, Perplexity, Resend, Telnyx, web-push, OpenRouteService/TomTom — either core/critical as-is, or correctly still pre-build). All preliminary; none authorize implementation.

## 11. Strategic hypotheses — evaluated, not assumed

- **POI (Overture-first, paid provider on unresolved cases):** evidence-consistent but unproven — Overture's actual coverage of RI/TI's typical venue mix (small facilities, rec-league fields) still hasn't been tested, exactly as flagged in the venue-architecture review. Not contradicted by anything found this pass; also not yet confirmed.
- **Geocoding (canonical TI coordinates first, no second Corralio geocoder until proven necessary):** strongly supported by this pass's evidence — Corralio's planned Geocodio integration doesn't exist yet (zero env var, zero call site), which means there's a genuine window to test coordinate reuse *before* committing to a second paid vendor, not after. Recorded as the Geocodio row's rationale directly.
- **Weather (one commercial, instrumented, shared cache across TI/RI/Corralio):** strongly supported — this is the cleanest shared-data case in the whole register, for the structural reason that weather has no product ownership. The one blocker is the licensing question (Section 2), not a technical one.
- **Search/research consolidation (Brave/Bing/SerpAPI/CSE/Perplexity/GenAI):** partially supported, and worth being precise about which part. Brave/Bing/SerpAPI are confirmed materially duplicate — three metered providers behind one already-built selector function, which is about as clean a consolidation case as exists in this register. Perplexity is **not** duplicate work with the other four — it's doing AI-assisted structured-extraction research, not keyword web search, a categorically different job. Google GenAI isn't part of this question at all; it's dead code, not a fifth active competitor. So: consolidate the three search engines, leave Perplexity alone, remove GenAI as unrelated cleanup.
- **HotelPlanner (protect/expand as revenue infrastructure, not ordinary API overhead):** confirmed, cleanly — it's the only row in the register classified `REVENUE` rather than `ENRICHMENT`/`COMMUNICATION`/`INFRASTRUCTURE`, its disable impact is the register's only other `CRITICAL` alongside Resend, and this pass additionally confirmed it isn't even a passive-render cost risk (Section 1, item 7) — there's no evidence pointing away from EXPAND.

---

## Final decision packet

**Stage 1:** `COMPLETE`

**Active metered providers:** Google Places, Google Geocoding, Google CSE, Foursquare, Mapbox, Perplexity, Brave Search, Bing Search, SerpAPI, TimeZoneDB, HotelPlanner (transactional). Open-Meteo is active but licensing-ambiguous (Section 2) rather than cleanly "metered" today.

**Unused/legacy providers:** Google GenAI (confirmed dead — zero call sites). `SUPABASE_ROLE_KEY` and `BRAVE_SEARCH_API_KEY` are legacy/unused credential *names* (the live credentials are `SUPABASE_SERVICE_ROLE_KEY` and `BRAVE_SEARCH_KEY` respectively), not separate dead providers.

**30/90-day measured usage:** None available from this session — see Section 4. Zero confirmed for Telnyx and web-push specifically (pre-launch, no live traffic).

**Actual spend known:** Telnyx $0, web-push $0 (both pre-launch). Everything else: unknown.

**Actual spend unknown:** every other active provider in the register — Google Places, Google Geocoding, Google CSE, Foursquare, Mapbox, Perplexity, Brave/Bing/SerpAPI, Open-Meteo, TimeZoneDB, Resend.

**Included/free allowances (from the admin dashboard's own reference table, dated 2026-06-09, plus this session's live verification):** Google Places ~$200 credit/mo (≈6,250 calls); Foursquare 500/mo (499 enforced in code); Mapbox 50K/mo static + 100K/mo geocoding; Resend 3K emails/mo; Open-Meteo 300K/mo but non-commercial-only; Brave 2K/mo; Bing 1K/mo; SerpAPI 100/mo; Overpass/TimeZoneDB uncapped/free.

**Highest-overlap functions, ranked:** (1) Brave/Bing/SerpAPI — three providers, one function, already-built selector; (2) Google Geocoding vs. planned Geocodio — not yet actually overlapping since Geocodio isn't built, but on track to be; (3) Google Places/Foursquare vs. Overture — Food/Coffee/POI, coverage-untested.

**Highest-cost functions, ranked:** cannot be ranked — no actual spend evidence exists for any provider except the two confirmed-zero pre-launch ones. This is itself the headline finding of Section 4/10, not an omission.

**Open-data displacement candidates, ranked:** (1) TimeZoneDB — `STRONG` overlap, deterministic, plausibly replaceable by an offline library entirely; (2) Foursquare/Google Places nearby-POI — `PARTIAL`, needs the coverage test; (3) Google/planned-Geocodio venue geocoding — `PARTIAL`, same caveat.

**Shared-cache candidates, ranked:** (1) Weather — cleanest case, no product ownership; (2) TimeZoneDB — same reasoning, smaller stakes; (3) Venue coordinates — already partially intended per ADR-030, more complex due to product-specific attribution needs.

**Providers needing immediate licensing/configuration review:** Open-Meteo (commercial-use terms, Section 2 — the clearest item in this whole register); `NEXT_PUBLIC_OWLS_EYE_ADMIN_TOKEN` (client-exposed privileged capability, Section 1 item 9); Stripe (can't currently tell if it's even in use).

**Preliminary portfolio actions:** full list in the register's Decisions sheet; distribution summarized in Section 10 above.

**Recommended next three experiments**, chosen for the combination of dollar savings, product value, reduced duplication, monetization, and low implementation risk:

1. **Run the usage-cost queries.** Zero implementation risk (the RPCs and the read-only script already exist), and it's the prerequisite for every other decision in this register having real numbers instead of `UNKNOWN`. Highest leverage-to-risk ratio of anything in this packet.
2. **Resolve Open-Meteo's licensing status.** One conversation, not an engineering task; directly gates whether Corralio can safely build its own weather feature and whether TI/RI's existing one needs a plan change.
3. **Consolidate Brave/Bing/SerpAPI to whichever is the actual production default**, once usage data from experiment 1 shows which one is really being used. Concrete dollar savings (up to two of three subscriptions become unnecessary) with minimal product risk, since it's an internal admin research tool, not customer-facing.

No implementation is authorized by this document.
