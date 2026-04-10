## 2026-04-10

- Tournament directory (state → metro): when a single state is selected in the directory, show “Explore by area” chips that jump into existing `metro_markets` pages (e.g. Northern/Southern California, DC Metro) and preserve the active filters (sport/q/month/includePast/AYSO): `apps/ti-web/app/tournaments/page.tsx`, `apps/ti-web/app/tournaments/_components/MetroMarketChips.tsx`, `apps/ti-web/app/tournaments/_lib/getMetroMarketsForState.ts`, `apps/ti-web/app/tournaments/tournaments.css`.
- SEO sport+state hub pages: add the same “Explore {State} by area” chips under the hero so users can pivot from a state hub into a metro/region view: `apps/ti-web/app/[sport]/[state]/page.tsx`.
- Tournament detail discovery: add “More tournaments in {state}” links that deep-link into the directory as “upcoming” plus quick links for the next 4 months (keeps `includePast=false` explicit and preserves sport when available): `apps/ti-web/app/tournaments/[slug]/page.tsx`.
- Tournament directory filters: adjust layout so the State selector is narrower and the ZIP input has room for a full 5-digit ZIP: `apps/ti-web/app/tournaments/page.tsx`, `apps/ti-web/app/tournaments/tournaments.css`.
- Map analytics (admin surface): add a “Load map analytics” toggle on RI `/admin/ti` that shows TI map/homepage event counts + a recent-events table (last 7 days): `apps/referee/app/admin/ti/page.tsx`.
- Map analytics (tournament detail clicks): track clicks on “More tournaments in {state}” links into `ti_map_events` as `tournament_detail_more_in_state_clicked`: `apps/ti-web/app/tournaments/[slug]/page.tsx`, `apps/ti-web/app/tournaments/_components/MoreTournamentsInStateLinks.tsx`, `apps/ti-web/lib/tiAnalyticsEvents.ts`.
- Analytics hygiene: skip persisting analytics events when running on localhost, stamp `host/origin/referer` into `ti_map_events.properties`, and add a cleanup migration to delete previously persisted localhost rows: `apps/ti-web/app/api/analytics/route.ts`, `supabase/migrations/20260410_cleanup_localhost_ti_analytics_events.sql`.
- Analytics hygiene (dev hardening): ensure `ti-web` never persists analytics when `NODE_ENV=development` (covers local/private-network hostnames beyond literal `localhost`): `apps/ti-web/app/api/analytics/route.ts`.
- Hydration fix: move homepage + heatmap SVG tooltip/click handling out of inline scripts and into a client `useEffect` binder to avoid “Text content does not match server-rendered HTML” errors: `apps/ti-web/app/_components/UsMapInteractions.tsx`, `apps/ti-web/app/page.tsx`, `apps/ti-web/app/heatmap/page.tsx`.
- RI admin tournament uploads (CSV): allow ingesting multiple venue rows for the same tournament (same `tournament_external_id`), linking additional venues without duplicating the tournament in the approval queue: `apps/referee/app/api/admin/tournaments/uploads/import/route.ts`, `apps/referee/src/server/admin/tournamentUploads.ts`.
- RI admin discovery: add `/admin/tournaments/discover-to-queue` that uses Atlas search (Brave/Bing/SerpAPI) to discover candidate tournament URLs by sport+state+year and queue selected URLs into the uploads approval queue as `draft` tournaments (respects `tournament_sources` skip guards, with optional override): `apps/referee/app/admin/tournaments/discover-to-queue/page.tsx`, `apps/referee/app/admin/page.tsx`.
- Discover → Queue: show upcoming tournament counts per state (for the selected sport) inline in the state dropdown to help prioritize under-covered states: `apps/referee/app/admin/tournaments/discover-to-queue/page.tsx`, `supabase/migrations/20260409_public_directory_state_counts_by_sport.sql`.
- Discover → Queue: filter obvious junk discovery results (e.g. wikipedia/world cup) by domain so they don’t clutter the candidate list: `apps/referee/app/admin/tournaments/discover-to-queue/page.tsx`.
- Discover → Queue: improve Atlas queries by using full state names (“Alabama” instead of “AL”), add negative keywords (Canada/world cup), and filter out results that look out-of-state based on title/snippet heuristics: `apps/referee/app/admin/tournaments/discover-to-queue/page.tsx`.
- Discover → Queue: add per-row “Hide” controls (client-side, stored in localStorage per sport+state) so big candidate lists are manageable without affecting the underlying source registry: `apps/referee/app/admin/tournaments/discover-to-queue/CandidatesTableClient.tsx`, `apps/referee/app/admin/tournaments/discover-to-queue/page.tsx`.

## 2026-04-08

- TI outreach dashboard: add an “All sports” filter option so admins can view all campaigns/metrics at once (passes `p_sport = null` to the metrics RPC): `apps/ti-web/app/admin/outreach-dashboard/page.tsx`.
- RI sources: add a `venues` pseudo-sport bucket for venue-based sources (`source_type=venue_sweep|venue_calendar`) so they group/filter alongside sports on the Sources page: `apps/referee/app/admin/tournaments/sources/page.tsx`.
- RI tournament uploads approval: include venue linking details in the approval notice (counts of venues linked vs created) for both single-row and bulk “Approve selected”: `apps/referee/app/admin/page.tsx`, `apps/referee/lib/tournaments/ensureTournamentVenueLink.ts`.
- RI venues duplicates: keep sport-suffixed venue names (e.g. “(Baseball)”) as distinct, but add a review-only “base name + city/state” duplicate group to surface likely duplicates without forcing merges (requires street/zip/url evidence): `apps/referee/app/admin/venues/page.tsx`, `apps/referee/components/admin/VenuesListClient.tsx`.
- RI TI admin: show `auth.users.email_confirmed_at` on `/admin/ti`, display effective entitlement inline (free+confirmed → Insider), and show “already sent” for a selected template subject by logging admin blasts into `ti_tournament_alert_send_logs.result_hash` (subject hash): `apps/referee/app/admin/ti/page.tsx`.
- RI TI admin: improve bulk sender diagnostics by surfacing suppressed-recipient previews (email + reason) in the post-send notice: `apps/referee/app/admin/ti/page.tsx`.
- RI TI admin: fix dev-only `Cannot find module './_rsc_lib_email_ts.js'` bulk-send crash by removing dynamic `import("@/lib/email")` usage and using static imports: `apps/referee/app/admin/ti/page.tsx`.
- TI admin daily email: add a US tournament “heatmap” image (public directory upcoming counts by state) under the tiles, rendered via a Next.js `ImageResponse` endpoint and backed by a small state-counts RPC: `apps/ti-web/app/api/cron/admin-dashboard-email/route.ts`, `apps/ti-web/app/api/admin-dashboard-email/heatmap/route.ts`, `supabase/migrations/20260409_admin_dashboard_heatmap_state_counts.sql`.

## 2026-04-09

- Public map discovery: add a public interactive US tournament map at `/heatmap` with an `all` default and a sport filter; states are clickable into the tournament directory (state + optional sport): `apps/ti-web/app/heatmap/page.tsx`, `apps/ti-web/app/heatmap/SportFilter.tsx`.
- Public directory counts by state + optional sport: add RPC `public.get_public_directory_tournament_counts_by_state_sport(p_sport, p_now)` used by the map and map previews: `supabase/migrations/20260409_public_directory_state_counts_by_sport.sql`.
- Homepage redesign (map-first): make the map preview the primary entry point, add “Explore the map” CTA → `/heatmap?sport=all`, add sport chips, move Owl’s Eye/Premium messaging below discovery sections, and later tuned layout so the sport selector sits next to the primary CTA and the map module is larger: `apps/ti-web/app/page.tsx`, `apps/ti-web/app/home.css`, `apps/ti-web/app/layout.tsx`, `apps/ti-web/app/globals.css`.
- Homepage hero-left polish (mobile): remove the visible “Sport” label, restructure the action flow (primary CTA → optional sport selector → quiet browse link), lighten trust bullets, and center the “Browse tournaments” fallback link on small screens: `apps/ti-web/app/page.tsx`, `apps/ti-web/components/homepage/HomepageSportFilter.tsx`, `apps/ti-web/app/home.css`, `apps/ti-web/app/globals.css`.
- Map labeling polish: switch label placement to explicit `US_STATE_LABELS` and tune several state label coordinates (AK/CA/FL/MI/VA/ID/LA/etc.) for readability: `apps/ti-web/app/api/admin-dashboard-email/heatmap-us/usStatesMap.ts`.
- Map analytics (persisted): add `public.ti_map_events` table + indexes to store lightweight map/homepage interaction events: `supabase/migrations/20260409_ti_map_analytics_events.sql`.
- Map analytics (ingest): extend `POST /api/analytics` to persist `map_viewed`, `map_filter_changed`, `map_state_clicked`, `homepage_cta_clicked`, and `homepage_sport_chip_clicked` into `ti_map_events` (still logs all events to console; only quick-check + map events are persisted): `apps/ti-web/app/api/analytics/route.ts`.
- TI admin dashboard: add `/admin` page that shows the existing tile summary and a “Map Analytics (last 7 days)” section with recent event rows: `apps/ti-web/app/admin/page.tsx`.
- Rename: update “US Tournament Heatmap” labeling to “US Tournament Map” across public/admin/email surfaces: `apps/ti-web/app/heatmap/page.tsx`, `apps/ti-web/app/admin/dashboard-email/page.tsx`, `apps/ti-web/app/api/cron/admin-dashboard-email/route.ts`, `apps/ti-web/app/api/admin-dashboard-email/heatmap/route.ts`, `apps/ti-web/app/api/admin-dashboard-email/heatmap-us/route.ts`.

## 2026-04-07

- TI saved tournaments: include a per-tournament “what changed” summary in the saved-tournament change digest email (dates/location/name/sport/official-site) by storing the last-notified public snapshot and diffing it on the next send: `apps/ti-web/lib/savedTournamentChangeNotificationsJob.ts`, `apps/ti-web/lib/savedTournamentChangeNotificationsEmail.ts`, `supabase/migrations/20260407_ti_saved_tournament_change_snapshots.sql`, `docs/ti-saved-tournament-change-notifications.md`.
- TI deploy/build hardening: fix Next.js Server Action `<form action>` typing issues by using existing server actions (or safe casts) in the admin dashboard email and tournament detail pages: `apps/ti-web/app/admin/dashboard-email/page.tsx`, `apps/ti-web/app/tournaments/[slug]/page.tsx`.
- TI deploy/build hardening: prevent TypeScript build failures for async server components rendered under `Suspense` on the tournament detail page by routing through a casted component wrapper (runtime behavior unchanged): `apps/ti-web/app/tournaments/[slug]/page.tsx`.

## 2026-04-04

- RI admin: clarify tournament metrics on the main dashboard by splitting the old “Published” count into three tiles: Total Tournaments in DB (all statuses), Published (Canonical), and Public Directory (Upcoming): `apps/referee/app/admin/page.tsx`.
- RI enrichment: add per-tournament “Atlas email” action to discover + save missing director emails directly from the enrichment queue (refreshes the row so TD candidates disappear once filled): `apps/referee/app/admin/tournaments/enrichment/EnrichmentClient.tsx`, `apps/referee/app/api/admin/tournaments/atlas-email-discovery/route.ts`, `apps/referee/src/server/atlas/tournamentEmails.ts`.
- Atlas search: add lightweight debug logging for Brave/Bing/SerpAPI search calls (status, latency, query summary) to help verify provider usage: `apps/referee/src/server/atlas/search.ts`.
- Sources discovery: fix “Source type is required” validation so “Any source type” works for tournament discovery: `apps/referee/app/admin/tournaments/sources/discover/RunDiscovery.tsx`.
- RI admin uploads: add a “Missing venues” filter toggle (All / Missing venues / Has venues) for the tournament uploads queue: `apps/referee/app/admin/page.tsx`.
- TI auth: add “Forgot password?” link on login + a `/forgot-password` page that sends Supabase password reset emails (redirects to `/account/reset-password`): `apps/ti-web/app/login/page.tsx`, `apps/ti-web/app/forgot-password/page.tsx`, `apps/ti-web/app/account/reset-password/page.tsx`.
- TI venues: fix Quick Venue Check submissions failing when a venue page is opened from a tournament link (the `tournament` query param is a slug, but `venue_quick_checks.source_tournament_id` expects a UUID): `apps/ti-web/app/venues/[venueId]/page.tsx`, `apps/ti-web/app/api/venue-quick-check/route.ts`.
- Ops ingest: fix venue-first ingest feed to avoid generic `tournament_url` collisions by using `slug` as `source_event_id` when the URL is a generic listing, and improve venue creation when only `City, ST ZIP` is provided (creates venue stubs when ZIP is present): `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs`.
- Ops ingest: avoid merging distinct tournaments that share a generic listing URL by using `slug` (not `tournament_url`) for `source_event_id` when the URL is generic (e.g. `/tournaments`, homepage): `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs`.
- Ops repair: add one-off script to split/repair the Spokane ingest where generic `source_event_id` collisions merged multiple events into one tournament: `scripts/ops/repair_spokane_ingest_20260404.mjs`.

## 2026-04-06

- RI admin venues: add a venue-only CSV import flow with dry-run + apply, row-level reporting, and downloadable results CSV: `apps/referee/app/admin/venues/import/page.tsx`, `apps/referee/app/api/admin/venues/import/route.ts`, `apps/referee/app/api/admin/venues/import/export/route.ts`, `apps/referee/src/server/admin/venueImport.ts`, `supabase/migrations/20260406_venue_import_and_venue_discovery.sql`.
- RI admin venues: add a venue-driven Atlas discovery page that generates venue-anchored queries and queues discovered URLs into the existing `tournament_sources` review pipeline: `apps/referee/app/admin/venues/sweep/page.tsx`, `apps/referee/app/admin/tournaments/sources/discover/RunDiscovery.tsx`.
- Discovery provenance: persist venue/query/provider for discovered URLs via new `tournament_source_discoveries` table (keeps `tournament_sources` as the canonical URL registry): `supabase/migrations/20260406_venue_import_and_venue_discovery.sql`, `apps/referee/app/api/atlas/discover-and-queue/route.ts`.
- RI admin venues: add per-row “Sweep venue” action on the Venue CSV import results table; sweeps discover URLs via Atlas, imports discovered tournaments as `draft` (so they appear in the uploads approval queue), and stores sweep counts/errors on the row: `apps/referee/app/admin/venues/import/page.tsx`, `apps/referee/src/server/admin/venueSweep.ts`, `supabase/migrations/20260406_venue_import_sweep_result_columns.sql`.
- Tournament sources: allow `source_type='venue_sweep'` so venue sweeps can queue URLs into `tournament_sources` without failing CHECK constraints: `supabase/migrations/20260406_tournament_sources_allow_venue_sweep.sql`.
- Venues: track `venues.last_swept_at` and make `/admin/venues/sweep` filterable by state/sport, showing last-swept and hiding venues swept in the last 30 days by default: `supabase/migrations/20260406_venues_last_swept_at.sql`, `apps/referee/app/admin/venues/sweep/page.tsx`, `apps/referee/app/api/atlas/discover-and-queue/route.ts`, `apps/referee/src/server/admin/venueSweep.ts`.
- Venue sweep quality: reduce noisy non-tournament URLs during venue sweeps (keyword/domain filtering + negative terms) and improve generic date parsing to support same-month ranges like “Apr 10–12, 2026”: `apps/referee/src/server/admin/venueSweep.ts`, `apps/referee/src/server/admin/pasteUrl.ts`.
- Venue sweep quality: add a second-stage “venue page expansion” that fetches likely facility pages, extracts outbound tournament links, and runs a small follow-up search using event-name phrases (e.g. “406 Cup”) so venue sweeps don’t miss tournaments hidden behind venue/facility pages: `apps/referee/src/server/admin/venueSweep.ts`.
- Venue sweep reliability: treat venue/facility page fetch failures as non-fatal (some pages are bot-blocked, JS-only, or non-HTML) so a single bad venue page can’t fail the entire sweep: `apps/referee/src/server/admin/venueSweep.ts`.
- Venue import robustness: parse common “no-comma” address format (`street city ST ZIP`) so city/state aren’t dropped during import (prevents false `invalid`): `apps/referee/src/server/admin/venueImport.ts`.
- Venue import robustness: parse addresses that omit a leading street number (e.g. “Siebel Soccer Park Rd Bozeman MT 59718”) so city/state still populate and rows don’t get marked invalid: `apps/referee/src/server/admin/venueImport.ts`.
- Admin nav: add quick links for Venue CSV import + Venue sweep from `/admin/venues`: `apps/referee/app/admin/venues/page.tsx`.

## 2026-04-03

- TI tournaments: reduce sport hub page caching from 6h → 5m so newly ingested tournaments show up quickly (`apps/ti-web/app/tournaments/{soccer,baseball,softball,basketball,lacrosse}/page.tsx`). Also make sport/state SEO pages refresh + include tournaments with only `start_date` (use `start_date >= today OR end_date >= today`) via `apps/ti-web/app/[sport]/[state]/page.tsx`.
- TI cron: allow `x-vercel-cron: 1` production invocations for the admin dashboard email route so scheduled crons work even when `?token=` isn’t configured: `apps/ti-web/app/api/cron/admin-dashboard-email/route.ts`.
- TI directory + email metrics: include AYSO in the default public directory (and ZIP-radius RPC), relabel RI admin “Published” to “Total Tournaments in DB”, and show both DB total + public-directory (upcoming) counts in the TI admin dashboard email tiles: `apps/ti-web/app/tournaments/page.tsx`, `apps/ti-web/app/tournaments/metro/[slug]/page.tsx`, `supabase/migrations/20260404_tournaments_public_radius_ayso_filter_fix.sql`, `supabase/migrations/20260404_admin_dashboard_email_tiles_public_directory_counts.sql`, `apps/referee/app/admin/page.tsx`, `apps/ti-web/app/{api/cron/admin-dashboard-email,admin/dashboard-email}/page.tsx`, `apps/ti-web/lib/adminDashboardEmail.ts`.
- RI admin enrichment: fix Apply/Delete rows not disappearing without a full page refresh by aligning client-side candidate grouping with server de-dupe signatures, fetching contact `name` for accurate de-dupe, and optimistically removing candidates + clearing the stale “(Updating row…)” suffix after mutations: `apps/referee/app/admin/tournaments/enrichment/page.tsx`, `apps/referee/app/admin/tournaments/enrichment/EnrichmentClient.tsx`.
- RI admin enrichment: call `router.refresh()` after Apply/Delete and sync refreshed server props into client state so the queue reflects DB changes without manual reloads (covers edge cases where optimistic removal misses de-duped rows): `apps/referee/app/admin/tournaments/enrichment/EnrichmentClient.tsx`.
- Missing venues export: include `tournament_uuid` in the CSV to support downstream “link venues without creating tournaments” workflows: `apps/referee/app/api/admin/tournaments/missing-venues/export/route.ts`.
- Ops tooling: add `scripts/ops/link_venues_from_csv_no_tournaments.mjs` to upsert venues and link them to existing tournaments from a CSV without creating tournaments (resolves tournaments by UUID/slug or conservative name+state match; idempotent; optional primary flag when none exists).
- RI Sources discovery: add admin-only seed recommendations for low-volume states (published canonical counts + top source domains + keep seed sources) surfaced on `/admin/tournaments/sources/discover`: `supabase/migrations/20260403_admin_seed_source_recommendations.sql`, `apps/referee/app/admin/tournaments/sources/discover/page.tsx`.
- RI Sources discovery: surface underlying Atlas search errors (missing API keys, provider failures) in the UI instead of a generic 500: `apps/referee/app/api/atlas/discover-and-queue/route.ts`, `apps/referee/app/admin/tournaments/sources/discover/RunDiscovery.tsx`.
- RI Sources discovery: avoid Brave 400-char query limit by chunking multi-state searches into multiple queries automatically (prevents 422 “too_long”): `apps/referee/app/admin/tournaments/sources/discover/page.tsx`.
- RI Sources discovery: keep the runner’s query list in sync with regenerated queries (unless manually edited) and fail fast on Brave’s 400-char limit with an actionable 400: `apps/referee/app/admin/tournaments/sources/discover/RunDiscovery.tsx`, `apps/referee/app/api/atlas/discover-and-queue/route.ts`.

## 2026-04-02

- TI SEO: Metro/Region markets (v1):
  - Added service-role-only reference tables + seed: `supabase/migrations/20260402_metro_markets_dc_new_england.sql`
  - Added region expansion seed: `supabase/migrations/20260402_metro_markets_region_expansion.sql`
  - Added California city-split rules + seed: `supabase/migrations/20260402_metro_market_city_rules_ca_split.sql`
  - Added metro listing pages: `apps/ti-web/app/tournaments/metro/[slug]/page.tsx`
  - Added metro helper: `apps/ti-web/app/tournaments/_lib/getMetroMarketTournaments.ts`
  - Added internal links on directory: `apps/ti-web/app/tournaments/page.tsx`
  - Added deterministic metro labels on tournament details (incl. generic CA label): `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Updated metro SEO content (unique titles/intros/FAQs + metadata derived from intro): `apps/ti-web/app/tournaments/metro/[slug]/page.tsx`
  - Added tournament hero Save context copy (“Track this tournament” + helper text) + Save click/auth-redirect analytics: `apps/ti-web/app/tournaments/[slug]/page.tsx`, `apps/ti-web/components/SaveTournamentButton.tsx`
  - Centered the single-venue tile layout on tournament detail pages: `apps/ti-web/app/tournaments/[slug]/page.tsx`, `apps/ti-web/app/tournaments/tournaments.css`
  - Venues (inference safety): added `tournament_venues.is_inferred` flag and updated all key reads/metrics (missing-venues RPC + dashboard tiles + public/admin pages + alerts) to treat only `is_inferred=false` links as confirmed: `supabase/migrations/20260402_tournament_venues_inferred_flag.sql`

## 2026-03-30

- TI Outreach Previews: improved load performance by avoiding `select("*")` on `email_outreach_previews`; list view now fetches a lightweight column set and loads `html_body`/`text_body` only for the selected preview row.
- TI Outreach: added a new admin-only `/admin/outreach-dashboard` page backed by the `get_outreach_dashboard_metrics(...)` RPC for set-based outreach metrics (includes manual replies via `director_replied_at`).
- RI admin: added a `TI Outreach Dashboard` button on `/admin/ti` that opens the TI dashboard via SSO (env-aware localhost vs prod domain).
- RI Sources: highlighted sport groupings and source rows when `review_status=keep` sources are overdue for sweep (45+ days since `last_swept_at`).
- RI Tournament uploads: CSV imports now (a) accept common header variants like `tournament_name`, `tournament_state`, `venue_name`, and `venue_address`, and (b) create/match venues + upsert `tournament_venues` links during import when venue fields are non-empty/non-TBD.
- RI Tournament uploads: approval queue now shows a compact green “N venues linked” indicator (hover to see names) without increasing row height.
- RI Tournament uploads: added an admin-only “Export CSV” download for the pending approval queue (includes tournament UUID + best URL).
- RI Owl’s Eye admin: fixed “ready venues” selection to query for complete addresses server-side (so counts aren’t skewed by the first 1200 rows), and prioritize venues that have not had an Owl’s Eye run yet.
- RI Owl’s Eye nearby: added a gear-only backfill tool to populate `sporting_goods` (with `big_box_fallback`) for venues whose latest runs predate the 2026-03-18 feature (`scripts/ops/backfill_owlseye_gear_nearby.ts`, dry-run by default; `--apply` to write).
- Ops tooling: added `scripts/ops/update_missing_director_emails_from_csv.mjs` to apply curated director-email CSVs by tournament UUID (updates `tournaments.tournament_director_email` only when blank; emits a report CSV under `tmp/`).
- Ops tooling: added `scripts/ops/convert_lacrosse_acquisition_csv.mjs` to normalize `lacrosse_acquisition_ingest.csv` into the standard ingest CSV shape used by `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs` (conservative venue parsing; avoids creating junk venues).
- Ops tooling: added `scripts/ops/ingest_gotsport_fields_venues.mjs` to fetch venue name + address/coords from a GotSport fields page and match/create/link venues for a specific `tournament_id` (dry-run by default; `--apply` to write).
- Ops tooling: added `scripts/ops/ingest_renoapex_springcup_venues.mjs` to parse venue blocks (name + city/state + map embed lat/lng) from the RenoApex Spring Cup page and match/create/link venues for a specific `tournament_id` (dry-run by default; `--apply` to write).
- Ops tooling: added `scripts/ops/cleanup_draft_placeholder_venue_links.mjs` to unlink draft (pending approval) tournaments from placeholder venue links (TBD/TBA) when the venue has no address/geo (dry-run by default; `--apply` to write; emits a CSV report under `tmp/`).

## 2026-03-31

- Shared email preflight: added `shared/email/emailPreflight.ts` + `shared/email/sendWithPreflight.ts` for cross-app validation + suppression filtering before sends.
- Shared suppressions table: added `supabase/migrations/20260331_email_suppressions.sql` (`public.email_suppressions`) for explicit opt-out / bounce / complaint suppression across TI + RI (marketing vs transactional behavior).
- TI + RI email sends: added `sendEmailVerified(...)` wrappers in `apps/ti-web/lib/email.ts` and `apps/referee/lib/email.ts` and switched key send paths to use preflight + suppression checks.
- TI account: added an Email preferences section on `/account` to opt out of marketing emails or pause all emails (writes to `public.email_suppressions` via `/api/account/email-preferences`).
- TI outbound sender: standardized TI `From` to `TournamentInsights <hello@mail.tournamentinsights.com>` (TI no longer falls back to `REVIEW_ALERT_FROM`).
- One-click unsubscribe (marketing): added `/unsubscribe` on TI and added `List-Unsubscribe` headers + per-recipient signed unsubscribe links for admin-blast sends.
- RI admin: added reusable `TI admin email templates` (save/load/update/delete) for the bulk sender on `/admin/ti` (stored in `public.ti_admin_email_templates`).
- RI admin email rendering: improved bulk sender HTML for Outlook/webmail by converting newline formatting to `<br/>`, adding an Account CTA button, and rendering footer links as labeled anchors (no raw URLs).
- RI admin: made the `/admin/ti` notice banner sticky with a Dismiss action so send results stay visible while scrolling.
- Suppression behavior:
  - `kind: "marketing"` skips recipients where `suppress_marketing=true` **or** `suppress_all=true`.
  - `kind: "transactional"` skips recipients **only** when `suppress_all=true`.
  - Add/update suppressions by inserting rows into `public.email_suppressions` (admin-only via `public.is_admin()`; full CRUD allowed to `service_role`).
- Preflight behavior:
  - Normalizes/dedupes recipients, blocks invalid `from` addresses/domains, and warns when email content contains `localhost` links (allowed by default outside production).
- RI draft uploads: improved venue candidate scanning + auto-fill for pending approval tournaments:
  - `scripts/ops/scan_draft_upload_venues.ts` now loads `.env.local` automatically, paginates draft fetches, treats placeholder `venue` values (TBD/TBA) as missing, extracts per-venue address lines from “Fields:”/venue lists, and avoids silent insert failures by de-duping against existing candidates and writing insert errors to the CSV report.
  - `scripts/ops/apply_high_confidence_draft_venues.ts` now loads `.env.local`, paginates draft fetches, parses `City ST ZIP` addresses (comma optional), treats `fields-link` venue candidates as high-confidence, and can overwrite placeholder `tournaments.venue` values (TBD/TBA) when `address` is blank.

## 2026-03-29

- TI Outreach Previews: director email search is now a global lookup (does not get blocked by selected `campaign_id`, `sport`, or `start_after`), and uses a case-insensitive contains match so minor whitespace/casing issues still return results.
- TI Outreach Previews: added tournament-name search (`tournament_q`) that also matches tournaments referenced inside multi-tournament outreach (via `tournament_id` / `tournament_ids`), so replies can be located even when the reply-from email differs from the sent-to address; list view now shows the replied timestamp inline.
- Outreach tracking (Supabase): added migration `supabase/migrations/20260329_email_outreach_preview_tracking.sql` to add `sent_at`, `send_attempt_count`, and director reply fields (`director_replied_at`, `director_replied_note`, `director_replied_by_email`) + indexes.
- TI outreach APIs: hardened `/api/outreach/mark-replied`, `/api/outreach/send-test`, and `/api/outreach/send-director` to (a) return actionable JSON errors when the migration hasn’t been applied (PostgREST schema cache / missing columns) and (b) fail fast when Supabase admin env is missing.
- Ops ingest (Bottom 5 states intake): normalized `bottom5_states_tournament_intake.csv` via `scripts/ops/normalize_bottom5_states_intake_to_new_feed.mjs`, then ran ingest with `--no-create-tournaments` so only existing tournaments were updated and venue links were created when possible (created_tournaments=0, updated_tournaments=4, created_venues=13, linked=4; report: `tmp/bottom5_states_intake_report_apply.csv`). Follow-up: updated ingest script to avoid creating venues unless the tournament exists and can be linked (prevents orphan venues when tournament matches fail).

## 2026-03-28

- Data (Swallows Cup): scraped the venues list and ensured all venue links exist for `Swallows Cup 2026` (tournament `39c6832b-d091-4787-a989-e8d7e2977a5e`): created 11 new `venues` and upserted 17 `tournament_venues` links. Added helper script `scripts/ops/link_swallowscup_venues_to_tournament.mjs` (uses map embed lat/lon + Nominatim reverse geocode when a full street address is not embedded).
- TI venues routing: switched TI venue pages to route via `venues.seo_slug` when present (`/venues/{seo_slug}`), with UUID fallback + automatic UUID→slug redirect + canonicalization; updated venue links across TI (directory, tournament pages, reviews flow, and venue maps).
- Ops ingest (USSSA batch): ingested `tmp/usssa_batch_20260327_az_ok_mi_ny.csv` via `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs` (apply=true): created_tournaments=0, updated_tournaments=8, created_venues=0, linked=16 (report in `tmp/ingest_tournaments_and_venues_20260327_144343.csv`).
- Ops ingest (TI feed normalize + ingest): added `scripts/ops/normalize_ti_feed_to_new_ingest_csv.mjs` to convert “id,tournament_name,...,source_url,confidence” exports into the standard ingest CSV format (handles markdown link wrappers + confidence embedded as `,low|,medium|,high`). Updated `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs` to (a) allow missing `tournament_url`, (b) support update-only rows when `start_date` is missing (skip create, still update when `source_event_id` matches), and (c) fix venue matching when addresses contain commas by replacing `PostgREST .or(address.eq...,address1.eq...)` with two safe queries. Applied ingest for the normalized batch: created_tournaments=0, updated_tournaments=60, created_venues=3, linked=57 (report in `tmp/ingest_tournaments_and_venues_20260327_151345.csv`).
- Semantic text (TI + RI): added deterministic, template-based relationship text on tournament + venue pages (no LLM): tournament→venues sentence and venue→tournaments sentence. Uses time-based ISR (`revalidate=3600`), dedupes + truncates long labels, and caps list size (venues=5, tournaments=8, with “and N more”). Shared helper: `shared/semantic/formatEntityList.ts`. Venue→tournaments list excludes tournaments with `start_date` missing or older than 7 days.
- Demo sorting: ensured `refereeinsights-demo-tournament` stays first even when listings are ordered by `start_date` by including demo rows in “upcoming” filters and ordering `is_demo DESC` before `start_date` in TI/RI sport hub queries.
- Admin venues: added a “To review: remaining/total” counter to the “Recent tournament venue links” panel; reviewed tournaments are now excluded server-side once `skip_venue_discovery=true` is set (so they don’t reappear when changing date ranges or resetting local hidden state).
- Admin venues: added a per-tournament venue count in the collapsed recent-links row (next to “Updated”), to help prioritize which tournaments need review first.
- Ops ingest (WYO Club VB venue enrichment): extended `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs` to accept a `tournament_uuid + venue_*` enrichment CSV (no tournament creation; links venues to existing tournaments by id). Applied `wyo_club_vb_venue_enrichment.csv`: created_venues=3, linked=18 (report: `tmp/wyo_club_vb_venue_enrichment_report_apply.csv`).
- Organizer venue suggestions (backend tooling): added `scripts/ingest/suggest_organizer_venue_candidates.ts` to propose venue links for tournaments missing `tournament_venues` based on evidence from existing organizer patterns (association first, domain fallback). Writes suggestions into `tournament_venue_candidates` (never auto-links) with confidence + evidence text + provenance (`source_url=organizer_pattern:*`) and emits a CSV report under `tmp/`.

## 2026-03-27

- Court23 cleanup: added `scripts/ops/cleanup_court23_tournament_venues.mjs` to fetch each Court23 tournament’s specific page (via homepage date→URL mapping), parse “Playing Sites”, ensure only those venues are linked in `tournament_venues` (unlinking noise), and set `tournaments.official_website_url` to the tournament-specific URL (prevents homepage venue bleed during scans). Emits a CSV report under `tmp/` for audit.
- Admin venues duplicates: added “Recent tournament venue links” panel (date-range filter) under `/admin/venues?duplicates=1` to review links created in a window and quickly unlink incorrect ones; added API `apps/referee/app/api/admin/tournament-venues/unlink/route.ts`.
- Review workflow: added per-tournament `Reviewed (skip + hide)` control on the recent-links panel (sets `tournaments.skip_venue_discovery=true` and then persists the hide per date range in localStorage, with reset), plus “Delete tournament” action for the expanded row (API `apps/referee/app/api/admin/tournaments/delete/route.ts`).
- UI: fixed a hydration mismatch in the recent-links panel by deferring localStorage reads until after mount (server/client first render now matches).
- Skip venue discovery: added `tournaments.skip_venue_discovery` (migration `supabase/migrations/20260327_skip_venue_discovery.sql`) to opt a tournament out of venue searches; excluded skipped tournaments from the missing-venues RPC, added admin API `apps/referee/app/api/admin/tournaments/skip-venue-discovery/route.ts`, and surfaced controls + an “Edit” shortcut in the recent-links panel.
- Admin (tournament uploads): exposed inline “Edit fields” panel under each pending tournament row in `/admin?tab=tournament-uploads` (lazy-loads details only when expanded) so admins can tweak values in-place before approving; fields are optional; sport dropdown now includes all supported sports (e.g. futsal/softball/volleyball/wrestling/hockey/other). Added linked-venues UI with search + multi-venue linking + create-new-venue, and save/approve now persists edits and auto-creates a `venues` row (when venue+location info is present) and links it via `tournament_venues`.
- Ops ingest: extended `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs` to also accept the newer “tournament_external_id + venue_* columns” feed format, grouping multi-venue tournaments and creating/linking venues even when street address is missing (name + city + state fallback). Follow-up: tournament matching now prefers `source_event_id` (external id) to avoid duplicates and updates avoid wiping existing fields with nulls.
- Docs: added `docs/templates/ayso_invitation_letter.md` template email for requesting AYSO venue details (includes venue/address fields to fill).

## 2026-03-26

- Supabase Security Advisor: added migration `supabase/migrations/20260326_rls_disabled_in_public_fix.sql` to address `rls_disabled_in_public` (“Table publicly accessible”) by enabling RLS + adding explicit policies (admin-only for most tables; allow public select on `school_referee_scores_by_sport` where `status='clear'`).
- Fargo Basketball ND ingest: added ops scripts `scripts/ops/audit_fargo_basketball_nd_venues.ts` and `scripts/ops/ingest_fargo_basketball_nd.ts` to scrape the tournament list, verify presence in Supabase, and (optionally) upsert venues/tournaments + `tournament_venues` links.
- Missing venues source of truth: updated admin dashboards + `/admin/tournaments/missing-venues` to define “missing venues” as tournaments missing `tournament_venues` links (ignore legacy inline `tournaments.venue/address`), and added chunking RPC `supabase/migrations/20260326_missing_venues_chunk_rpc.sql` (`list_missing_venue_link_tournaments`) so the list/counts can page by limit/offset without client-side NOT EXISTS emulation.
- Owl’s Eye duplicates → venue duplicates workflow: added persisted suspects table `supabase/migrations/20260326_owls_eye_venue_duplicate_suspects.sql`, store `DUPLICATE_VENUE_SUSPECT` pairs during Owl’s Eye runs, and surface them as an “Owl’s Eye suspect” group in `/admin/venues?duplicates=1` (keep-both override also suppresses Owl suspects). Follow-up: venues duplicate UI now backfill-fetches any suspect venue IDs missing from the full venue scan so Owl suspects always render (even if the venue scan breaks/truncates).
- Ops: added `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs` to ingest tournaments + venues from a CSV with duplicate checks and `tournament_venues` linking (idempotent-ish; avoids merging distinct tournaments that share a generic “tournaments landing page” URL). Follow-up: URL-only dedupe now skips generic directory URLs like `/events` to prevent merging distinct tournaments on shared listing pages.
- Ops: added `scripts/ops/ingest_venues_from_csv.mjs` to ingest venue-only CSV lists (create new venues when address/city/state are present; otherwise skip; fill-in missing venue fields on exact matches).
- Missing venues deep scan: fixed local script execution by removing `@/` path alias import from `scripts/ingest/link_missing_venues_deep.ts` and improved failure logging so errors don’t print as `[object Object]`.

## 2026-04-01

- TI tournament detail: after a successful Save, show a lightweight opt-in prompt to enable “Notify me of changes” for that specific saved tournament (soft opt-in; dismisses for the current session).
- TI save tournament API: return `notify_on_changes` status on save-status GET and Save POST so the UI can decide whether to show the opt-in prompt.
- RI admin bulk email: improved Outlook/webmail-safe button markup and point the Account CTA to TI login (`/login?returnTo=/account`) while preserving existing one-click unsubscribe behavior.
- RI enrichment (fees/venue): stop emitting `venue_url`-only attribute candidates; only treat venue URLs as useful when they resolve to a real venue candidate (name + address).
- RI enrichment apply: prevent creating/linking venues from URL-only candidates and only persist `tournaments.venue_url` when an address-backed venue was created/linked.

## 2026-04-02

- TI ops: added a scheduled cron email that sends a daily admin dashboard summary (Outreach Dashboard totals by sport) via Resend.
  - Endpoint: `apps/ti-web/app/api/cron/admin-dashboard-email/route.ts` (auth via `CRON_SECRET`, lock via `acquire_cron_job_lock`).
  - Schedule: `apps/ti-web/vercel.json` cron at `5 13 * * *` (UTC).
  - Env: `TI_ADMIN_DASHBOARD_EMAILS` (comma/newline-separated recipients), `RESEND_API_KEY`, `CRON_SECRET`.
  - Manual preview (no send): add `&dry_run=1` to the cron URL.
- TI ops: added an admin UI to preview, customize (sections + recipients), and send the dashboard email on demand.
  - Page: `apps/ti-web/app/admin/dashboard-email/page.tsx`
  - Settings storage (Supabase): `supabase/migrations/20260402_ti_admin_dashboard_email_settings.sql` (table `public.ti_admin_dashboard_email_settings`)
  - RI shortcut: button on RI `/admin` to open TI page via SSO (`apps/referee/app/admin/page.tsx`)
- TI ops: dashboard email now leads with tile KPIs (canonical + deltas, missing venues + deltas, Owl’s Eye venue reviews + deltas, and per-sport tiles).
  - Metrics RPC: `supabase/migrations/20260402_admin_dashboard_email_tiles_rpc.sql` (`public.get_admin_dashboard_email_tiles(...)`)
- TI ops: added two more tiles (success tone) for Venue Check submissions and TI users (Insider + Weekend Pro), each with “yesterday” deltas.
  - Metrics RPC update: `supabase/migrations/20260402_admin_dashboard_email_tiles_rpc_v2.sql`

- Ops tooling: `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs` now supports an expanded CSV feed with explicit venue city/state/zip (`venue_city,venue_state,venue_zip`) while still de-duping tournaments/venues and linking via `tournament_venues`.
  - Also treats `/state-tournaments` URLs as generic listing pages to avoid merging distinct tournaments on shared USSSA state listing URLs.

## 2026-03-14

- Added per-row approval on admin tournament sport validation page to remove nested forms and hydration errors; bulk UI removed.
- Added high-confidence name keyword sport validation rules (basketball/baseball/softball/hockey/lacrosse/volleyball/football/futsal).
- Fixed TypeScript typing for requeue action in validation admin to unblock build.

## 2026-03-15

- Validation batch script now shows ruleConfirmed count and accepts CLI limit arg.
- Validation admin page now links tournament names to external URLs (uses official_website_url, then source_url, then slug).
- Added run-time guidance to requeue needs_review items and rerun batch; processed ~949 with 575 rule-confirmed after new URL/keyword rules.
- Added per-row “Clear URL (bad link)” action in validation admin to null official_website_url and requeue validation.
- Venue Insights and tournament badges now use the same responsive layout; added mobile wrapping (2-up) for TI and RI summaries.
- TI venues list paginates Supabase fetch (no 1000 cap).
- Sport/state hub routes added for TI with state-slug mapping; hubs include null-date tournaments when filtering future events.
- /admin now shows summary tiles (published/draft/missing venues/URLs/dates, validation counts) and keeps link to the tournaments dashboard.
- /admin/tournaments/dashboard now pages through all tournaments (no 1000 cap).
- Added anonymous “Quick Venue Check” widget (TI) with chip inputs, analytics, rate-limit per venue/browser, honeypot, and Supabase insert to new venue_quick_checks table; aggregates now union quick checks into venue averages.
- Quick Venue Check embedded on TI venue detail and tournament detail (first linked venue).
- Quick Venue Check restyled to match venue badges (dark translucent card, green accents), added close/reopen control, and guarded analytics open event to fire once per page.

## 2026-03-16

- Quick Venue Check: added “Have you played here before?” gate (Yes shows form; No shows acknowledgement) and expanded analytics to include Started/Dismissed.
- Quick Venue Check: allow partial submissions (>= 1 field) and aligned API validation accordingly.
- Quick Venue Check: multi-venue tournaments now pass venueOptions and require a venue pick before submit.
- Quick Venue Check: improved chip labels (shade: None/Poor/Fair/Good/Great; cleanliness: Poor/Fair/Good/Great/Spotless) and moved restroom type above cleanliness.
- Quick Venue Check: all chip selections are now toggleable (click again to de-select).
- Quick Venue Check: persist funnel events to `venue_quick_check_events` (and include `fieldsAnswered` on submit) + added `/admin/ti` dashboard tiles/top tournaments via `get_venue_quick_check_metrics` (migration `20260316_quick_check_analytics.sql`).
- Quick Venue Check: extended `get_venue_quick_check_metrics` to include top venues by submissions (migration `20260316_quick_check_top_venues.sql`) and surfaced the table on `/admin/ti`.
- RI: fixed `/admin` runtime error by importing `getSportValidationCounts` on `apps/referee/app/admin/page.tsx`.
- Added backfill script to copy `source_url` into `official_website_url` for high-confidence matches based on tournament name: `scripts/ingest/backfill_official_urls_from_source.ts` (dry-run by default, `--apply` to write).
- Added CSV apply script for official tournament URLs (only fills when blank): `scripts/ingest/apply_official_urls_from_csv.ts` (used to apply 443 official URLs from `tournaments_with_urls.csv`).
- Added `/admin/tournaments/missing-venues` queue with per-row deep scan (uses fees/venue enrichment in missing-venues mode) and quick links to venue search + current candidate confidence.
- Made the Admin Dashboard “Missing venues” tile link to `/admin/tournaments/missing-venues`.
- Added a “Deep scan 50” bulk button on `/admin/tournaments/missing-venues` to run the missing-venues enrichment for up to 50 tournaments at once.
- Fees/Venue enrichment: improved deep scan to extract venue map cards (image + venue/city headings) and store the map image URL on venue candidates; added same-state guard + a small denylist for known sticky footer addresses.
- Fees/Venue enrichment: per-tournament deep scans (when `tournament_id` is specified) now bypass linked/pending/cooldown skips so a user can always force a refresh on one tournament.
- Missing venues admin: show a clickable `(map)` link for venue candidates when the scraper captured a map image URL.
- Admin UX: Edit links from enrichment now deep-link into the Tournament listings section of `/admin?tab=tournament-listings` (anchor jump).
- Missing venues counters: now treat `tournament_venues` links as the source of truth (exclude linked tournaments from the “missing venues” tile and list); implemented chunked queries to avoid Supabase/PostgREST URL/header limits.
- Fees/Venue enrichment: added facility extraction for pages listing venues as `Venue Name – City, ST` (e.g. “Age Groups & Facilities” blocks) so deep scan captures facilities even without street addresses.
- TI SEO hubs: centered tournament card title/meta/date text on hub pages to match the directory badge/card layout on mobile.
- RI email: password reset endpoint now returns success when the email is not found (prevents account enumeration and removes noisy 500s).
- RI email: Resend sender fallback now defaults to `noreply@refereeinsights.com` instead of a gmail address (prevents 403 “domain not verified” failures).

## 2026-03-17

- Admin build stamp: RI admin nav and TI admin pages now display a build identifier (commit short + env + deployment short) to help diagnose dashboard inconsistencies across deployments.
- /admin/ti: added an expandable “quick view” row under Top tournaments by “Yes” (Started) to show one-line venue quick check rollups (submissions, venues touched, avg cleanliness/shade labels, top parking/restroom type, bring-chairs %).
- TI tournament claim v1: added “Claim this tournament” CTA on tournament pages, magic-link verification against `tournaments.tournament_director_email`, and a director-only inline edit form (no director-email changes in v1); added `tournament_claim_events` table for funnel/ops tracking + basic rate limiting.
- RI admin: added `/admin/tournaments/claims` to review claim mismatches/review requests and manually approve (sets director email) or dismiss; surfaced a Claims button in the admin nav with a badge when open claim items exist (and an alert icon when mismatches are present).
- TI outreach: added an “Intro (reply only)” email mode for outreach previews/sends that includes the signed opt-out link but removes the verification link/button from the email body (verify-link mode remains available).
- TI outreach: preview generation now batches up to 5 tournaments per director email for the intro reply-only outreach (one email can cover multiple tournaments); unsubscribe link suppresses all tournaments included in that email.
- TI outreach: added a cross-campaign cooldown (default 30 days, configurable via `OUTREACH_COOLDOWN_DAYS`) so preview generation skips director emails that were already sent outreach recently.
- TI outreach: added `/admin/outreach-reply` tool + `POST /api/outreach/generate-verify-reply` to generate a second-step director email that lists all associated tournaments (by director email) with per-tournament verify links (keeps signed opt-out link).

## 2026-03-18

- Owl's Eye nearby: added two new nearby categories in `owls_eye_nearby_food` (`sporting_goods`, `big_box_fallback`) via migration `20260318_owls_eye_nearby_sporting_goods.sql`.
- Owl's Eye scan: extended nearby fetch to include team-sports gear stores within ~25 miles (filters out gun/range, running, racquet/tennis, golf, cycling, outdoors/ski, motorsports, fishing/marine, airsoft/paintball, etc); falls back to Target/Walmart/etc when no qualifying sporting goods store is found.
- Venue pages (TI + RI): show “gear nearby” count and include a “Gear” section in the premium Weekend Guide accordion.
- Tournament pages (TI + RI): Owls Eye presence indicator now counts gear rows (and big-box fallback) as part of “has Owl’s Eye data”.
- Admin venue editor (RI): allow editing nearby rows with category `sporting_goods` / `big_box_fallback` (API sanitization + dropdown options).
- Data: updated TI tournament `Red Shield Classic` official URL to `https://www.ironboundsoccer.com/tournaments`; created the 18 provided NJ venues (dedupe-by-address where possible) and linked them to the tournament.
- Data: ran Owl's Eye for all 18 Red Shield Classic venues (geocode + nearby + airports).
- Data: updated `Chattanooga Cup` official URL to `https://soccer.sincsports.com/details.aspx?tid=ERSHAM&tab=1`.
- Data: updated tournament director + director email fields for multiple tournaments from curated research lists (batch update scripts).
- Data: updated `AYSO Grape Stomp` tournament details (director + referee contact + official URL + dates); created/link 5 venues after checking for existing.
- Data: for `BATAAN DEATH MARCH`, created/link 2 additional venues (preserved existing tournament->venue links).
- Data: corrected several venue records by ID (name/address/city/state/zip) and renamed WA "BALLFIELDS" placeholder venues to more accurate names.
- RI admin: Owl's Eye batch runner now surfaces the duplicate-suspect candidates from a batch (so you can actually review/merge the duplicates that blocked a run).
- RI: Owl's Eye duplicate detection + the `/admin/owls-eye` "ready" list now prefer `venues.address` over stale legacy `venues.address1` (fixes duplicates showing old addresses after cleanup edits).

## 2026-03-19

- TI SEO: replaced capped Next metadata sitemap with scalable sitemap index at `/sitemap.xml` and paged sitemaps under `/sitemaps/*` (static + hubs + `tournaments-<n>.xml`).
- TI SEO: added `noindex,nofollow` for thin/utility pages (`/login`, `/signup`, `/join`, `/outreach/preview`, `/unsubscribe-outreach`, `/venues/maps/[venueId]`) and for secondary duplicate hub routes (`/tournaments/hubs/*`).
- TI SEO: added crawlable internal links to sport hubs (`/tournaments/{sport}`) from `/` and `/tournaments` (and ensured `softball` hub is included in sitemap coverage).
- RI admin: added a dashboard summary tile for “Missing director email” next to “Missing dates”, linking to `/admin?tab=tournament-listings&missing=director_email` (filters to tournaments where `tournament_director_email` is blank).
- Data: ingested tournament director name/email from director research CSV batches (only fills missing values; does not overwrite existing data); added helper script `scripts/ingest/apply_tournament_directors_from_csv.ts`.
- RI admin (tournament contacts): added a sticky notice banner for `notice=` feedback so action results are visible without scrolling.
- RI enrichment: `politeFetch` now uses abort timeouts and logs cleanly on timeout/fetch failures; 0-page fetch runs now mark the job as `error` (`enrichment_no_pages_fetched`) instead of silently "done".
- RI admin (tournament contacts): fixed contact discovery to surface Supabase insert errors (instead of always claiming rows were added).
- RI admin (tournament contacts): discovery now paginates through different tournaments via `discover_offset` (so repeated runs don't re-scan the same top N).
- RI admin (tournament contacts): fixed `tournament_contacts.confidence` inserts by converting enricher confidence (0..1) into 0..100 (smallint).
- RI admin: force `/admin` to be dynamic (`dynamic=force-dynamic`, `revalidate=0`) so save/delete mutations reflect immediately (no stale RSC payload).
- Data (USSSA venues): ran `scripts/ingest/link_usssa_missing_venues.ts` across all published canonical USSSA event URLs; created ~71 venues and upserted tournament->venue links where venue data was present on the page.
- Ingest (USSSA venues): hardened venue creation by checking the DB unique key (name/address/city/state) before insert and recovering from `23505` duplicate-key races; script now reports unresolved tournaments (no URL, empty fetch, or no venue data).
- Data (USSSA venues): fixed a stale 404 USSSA URL for `7f6da613-1721-446e-812a-2f0886f76332` by updating it to `https://labaseball.usssa.com/event/superman-nit/`; reran the linker and it successfully linked venues for that tournament.
- Data (USSSA venues): 3 tournaments remain missing venues because their stored USSSA event URLs returned 404/empty HTML at crawl time (need URL fix or manual venue entry): `a0e1aa79-0810-4d55-8a8d-13a496bc8cdc`, `945aa2a2-2095-45e2-a58f-dbb6c5e5b63d`, `5f460e94-ea38-4a52-b463-8266f59b916a`.
- Ingest (TopTierSports): added `scripts/ingest/link_exposure_missing_venues.ts` to pull venue addresses from embedded Exposure Events widgets on `toptiersports.net` tournament pages and create/link venues.
- Data (TopTierSports): ran the Exposure linker for TopTierSports-domain tournaments missing venue links; 16 targets found, 1 had venue data available in Exposure, resulting in 2 venues created and linked (others either lacked an Exposure widget or Exposure showed “Visit the official website for venue information.”).
- Ingest (SincSports): added `scripts/ingest/link_sincsports_missing_venues.ts` to scrape the `FIELDS` section from `soccer.sincsports.com/details.aspx?...` tournament pages, create venues (dedupe by unique key), and link them to tournaments missing `tournament_venues`.
- Data (SincSports): ran the SincSports linker; scanned 12 missing-venue targets and successfully created + linked 3 venues for 1 tournament that published full field addresses (remaining targets lacked a parseable `FIELDS` section or did not list venue addresses).
- Ingest (ASC Events): added `scripts/ingest/link_asc_missing_venues.ts` to scrape ASC pages for embedded Google Maps venue addresses (`iframe` `maps/embed/v1/place?q=...`), create venues (stable name defaults to address when no venue name is present), and link them to tournaments missing `tournament_venues`.
- Data (ASC Events): ran the ASC linker; 12 missing-venue targets found, 2 pages contained parseable map embeds, resulting in 3 venues created and linked (remaining targets did not publish venue addresses on the shared `lonestarclassic` / `lsr-championships` pages).
- Ingest (MyHockeyTournaments): added `scripts/ingest/link_myhockeytournaments_missing_venues.ts` to scrape `/rinkMapForTournament/<id>` pages (Google Map marker data) and create/link arena venues for tournaments missing `tournament_venues`.
- Data (MyHockeyTournaments): ran the MyHockeyTournaments linker (limit 50); 14 missing-venue targets found, 6 had rink map data, resulting in 10 venues created and 11 tournament->venue links inserted (remaining targets point to the site homepage or city landing pages without event-specific venue data).
- Ingest (USLaxEvents): added `scripts/ingest/link_uslaxevents_missing_venues.ts` to scrape `uslaxevents.com/tournaments/*` pages for the “Location & Directions” blocks (location name + street/city/state/zip), create venues, and link them to tournaments missing `tournament_venues`.
- Data (USLaxEvents): ran the USLaxEvents linker (limit 200); 7 missing-venue targets found, all 7 published venue addresses, resulting in 7 venues created and 7 tournament->venue links inserted.
- Data: created 4 Bay Area venues (Gunderson High School, Mission College, San Jose High School, Chabot College) and linked all 4 venues to 5 “Bay Area Roaddawgs” tournaments across May + July + August weekends (4 new venues, 20 new tournament->venue links).
- Ingest (PLL): added `scripts/ingest/link_pll_missing_venues.ts` to scrape `premierlacrosseleague.com/play/tournaments/*` pages for the “Event Location(s)” table (location + full address + directions), create venues, and link them to tournaments missing `tournament_venues`.
- Data (PLL): ran the PLL linker; 11 missing-venue targets found, all 11 published venue addresses, resulting in 13 venues created and 16 tournament->venue links inserted.
- RI UI: replaced the legacy green inline-styled header with a dark premium sticky header component (gold accent, hover underline, responsive hamburger menu) and added `/assignments` as a stable link target (redirects to `/assignors` for now).
- RI UI: adjusted the new header to match the prior layout hierarchy (larger centered logo, nav underneath) and restored the “List your tournament” CTA + account status icon (green when signed in, red when signed out).
- RI UI: increased header logo size significantly and centered nav under the logo; venues cards now use the shared `.cardWhistle` positioning (aligns the Venue icon badge with tournament cards).
- RI UI: updated the Venues page summary badges to use the same two-row layout as Tournaments (fixes the “all in one line” badge count row) and tweaked header logo padding/typography to better match TI’s nav style (no TI changes).
- RI UI: increased the perceived logo size without increasing header height by scaling the logo image (no borders/background around the logo container).
- RI UI: re-aligned the RI header to match TI’s header grid (Public Beta pill left, centered logo, right-side actions with CTA + auth links) and switched RI’s body font stack to match TI (`Inter`, then system fallbacks). No TI changes.
- RI UI: updated RI header to explicitly use the TI font stack, renamed the nav item to “Assignors” (links to `/assignors`), shifted nav slightly left under the logo, and increased the logo size without a major header height increase.
- RI UI: centered "Venues" precisely under the logo by switching the desktop nav to a 3-column grid layout, increased the perceived logo size further (still without inflating header height), and stacked the “List your tournament” CTA above the Sign up + account icon row.
- RI UI: made the RI header logo + nav centerline match the full header by switching the header grid to `1fr auto 1fr`, increased the logo size further, and made the desktop nav links bolder.
- RI UI: fixed the Public Beta pill stretching (left column is `1fr`) by constraining it to `fit-content`, and centered the account icon row underneath the “List your tournament” CTA.
- CI (smoke): fixed RI smoke test env handling so it no longer hard-requires `TI_SMOKE_INSIDER_PASSWORD` at import time (which caused "No tests found" + empty JUnit); it now prefers `RI_SMOKE_PASSWORD` and only uses TI vars as a local fallback.
- RI UI: fixed RI header nav links not being clickable/hoverable (logo transform overlap) by reducing logo scale and ensuring nav/actions are above the scaled logo via z-index.
- RI UI: increased the RI header logo size again using real dimensions (no transform) so it grows without overlapping/capturing nav clicks; header gets slightly taller but links stay interactive.
- RI UI: swapped the RI header logo to a trimmed/cropped PNG (original asset had a full-canvas faint background so it always looked small), then increased the rendered logo size so it actually appears ~2x larger.
- RI UI: shifted the RI header logo + nav centerline slightly right to better match the logo lockup optical center (uses a single CSS variable so it stays consistent).
- RI UI: centered the sport icon on RI venue cards by overriding the global tournament `.summaryIcon` positioning within `VenueCard` (icon now sits centered above the venue name).
- Assets: added `shared-assets/svg/sports/volleyball_ball_icon.svg` (volleyball standalone icon to match `hockey_puck_icon.svg`).
- RI venues: use the volleyball ball icon (`/svg/sports/volleyball_ball_icon.svg`) for volleyball venues in the venues grid + summary badges.
- RI UI: adjusted RI header logo centering independently (logo can shift without moving the nav) so the logo sits visually centered above the nav links.
- RI UI: aligned the RI header logo over the nav by constraining the logo container to the same width as the nav row (avoids “logo shift doesn’t show” when it gets covered by right-side actions).
- Ingest: added `scripts/ingest/link_tournament_venues_from_csv.ts` to import a CSV of tournament->venue mappings (checks for existing venues by state/zip + address/city or name/city, creates missing venues, and upserts `tournament_venues` links; dry-run by default, `--apply` to write).
- Ingest: added `scripts/ingest/migrate_denorm_venues_to_links.ts` to backfill normalized venue rows + `tournament_venues` links from denormalized `tournaments.venue`/`tournaments.address` (additive-only; never deletes/overwrites tournament fields; dry-run by default, supports `--apply --limit --offset`).
- Data: ran `scripts/ingest/migrate_denorm_venues_to_links.ts --limit=50 --offset=0 --apply`; created 6 venues and upserted 6 tournament->venue links (skips non-street placeholder addresses like "TBD" / "Multiple gyms").
- Data: ran `scripts/ingest/migrate_denorm_venues_to_links.ts --all --page_size=200 --apply --quiet`; targeted 290 tournaments with denormalized venue/address but no `tournament_venues` rows, matched 23 existing venues, created 28 venues, and upserted 51 tournament->venue links (skipped 73 venue entries due to non-street/placeholder addresses).
- Ingest: added `scripts/ingest/import_tournaments_from_csv.ts` to import a research CSV (dedupe via official URL or fuzzy name/city/date match), create/update tournaments, create/match venues, and upsert `tournament_venues` links (dry-run by default, `--apply` to write).
- Data: imported `southeast_tournaments_v3.csv`; created 30 tournaments, updated 7 existing tournaments, created 19 venues, matched 16 venues, and upserted 35 tournament->venue links (some tournaments had no parseable venue address so were imported without links).
- Data: linked CA tournament venues from `/tmp/ri_venue_import_ca_batch1.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 23 venues, matched 18 venues, created 26 new tournament->venue links, and found 15 links already present (10 venue entries skipped due to non-specific addresses like \"Irvine, CA\" / \"San Diego, CA\"). 
- Data: linked CA tournament venues from `/tmp/ri_venue_import_ca_batch2.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 14 venues, matched 9 venues, created 21 new tournament->venue links, and found 2 links already present (3 venue entries skipped due to incomplete addresses like missing ZIP).
- RI admin: updated the "Missing venues" dashboard widget to count published canonical tournaments with zero `tournament_venues` rows (linked venues), regardless of denormalized `tournaments.venue/address`.
- RI admin: added a "Show all users" mode on the Users tab (`/admin?tab=users&show_all=1`) to browse users without needing a search query (paginated by `users_page`).
- Data: linked WA tournament venues from `/tmp/ri_venue_import_wa_batch1.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 19 venues, matched 32 venues, created 43 new tournament->venue links, and found 8 links already present (4 venue entries skipped due to non-specific addresses like \"Centralia, WA\" / \"Seattle Metro Area, WA\"). 
- Data: linked FL tournament venues from `/tmp/ri_venue_import_fl_batch1.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 21 venues, matched 27 venues, created 33 new tournament->venue links, and found 15 links already present (16 venue entries skipped due to incomplete addresses missing ZIP like \"..., FL\"). 
- Data: linked AZ tournament venues from `/tmp/ri_venue_import_az_batch1.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 9 venues, matched 72 venues, created 60 new tournament->venue links, and found 21 links already present (25 venue entries skipped due to incomplete addresses missing ZIP like \"Flagstaff, AZ\").
- Data: linked tournament venues from `/tmp/ri_venue_import_mixed_batch1.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 20 venues, matched 6 venues, and created 26 new tournament->venue links (2 venue entries skipped due to non-specific addresses like \"Portland, OR\" / \"Salem, OR\"; most tournaments in this batch had blank venue/address fields so were skipped).
- Data: linked tournament venues from `/tmp/ri_venue_import_mixed_batch2.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 10 venues, matched 7 venues, and created 17 new tournament->venue links (1 venue entry skipped due to non-specific address like \"Seattle / Puget Sound, WA\"; most tournaments in this batch had blank venue/address fields so were skipped).
- Data: linked tournament venues from `/tmp/ri_venue_import_mixed_batch3.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 8 venues, matched 8 venues, created 15 new tournament->venue links, and found 1 link already present (1 venue entry skipped due to non-specific address like \"Centralia, WA\"; most tournaments in this batch had blank venue/address fields so were skipped).
- Ingest: fixed `scripts/ingest/link_tournament_venues_from_csv.ts` to handle venue dedupe when an existing venue is missed due to ZIP mismatch (catches unique constraint error on insert and re-selects the existing venue by the unique key fields).
- Data: linked tournament venues from `/tmp/ri_venue_import_mixed_batch4.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 10 venues, matched 21 venues, created 17 new tournament->venue links, found 14 links already present, and skipped 4 venue entries due to non-specific addresses like \"Folsom, CA\" / \"Upland, CA\" / \"Chicago, IL Region\" / \"Sandy, UT\" (note: initial run aborted on a duplicate insert and was completed after the script fix).
- Data: linked tournament venues from `/tmp/ri_venue_import_mixed_batch5.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 11 venues, matched 19 venues, and created 30 new tournament->venue links (14 venue entries skipped due to non-specific addresses like \"Detroit, MI Region\" / \"Washington State\" / \"Warren, MN\" / \"Fargo, ND\" / \"Minneapolis, MN\"; 1 tournament skipped due to venues/addresses count mismatch; 1 tournament id was not found and skipped).
- Data: linked tournament venues from `/tmp/ri_venue_import_mixed_batch6.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 6 venues, matched 31 venues, and created 37 new tournament->venue links (5 tournaments skipped due to venues/addresses count mismatch: the NWN Kennewick series had 2 venues but only 1 non-specific address \"Kennewick, WA\").
- Data: linked tournament venues from `/tmp/ri_venue_import_mixed_batch7.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 6 venues, matched 30 venues, and created 36 new tournament->venue links (1 tournament skipped due to venues/addresses count mismatch: Carlsbad Premier Cup had 2 venues but only 1 non-specific address \"Carlsbad, CA\").
- Data: linked tournament venues from `/tmp/ri_venue_import_mixed_batch8.csv` via `scripts/ingest/link_tournament_venues_from_csv.ts --apply`; created 4 venues, matched 5 venues, and created 9 new tournament->venue links (2 venue entries skipped due to non-specific addresses like \"Tampa, FL\" / \"Atlanta, GA\"; 3 tournaments skipped due to venues/addresses count mismatch where multiple venues only had one non-specific address).
- Ops: exported grouping reports for the remaining published canonical tournaments missing venue links: `/tmp/ri_missing_venues_by_domain.csv` and `/tmp/ri_missing_venues_by_sport.csv` (used to pick next scraper targets).
- Ingest: upgraded `scripts/ingest/link_sincsports_missing_venues.ts` to focus on `soccer.sincsports.com` and parse venue addresses from both `details.aspx` (Locations section) and linked `TTMore.aspx?tab=4` Field Location pages; then ran it with `--apply` (upserted 4 tournament->venue links total and created 3 new venues; most SincSports events still do not publish venue addresses on-page).
- Data: ran `scripts/ingest/migrate_denorm_venues_to_links.ts --limit=50 --offset=0 --apply`; created 6 venues and upserted 6 tournament->venue links (skips non-street placeholder addresses like "TBD" / "Multiple gyms").
## 2026-03-21

- TI Outreach: expanded outreach sport support to all `TI_SPORTS` (admin preview/reply tools, templates, typing + normalization) so campaigns can be generated per sport beyond soccer/baseball/softball.
- Ingest: added `scripts/ingest/backfill_director_emails_from_official_urls.ts` to backfill `tournament_director_email` by scraping `official_website_url` (domain allowlist; additive-only; blocks known false-positive domains like Sentry/Wix).
- Data: backfilled volleyball `tournament_director_email` coverage from 0 -> 120 using domain allowlists (including TopCourtEvents and SoCalCup parsing via 404 HTML fallback); output CSVs written under `/tmp/ti_volleyball_backfill_director_emails_*.csv`.
- Ingest: added `scripts/ingest/backfill_director_emails_playwright.ts` to support JS/Cloudflare-protected sites via Playwright (headed option), and added Cloudflare `data-cfemail` decoding.
- Data: updated Pacific Northwest Qualifier volleyball tournaments to use director email `april@pacificnwqualifier.org` and official URL `https://www.pacificnwqualifier.org/`, and linked Hub Sports Center venue (additive-only): `scripts/ingest/update_pnwq_hub_events.ts --apply`.
- RI header: replaced the header logo with a TM-white transparent PNG, then trimmed the baked-in dead space so the logo can render larger without pushing the header down.
- RI header: tightened spacing (header shell padding/gaps) and restored nav interactions (clickable links + gold underline on hover/focus).
- RI venue cards: added a volleyball sport icon (`/svg/sports/volleyball_ball_icon.svg`) and wired it up for volleyball venues.
- RI tournament detail: matched TI's sport-specific SVG background treatment for tournament detail cards for better contrast/readability.
- RI admin/ops: added local ops scripts to help clean the uploads queue (dedupe draft uploads, backfill missing fields/venues into existing tournaments, and remove/avoid placeholder venues like `TBD` and known organizer-address false positives).
- RI admin sweep: improved URL normalization and the paste/sweep flow to reduce 404s from stale source URLs and keep review queues cleaner.
- RI tournaments: refactored `/tournaments/[slug]` to use a sport-specific hero header and a separate plain-content section (cards) so long detail pages stay readable.
- RI tournaments: centered detail content cards with consistent widths (standard vs wide), and reused the sport field/court hero textures as the background surface under the plain-content section.
- RI tournaments: collapsed "Share your experience" behind a click-to-expand disclosure and widened the form area (full width) to reduce vertical scrolling.
- RI tournaments: added "Help the crew" (light/white, centered) and "Invite another referee" (mailto invite) disclosures under About; also restyled Decision Signals to match the new dark card surface.
- RI tournaments: removed the "Help the crew" white disclosure box (kept invite and the centered tournament referral CTA), and centered the tournament referral creative copy while removing the eyebrow line.

## 2026-03-22

- Chore: stopped tracking `tsconfig.tsbuildinfo` caches.
- Cross-domain admin SSO (RI -> TI): added RI-side helper to sign short-lived SSO links and wired it into RI admin pages (Outreach, TI, and Tournaments dashboard) to open TI outreach previews as the same admin user.
- TI: added `/admin/sso` route to validate the signed token, generate/verify a Supabase magiclink server-side, set the TI auth cookie, and redirect to the requested admin page; TI login now surfaces `notice=` and outreach admin redirects preserve `returnTo`.
- Supabase admin clients (RI + TI): trim URL and sanitize service role key to avoid hidden copy/paste characters.
- RI admin venues: improved duplicate candidate matching by falling back to extracting a street-like string from venue names when address fields are missing; added a safety cap on the venue pagination loop.
- Ingest/Ops: added `scripts/ingest/export_missing_tournament_venue_research.ts` (research grouping exports) and `scripts/ingest/ingest_tournament_search_csv.ts` (dry-run by default; `--apply` to upsert tournaments/venues/links from a search CSV).

## 2026-03-23

- RI admin enrichment: Apply status UX improvement — keep the row visible ~5 seconds after Apply/Delete so the status line can be read before the row disappears.
- RI enrichment apply: venue-linking now de-dupes via fingerprints, returns richer apply response fields (linked venues before/after + whether the tournament counts toward the `/admin` missing-venues tile), and handles `venue_name` missing by generating a safe fallback name to satisfy `venues.name NOT NULL`.
- Missing venues deep scan: fix bulk “skip linked” logic by chunking `tournament_venues` lookups (prevents re-scanning tournaments that already have venue links in missing-venues mode).
- Missing venues prioritization: `mode=missing_venues` now targets the true backlog (`venue IS NULL` AND `address IS NULL`) to focus the 400+ tournaments with no venue data.
- Missing venues scan quality: reduce low-quality venue candidates by ranking + filtering to require street-like addresses (drops `City, ST`-only rows and common placeholders like `TBD` / `multiple locations`), cap venue-url candidates, and expose `venue_candidates_dropped_low_quality` in the API response.
- Missing venues UI: bulk deep scan now supports “Deep scan all (N)” running batches sequentially and lets you pick batch size (25/50/etc).
- Missing venues deep scan: seed tournament-specific internal links based on the tournament name to “dig down” from hub URLs (helps sources like `https://toptiersports.net/basketball/` where multiple tournaments share the same page).
- US Club Soccer: added an enrichment helper that parses the sanctioned tournament directory to create `tournament_url_suggestions` for tournaments whose URL incorrectly points at the directory page; added a Missing Venues UI button to trigger it and review suggestions in enrichment.
- Ops: added `scripts/ops/link_venue_to_tournament.ts` to create/de-dupe a venue and link it to a tournament (used to create/link Kino South Complex to tournament `42517eeb-6c22-4d53-9b46-cff416cbcc12`).
- Ingest: added `scripts/ingest/migrate_denorm_venues_to_links.ts` to backfill normalized venue rows + `tournament_venues` links from denormalized `tournaments.venue`/`tournaments.address` (additive-only; never deletes/overwrites tournament fields; dry-run by default, supports `--apply --limit --offset`).

## 2026-03-28

- TI tournament + venue detail: added deterministic, relationship-based semantic text blocks (tournament → venues, venue → tournaments) using a shared list formatter (dedupe + Oxford comma + safe truncation + “and N more” overflow) and venue routing via `seo_slug` fallback to UUID.
- TI tournament detail: refactored to better support streaming and time-based cache hints (`revalidate = 3600`) by pushing viewer-specific work into Suspense’d server components (keeps the hero fast, avoids throwing on missing joins).
- RI admin venues: added a “Venue Enrichment CSV” uploader + API route to dry-run/apply linking (match existing venues when possible; otherwise create + link; never creates duplicate `tournament_venues` links; hard caps rows per upload).
- RI admin dashboard: fixed Owl’s Eye venue count to avoid PostgREST max-row caps (uses a set-based COUNT via `venues` + `owls_eye_runs` inner join, with a paged `owls_eye_runs` fallback).
- Ingest: `scripts/ingest/suggest_organizer_venue_candidates.ts` now loads `.env.local` automatically and defaults CSV output to `~/Downloads/organizer_venue_candidates_<timestamp>.csv` (still supports `--out=...`).
- Ingest: added `scripts/ingest/ingest_venue_enrichment_csv.ts` to ingest `tournament_uuid` + venue details from CSV, link existing venues when found, create venues only when needed, and upsert `tournament_venues` links; safely splits `A / B / C` venue+address rows into separate venues when the address list aligns; writes a report CSV to `~/Downloads/`.

## 2026-03-31

- RI enrichment: enable venue extraction + persistence from tournament pages (fixes `TBD` venues when pages include a venue list like “Fields:” with per-venue links). Venue extractor now prefers per-anchor venue/address lines and avoids turning PDF layout links into venue URLs.
- RI enrichment apply: hard-block known organizer mailing address `1529 Third St. S., Jacksonville Beach, FL 32250` from being inserted or applied as a venue candidate (prevents false venue matches). Also filters this address in draft-upload venue scan + organizer venue-candidate suggestion scripts.
- Ops: upgraded `scripts/ops/scan_draft_upload_venues.ts` to pull ballpark names + full addresses from PerfectGame `GroupedEvents.aspx?gid=...` and `Locations.aspx?event=...` pages so PGNW draft uploads can auto-fill venues from the Field Locations pages.

## 2026-04-01

- Ops (production): updated `PGNW%` draft uploads to set `official_website_url` to the corresponding PerfectGame `GroupedEvents.aspx?gid=...` link scraped from the source page (adds a stable venue source for follow-on scans): `scripts/ops/update_pgnw_official_urls.ts --apply`.
- Ops (production): scanned PerfectGame Field Locations and inserted venue/address candidates for PGNW drafts (37 venue candidates + 20 attribute candidates): `scripts/ops/scan_draft_upload_venues.ts --apply --url_contains=perfectgame.org`.
- Ops: improved draft-venue apply script to parse PerfectGame’s “street city, ST ZIP” address format (no comma after street) so high-confidence candidates can be auto-applied: `scripts/ops/apply_high_confidence_draft_venues.ts`.
- Ops (production): applied high-confidence venue candidates to fill `tournaments.venue` + `tournaments.address` for PGNW drafts and enable approve-time linking via `ensureTournamentVenueLink`.
- TI: Quick Venue Check post-submit success now includes an optional “Join Insider Free” prompt (dismissible per session), and logs analytics for prompt shown/clicked/dismissed; RI admin KPIs updated and Supabase RPC extended via `supabase/migrations/20260401_quick_check_signup_prompt_metrics.sql`.
- Supabase Security Advisor (production): cleared `security_definer_view` + `rls_disabled_in_public` findings by enabling RLS for assignor/enrichment support tables and switching public-facing views to `security_invoker=true` via migrations `supabase/migrations/20260401_assignor_and_enrichment_rls_hardening.sql` and `supabase/migrations/20260401_view_security_invoker_hardening.sql` (linter re-run shows no errors).
- RI admin venues duplicates: improve duplicate grouping for venues whose ingest format puts an address blob in the name (e.g. `Venue • 123 Main St, City, ST 12345`) by extracting/deriving city/state/zip for fingerprint checks: `apps/referee/app/admin/venues/page.tsx`.
- RI admin venues merge: after moving tournament links to the merge target, also delete old `tournament_venues` rows for the source venue so recent-links doesn’t show duplicates and source deletes don’t trip FK constraints: `apps/referee/app/api/admin/venues/merge/route.ts`.
- Ops (production): rebuilt Owl’s Eye persisted venue-duplicate suspects (`owls_eye_venue_duplicate_suspects`) and repopulated WA suspect pairs to refresh `/admin/venues?duplicates=1`: `scripts/ops/rebuild_owls_eye_venue_duplicate_suspects.ts --state=WA --apply`.
- Ops (production): repopulated Owl’s Eye venue-duplicate suspects for additional high-volume states (CA/FL/TX/AZ) to refresh `/admin/venues?duplicates=1` as venue merges progress: `scripts/ops/rebuild_owls_eye_venue_duplicate_suspects.ts --state=CA|FL|TX|AZ --apply`.
- Owl’s Eye duplicate suspects: add missing `updated_at` column + safe updated_at trigger migration so suspect-pair updates don’t error (`supabase/migrations/20260401_owls_eye_venue_duplicate_suspects_updated_at.sql`). Also make the rebuild script fall back to inserts-only when `updated_at` is missing.
- RI admin venues duplicates: add batch merge UI within each duplicate group (pick target, multi-select sources, merge sequentially w/ progress) to reduce friction when groups have 3–9 candidate venues: `apps/referee/components/admin/VenuesListClient.tsx`.
- RI admin venues: avoid full page reload after merges; keep state in-place and show a “Refresh page data” banner when other sections may be stale: `apps/referee/components/admin/VenuesListClient.tsx`.
- RI admin tournaments dashboard: fix “Venues with Owl’s Eye” tile returning `0` when the scoped tournament/venue id sets are large by chunking PostgREST `.in(...)` filters (prevents URL-length / request-limit failures): `apps/referee/app/admin/tournaments/dashboard/page.tsx`.
- RI admin venues duplicates: fix linked-tournament and Owl’s Eye run counts still showing `0` in some environments by aligning pagination step size with PostgREST’s common 1000-row cap (prevents offset skipping): `apps/referee/app/admin/venues/page.tsx`.
- Ops (production): ingested a small batch of fastpitch/softball tournaments + venues from CSV (de-dupe safe: matches existing tournaments/venues when possible; creates new venues only with full street/city/state addresses; links via `tournament_venues`; leaves “multiple complexes / city-only” venue rows unlinked): `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs`.
- Ops (production): ingested a second batch of fastpitch/softball tournaments + venues from CSV (NC/NV/CO/SD/RI), reusing existing venues by address and linking all rows with full street/city/state addresses (40 tournament↔venue links): `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs`.
- Ops (production): ingested a third “high confidence” softball CSV batch (created 11 tournaments, updated 11, created 30 venues, linked 67 tournament↔venue rows): `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs`.
- Ops (production): ingested a small multi-sport CSV batch (UT/NH/ME/AK/DC) with per-row venue linking (created 16 tournaments, updated 10, created 12 venues, linked 26 tournament↔venue rows): `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs`.
- Ops (production): ingested “venue-first enrichment” CSV batch (DC/ME/AK/NH/UT) with explicit `state` + `sport` columns (created 16 tournaments, updated 6, created 19 venues, linked 28 tournament↔venue rows): `scripts/ops/ingest_tournaments_and_venues_from_csv.mjs`.
- RI admin tournament uploads: make tournament names clickable (opens `official_website_url` or `source_url` in a new tab) to speed up verification during approvals: `apps/referee/app/admin/page.tsx`.
- Owl’s Eye: filter out residential-style “hotel” results (mobile homes, private rooms/bedrooms, guest suites, apartments) so Places API doesn’t surface rentals as nearby hotels. Added purge script and removed 65 existing bad hotel rows from `owls_eye_nearby_food`: `apps/referee/src/owlseye/nearby/upsertNearbyForRun.ts`, `scripts/ops/purge_owlseye_residential_nearby_places.mjs`.

## 2026-04-02

- Supabase: add deterministic primary-venue flag to `tournament_venues` (`is_primary`) with a partial unique index enforcing at most one primary per tournament, and a follow-up migration to fix an earlier incorrect unique index that could block multiple venues per tournament: `supabase/migrations/20260402_tournament_venues_primary.sql`, `supabase/migrations/20260402_tournament_venues_primary_fix_index.sql`.
- Supabase: add `tournament_venues.is_inferred` guardrail so probabilistic links can exist without contaminating confirmed/default behavior; add confirmed-only indexes and update missing-venues + admin dashboard tiles to count only confirmed links: `supabase/migrations/20260402_tournament_venues_inferred_flag.sql`.
- Supabase (venue inference v1): add inference metadata columns + feedback memory table, confirmed-only city/state/sport venue-history materialized view, refresh helper, conservative candidate selection, dry-run apply, and admin promote/reject helpers: `supabase/migrations/20260402_venue_inference_01_metadata_and_feedback.sql`, `supabase/migrations/20260402_venue_inference_02_city_state_sport_venue_clusters_mv.sql`, `supabase/migrations/20260402_venue_inference_03_city_state_sport_venue_clusters_refresh_rpc.sql`, `supabase/migrations/20260402_venue_inference_04_candidates_and_admin_helpers.sql`.
- Supabase (venue inference v1): harden `apply_inferred_venue_candidates` across environments by resolving PL/pgSQL identifier ambiguity and dynamically upserting against the actual `(tournament_id, venue_id)` unique/PK constraint (avoids duplicate key errors in envs with a separate unique constraint): `supabase/migrations/20260402_venue_inference_05_apply_inferred_venue_candidates_fix.sql`, `supabase/migrations/20260402_venue_inference_06_apply_inferred_conflict_target_fix.sql`, `supabase/migrations/20260402_venue_inference_07_apply_inferred_dynamic_conflict_constraint.sql`.
- RI admin tournaments enrichment: add an “Inferred venues” panel with load/refresh and per-venue Promote/Reject actions wired to RPCs via admin-only API routes: `apps/referee/app/admin/tournaments/enrichment/EnrichmentClient.tsx`, `apps/referee/app/api/admin/tournaments/enrichment/inferred-links/route.ts`, `apps/referee/app/api/admin/tournaments/enrichment/inferred/promote/route.ts`, `apps/referee/app/api/admin/tournaments/enrichment/inferred/reject/route.ts`.
- RI admin tournament uploads: add a “Draft venue inference (uploads)” panel to preview/apply inferred links for draft uploads (writes `is_inferred=true` only; promote/reject uses the same admin RPCs). Includes draft-only inference RPCs + an admin-only API route: `supabase/migrations/20260402_venue_inference_08_draft_upload_candidates_and_apply.sql`, `apps/referee/app/api/admin/tournaments/uploads/inferred/route.ts`, `apps/referee/components/admin/UploadsVenueInferencePanel.tsx`, `apps/referee/app/admin/page.tsx`.
- RI enrichment fees/venue scraper: add per-run venue reason breakdown + low-score drop counts, prioritize crawling “Fields/Locations/Venues” links during fetch, and attach `reason=...; score=...;` evidence + confidence on inserted `tournament_venue_candidates`: `apps/referee/app/api/admin/tournaments/enrichment/fees-venue/route.ts`, `apps/referee/app/admin/tournaments/enrichment/EnrichmentClient.tsx`.
- Enrichment run notes (fees/venue scrape): venue reasons `page_text_address=70`, `map_link=2`, `jsonld_location=2`; recent findings: PURE SOFTBALL [`team_fee`], 2026 Wellesley Memorial Day Tournament [`team_fee`, `address`, `venue_candidates`], Sparks Invitational [`team_fee`, `games_guaranteed`, `venue_candidates`], AVC Dallas 11s–17s (non-qualifier) [`team_fee`, `address`, `venue_candidates`], Swinging for Mom [`team_fee`, `games_guaranteed`, `venue_candidates`], Midwest Madness Showcase [`team_fee`], Turf Wars [`team_fee`].
- Missing venues tool: added `status` toggle to include draft uploads backlog, and threaded `status=draft` through deep scan + export; introduced `public.list_missing_venue_link_tournaments_v2(...)`: `supabase/migrations/20260402_missing_venues_include_drafts.sql`, `apps/referee/app/admin/tournaments/missing-venues/page.tsx`, `apps/referee/app/admin/tournaments/missing-venues/BulkDeepScanButton.tsx`, `apps/referee/app/api/admin/tournaments/missing-venues/export/route.ts`.
- Missing venues tool: added an inline “migration not applied / reload schema cache” hint when `list_missing_venue_link_tournaments_v2` is missing from the PostgREST schema cache; export falls back to v1 RPC for `published` mode if v2 isn’t deployed yet: `apps/referee/app/admin/tournaments/missing-venues/page.tsx`, `apps/referee/app/api/admin/tournaments/missing-venues/export/route.ts`.
- RI admin venues: added quick link from `/admin/venues` to the Missing Venues tool: `apps/referee/app/admin/venues/page.tsx`.
- Enrichment apply: surface a clearer error when an environment has the misconfigured `tournament_venues_one_primary_per_tournament_idx` unique index (non-partial) and recommend applying `supabase/migrations/20260402_tournament_venues_primary_fix_index.sql`; also explicitly sets `is_primary=false` on new links: `apps/referee/app/api/admin/tournaments/enrichment/apply/route.ts`.
- RI admin venues merge: when merges fail due to the same misconfigured `tournament_venues_one_primary_per_tournament_idx` index, return a clearer error with migration + “reload schema” instructions instead of the raw PG constraint error: `apps/referee/app/api/admin/venues/merge/route.ts`.
- DB recovery: add `public.repair_tournament_venues_primary_index_v1(p_reload_schema boolean)` (service-role only) to automatically drop/recreate the `tournament_venues_one_primary_per_tournament_idx` partial unique index if it’s misconfigured, normalize multiple primaries, and optionally trigger `NOTIFY pgrst, 'reload schema'`: `supabase/migrations/20260403_repair_tournament_venues_primary_index_rpc.sql`.
- Admin recovery: `enrichment/apply` and `venues/merge` now attempt to call the repair RPC and retry once when they hit the misconfigured primary-index error (reduces manual “apply migration + reload schema” friction): `apps/referee/app/api/admin/tournaments/enrichment/apply/route.ts`, `apps/referee/app/api/admin/venues/merge/route.ts`.
- Venues merge: preserve `tournament_venues` link metadata (incl `is_inferred` + inference fields) and explicitly set `is_primary` (never rely on DB defaults), keeping primary only when the source link was primary and no other primary exists for that tournament: `apps/referee/app/api/admin/venues/merge/route.ts`. Also harden the repair RPC to force `is_primary default false` even in legacy envs: `supabase/migrations/20260403_repair_tournament_venues_primary_index_rpc.sql`.
- Venues merge: when moving links, never set `is_primary=true` during the upsert (avoids primary-index violations); instead promote the target link afterward only if the tournament has no existing primary using `public.set_primary_venue_for_tournaments_if_missing_v1(...)`: `supabase/migrations/20260403_set_primary_venue_if_missing_rpc.sql`, `apps/referee/app/api/admin/venues/merge/route.ts`.
- Fees/venue scrape: expanded `isJunkVenueName` filtering to drop candidates that are clearly site chrome (policies/terms/login/leagueapps/etc) so “Venue” candidates don’t show long navigation/footer strings: `apps/referee/app/api/admin/tournaments/enrichment/fees-venue/route.ts`.
- TI ops: added run logging for the scheduled admin dashboard email cron (records dry-run/sent + recipients/subject + ok/error): `supabase/migrations/20260403_ti_admin_dashboard_email_runs.sql`, `apps/ti-web/app/api/cron/admin-dashboard-email/route.ts`.
- TI web: added redirects for common 404 crawl noise (`/favicon.ico` → `/ti-logo.png`, `/pricing` → `/#pricing`, legacy `/venue` → `/venues`): `apps/ti-web/app/favicon.ico/route.ts`, `apps/ti-web/app/pricing/page.tsx`, `apps/ti-web/app/venue/page.tsx`.
- TI web: best-effort resolver for legacy address-style venue slugs (e.g. `/venues/425-woodward-st-austin-tx`) by looking up venues by `state` + address tokens and redirecting to the canonical `seo_slug`/UUID URL: `apps/ti-web/app/venues/[venueId]/page.tsx`.
- TI tournaments: increased sport hub pagination cap from 20→60 pages so high-volume sports (e.g. soccer) don’t silently drop tournaments past the first 1000 results: `apps/ti-web/app/tournaments/_lib/getSportHubTournaments.ts`.
