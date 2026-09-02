# Portfolio External API & Data-Source Audit — Stage 1: Discovery Only

**Filed:** 2026-09-02
**Status:** Founder-authored, CPO-reviewed and accepted with two additions (Sections 21–22 below). Ready to dispatch.
**Scope:** TournamentInsights (TI), RefereeInsights (RI), Corralio, and shared libraries/jobs used by them.
**Mode:** Discovery only. No optimization, replacement, migration, rerouting, schema change, provider-configuration change, production write, deploy, or push.

## CPO framing note (read before dispatching)

This follows directly from `docs/corralio/cpo/2026-09-02-cpo-review-venue-architecture-corralio-vs-legacy.md`, which compared Owl's Eye and Overture on venues specifically and recommended getting real usage/cost data before any migration decision. The founder's call here — and I agree with it — is to go further than that review did: **keep cost and strategy out of Stage 1 entirely**, build a complete repository-backed inventory of every external dependency across all three products first, and only attach usage/pricing/business-value in a separate Stage 2. This supersedes the narrower "run the cost report first" sequencing I suggested in that review — the founder's version is the more disciplined approach (a full inventory prevents anchoring on whichever two or three providers happen to be top of mind, e.g. Perplexity and Google Places, before the complete picture exists), and I'm adopting it rather than the other way around.

The prompt below is the founder's, reproduced in full and unmodified except for two additions at the end (Sections 21–22): an execution-gate/stop-marker section matching this project's standing convention for every other filed Codex prompt, and one explicit safety-valve for a specific failure mode discovery could surface — active, unbounded, crawler-triggered spend on a paid provider in production right now. That one scenario is not a strategy question deferrable to Stage 2; it's an operational-risk finding that should be surfaced prominently the moment it's found, even though no remediation happens in this pass.

---

# Portfolio External API & Data-Source Audit — Discovery Only

## Objective

Produce a complete repository-backed inventory of every external API, third-party data source, external AI/model service, mapping/geocoding/place service, search provider, travel provider, messaging provider, weather provider, and other metered or externally hosted dependency used by:

* TournamentInsights (TI)
* RefereeInsights (RI)
* Corralio
* shared libraries/jobs used by those products

This is Stage 1: DISCOVERY ONLY.

The purpose is to establish exactly:

> What external services do we use, where do we use them, why do we use them, how often can they be triggered, what gets cached/persisted, and where are we paying multiple providers to solve overlapping problems?

Do NOT optimize, remove, replace, migrate, or reroute anything during this audit.
Do NOT make product changes.
Do NOT make schema changes.
Do NOT make provider configuration changes.
Do NOT make production writes.
Do NOT deploy or push.
Do NOT recommend replacing paid providers with Overture until the complete inventory is established.

---

# 1. Scope

Audit the entire repository, not just currently remembered integrations.

Search:

* application code;
* shared libraries;
* server routes;
* API routes;
* cron jobs;
* background jobs;
* ingestion scripts;
* enrichment scripts;
* admin tools;
* operator scripts;
* migrations;
* environment-variable references;
* package dependencies;
* provider clients;
* fetch/HTTP calls;
* RPCs;
* edge/server functions;
* analytics/cost-tracking code;
* test fixtures where they reveal integrations;
* documentation only as secondary confirmation.

Repository implementation is authoritative.

Do not assume a provider is active merely because it appears in documentation.

Classify unused/legacy/dead integrations separately.

---

# 2. Provider discovery

Identify every external provider/data source.

At minimum investigate whether the repository uses:

## Places / POI / venue / geospatial

* Google Places
* Google Geocoding
* Google Maps
* Mapbox
* Foursquare
* Overture Maps
* OpenStreetMap
* Overpass
* any other place/geospatial provider

## Search / research / enrichment

* Perplexity
* Brave Search
* Bing Search
* SerpAPI
* Google search-related services
* other web/search providers

## Weather / environmental

Identify every weather provider and API.

## Travel / commerce

* HotelPlanner
* any mapping/distance/travel provider
* any other affiliate/travel provider

## AI / model APIs

Identify every externally billed model/API, including direct provider calls and any abstraction layer.

## Messaging / communications

* SMS providers
* email providers
* notification services

## Authentication / identity

Identify externally metered identity services where relevant to variable cost.

## Maps / routing / distance

Identify:

* map tiles
* geocoding
* directions
* routing
* matrix APIs
* traffic APIs
* timezone APIs

## Other

Include every externally hosted service that can create:

* per-call cost;
* per-token cost;
* per-message cost;
* per-request cost;
* compute/storage transfer cost;
* quota consumption;
* meaningful rate-limit exposure.

---

# 3. Build the master provider inventory

For each provider/service create one row with:

| Field | Required |
| --- | --- |
| Provider | Yes |
| API/product | Yes |
| TI | Yes/No |
| RI | Yes/No |
| Corralio | Yes/No |
| Shared | Yes/No |
| Active | Yes/No/Unclear |
| Primary purpose | Yes |
| Data returned | Yes |
| Main repository implementation | Yes |
| Environment variables | Names only |
| Authentication type | High level only |
| Cost tracking exists | Yes/No |
| Usage tracking exists | Yes/No |
| Cache/persistence exists | Yes/No |
| User-facing dependency | Yes/No |
| Failure behavior | Yes |
| Known fallback | Yes/No |
| Candidate overlap with another provider | Yes/No |

Do NOT print secret values.

---

# 4. Inventory every call surface

Provider-level inventory is insufficient.

For every distinct call surface, produce:

| Provider | Product | Surface/job | File/function | Trigger | Purpose | Sync/async | User waits? | Cached? | Persisted? | TTL | Reused? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Examples of trigger classifications:

* page render;
* server-side render;
* browser interaction;
* explicit travel intent;
* account creation;
* schedule import;
* admin action;
* cron;
* batch enrichment;
* ingestion;
* operator script;
* background refresh;
* fallback;
* retry.

Do not combine materially different surfaces merely because they call the same provider.

---

# 5. Classify trigger economics

For every call surface classify the trigger as exactly one primary type:

## PASSIVE_RENDER
Can occur merely because a public page/server component renders.

## EXPLICIT_USER_INTENT
Requires an explicit browser/user action.

## TRANSACTION_INTENT
Occurs directly in support of a monetizable transaction such as lodging.

## PERSONALIZED_PRODUCT
Required to produce user-specific planning value.

## BATCH_ENRICHMENT
Triggered by scheduled/admin/batch enrichment.

## INGESTION
Required to ingest/normalize source data.

## ADMIN_OPERATOR
Explicit internal/admin action.

## BACKGROUND_REFRESH
Scheduled freshness maintenance.

## FALLBACK
Called only when another source fails or lacks coverage.

## OTHER
Explain.

This classification will later be used to evaluate ROI and waste.

---

# 6. Identify crawler-amplifiable calls

For every public-page-triggered external call determine:

> Can a crawler, bot, link preview, monitor, or automated page request cause this provider call without explicit user intent?

Return:

* YES
* NO
* CONDITIONAL
* UNKNOWN

Document why.

Pay particular attention to:

* venue pages;
* tournament pages;
* hotel searches;
* maps;
* POI discovery;
* Owl's Eye enrichment;
* metadata generation;
* SSR;
* sitemap-related page discovery.

Do not attempt new bot detection.

---

# 7. Cache and persistence audit

For every external call determine:

### Cache

* no cache;
* request cache;
* Next.js cache;
* server cache;
* CDN cache;
* database cache;
* file/artifact cache;
* unknown.

### TTL

Document exact TTL where present.

### Persistence

Does the response/result become durable reusable data?

Examples:

* canonical venue fields;
* venue enrichment;
* POI rows;
* Overture cache;
* hotel search session only;
* weather result;
* geocode;
* coordinates;
* generated content.

### Reuse scope

Determine whether cached/persisted results are reusable by:

* same user;
* all users of one product;
* TI + RI;
* TI + RI + Corralio;
* admin only.

This is critical.

---

# 8. Identify duplicated external work

Find cases where multiple products/providers obtain substantially the same information independently.

Examples to test, not assume:

```text
TI calls Google for venue coordinates
RI calls Google for same venue
Corralio queries Overture for same venue
```

or:

```text
Google Places
+
Foursquare
+
Overture
```

for overlapping nearby POI discovery.

For each duplication candidate report:

* data need;
* provider A;
* provider B;
* product/surface;
* whether calls happen independently;
* whether one result is already persisted;
* whether shared canonical data could theoretically satisfy both.

Do NOT recommend consolidation yet.

Just identify overlap.

---

# 9. Overture capability inventory

Audit exactly what Corralio currently obtains from Overture.

Document:

* dataset/theme used;
* fields consumed;
* query mechanism;
* batch mechanism;
* geographic bounding strategy;
* refresh strategy;
* persistence/cache;
* matching logic;
* categories supported;
* Food/Coffee usage;
* provisional-venue evidence usage;
* current limits/guards;
* failure behavior.

Then create an overlap matrix against every paid POI/place/geospatial call found elsewhere:

| Existing paid function | Provider | Data needed | Overture currently contains comparable fields? | Exact / Partial / No / Unknown |
| --- | --- | --- | --- | --- |

Do not yet recommend replacement.

This is capability discovery only.

---

# 10. Owl's Eye decomposition

Do NOT treat Owl's Eye as one API feature.

Break it into its actual functions:

## Canonical venue hygiene
* duplicate detection;
* venue matching;
* candidate generation;
* address/geocode validation.

## Venue enrichment
* places;
* nearby POIs;
* gear;
* address research;
* search/research;
* other enrichment.

## Consumer content
* venue score;
* venue writeups;
* weekend-guide content;
* premium/enhanced content.

For every Owl's Eye function list all external providers involved and the exact call surfaces.

Identify which results are persisted and which can be regenerated repeatedly.

---

# 11. Venue lifecycle audit

Trace a venue through both architectures.

## RI/TI

From:

```text
raw tournament/source location
→ candidate
→ provider enrichment
→ review
→ public.venues
→ enrichment
→ public venue page
→ travel
```

Identify every external API/data-source touchpoint.

## Corralio

From:

```text
schedule raw location
→ canonical match attempt
→ provisional venue if unresolved
→ evidence
→ Overture enrichment
→ Nearby
→ possible future promotion
```

Identify every external API/data-source touchpoint.

Then show where both systems are purchasing/computing equivalent information.

---

# 12. Travel API audit

Trace all HotelPlanner-related provider calls separately.

Classify:

* hotel search;
* property handoff;
* checkout;
* booking report;
* cancellation report;
* historical backfill.

For each determine:

* user-triggered vs passive;
* provider capacity/rate-limit implications;
* cache behavior;
* persistence;
* revenue relationship;
* whether crawler traffic can trigger it.

Do NOT change the existing revenue path.

This section is discovery only.

---

# 13. Mapping/routing audit

Identify every place where the products calculate or retrieve:

* coordinates;
* distance;
* travel duration;
* route;
* map;
* map tiles;
* timezone;
* directions.

For each identify the provider and whether the result could theoretically be shared/reused.

Pay particular attention to future Corralio leave-by functionality versus existing TI/RI venue/map infrastructure.

---

# 14. Existing usage/cost instrumentation

Identify every existing table/RPC/log/report capable of measuring provider usage or cost.

Examples already suspected include:

* `external_api_calls`
* `perplexity_usage_summary()`
* `perplexity_usage_detail()`
* HotelPlanner search/session reporting

Search for all others.

For each provide:

| Instrument | Provider(s) | Fields | Cost captured? | Call count? | Surface? | Product? | Date range possible? |
| --- | --- | --- | --- | --- | --- | --- | --- |

Do NOT run production usage/cost queries during Stage 1 unless separately authorized.

We are identifying what can be measured first.

---

# 15. Environment/configuration inventory

List provider-related environment variable NAMES only.

For each determine:

* provider;
* product/application;
* server/client exposure;
* whether currently referenced;
* whether apparently legacy/dead.

Never print values.

Flag:

* duplicate credentials;
* multiple accounts for same provider;
* client-exposed paid-provider credentials;
* unclear ownership.

Do not modify configuration.

---

# 16. Failure and fallback matrix

For every important provider call identify:

```text
provider succeeds → ?
provider misses → ?
provider rate limits → ?
provider times out → ?
provider errors → ?
```

Document fallback chains.

Especially identify cases such as:

```text
Overture miss
→ paid provider
```

or:

```text
Google miss
→ Perplexity
```

or:

```text
Hotel attribution persistence failure
→ Standard HotelPlanner routing
```

Do not change them.

---

# 17. Preliminary substitutability matrix

After completing discovery, classify each external-data function:

## OPEN_DATA_CANDIDATE
Could plausibly be served wholly/partially by Overture/OSM/open data.

## CACHE_CANDIDATE
Dynamic provider result appears reusable enough that stronger caching may reduce calls.

## SHARED_DATA_CANDIDATE
One canonical result could plausibly serve TI + RI + Corralio.

## PAID_PROVIDER_LIKELY_REQUIRED
Function appears to require freshness, coverage, proprietary data, search/research, or another capability not currently available from open sources.

## TRANSACTION_PROVIDER
Provider is directly tied to monetization, such as HotelPlanner.

## UNKNOWN
More evidence required.

This is classification, not a migration recommendation.

---

# 18. Do not evaluate pricing yet

Stage 1 must NOT make a final provider-cost optimization recommendation.

Do not rank providers by price.

Do not recommend killing a provider.

Do not recommend replacing Google/Places/Perplexity/etc. merely because Overture is free.

The next stage will attach:

* actual usage;
* actual provider limits;
* free tiers;
* unit pricing;
* current spend;
* cache hit/miss rates where measurable;
* business value;
* revenue influence.

Stage 1 exists to ensure we attach those economics to the correct call surfaces.

---

# 19. Final deliverables

Produce a repository report:

`docs/reports/portfolio-external-api-data-source-audit-2026-09-02.md`

The report must contain:

## A. Executive inventory
Every external provider/data source and product using it.

## B. Call-surface inventory
Every material call surface.

## C. Trigger classification
Passive vs explicit vs batch vs transactional etc.

## D. Crawler amplification
Which paid/provider calls can occur without explicit user intent.

## E. Cache/persistence map
What is cached, TTL, persistence, and reuse scope.

## F. Duplicate-work map
Where TI/RI/Corralio or multiple providers obtain overlapping data.

## G. Overture overlap matrix
What current paid-data functions appear Exact / Partial / No / Unknown relative to current Overture capabilities.

## H. Owl's Eye decomposition
Duplicate detection vs enrichment vs consumer content.

## I. Venue lifecycle comparison
RI/TI vs Corralio external-data touchpoints.

## J. Travel-provider map
HotelPlanner calls and trigger semantics.

## K. Mapping/routing map
Coordinates, maps, distance, route, timezone.

## L. Existing usage/cost instrumentation
What can be measured in Stage 2.

## M. Environment/configuration inventory
Names only; no secrets.

## N. Failure/fallback matrix
Provider miss/error behavior.

## O. Preliminary substitutability classification
Open-data / cache / shared / paid-required / transaction / unknown.

## P. Stage 2 measurement plan
For every provider/call surface specify what Stage 2 needs to collect:

* calls/day;
* calls/month;
* unique entities enriched;
* cache hits;
* cache misses;
* cost;
* free-tier utilization;
* rate-limit/quota;
* product surface;
* user-triggered vs automated volume;
* revenue/activation influence where measurable.

---

# 20. Final decision packet

End with:

## Providers discovered
Count and list.

## Active call surfaces discovered
Count.

## Paid/metered providers
List only; no strategic recommendation yet.

## Open/free data sources
List.

## Largest apparent overlap areas
List, without recommending replacement.

## Crawler-amplifiable paid calls
List.

## Shared-data opportunities
List.

## Existing cost instrumentation
List.

## Missing measurement
List.

## Stage 2 readiness

Choose:

* `READY FOR COST/LIMIT ANALYSIS`
* `BLOCKED — INVENTORY GAPS REMAIN`

If blocked, identify exactly what remains unknown.

---

# Restrictions

* Discovery/report only.
* No migrations.
* No code changes except creation of the requested report.
* No production writes.
* No provider configuration changes.
* No customer-facing changes.
* No API replacement.
* No new caching.
* No entitlement changes.
* No deployment.
* No push.
* Preserve unrelated worktree changes.

This is intentionally broad because **we only want to do this inventory once**.

Then Stage 2 becomes much more useful: we attach actual 30/60/90-day call counts, free tiers, quotas, current spend, cache efficiency and—where we can—**commercial value per API dollar**.

That will let us make decisions such as "Overture replaces this," "cache this," "share this across all three products," "this paid API is worth every penny," or "kill this call" based on economics rather than architecture aesthetics.

---

# 21. Execution gates (CPO addition)

Added for consistency with every other prompt filed in this repository — this task produces one new file and touches nothing else, but the same stop discipline applies:

1. Complete Sections 1–20 above.
2. Write only `docs/reports/portfolio-external-api-data-source-audit-2026-09-02.md`. Do not edit any other file except as Section 21.2 below permits.
3. If Section 22's urgent-finding condition is met, also record it in `apps/corralio/notes.md` / `docs/notes.md` (whichever engineering-notes file this session already uses) as a plainly flagged entry — this is the one exception to "no other file changes," because an active unbounded-spend finding should not be undiscoverable inside a single large report.
4. Local commit only. Do not push. Do not deploy. Do not touch any provider configuration, `.env` value, or production data.
5. Preserve all currently uncommitted/unrelated working-tree changes exactly as found — do not commit over them, do not stash them, do not resolve them.

Stop at one of the exact verdicts in Section 22.

# 22. Final verdict (CPO addition)

Return exactly one, using the same `READY FOR COST/LIMIT ANALYSIS` / `BLOCKED — INVENTORY GAPS REMAIN` language Section 20 already specifies, plus a third option for the one case Section 18's "no pricing yet" rule should not suppress:

`PORTFOLIO EXTERNAL API AUDIT COMPLETE — READY FOR COST/LIMIT ANALYSIS`
`PORTFOLIO EXTERNAL API AUDIT COMPLETE — BLOCKED, INVENTORY GAPS REMAIN` (list exactly what remains unknown)
`PORTFOLIO EXTERNAL API AUDIT COMPLETE — URGENT FINDING: POSSIBLE UNCONTROLLED PAID-PROVIDER SPEND`

Use the third verdict only if discovery finds a paid/metered provider call that is (a) triggerable by a crawler, bot, or other non-human automated request per Section 6, AND (b) has no cache, no rate limit, and no cost cap that would bound repeated triggering. This is a report-only trigger, not authorization to remediate: state the exact call surface, file/function, and why it qualifies, and stop. Do not silence this into the general Section 20 list if it applies — surface it in the response summary too, not only inside the filed report, since it is the one Stage 1 finding with same-day operational relevance rather than Stage 2 planning relevance.

Include with any verdict: total providers discovered, total call surfaces discovered, confirmation nothing was pushed or deployed, confirmation no provider/production configuration changed, and the local commit hash.
