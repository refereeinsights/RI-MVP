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
