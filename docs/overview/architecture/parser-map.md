# Parser Map

Last updated: 2026-02-12

## Purpose
This document captures parser/discovery logic for tournament and assignor ingestion so future work can quickly answer:
- which parser runs for which URL/domain
- what data gets extracted
- where extracted data is written
- where to debug failures

## Parsing stack at a glance
- URL-first parser entry point:
  - `apps/referee/src/server/admin/pasteUrl.ts` (`createTournamentFromUrl`)
- Domain-specific tournament parsers:
  - Grassroots365 calendar JSON extraction
  - US Club sanctioned list parser
  - FYSA sanctioned list parser
  - Oregon Youth Soccer sanctioned list parser
  - NC Soccer events list parser
  - ENYSA sanctioned list parser
  - ASA AZ sanctioned-club multi-layout sweep parser
- Generic fallback parser:
  - `parseMetadata` + heuristic field extraction in `pasteUrl.ts`
- Enrichment parser (post-ingest):
  - `apps/referee/src/server/enrichment/extract.ts` (`extractFromPage`)
  - Crawl orchestration in `apps/referee/src/server/enrichment/pipeline.ts`
- Discovery/search ingestion (not HTML parser, but source discovery pipeline):
  - Atlas provider wrapper in `apps/referee/src/server/atlas/search.ts`
  - Queue/review APIs in `apps/referee/app/api/atlas/*`

## URL trigger map
| Trigger | Parser path | Behavior |
| --- | --- | --- |
| `grassroots365.com` + `/calendar` | `extractGrassrootsCalendarEvents` in `pasteUrl.ts` | Extracts embedded JSON events, maps each event, upserts tournaments, queues enrichment |
| `usclubsoccer.org` + `/list-of-sanctioned-tournaments` | `parseUSClubSanctionedTournaments` in `pasteUrl.ts` | Parses sanctioned list into rows, upserts tournaments, queues enrichment |
| `fysa.com` + `/2026-sanctioned-tournaments` | `parseFysaSanctionedTournaments` in `pasteUrl.ts` | Parses FYSA rows, upserts tournaments, queues enrichment |
| `oregonyouthsoccer.org` + `/sanctioned-tournaments` | `parseOregonSanctionedTournaments` in `pasteUrl.ts` | Parses paragraph-based sanctioned list rows, upserts tournaments, queues enrichment |
| `ncsoccer.org` + `/events/list` | `parseNcsoccerEventsList` in `pasteUrl.ts` | Parses list layout/cards, upserts tournaments, queues enrichment |
| `enysoccer.com` + `/events/category/sanctioned-tournaments` | `parseEnysoccerSanctionedTournaments` in `pasteUrl.ts` | Parses ENYSA listing containers, upserts tournaments, queues enrichment |
| ASA AZ canonical URL | `sweepAsaAzSanctionedClubTournaments` in `asaAzSanctionedClubTournaments.ts` | Multi-layout parse + optional website enrichment + DB writes + enrichment queue |
| Any other URL | `parseMetadata` fallback in `pasteUrl.ts` | Heuristic metadata parse (title, dates, city/state, host org), upsert single tournament, queue enrichment |

## Domain parser details
### `pasteUrl.ts` core flow
- Fetch behavior:
  - manual redirect handling, max 5 redirects
  - timeout 10s
  - content validation through `classifyHtmlPayload`
  - body cap 1MB
- If a domain-specific parser matches:
  - parse events
  - transform to `TournamentRow`
  - `upsertTournamentFromSource`
  - `queueEnrichmentJobs`
  - log/update source run via:
    - `upsertRegistry`
    - `insertRun`
    - `updateRunExtractedJson`
- If no specialized parser matches:
  - `parseMetadata` fallback extracts:
    - title/summary
    - date guess
    - city/state guess
    - host org
    - OG image
  - writes tournament row and links:
    - `discovery_source_id`
    - `discovery_sweep_id`

### ASA AZ parser specifics
File: `apps/referee/src/server/sweeps/asaAzSanctionedClubTournaments.ts`
- Layout strategy (ordered):
  - `parseTableLayout`
  - `parseColumnsLayout`
  - `parseBlockLayout`
  - `parseGlobalAnchors` fallback
- Optional secondary enrichment per tournament website:
  - emails, phones, contact names, registration-hint providers, date hint
  - low-concurrency crawl (`limit=2`) with jittered delay
- Output:
  - `AsaTournamentRecord[]`
  - counts (`found`, `with_website`, `with_email`, `with_phone`)
  - imported IDs when `writeDb=true`
- DB side effects:
  - upsert tournaments from synthesized rows
  - update `official_website_url` / `tournament_director`
  - queue enrichment jobs for imported tournaments

### Legacy parser file
File: `apps/referee/lib/parsers/usclubsoccer.ts`
- Contains `parseUSClubSoccer`, but current primary ingestion path for US Club is in `pasteUrl.ts`.
- Notes:
  - Uses hard-coded date placeholders in current implementation.
  - Treat as legacy/reference unless explicitly wired back into active ingestion flows.

## Post-ingest enrichment parser
Files:
- `apps/referee/src/server/enrichment/extract.ts`
- `apps/referee/src/server/enrichment/pipeline.ts`

### Crawl and extraction constraints
- Max pages per tournament: 8
- Per-request timeout: 10s
- Max response body: 1MB
- Per-domain delay: 500ms
- Ranked-link crawl prioritizes contact/referee/assignor/staff/about/support pages

### Extracted candidate families
- contacts: names, emails, phones, role classification (`TD`, `ASSIGNOR`, `GENERAL`)
- venues: venue/address candidates
- compensation: rate text/amounts + travel/lodging hints + PDF hints
- dates: parsed or textual date candidates
- attributes: key/value candidates (director/referee/hotel-related attributes)

### Email extraction hardening in `extract.ts`
- Handles:
  - plain emails
  - `[at]/[dot]` and `(at)/(dot)` variants
  - `mailto:` links
  - Cloudflare obfuscation (`data-cfemail` + `/cdn-cgi/l/email-protection`)
  - text-only scan fallback
- Applies filters:
  - blocked domains (wix/sentry/example/etc.)
  - blocked local parts (`noreply`, etc.)
  - allowed TLD checks

### Candidate persistence
- Writes into:
  - `tournament_contact_candidates`
  - `tournament_venue_candidates`
  - `tournament_referee_comp_candidates`
  - `tournament_date_candidates`
  - `tournament_attribute_candidates`
- Dedupes against existing unresolved rows + current batch signatures.

## Discovery/search pipeline (Atlas)
Files:
- `apps/referee/src/server/atlas/search.ts`
- `apps/referee/src/server/enrichment/urlCandidates.ts`
- `apps/referee/app/api/atlas/search/route.ts`
- `apps/referee/app/api/atlas/discover-and-queue/route.ts`
- `apps/referee/app/api/atlas/queue-url/route.ts`
- `apps/referee/app/api/atlas/update-source-status/route.ts`

### Behavior
- Search providers: `serpapi` (default), `bing`, `brave` with rate handling.
- Query builder UI:
  - `apps/referee/app/admin/tournaments/sources/discover/page.tsx`
  - run client: `apps/referee/app/admin/tournaments/sources/discover/RunDiscovery.tsx`
- Queue targets:
  - tournament sources (`tournament_sources`)
  - assignor source records (`assignor_source_records` via synthetic `atlas://discover` source)
- Status actions:
  - `keep`, `dead`, `login_required`, `pdf_only` update source review status.

## DB write map by parser flow
| Flow | Main writes |
| --- | --- |
| `createTournamentFromUrl` specialized parsers | `tournaments`, `tournament_sources` (registry/run metadata), `tournament_enrichment_jobs` |
| ASA AZ sweep | `tournaments`, `tournament_enrichment_jobs`, and tournament fields `official_website_url`/`tournament_director`; plus source run metadata |
| Generic metadata fallback | `tournaments`, source run metadata in `tournament_sources`, `tournament_enrichment_jobs` |
| Enrichment extractor | candidate tables for contacts/venues/comp/dates/attributes |
| Email discovery admin run | `tournament_email_discovery_runs`, `tournament_email_discovery_results`, `tournament_contacts`, `tournament_dead_domains` |
| Atlas discovery/queue | `tournament_sources` or `assignor_source_records`; discovery logs in `tournament_source_logs` |

## Error and diagnostics model
- Typed sweep errors:
  - `SweepError` codes include: `fetch_failed`, `redirect_blocked`, `html_received_no_events`, `non_html_response`, HTTP code variants.
  - Source: `apps/referee/src/server/admin/sweepDiagnostics.ts`
- Parse and discovery runs also persist metadata/log payloads in `tournament_sources.extracted_json` and `tournament_source_logs`.

## Test coverage currently present
- `apps/referee/src/server/admin/__tests__/pasteUrl.test.ts`
  - metadata/date/city-state/host extraction
- `apps/referee/src/server/admin/__tests__/sweepDiagnostics.test.ts`
  - diagnostics/error code classification
- `apps/referee/src/server/enrichment/enrichment.test.ts`
  - `extractFromPage` for contacts, venues, and comp parsing

## Parser runbook
### Prerequisites
- Run app: `npm run dev --workspace referee-app`
- Admin session required for admin pages and `/api/admin/*` + `/api/atlas/*` routes.
- Ensure `.env.local` has required search/provider keys if testing Atlas discovery:
  - `SERPAPI_API_KEY` or `BING_SEARCH_KEY` or `BRAVE_SEARCH_KEY`

### 1) Manual URL parser smoke test (`createTournamentFromUrl`)
- UI path:
  - Open `/admin` (Tournament uploads tab)
  - Paste test URL and submit
- Parser should auto-select by domain/path (see URL trigger map above).
- Verify expected writes:
  - `tournaments` row inserted/updated
  - source run metadata in `tournament_sources`
  - enrichment queue row(s) in `tournament_enrichment_jobs`

### 2) ASA AZ parser smoke test
- URL to use:
  - `https://azsoccerassociation.org/sanctioned-club-tournaments/`
- Run via same admin paste-URL flow.
- Verify:
  - multiple tournament imports (not single fallback row)
  - `official_website_url`/`tournament_director` updates where present
  - enrichment jobs queued for imported IDs

### 3) Enrichment parser smoke test
- Queue enrichment:
  - `POST /api/admin/tournaments/enrichment/queue`
- Run enrichment:
  - `POST /api/admin/tournaments/enrichment/run?limit=10`
- Verify candidate tables receive rows:
  - `tournament_contact_candidates`
  - `tournament_venue_candidates`
  - `tournament_referee_comp_candidates`
  - `tournament_date_candidates`
  - `tournament_attribute_candidates`

### 4) Email discovery + dead-domain skip smoke test
- Trigger:
  - `POST /api/admin/tournaments/enrichment/email-discovery` with optional `{ "limit": 25 }`
- Verify:
  - run row in `tournament_email_discovery_runs`
  - result rows in `tournament_email_discovery_results`
  - `tournament_contacts` inserts for discovered emails
  - dead domains recorded in `tournament_dead_domains` with reason `dns_enotfound`

### 5) Atlas discovery smoke test
- UI path:
  - `/admin/tournaments/sources/discover`
- API path equivalents:
  - `POST /api/atlas/search`
  - `POST /api/atlas/discover-and-queue`
  - `POST /api/atlas/queue-url`
  - `POST /api/atlas/update-source-status`
- Verify tournament-target writes:
  - new/updated source rows in `tournament_sources`
  - discovery log events in `tournament_source_logs`
- Verify assignor-target writes:
  - rows in `assignor_source_records` under synthetic source `atlas://discover`

### 6) Test commands
- Parser metadata/unit tests:
  - `cd apps/referee && npm run test`
- Optional sweep smoke script:
  - `npm run sweep:asa-az`

### 7) Fast triage checklist when parsing fails
- Check error code shape (`SweepError`) in logs:
  - `fetch_failed`, `redirect_blocked`, `non_html_response`, `html_received_no_events`
- Inspect source run payloads:
  - `tournament_sources.extracted_json`
  - `tournament_source_logs.payload`
- Confirm URL normalization and review status:
  - `normalized_url`, `review_status`, `is_active`, `ignore_until`

## Known gaps and watch items
- `apps/referee/lib/parsers/usclubsoccer.ts` appears legacy relative to active parser path in `pasteUrl.ts`.
- Parser logic is heavily domain-path coupled; URL structure drift at source sites is a primary break risk.
- Limited parser-specific tests for FYSA/NC/ENYSA/ASA layouts; adding fixtures for each would reduce regression risk.
