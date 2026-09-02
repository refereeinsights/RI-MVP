# Corralio CPO Review — Venue Architecture: Corralio vs. RI/TI, and Owl's Eye vs. Overture

**Date:** 2026-09-02
**Mode:** Documentation + comparative review + recommendation. No code, migration, or canonical document modified.
**Method:** Everything below is read directly from the repository (migrations, code, ADRs, existing cost-tracking data) unless explicitly marked CPO inference or opinion. Two external pricing figures were verified via live web search this session (cited inline); everything else pricing-related is drawn from figures already documented and cited elsewhere in this repo, with their own original citations preserved.

---

## 1. Two venue systems exist in one repo, on purpose

RI/TI (RefereeInsights/TournamentInsights) and Corralio share one Supabase project but run **two structurally separate venue systems** with different owners, different write authority, and different ages. This is deliberate, not accidental duplication — ADR-008 through ADR-021 in `docs/corralio/CORRALIO_ARCHITECTURE_DECISIONS.md` establish and re-affirm it: **RI/TI's `public.venues` table is the one and only canonical venue authority in this business.** Corralio is a consumer of that authority, never a second writer to it.

### 1.1 RI/TI's legacy venue system (the canonical one)

This is a mature, multi-year system built for a fundamentally different problem than Corralio's: **discovering and curating venues for youth-sports tournaments at scale**, across dozens of governing bodies (USSSA, AYSO, Perfect Game, Arbiter, and more), often from messy or incomplete source data.

Core table: `public.venues`, extended over ~40+ migrations (`supabase/migrations/2026022*` through `2026060*_venue*`) with sport-specific profiles (`venue_sport_profiles`), field-level maps, SEO slugs, scoring/review fields, parking/restroom/shade metadata, and duplicate-override flags. Tournaments link to venues via `tournament_venues`, with an explicit `inferred` flag distinguishing confirmed links from system-guessed ones.

The **discovery/creation pipeline** (`venue_inference_01` through `08` migrations, `scripts/ingest/link_*_missing_venues*.ts`, the admin `/admin/tournaments/missing-venues` and `/admin/tournaments/enrichment` surfaces) is candidate-based: the system proposes venue candidates from tournament source data, and a human reviews and applies them through an admin UI (`apply_high_confidence_draft_venues.ts`, `EnrichmentClient.tsx`). This is not fully automatic venue creation — it's **machine-assisted, human-approved** creation, which is an important nuance: RI/TI does have a review gate, it's just a different (older, more UI-heavy, more per-record) gate than Corralio's.

Duplicate detection and enrichment run under the product brand **Owl's Eye** — covered in depth in Section 2.

### 1.2 Corralio's venue system (the new one)

Corralio never creates or writes canonical venues at all (Section confirmed in my prior answer this session). Its job is narrower: link a parent's schedule event to an *existing* canonical venue when confident, and otherwise hold a private, isolated placeholder. Built across Slices 4.4, 4.4B, 4.4C, 4.4D, 4.5, and 4.5A:

- `apps/corralio/lib/venueMatching.server.ts` attempts a deterministic, unique-name match against canonical `public.venues` (read-only, via `corralio_find_unique_canonical_venue_by_name_v1`).
- On no confident match, `apps/corralio/lib/provisionalVenues.server.ts` creates/reuses a row in `public.corralio_provisional_venues` — a Corralio-owned, RLS-locked, service-role-only table (migration `20260825_corralio_slice44b_shared_provisional_venues.sql`), keyed by a normalized identity hash, never exposed publicly, never promotable except through a reserved, not-yet-built, human-reviewed slice (4.5B).
- Slice 4.4C adds typed, versioned **evidence** records on top of a provisional venue (e.g. corroboration from a second independent source) — evidence accumulates confidence but is explicitly never itself authorization to promote.
- Slice 4.5/4.5A layers in **Overture Maps** data — not to create or validate canonical venues, but for a separate "Nearby" feature (Food/Coffee suggestions) and for one narrow additional evidence type (`overture_place_match`), under the same rule: corroboration only, never promotion.

The governing principle, stated verbatim in the Slice 4.5 prompt, is the cleanest one-line summary of the whole Corralio approach: **"Capture broadly. Enrich automatically. Publish conservatively."**

## 2. Owl's Eye vs. Overture

These aren't really two competitors solving the same problem — they're two different tools that happen to both touch venues. Owl's Eye is RI/TI's own multi-purpose venue-intelligence engine; Overture is a single external open dataset Corralio recently started consuming for one narrow purpose. Comparing them fairly means being precise about what each actually does.

### 2.1 What Owl's Eye does

Owl's Eye (`apps/referee/app/admin/owls-eye/`, `apps/referee/src/owlseye/`, `apps/ti-web/lib/owlsEyeScores.ts`) is RI/TI's venue-enrichment and scoring engine, exposed as a consumer-facing feature (Owl's Eye venue scores, "Owl's Eye Premium," the weekend-guide accordion, demo scores panel) as well as an internal admin tool. Per `trackExternalCall.ts`, the surfaces it drives (`owls_eye_batch`, `owls_eye_gear`, `venue_geocode`, `venue_places_lookup`, `venue_address_verify`) call out to a genuinely wide set of paid and free third-party APIs: **Google Places, Foursquare, Mapbox, Brave Search, Bing Search, SerpAPI, Perplexity, TimeZoneDB, and the free/donation-based Overpass (OpenStreetMap)**. Separately, `public.owls_eye_venue_duplicate_suspects` (migration `20260326_owls_eye_venue_duplicate_suspects.sql`) is a persisted fuzzy-match duplicate-detection table feeding the `/admin/venues?duplicates=1` human review queue — this piece is specifically about catching duplicate canonical venues, distinct from the enrichment/scoring piece.

So "Owl's Eye" is really three things wearing one name: (1) a duplicate-detection engine for canonical venue hygiene, (2) a paid-API enrichment pipeline (places lookups, address verification, geocoding, AI-assisted content generation) that also *feeds venue creation candidates*, and (3) a consumer-facing scoring/content product (Owl's Eye venue scores and premium content) that has nothing to do with venue creation at all — it's a differentiated feature RI/TI sells.

### 2.2 What Overture does

Overture Maps is a single external open dataset (Overture Maps Foundation — a Linux Foundation project backed by Amazon, Meta, Microsoft, and TomTom, among others) distributed as bulk Parquet files via public cloud storage. Per AWS's own Registry of Open Data listing, it's accessible via AWS CLI with no AWS account required — i.e., it's public open data, not a metered API. Corralio queries it in bounded batch jobs (`corralio_overture_refresh.ts`), not per-user-request, and uses it for exactly two things: a Food/Coffee "Nearby" candidate pool, and one corroboration evidence type for provisional venues. It does not do duplicate detection, scoring, address verification, or any AI-generated content — it's a places-existence dataset, nothing more.

### 2.3 Cost — this is the clearest, most decision-relevant difference

Real pricing documented in this repo, plus figures I verified live this session, put real numbers on this rather than leaving it as a vibe:

| Source | Model | Verified price | Where documented |
|---|---|---|---|
| Google Geocoding API | per-call, metered | 100K free/mo, then **$0.75/1,000** | `docs/admin-reference.md:683`, `docs/notes.md:4599` (repo-internal, already tracked for Owl's Eye venue geocoding) |
| Perplexity Sonar Pro | per-token, metered | **$3/1M input, $15/1M output tokens**; observed real-world cost **~$10–20 per 6,000 tournament-enrichment items** (~$1.67–3.33/1,000) | `docs/notes.md:1235,1240` — RI/TI already built `perplexity_usage_summary`/`perplexity_usage_detail` RPCs that read real per-call cost from stored raw responses |
| Google Places API (New) — Nearby Search | per-call, metered | **$32.00/1,000 calls** (Pro tier), 5,000 free/mo | Verified live this session via [openplacesapi.com](https://openplacesapi.com/blog/google-places-api-pricing) |
| Google Places API (New) — Place Details | per-call, metered | **$5.00–$20.00/1,000 calls** depending on tier (Essentials/Pro/Enterprise), 1,000–10,000 free/mo | Same source, verified live this session |
| Overpass (OSM) | free/donation-ware, rate-limited | **$0** | Repo usage confirms `overpassSportingGoods.ts` already relies on this for gear-nearby — Owl's Eye itself already uses a free source where it can |
| Overture Maps | open dataset, bulk bytes-scanned/compute cost only, no per-place fee | **No per-request charge** — public, unauthenticated bulk access | Verified live this session via [AWS Registry of Open Data](https://registry.opendata.aws/overture/); cost model is your own query/compute time against Parquet files, not a metered API call |

The structural difference matters more than any single number: **Owl's Eye's Google Places/Perplexity/SerpAPI/Bing legs are pay-per-item, and cost scales linearly with venue volume and with every re-run** (re-enrichment, re-verification, batch re-scans all cost again). **Overture is pay-once-for-compute, not pay-per-place** — bulk-querying a million places costs roughly the same order of magnitude as querying a thousand, because you're paying for a batch compute job against open data, not metered per-record calls. At RI/TI's actual scale (tens of thousands of tournaments, presumably many more venue candidates over the platform's life), the Google Places + Perplexity legs of Owl's Eye are very likely a real, non-trivial recurring cost — and RI/TI already has the exact instrumentation to check this precisely (`perplexity_usage_summary()`, `external_api_calls` table) rather than guessing. **I have not run that report this session** — it would take one SQL query and would turn the "which costs more" question from an architectural inference into an actual dollar figure. That's the single most useful next step before making a spending decision.

### 2.4 Where each is better, where each is worse

**Owl's Eye is better at:** things Overture fundamentally cannot do. Duplicate detection against RI/TI's own existing 40+-migration-deep canonical venue graph (a place-existence dataset has no idea what's already in your database). Consumer-facing content and scoring — the "Owl's Eye score," premium venue write-ups, weekend-guide content — this is differentiated product content, not venue creation, and Overture has nothing to offer there since it's just place metadata, not editorial content. Handling RI/TI's genuinely messy long-tail inputs (tournament flyers, USSSA/AYSO exports, Perfect Game data) where a place may not exist in any open dataset yet and genuinely needs AI-assisted research (Perplexity) or a commercial places index (Google) to resolve at all.

**Owl's Eye is worse at:** cost discipline at scale (every one of those paid legs bills per item, forever, including on re-runs), and — per the CPO travel/product-hierarchy discipline I apply throughout this project — it was built for a different risk profile. RI/TI's venues are a public product surface people search and click through; getting a venue wrong is a UX/trust problem but not a household-trust problem the way a wrong venue in a parent's weekend plan would be.

**Overture (and Corralio's overall approach) is better at:** cost (functionally free per-place at Corralio's current and near-term scale), and discipline — the "capture broadly, enrich automatically, publish conservatively" pattern (raw location always preserved, canonical write-behind-a-gate, provisional isolation, evidence before promotion) is a genuinely more conservative safety model than anything in the legacy pipeline, which is unsurprising since it was designed later, in view of the ADR-008/009/010/021 principles Owl's Eye predates.

**Overture is worse at:** everything that requires actual editorial/enrichment content rather than existence-and-coordinates. It cannot generate a venue score, a "why families like this venue" write-up, or resolve ambiguous/obscure venues that aren't in Overture's dataset at all (coverage of small private sports complexes, school gyms, and rec-league fields — exactly Corralio's typical inputs — is a real, unverified open question; I have not confirmed Overture's coverage rate against Corralio's actual venue mix, and Slice 4.5's own Stage-1 bounded live sample was explicitly designed to test this rather than assume it. **This is the one honest gap in the case for Overture** — its cost advantage is real, but its coverage for small youth-sports facilities is unproven, not proven-good.

## 3. Should Corralio's approach be applied to legacy venue ingestion?

**My recommendation: TEST FIRST, partial adoption — not a full replacement.**

This is not a clean "new system beats old system" call, because they're not actually solving the same problem end to end. Here's the honest breakdown:

**Genuinely portable, worth testing now:** the *discipline pattern* — raw-value preservation, conservative-match-only, isolated provisional storage, evidence-before-promotion, human-gated promotion. RI/TI's existing candidate-review flow (`missing-venues`, `enrichment`) already has a human-approval step, so this isn't as large a gap as it might look; the real opportunity is using Overture as a **free first-pass existence/geocode/dedup-signal check before spending a paid Google Places or Perplexity call**, not replacing Owl's Eye's review UI or its scoring/content product. Concretely: for the geocoding leg specifically (currently $0.75/1,000 via Google after the free tier, per `docs/notes.md:4599`), an Overture lookup could plausibly resolve the same coordinate for free for any venue that already exists in Overture's dataset, falling back to the paid Google call only when Overture has no match. That's a direct, low-risk cost-reduction test, not an architecture change.

**Not portable, and I'd actively push back on trying:** replacing the Perplexity/Google-Places-driven enrichment and scoring content, or the duplicate-detection engine. That content *is* a product feature RI/TI sells (Owl's Eye Premium, venue scores) — Overture has no equivalent, and building one would be a multi-month content/ML project disguised as a "just swap the data source" request. Don't do this. It would also be a scope and priority conflict for a Corralio CPO to greenlight spending real engineering time on a TI/RI product feature.

**Evidence I don't yet have, and would want before recommending more than a test:** actual current Owl's Eye API spend (the `perplexity_usage_summary`/`external_api_calls` data already exists to answer this — I just haven't queried it this session), and Overture's real match/coverage rate against a representative sample of RI/TI's actual missing-venue backlog (not just Corralio's household-schedule inputs, which skew toward different venue types).

## 4. How to automate venues going forward — concrete recommendations

1. **Run the cost report before any migration decision.** Query `perplexity_usage_summary()` and aggregate `external_api_calls` by `api`/`surface` for a realistic recent window. This turns Section 2.3's cost comparison from documented-but-general figures into an actual current RI/TI dollar number, and should take under an hour. This is the correct first action, not a build.
2. **Insert an Overture pre-check ahead of the paid geocoding call in the existing venue-creation/enrichment pipeline**, falling back to Google Geocoding only on a miss — smallest possible slice, directly measurable (compare Google Geocoding API call volume before/after), doesn't touch duplicate detection, scoring, or content.
3. **Run a small, bounded Overture coverage sample against RI/TI's actual missing-venue candidate backlog** (mirroring the same bounded-sample discipline Corralio's own Slice 4.5 already used) before deciding whether pre-check #2 is worth generalizing further. If coverage is poor for RI/TI's typical inputs (rec-league fields, school gyms — plausibly less represented in a commercial-grade open dataset than well-known facilities), that caps how much of Owl's Eye's paid-API spend can realistically be displaced, and that's a legitimate reason to stop at step 2 rather than push further.
4. **Do not port Corralio's evidence/provisional-lifecycle schema wholesale into RI/TI.** RI/TI's candidate-review admin tooling already provides a human gate; introducing a second, differently-shaped provisional/evidence layer on top of a 40-migration-deep existing schema is exactly the kind of "rebuild what already works, under a new name" pattern this project's own ADR-021 and the standing "reuse before rebuild" discipline warn against.
5. **Treat this as a cost-optimization workstream for RI/TI, tracked separately from Corralio's own roadmap** — it's valuable, but it's not a Corralio product priority, and pulling engineering attention onto it should be weighed against Corralio's own active-blocking items (Gate 3 database verification, the CALNAME micro-slice) rather than assumed free.

**Evidence vs. inference recap, since this is a decision document:** the pricing figures in Section 2.3 are either repo-documented-and-cited or verified live this session — evidence. The claim that this represents real, non-trivial recurring RI/TI spend at scale is inference — plausible given linear per-item pricing and repo-documented volume (thousands of tournaments), but not confirmed against an actual invoice or the existing usage-tracking tables. Overture's coverage adequacy for RI/TI's typical small-facility inputs is an open question, not a settled fact, and Section 3's TEST FIRST recommendation is built around resolving that specific unknown before committing further engineering time.
