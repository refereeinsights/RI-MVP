## Monorepo Structure
### Key files
- `package.json` (root scripts: smoke, seed, ops aliases)
- `playwright.smoke.config.ts` (smoke runner, loads env from repo + app roots)
- `apps/referee/app/admin/**` (RefereeInsights admin UI routes)
- `apps/referee/app/api/admin/**` (RefereeInsights admin API routes)
- `apps/referee/lib/admin.ts` (`requireAdmin()` and many admin server helpers)
- `apps/referee/lib/trackExternalCall.ts` (external API call tracking constants + wrapper)
- `apps/ti-web/app/admin/**` (TournamentInsights admin UI routes)
- `apps/ti-web/app/planner/**` (TournamentInsights planner route + APIs; `/planner` is a compatibility alias and should redirect)
- `apps/ti-web/app/weekend-planner/**` (canonical Weekend Planner entrypoint at `/weekend-planner`)
- `apps/ti-web/app/_components/planner/**` (shared planner UI components, imported by `/weekend-planner`)
- `apps/ti-web/lib/outreachAdmin.ts` (`requireTiOutreachAdmin()` gate for TI admin pages)
- `apps/ti-web/lib/trackExternalCall.ts` (TI external API call tracking constants + wrapper)
- `supabase/migrations/**` (DB schema: tables/views/functions/RPCs used by admin and ops)
- `scripts/ops/**` (ops scripts that mutate or audit Supabase data)

This monorepo contains two Next.js App Router apps plus Supabase migrations and ops scripts:
- `apps/referee` = RefereeInsights (RI) + the primary **admin UI** and **admin APIs** (`/admin/**`, `/api/admin/**`).
- `apps/ti-web` = TournamentInsights (TI) public site plus a small TI admin surface (`/admin/**`) primarily gated by an email allowlist.
- `supabase/migrations` = the schema source of truth (tables/views/functions/RPCs).
- `scripts/ops` and `scripts/ingest` = operational scripts that use service-role DB access.

Service role usage pattern:
- Server-side admin features typically use `supabaseAdmin` (service role client) to bypass RLS and read/write privileged tables.
- End-user features use a cookie-based server client (`createSupabaseServerClient()`) and are constrained by RLS.

---

## TI Planner (Stage 1)
### User routes
- `/weekend-planner` → `apps/ti-web/app/weekend-planner/page.tsx` (canonical Weekend Planner app entrypoint; shows planner for signed-in users)
- `/planner` → `apps/ti-web/app/planner/page.tsx` (compatibility alias; should redirect to `/weekend-planner`)

### Shared planner UI
- Shared planner UI client: `apps/ti-web/app/_components/planner/PlannerClient.tsx` (imported by `/weekend-planner`)

### DB migration
- `supabase/migrations/20260526_ti_planner_stage1.sql`
  - Tables: `planner_events`, `planner_weekends`, `planner_event_sources`, `planner_event_venue_matches`, `planner_user_preferences`, `planner_calendar_feeds`
  - All tables are RLS user-owned; `planner_event_venue_matches` is owned via parent event (`EXISTS` policy join to `planner_events`)
- `supabase/migrations/20260526_ti_planner_stage1_stage2_ready.sql`
  - Adds `planner_events.source_event_uid` for Stage 2 ICS/iCal mapping
  - Adds index `planner_events_source_uid_idx` on `(user_id, source_id, source_event_uid)` for idempotent upserts

### APIs
- `POST /api/planner/events` → `apps/ti-web/app/api/planner/events/route.ts`
- `PATCH|DELETE /api/planner/events/[id]` → `apps/ti-web/app/api/planner/events/[id]/route.ts`
- `POST /api/planner/events/[id]/duplicate` → `apps/ti-web/app/api/planner/events/[id]/duplicate/route.ts`

Note: Route consolidation in progress — `/weekend-planner` is the canonical planner entrypoint, and `/planner` should redirect to it. The legacy `/weekend-planner` “hub” content is now signed-out/secondary utility content.

## TI Planner (Stage 2 — ICS/iCal import MVP)
### DB migrations
- `supabase/migrations/20260526_ti_planner_stage2_sources_unique_url.sql`
  - Unique ICS sources per user: `(user_id, source_type, source_url)` (prevents duplicate “Synced calendars” entries for the same link).
- `supabase/migrations/20260528_ti_planner_stage2_sources_unique_url_full.sql`
  - Fixes Postgres `ON CONFLICT` compatibility for Supabase upserts by ensuring a non-partial unique index exists on `(user_id, source_type, source_url)`.
- `supabase/migrations/20260526_ti_planner_stage2_ics_unique_uid.sql`
  - Unique event identity per source: `(user_id, source_id, source_event_uid)` where `source_event_uid IS NOT NULL` (required for safe refresh dedupe).
- `supabase/migrations/20260527_ti_planner_public_search_surfaces.sql`
  - Adds authenticated-only read views for planner search:
    - `public.venues_public`
    - `public.tournaments_search_public`
  - Base tables remain admin-only under RLS; views are not granted to `anon`/`public`.
- `supabase/migrations/20260528_ti_planner_stage2_4b_event_suppressions.sql`
  - Stage 2.4B: adds `planner_event_suppressions` (RLS) for refresh-proof hiding of source-linked duplicates by `(user_id, source_id, source_event_uid)`.
- `supabase/migrations/20260528_ti_planner_stage2_4c_duplicate_dismissals.sql`
  - Stage 2.4C: adds `planner_event_duplicate_dismissals` (RLS) for “Keep separate” persistence (dismisses suggestions; does not hide events).

### APIs
- `POST /api/planner/sources/import-ics` → `apps/ti-web/app/api/planner/sources/import-ics/route.ts`
- `POST /api/planner/sources/[id]/refresh` → `apps/ti-web/app/api/planner/sources/[id]/refresh/route.ts`
- `GET /api/planner/sources` → `apps/ti-web/app/api/planner/sources/route.ts`
- `GET /api/planner/search/venues?q=` → `apps/ti-web/app/api/planner/search/venues/route.ts`
- `GET /api/planner/search/tournaments?q=` → `apps/ti-web/app/api/planner/search/tournaments/route.ts`
- `GET /api/planner/timezone?venue_id=...|tournament_id=...|lat=...&lng=...` → `apps/ti-web/app/api/planner/timezone/route.ts` (Stage 2.6A; server-only TimeZoneDB lookup)
- `POST /api/planner/events/duplicates/dismiss` → `apps/ti-web/app/api/planner/events/duplicates/dismiss/route.ts`
- `GET /api/planner/events/duplicates/dismissed` → `apps/ti-web/app/api/planner/events/duplicates/dismissed/route.ts`
- `POST /api/planner/events/merge` → `apps/ti-web/app/api/planner/events/merge/route.ts` (Stage 2.4D; server-only; UI merge remains disabled)

### Implementation notes
- Server-only parsing uses `node-ical` via `apps/ti-web/lib/planner/ics-import.ts` with `ical.parseICS(icsText)` (do not use `ical.fromURL()`; SSRF protections live in our fetch path).
- Import window: 30 days in the past → ~18 months in the future.
- Refresh behavior: inserts new events and updates source-managed fields; does not delete missing events yet; does not overwrite `venue_id` or non-empty `notes`.
- Stage 2.3: refresh returns a user-safe summary including `changed` count and a capped `changedEvents` list for UI display.
- Stage 2.4B: `GET /api/planner/events` filters suppressed ICS events for `reason='merged_duplicate'` (read-time filtering; does not delete rows).
- Stage 2.4C: “Keep separate” persists dismissed pairs and prevents repeated duplicate prompts; it does not hide events.
- Stage 2.4D:
  - `GET /api/planner/events` returns truncation metadata (`truncated`, `limit`) so the UI can disclose when duplicate suggestions only consider loaded events.
  - `POST /api/planner/events/merge` creates a new canonical manual event and suppresses eligible ICS originals using `planner_event_suppressions` (`reason='merged_duplicate'`).
  - Manual originals are not suppressed in Stage 2.4D due to the current `planner_event_suppressions` constraint requiring `source_id` + `source_event_uid` for `merged_duplicate`.
- Stage 2.4E: Planner UI wires duplicate suggestion Merge buttons to a confirmation modal that calls the merge endpoint after explicit confirmation (no one-click merge).
- Stage 2.4F (prompt drafted): optional manual-original cleanup after merge (manual-only, explicit confirmation; reuses existing delete API; no ICS deletion).
- Stage 2.6A: manual event create/edit uses date+time pickers and tz-aware serialization. The UI resolves timezone from venue/tournament coordinates via `GET /api/planner/timezone` (TimeZoneDB server-side; falls back to browser tz). No timezone is persisted back onto venue/tournament tables in this stage.
- Stage 2.6B: loaded-event schedule conflict highlighting is client-only (no new APIs). Conflicts are computed from currently loaded events using stored UTC `starts_at/ends_at` (with a display-only 60-minute fallback for missing `ends_at`). Back-to-back events (end == start) are not flagged.
- Stage 2.6C: schedule-first UX pass (no schema changes). Default view is Upcoming (next 30 days), Add manual event is collapsed by default, Connected calendars are summarized with an optional Manage expansion, and the Weekend Pro upsell is dismissible for the current session so it does not block schedule scanning.
- Stage 2.6D: Season calendar view (Schedule‑X, client-only). Adds `Calendar | List` toggle in Season, stable source-based color coding (manual = gray), and a session-only timezone override (browser tz default; UTC fallback). Calendar consumes the already-loaded event list and performs no additional planner events fetches. UX polish: schedule block appears earlier, loaded-scope disclosure appears once under the toggle, calendar jumps to first month with loaded events, and the timezone control is a compact badge + `Change` affordance.
- Stage 2.6D calendar visual polish: Schedule‑X uses the shadcn theme + scoped TI color variables; view options reduced to Month Grid + Month Agenda; timezone badge uses a globe icon; per-source legend shows safe labels (Manual / Imported calendar N); detail panel typography tightened.
- Stage 2.6D calendar follow-up polish: calendar opens to the first month containing loaded events; Schedule‑X header date picker is hidden; desktop view dropdown is hidden; overlaps notice is shown below `Calendar | List` with calmer styling.
- Stage 2.6E (SAFE v1.x): entitlement alignment for planner calendar aggregation.
  - Insider users can connect 1 ICS feed; `POST /api/planner/sources/import-ics` returns 403 `calendar_feed_limit_reached` for a second feed.
  - Unverified users get 403 `email_verification_required` when attempting ICS import.
  - Season visual calendar (Schedule‑X) is Weekend Pro only; Insider users see a locked card and continue with Season List.
- Stage 2.6D calendar grid polish: grid background softened to near-white (`--sx-color-background: #fbfcfd`); grid lines lightened (`--sx-color-outline-variant: #e9ecef`); day-of-week header row (`.sx__month-grid-week:first-child`) given a green-50 gradient with matching bottom border. Pure CSS, scoped to `.sxWrapper`.
- Stage 2.6D calendar header + column gradients: custom Mon–Sun header bar rendered in `PlannerCalendar.tsx` above the SX grid (green gradient, SAT/SUN at 70% opacity); SX's internal day-name labels hidden; SX outer border/radius stripped and replaced by a `calendarFrame` container; weekday columns (1–5) get a cool-to-white gradient, weekend columns (6–7) get a green-50 gradient.
- Global `Calendar | List` display-mode toggle (2026-05-31):
  - Toggle is now visible for all three timeframe views (Upcoming, This Weekend, Season) on page load. Previously Season-only.
  - Default is always `list`. Paid users (`canUseCalendar = props.isPaid`) see both buttons; non-paid users see the Weekend Pro upgrade card only in Season view.
  - Internal renames: `seasonDisplayMode` → `displayMode`, `seasonDisplayTouched` → `displayModeTouched`, `canUseSeasonCalendar` → `canUseCalendar`, `SeasonDisplayMode` → `DisplayMode`.
  - Three auto-default effects collapsed into one: reverts to list on entitlement revoke only (no longer auto-switches to calendar on view change).
  - `PlannerCalendar` gains `scheduleView` prop; Upcoming calendar constrains next-month nav to the loaded 30-day window.
  - `planner_view_toggle_clicked` analytics payload gains `toggle_type: "display_mode"`.
- Stage 2.6D calendar bug fixes (2026-05-31):
  - `onRangeUpdate` label bug: was reading `range.start` (first day of first visible week row) to set the nav bar month/year label. Months that don't start on Monday caused a one-month-off label (e.g. July 2026 starts Wed → first row = Jun 29 → label showed "June"). Fixed: read `controls.getDate()` which returns the canonical displayed month.
  - `eventsService` not reactive: events were only seeded at `useNextCalendarApp` initialization; no `useEffect` kept `eventsService` in sync after mount. Added `useEffect(() => { eventsService.set(sxEvents) }, [sxEvents, eventsService])`.
- Stage 2.6D calendar nav + zoom polish (2026-05-31):
  - Custom `calendarNavBar` (prev/next month + week-zoom) replaces SX's built-in `.sx__calendar-header` (hidden). Month/year label driven by `displayedMonth` state via `onRangeUpdate` + `onRender` seed. Month navigation uses `controls.getDate()` / `controls.setDate()`.
  - Week-zoom control: `weeksToShow` state (default 6, range 1–6); CSS var `--calendar-weeks-visible` passed inline on `.sxWrapper`; `.sx__month-grid-wrapper` clips to `calc(var(...) * 90px)` with a 0.2s ease transition.
  - Alternating week-row gradients: even rows use slightly cooler weekday (`#edf0f3 → #f6f8fa`) and deeper weekend (`#ddf0e7 → #e8faf0`) gradients vs. odd rows; targets `.sx__month-grid-week:nth-child(even) .sx__month-grid-day:nth-child(N)` to override at cell level.
  - Consistent day cell height: `min-height: 80px` on `.sx__month-grid-day` prevents empty cells collapsing.
  - Day number underline: `border-bottom: 1px solid #e2e8f0` on `.sx__month-grid-day__header-date`; green (`#15803d`) for today.
  - Removed fixed `height: 600px` / `height: 400px` from `.sxWrapper` so grid sizes naturally to its content.
- Weekend Planner bottom-section cleanup: removed repetitive “planning tools”/empty-state blocks below the schedule so the page ends with the travel widgets + share link + affiliate disclosure (no duplicate Browse/Search/Add CTAs).
- Stage 2.5: `GET /api/planner/events` supports bounded cursor pagination (stable order by `starts_at, id`) and returns `hasMore` + `nextCursor` so the UI can load additional season events without unbounded queries. While `hasMore=true`, duplicate suggestions are disclosed as “loaded events only”.
- Safety: planner events returned by `GET /api/planner/events` treat any row with `(source_id, source_event_uid)` as source-linked/ICS for suppression + UI labeling, even if `source_type` was accidentally persisted incorrectly in older data.
- `GET /api/planner/sources` returns source metadata only (does not return `source_url`).
- Planner search routes are authenticated and query only the views (`venues_public`, `tournaments_search_public`), not base tables.
- SSRF: URL scheme/host checks + DNS lookup + manual redirect chaining; DNS rebinding remains a known limitation with native `fetch` (acceptable for MVP; tighten later with an agent-based approach if needed).
- Production-only UAT framework (no staging DB): `docs/weekend-planner-uat.md` (UAT accounts, hosted fixture strategy, cleanup SQL templates scoped by UAT user UUIDs) + Stage 2 checklist `docs/qa/ti-planner-ics-uat.md`.
- ICS fixtures for hosting/docs live under `apps/ti-web/lib/planner/__fixtures__/`.
- Import UX: after a successful import, the modal shows a success summary and switches the secondary action to “Done”.
- UAT fixture note: `apps/ti-web/public/uat-fixtures/planner/test-calendar-conflict-uid.ics` intentionally overlaps `test-calendar-initial.ics` but uses a different ICS `UID`, to verify duplicate suggestions are not UID-dependent.

## TI Planner (Stage 2.7 — UAT hardening + typed analytics)

- Prompt: `docs/prompts/ti-planner-stage-2.7-uat-hardening-typed-analytics.md`
- Post-UAT snapshot prompt: `docs/prompts/ti-planner-stage-2.7b-post-uat-snapshot.md`
- Current state snapshot: `docs/weekend-planner-current-state.md`
- Typed event names: `apps/ti-web/lib/tiAnalyticsEvents.ts`
- Analytics ingestion + allowlist persistence: `apps/ti-web/app/api/analytics/route.ts`
  - Stage 2.7 planner events are allowlisted in `PLANNER_EVENTS` and persisted to `public.ti_map_events` (same storage as map/travel analytics).
- Admin review surface: `apps/referee/app/admin/ti/clicks/page.tsx`

## TI Planner (Stage 2.8 — UAT findings polish + launch readiness)

- Prompt: `docs/prompts/ti-planner-stage-2.8-uat-polish-launch-readiness.md`
- UAT runner checklist: `CLAUDE.md` (see “Stage 2.8 UAT (polish + launch readiness)” section)

## TI Planner (Stage 2.1 — Local-first venue-aware polish)
- Events remain valid with only `title`, `starts_at`, and `event_type`; venue/tournament/location remain optional.
- Planner UI supports optional venue linking via “Find venue” and never exposes raw UUIDs to end users.
- Venue/tournament reads in end-user planner code must use the authenticated-only views (`venues_public`, `tournaments_search_public`) via planner search routes; do not query base tables directly under RLS.
- Maps: show a “Map” action only when a usable location string exists; use a simple external maps search URL (no new geocoding services).

## Weekend Planner routing (consolidation)
- Canonical route for the planner app experience: `/weekend-planner`.
- Compatibility alias: `/planner` redirects to `/weekend-planner` (preserves allowlisted query params like `view`/`import`).
- During consolidation + UAT, the primary header nav may hide the Weekend Planner link; direct access via `/weekend-planner` remains supported.

## TI Auth (logout)
- Canonical signout route: `/logout` → `apps/ti-web/app/logout/route.ts`
- Compatibility alias: `/account/logout` redirects to `/logout` → `apps/ti-web/app/account/logout/route.ts`

---

## TI SEO landing pages (tournaments)

- June 2026 landing page: `/youth-sports-tournaments/june-2026`
  - Canonical URL: `/youth-sports-tournaments/june-2026` (any alias should 301 redirect).
  - Default scope: June 2026 (`start_date >= 2026-06-01` and `start_date < 2026-07-01`).
  - Headline tournament count uses a count-only aggregate query (do not use bounded list length like `results.length` from `/tournaments`).
  - Filtered variants (sports/state/q/date chips/etc.) should canonicalize back to the base June URL and use `noindex,follow` unless explicitly approved for indexing.

## TI Planner (Stage 2.2 — Season Planner Reliability)
- Adds a “This Weekend” / “Season” lens toggle with season range presets and lightweight type filters (mobile-first; no month grid).
- `GET /api/planner/events` supports optional query params for ranged queries:
  - `from` (inclusive), `to` (exclusive), `types`, `limit`, `includePast`.
- Adds server-side duplicate action for manual events:
  - `POST /api/planner/events/[id]/duplicate` (copies safe fields; resets source fields to manual/null).

## Admin Routes
### Key files
- RefereeInsights admin routes: `apps/referee/app/admin/**`
- RefereeInsights admin APIs: `apps/referee/app/api/admin/**`
- TournamentInsights admin routes: `apps/ti-web/app/admin/**`
- RefereeInsights auth gate: `apps/referee/lib/admin.ts` (`requireAdmin()`)
- TournamentInsights auth gate: `apps/ti-web/lib/outreachAdmin.ts` (`requireTiOutreachAdmin()`)

### RefereeInsights admin UI (Next.js App Router)
Admin page routes are implemented as `page.tsx` under `apps/referee/app/admin/**`. All call `await requireAdmin()`.

**Top-level:**
- `/admin` → `apps/referee/app/admin/page.tsx`
- `/admin/login` → `apps/referee/app/admin/login/page.tsx`
- `/admin/api-usage` → `apps/referee/app/admin/api-usage/page.tsx`
- `/admin/owls-eye` → `apps/referee/app/admin/owls-eye/page.tsx` — Owl's Eye batch enrichment control panel; triggers venue enrichment runs

**TI admin (under RI app):**
- `/admin/ti` → `apps/referee/app/admin/ti/page.tsx`
- `/admin/ti/clicks` → `apps/referee/app/admin/ti/clicks/page.tsx` — analytics event counts, top-viewed tournaments/venues, dimension snapshots, outbound click tiles
- `/admin/ti/revenue` → `apps/referee/app/admin/ti/revenue/page.tsx` — hotels/vrbo/partner outbound click revenue metrics
- `/admin/ti/outbound` → `apps/referee/app/admin/ti/outbound/page.tsx` — outbound link inspection
- `/admin/ti/static-maps` → `apps/referee/app/admin/ti/static-maps/page.tsx` — static map generation status and runner
- `/admin/ti/seasons` → `apps/referee/app/admin/ti/seasons/page.tsx` — season scan management
- `/admin/ti/quality` → `apps/referee/app/admin/ti/quality/page.tsx` — TI data quality checks
- `/admin/ti/discovery` → `apps/referee/app/admin/ti/discovery/page.tsx` — tournament discovery workflow (v1)

**Venues:**
- `/admin/venues` → `apps/referee/app/admin/venues/page.tsx` — venue list/search
- `/admin/venues/[id]` → `apps/referee/app/admin/venues/[id]/page.tsx` — venue detail/edit
- `/admin/venues/new` → `apps/referee/app/admin/venues/new/page.tsx` — create venue
- `/admin/venues/import` → `apps/referee/app/admin/venues/import/page.tsx` — bulk CSV import
- `/admin/venues/field-maps` → `apps/referee/app/admin/venues/field-maps/page.tsx` — field map index
- `/admin/venues/field-maps/[venue_id]` → `apps/referee/app/admin/venues/field-maps/[venue_id]/page.tsx` — per-venue field map editor
- `/admin/venues/link-quality` → `apps/referee/app/admin/venues/link-quality/page.tsx` — suspicious/broken venue URL audit
- `/admin/venues/sweep` → `apps/referee/app/admin/venues/sweep/page.tsx` — venue duplicate sweep

**Tournaments:**
- `/admin/tournaments/dashboard` → `apps/referee/app/admin/tournaments/dashboard/page.tsx` — tournament health/validation summary
- `/admin/tournaments/enrichment` → `apps/referee/app/admin/tournaments/enrichment/page.tsx` — tournament enrichment queue and runner
- `/admin/tournaments/missing-venues` → `apps/referee/app/admin/tournaments/missing-venues/page.tsx` — tournaments without venue links
- `/admin/tournaments/discover-to-queue` → `apps/referee/app/admin/tournaments/discover-to-queue/page.tsx` — feed discovery → queue workflow
- `/admin/tournaments/sources` → `apps/referee/app/admin/tournaments/sources/page.tsx` — tournament source management
- `/admin/tournaments/sources/discover` → `apps/referee/app/admin/tournaments/sources/discover/page.tsx` — source discovery runner
- `/admin/tournaments/staff-verification-queue` → `apps/referee/app/admin/tournaments/staff-verification-queue/page.tsx` — staff upload review
- `/admin/tournaments/claims` → `apps/referee/app/admin/tournaments/claims/page.tsx` — tournament claim review
- `/admin/tournaments/validation` → `apps/referee/app/admin/tournaments/validation/page.tsx` — validation rule results
- `/admin/tournaments/validation/rules` → `apps/referee/app/admin/tournaments/validation/rules/page.tsx` — validation rule config
- `/admin/tournaments/tourney-export` → `apps/referee/app/admin/tournaments/tourney-export/page.tsx` — tournament data export

**Assignors:**
- `/admin/assignors` → `apps/referee/app/admin/assignors/page.tsx`
- `/admin/assignors/[id]` → `apps/referee/app/admin/assignors/[id]/page.tsx`
- `/admin/assignors/review` → `apps/referee/app/admin/assignors/review/page.tsx`
- `/admin/assignors/sources` → `apps/referee/app/admin/assignors/sources/page.tsx`
- `/admin/assignors/zip-missing` → `apps/referee/app/admin/assignors/zip-missing/page.tsx`

**Outreach:**
- `/admin/outreach` → `apps/referee/app/admin/outreach/page.tsx`
- `/admin/outreach/create` → `apps/referee/app/admin/outreach/create/page.tsx`

### RefereeInsights admin API routes
Admin API endpoints under `apps/referee/app/api/admin/**`. All use `supabaseAdmin` and most call `requireAdmin()`.

**API usage:**
- `/api/admin/api-usage/alarms` → alarms CRUD
- `/api/admin/api-usage/check-alarms` → alarm evaluator

**Owl's Eye:**
- `/api/admin/owls-eye/run` → start an Owl's Eye enrichment run
- `/api/admin/owls-eye/run/[runId]` → run status/results

**Venues:**
- `/api/admin/venues` → venue list/search
- `/api/admin/venues/[id]` → venue CRUD
- `/api/admin/venues/[id]/owls-eye` → trigger per-venue Owl's Eye enrichment
- `/api/admin/venues/[id]/owls-eye/nearby` → nearby places lookup for a venue
- `/api/admin/venues/[id]/refresh-coordinates` → re-geocode a venue
- `/api/admin/venues/address-verify` → address verification (external API)
- `/api/admin/venues/bulk-delete` → bulk venue delete
- `/api/admin/venues/copy` → copy/clone a venue record
- `/api/admin/venues/duplicate-overrides` → manage duplicate override flags
- `/api/admin/venues/import` → import venues from CSV
- `/api/admin/venues/import/export` → export import batch results
- `/api/admin/venues/merge` → merge two venue records
- `/api/admin/venues/places` → Google Places venue lookup
- `/api/admin/venues/scan-duplicate-candidates` → run duplicate candidate scan
- `/api/admin/venues/search` → venue search
- `/api/admin/venues/venue-enrichment-csv` → export venue enrichment CSV

**Tournaments:**
- `/api/admin/tournaments/search` → tournament search
- `/api/admin/tournaments/delete` → delete a tournament
- `/api/admin/tournaments/discover-to-queue` → push discovery results to queue

---

## TI Venue → Planning Map routing

TI’s internal “Planning Map” experience is the Tournament Venue Map route:
- `/tournaments/[slug]/map`

Venue surfaces deep-link into the internal map using:
- `?venue=<venue_id>` (preselects the venue)
- `&source=venue_directory|venue_details` (analytics attribution)

Code pointers:
- URL helper: `apps/ti-web/lib/planningMapUrl.ts` (`buildPlanningMapUrl`)
- Tournament map reads `venue` + `source`:
  - Server page: `apps/ti-web/app/tournaments/[slug]/map/page.tsx`
  - Client shell tracking: `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapShellClient.tsx`
- Venue surfaces:
  - Directory cards: `apps/ti-web/components/venues/VenueCard.tsx`
  - Details card: `apps/ti-web/components/venues/OwlsEyeVenueCard.tsx`

Analytics events (typed in `apps/ti-web/lib/tiAnalyticsEvents.ts`):
- `venue_directory_plan_map_click`
- `venue_directory_view_venue_click`
- `venue_details_plan_map_click`
- `venue_details_directions_click`
- `tournament_map_loaded_from_venue`

## TI Weekend Pro — Premium routing + Founders Preview

Key UX rules:
- Most “Upgrade to Weekend Pro” CTAs should route to `/premium` (marketing/pricing) rather than starting Stripe checkout directly.
- The primary checkout CTA on `/premium` continues to start checkout directly.
- The 30-day Founders Preview ($4.99) reuses the existing checkout wiring (`offer = weekend_pass_30d`) — do not add new Stripe products/prices.

Copy constants:
- `apps/ti-web/lib/weekendProPricing.ts`
  - `WEEKEND_PRO_FOUNDING_DEADLINE_COPY`
  - `WEEKEND_PRO_FOUNDING_SHORT_COPY`

Weekend Pro gating:
- Weekend Pro subscribers should not see purchase/upgrade CTAs (they may still view `/premium` as a status/plan page if implemented).

## Partner Links (Affiliate / Outbound)
TI monetization partners (e.g. Fanatics) are configured in Supabase and routed through a tracked redirect.

- DB config tables: `public.partners`, `public.partner_links` (seeded by `supabase/migrations/20260514_partner_management_v1.sql`)
- Link selection helper: `apps/ti-web/lib/partners.ts` (`getPartnerLinkForSport`, `getFanaticsLinkAndDisclosure`)
- Tracked redirect route: `apps/ti-web/app/go/partner/[partnerLinkId]/route.ts`
  - Logs `partner_click_clicked` to `public.ti_map_events` (server-side, service role)
  - Redirects to the `partner_links.url` (affiliate URL)

Planning prompt:
- `docs/prompts/ti-fanatics-gear-module-expansion-v1.1.md`
- `/api/admin/tournaments/tourney-export` → CSV export of tournament data
- `/api/admin/tournaments/atlas-email-discovery` → Atlas-based email discovery
- `/api/admin/tournaments/skip-venue-discovery` → mark tournament as skip for venue discovery
- `/api/admin/tournaments/[id]/partner-nearby` → find nearby partner venues for a tournament
- `/api/admin/tournaments/missing-venues/export` → export missing-venue tournaments
- `/api/admin/tournaments/missing-venues/infer` → infer venue links for missing-venue tournaments
- `/api/admin/tournaments/sources/export` → export tournament sources
- `/api/admin/tournaments/uploads/export` → export upload batch
- `/api/admin/tournaments/uploads/inferred` → list inferred upload venues
- `/api/admin/tournaments/uploads/venue-accept` → accept an upload-inferred venue
- `/api/admin/tournaments/uploads/venue-extract` → extract venue from upload
- `/api/admin/tournaments/enrichment/run` → run tournament enrichment
- `/api/admin/tournaments/enrichment/queue` + `/queue-all` → queue enrichment
- `/api/admin/tournaments/enrichment/apply` + `/delete` + `/update` + `/skip` → manage enrichment drafts
- `/api/admin/tournaments/enrichment/search` → search within enrichment results
- `/api/admin/tournaments/enrichment/email-discovery` → email discovery from enrichment
- `/api/admin/tournaments/enrichment/fees-venue` → fees/venue enrichment sub-task
- `/api/admin/tournaments/enrichment/inferred-links` → inferred link extraction
- `/api/admin/tournaments/enrichment/inferred/promote` + `/reject` → promote/reject inferred links
- `/api/admin/tournaments/enrichment/extract-source-urls` → extract URLs from source pages
- `/api/admin/tournaments/enrichment/url-search` + `/url-apply` + `/url-apply-batch` → URL management
- `/api/admin/tournaments/enrichment/url-suggestions/approve` + `/reject` → URL suggestion review
- `/api/admin/tournaments/enrichment/us-club-soccer` + `/usssa` → org-specific enrichment runners
- `/api/admin/tournaments/enrichment/venue-perplexity` → Perplexity-based venue lookup

**Tournament venues (linking):**
- `/api/admin/tournament-venues/link` → link a venue to a tournament
- `/api/admin/tournament-venues/unlink` → unlink a venue
- `/api/admin/tournament-venues/unlink-bulk` → bulk unlink
- `/api/admin/tournament-venues/create-and-link` → create a new venue and link it

**Tournament sources:**
- `/api/admin/tournament-sources/[id]/logs` → source crawl/scan logs

**TI Discovery v1:**
- `/api/admin/ti/discovery/batches` → batch management
- `/api/admin/ti/discovery/candidates` → candidate list
- `/api/admin/ti/discovery/candidates/import` → import candidates
- `/api/admin/ti/discovery/intake/save` + `/validate` → intake form
- `/api/admin/ti/discovery/prompt` → discovery prompt runner
- `/api/admin/ti/discovery/searches` → search history

**TI Discovery v2:**
- `/api/admin/ti/discovery-v2/queue` → queue a discovery run
- `/api/admin/ti/discovery-v2/runs` → list runs
- `/api/admin/ti/discovery-v2/runs/[id]` → run detail
- `/api/admin/ti/discovery-v2/runs/[id]/perplexity/search` + `/run-all` → Perplexity sub-tasks
- `/api/admin/ti/discovery-v2/runs/[id]/paste/attach` → paste-and-attach workflow
- `/api/admin/ti/discovery-v2/runs/[id]/zip-backfill` → ZIP code backfill for a run

**TI static maps:**
- `/api/admin/ti/static-maps/run` → trigger static map generation

**TI event codes:**
- `/api/admin/ti/event-codes/print-label` → generate printable join-code label

**Outreach:**
- `/api/admin/outreach/queue` → outreach queue management
- `/api/admin/outreach/priority-dismiss` → dismiss a priority outreach item

**Assignors:**
- `/api/admin/assignors/zip` → assignor ZIP code lookup

### TournamentInsights admin UI
TI has its own `/admin/**` routes under `apps/ti-web/app/admin/**`:
- `/admin` → `apps/ti-web/app/admin/page.tsx`
- `/admin/dashboard-email` → `apps/ti-web/app/admin/dashboard-email/page.tsx`
- `/admin/dashboard-email/heatmap-us` → `apps/ti-web/app/admin/dashboard-email/heatmap-us/page.tsx`
- `/admin/outreach-dashboard` → `apps/ti-web/app/admin/outreach-dashboard/page.tsx`
- `/admin/outreach-previews` → `apps/ti-web/app/admin/outreach-previews/page.tsx`
- `/admin/outreach-reply` → `apps/ti-web/app/admin/outreach-reply/page.tsx`

These TI admin routes are gated by `requireTiOutreachAdmin()` (email allowlist / dev-mode gate), not by RI's `requireAdmin()`.

---

## TI Analytics Tracking
### Key files
- Events table migration: `supabase/migrations/20260428_external_api_calls.sql` (no — events in `ti_map_events`)
- Analytics RPCs: `supabase/migrations/20260525_admin_analytics_rpcs.sql`
- Outbound clicks table: `public.ti_outbound_clicks` (destination_type, created_at columns; used by `/go/*` hotel and VRBO redirect routes)
- Partner clicks: tracked in `public.ti_map_events` (event_name=`partner_click_clicked`, partner key in `properties->>'partner_key'`)
- Clicks dashboard: `apps/referee/app/admin/ti/clicks/page.tsx`
- Revenue dashboard: `apps/referee/app/admin/ti/revenue/page.tsx`
- Analytics client table: `apps/referee/app/admin/ti/clicks/ClicksTableClient.tsx`

### Storage table: `public.ti_map_events`
The primary analytics sink for all TI user events.
- Top-level columns: `event_name`, `sport`, `state`, `page_type`, `href`, `cta`, `filter_name`, `old_value`, `new_value`, `created_at`
- JSONB `properties` column: stores structured event context (tournament_id, venue_id, partner_key, user_tier, etc.)
- Note: `tournament_id` and `venue_id` live inside `properties` JSONB, not as top-level columns. Aggregations on these fields require Postgres RPCs (PostgREST cannot GROUP BY JSONB paths).
- Dev gate: `shouldPersistMapEvents()` returns false in `NODE_ENV=development` unless `ENABLE_TI_ANALYTICS_TRACKING=true`.

### Storage table: `public.ti_outbound_clicks`
Tracks server-side outbound clicks through `/go/*` hotel and rental redirect routes.
- Top-level column: `destination_type` (values: `'hotels'`, `'vrbo'`, `'tournament_official'`).
- Used by the revenue dashboard to count hotels/VRBO click totals.
- Partner clicks (Fanatics, future Scheels) go through `/go/partner/[partnerLinkId]` and write to `ti_map_events` instead, not this table.

### Analytics admin RPCs (`supabase/migrations/20260525_admin_analytics_rpcs.sql`)
Four Postgres RPCs required for JSONB-based aggregations on `ti_map_events`. Must be applied to Supabase before top-viewed and dimension sections on the clicks dashboard render data.

- `admin_top_viewed_tournaments(since_iso timestamptz, result_limit int DEFAULT 10)`
  - Returns: `(tournament_id, view_count, name, start_date, end_date)`
  - Counts `tournament_detail_page_viewed` events, groups by `properties->>'tournament_id'`, JOINs `tournaments` for name/dates.

- `admin_top_viewed_venues(since_iso timestamptz, result_limit int DEFAULT 10)`
  - Returns: `(venue_id, view_count, name, next_tournament_start)`
  - Counts `venue_map_opened` events, groups by `properties->>'venue_id'`, JOINs `venues` for name, subquery for next upcoming tournament start.

- `admin_top_sports_by_views(since_iso timestamptz, result_limit int DEFAULT 5)`
  - Returns: `(sport, view_count)`
  - Counts `tournament_detail_page_viewed` events grouped by top-level `sport` column.

- `admin_top_states_by_venue_opens(since_iso timestamptz, result_limit int DEFAULT 5)`
  - Returns: `(state, open_count)`
  - Counts `venue_map_opened` events grouped by top-level `state` column.

All four are `SECURITY DEFINER`, execute granted to `service_role` only. Called via `(supabaseAdmin as any).rpc("function_name", { since_iso, result_limit })` — the `(supabaseAdmin as any)` cast pattern is required because these functions are not in the generated Supabase types.

### Clicks dashboard: `/admin/ti/clicks`
Implemented in `apps/referee/app/admin/ti/clicks/page.tsx` (server) + `ClicksTableClient.tsx` (client).
- Queries: today, yesterday, last 7d, last 30d windows for ~48 named events.
- Grouped display: Discovery, Tournament Detail, Tournament Map, Directory, Venue Map, Weekend Share, Weekend Planner, Conversion, Owl's Eye, Book Travel.
- KPI health tiles (6): top funnel metrics with yesterday vs 7d-avg comparison.
- Outbound clicks section (3 tiles): Hotels (from `ti_outbound_clicks`), Vrbo (from `ti_outbound_clicks`), Fanatics (from `partner_click_clicked` events in `ti_map_events`). Note: Fanatics tile counts ALL `partner_click_clicked` events — if additional partners are added, filter by `properties->>'partner_key' = 'fanatics'`.
- Conversion funnel: map_viewed → tournament_detail_page_viewed → book_travel_* funnel rates.
- Top viewed tables: calls `admin_top_viewed_tournaments` and `admin_top_viewed_venues` RPCs.
- Dimension snapshot: calls `admin_top_sports_by_views` and `admin_top_states_by_venue_opens` RPCs.
- Anomaly detector: highlights events where yesterday > 2× the 7d daily average.

### Partner click tracking
Partner links (Fanatics, future Scheels) are managed via:
- `public.partners` table — partner rows (key, name, category, status, disclosure_text, is_active)
- `public.partner_links` table — individual affiliate links (partner_id, url, destination_type, sport, page_type, placement, campaign, is_active)
- Route: `apps/ti-web/app/go/partner/[partnerLinkId]/route.ts` — resolves link, writes `partner_click_clicked` to `ti_map_events` with full JSONB context, redirects to affiliate URL.
- Helper: `apps/ti-web/lib/partners.ts` — `getPartnerLinkForSport()` (generic), `getFanaticsLinkAndDisclosure()` (Fanatics wrapper).

---

## API Usage Tracking
### Key files
- Table migration: `supabase/migrations/20260428_external_api_calls.sql` (`public.external_api_calls`)
- RPC migrations: `supabase/migrations/20260429_api_usage_summary_rpc.sql` and `supabase/migrations/20260505_api_usage_summary_rpc_half_open.sql` (`public.api_usage_summary`)
- TI events RPC: `supabase/migrations/20260505_api_usage_summary_rpc_half_open.sql` (`public.ti_map_event_summary`)
- Alarm table migration: `supabase/migrations/20260505_api_usage_alarms.sql` (`public.api_usage_alarms`)
- RI admin UI: `apps/referee/app/admin/api-usage/page.tsx`
- Alarm CRUD API: `apps/referee/app/api/admin/api-usage/alarms/route.ts`
- Alarm evaluator API: `apps/referee/app/api/admin/api-usage/check-alarms/route.ts`
- Tracking wrapper: `apps/referee/lib/trackExternalCall.ts` and `apps/ti-web/lib/trackExternalCall.ts`

### Storage table: `public.external_api_calls`
Defined in `supabase/migrations/20260428_external_api_calls.sql`.
- Columns:
  - `id bigserial`
  - `api text`
  - `operation text`
  - `surface text`
  - `status text` (`ok` | `error`)
  - `latency_ms integer`
  - `error text`
  - `called_at timestamptz default now()`
- Indexes:
  - `(api, called_at desc)`
  - `(called_at desc)`
- Grants:
  - Service-role only (revoke from `public/anon/authenticated`, grant `select/insert` to `service_role`).

### Aggregation RPC: `public.api_usage_summary(from_ts, to_ts)`
Defined in `supabase/migrations/20260429_api_usage_summary_rpc.sql` and updated in `supabase/migrations/20260505_api_usage_summary_rpc_half_open.sql`.
- Signature:
  - `api_usage_summary(from_ts timestamptz, to_ts timestamptz) returns table(api, operation, surface, calls, errors, avg_latency_ms)`
- Behavior:
  - Aggregates `external_api_calls` in a half-open time window: `called_at >= from_ts AND called_at < to_ts`.
  - `errors` = count of rows where `status = 'error'`.
  - `avg_latency_ms` = rounded average of `latency_ms`.
- Security:
  - `security definer`, execute granted to `service_role` only.

### TI map events aggregation RPC: `public.ti_map_event_summary(from_ts, to_ts, event_names)`
Defined in `supabase/migrations/20260505_api_usage_summary_rpc_half_open.sql`.
- Signature:
  - `ti_map_event_summary(from_ts timestamptz, to_ts timestamptz, event_names text[]) returns table(event_name, calls)`
- Behavior:
  - Counts events in `public.ti_map_events` within `[from_ts, to_ts)` filtered to `event_name = any(event_names)`.

### RI admin UI: `/admin/api-usage`
Implemented in `apps/referee/app/admin/api-usage/page.tsx`:
- Gated by `await requireAdmin()`.
- Uses `supabaseAdmin.rpc("api_usage_summary", { from_ts, to_ts })` for the selected range and for MTD totals.
- Uses `supabaseAdmin.rpc("ti_map_event_summary", { from_ts, to_ts, event_names })` for a small set of TI event names (currently `venue_map_opened`, `venue_map_loaded`) to connect engagement to usage.
- UI includes:
  - per-(api,operation,surface) rows (calls/errors/avg latency)
  - vendor totals (calls/errors/avg latency aggregated client-side from RPC result)
  - free-tier gauges/limits and range filter helpers

### Alarms: `public.api_usage_alarms` + admin endpoints
- Table: `public.api_usage_alarms` (see `supabase/migrations/20260505_api_usage_alarms.sql`)
- Admin CRUD endpoint: `apps/referee/app/api/admin/api-usage/alarms/route.ts`
- Evaluator endpoint: `apps/referee/app/api/admin/api-usage/check-alarms/route.ts`
  - Uses `supabaseAdmin.rpc("api_usage_summary", ...)` and compares against configured thresholds.

---

## trackExternalCall
### Key files
- RI implementation: `apps/referee/lib/trackExternalCall.ts`
- TI implementation: `apps/ti-web/lib/trackExternalCall.ts`
- Storage table: `supabase/migrations/20260428_external_api_calls.sql` (`public.external_api_calls`)

### Function signature
Both apps expose the same signature:
```ts
export async function trackExternalCall<T>(
  api: string,
  operation: string,
  surface: string,
  fn: () => Promise<T>
): Promise<T>
```

### Behavior (common)
- Measures latency (`Date.now()` around `fn()`).
- Inserts a row into `public.external_api_calls` with:
  - `api`, `operation`, `surface`
  - `status` (`ok` or `error`)
  - `latency_ms`
  - `error` (truncated message) when status=`error`
- "Fail-open" insertion: insertion is done async and does not block the caller.
- Debug logging:
  - If insert fails and `EXTERNAL_API_CALL_TRACKING_DEBUG === "true"`, logs a warning.

### Enablement / env gates
RI (`apps/referee/lib/trackExternalCall.ts`):
- Tracking enabled when:
  - `NODE_ENV !== "development"` OR `ENABLE_EXTERNAL_API_CALL_TRACKING === "true"`.
TI (`apps/ti-web/lib/trackExternalCall.ts`):
- Tracking enabled when:
  - `NODE_ENV !== "development"` OR `ENABLE_EXTERNAL_API_CALL_TRACKING === "true"` OR
  - `surface === EXTERNAL_API_SURFACE.static_map_cron` (special case to record cron usage in local dev).

---

## External APIs (EXTERNAL_API constants)
### Key files
- RI constants: `apps/referee/lib/trackExternalCall.ts`
- TI constants: `apps/ti-web/lib/trackExternalCall.ts`
- RI API usage alarms allowlist uses these values: `apps/referee/app/api/admin/api-usage/alarms/route.ts`

### RefereeInsights `EXTERNAL_API`
Defined in `apps/referee/lib/trackExternalCall.ts`:
```ts
export const EXTERNAL_API = {
  google_places: "google_places",
  foursquare: "foursquare",
  mapbox: "mapbox",
  resend: "resend",
  open_meteo: "open_meteo",
  brave_search: "brave_search",
  bing_search: "bing_search",
  serpapi: "serpapi",
  overpass: "overpass",
  timezonedb: "timezonedb",
  perplexity: "perplexity",
} as const;
```

### TournamentInsights `EXTERNAL_API`
Defined in `apps/ti-web/lib/trackExternalCall.ts`:
```ts
export const EXTERNAL_API = {
  google_places: "google_places",
  mapbox: "mapbox",
  resend: "resend",
  open_meteo: "open_meteo",
} as const;
```

Notes:
- The storage table `external_api_calls.api` is `text` and can store additional values, but the admin UI and alarm allowlists are driven by these constants.

---

## External API Surfaces (EXTERNAL_API_SURFACE constants)
### Key files
- RI constants: `apps/referee/lib/trackExternalCall.ts`
- TI constants: `apps/ti-web/lib/trackExternalCall.ts`

### RefereeInsights `EXTERNAL_API_SURFACE`
Defined in `apps/referee/lib/trackExternalCall.ts`:
```ts
export const EXTERNAL_API_SURFACE = {
  owls_eye_batch: "owls_eye_batch",
  owls_eye_gear: "owls_eye_gear",
  venue_geocode: "venue_geocode",
  venue_timezone: "venue_timezone",
  venue_places_lookup: "venue_places_lookup",
  venue_address_verify: "venue_address_verify",
  tournament_enrichment: "tournament_enrichment",
  email_alert: "email_alert",
  email_digest: "email_digest",
  email_transactional: "email_transactional",
  venue_field_map: "venue_field_map",
  atlas_search: "atlas_search",
  tournament_scan: "tournament_scan",
  ti_discovery: "ti_discovery",
} as const;
```

### TournamentInsights `EXTERNAL_API_SURFACE`
Defined in `apps/ti-web/lib/trackExternalCall.ts`:
```ts
export const EXTERNAL_API_SURFACE = {
  static_map_cron: "static_map_cron",
  weather_widget: "weather_widget",
  zip_geocode: "zip_geocode",
  email_transactional: "email_transactional",
  hotel_redirect: "hotel_redirect",
} as const;
```

Notes:
- Surfaces are used to attribute calls to features/routes/scripts (e.g., Owl's Eye batch enrichment vs a venue address verify tool vs a cron job).

---

## Scripts
### Key files
- Root scripts: `package.json`
- Ops scripts: `scripts/ops/**` (70+ scripts)
- Ingest scripts: `scripts/ingest/**`
- Smoke seeding: `apps/ti-web/scripts/seed_smoke_test_users.ts`
- Playwright smoke runner: `playwright.smoke.config.ts`

This repo contains many scripts; the admin/ops-relevant ones typically require service-role Supabase access.

### Common prerequisites
- Run from repo root: `/Users/roddavis/RI_MVP/RI-MVP`
- Common required env vars for scripts that touch Supabase:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Many scripts are TypeScript and run via `tsx`:
  - Examples use `node --import tsx ...` or `npx tsx ...` depending on the script.

### Common commands (root `package.json`)
- Smoke tests:
  - `npm run test:smoke` (Playwright config: `playwright.smoke.config.ts`)
  - `npm run test:smoke:ui` (headed)
- Seed TI smoke users (Supabase Auth + profiles):
  - `npm run seed:smoke:users`
  - Runs `tsx apps/ti-web/scripts/seed_smoke_test_users.ts`
  - Controlled by env vars in `apps/ti-web/.env.local` such as:
    - `TI_SMOKE_SEED_ALLOW`
    - `TI_SMOKE_EXPLORER_EMAIL`, `TI_SMOKE_EXPLORER_PASSWORD`
    - `TI_SMOKE_INSIDER_EMAIL`, `TI_SMOKE_INSIDER_PASSWORD`
    - `TI_SMOKE_WEEKENDPRO_EMAIL`, `TI_SMOKE_WEEKENDPRO_PASSWORD`
- Ops alias:
  - `npm run ops:flag-long-tournaments`
  - Runs `node --import tsx scripts/ops/flag_long_tournaments.ts --apply`

### Scripts by category
There are 70+ scripts in `scripts/ops/`. Categories:

**Venue data quality / geocoding:**
- `flag_long_tournaments.ts` — flags suspicious date ranges
- `audit_venues_geo.ts` / `audit_tournaments_geo.mjs` — geo audit
- `backfill_venues_geo_mapbox.mjs` / `backfill_tournaments_geo_mapbox.mjs` — geocode backfills
- `backfill_venue_zip_codes.ts` — ZIP code backfill
- `probe_venues_address1.ts` — address field probe

**Venue CRUD / linking:**
- `apply_high_confidence_draft_venues.ts` — promote draft venues to live (use `--limit/--offset`)
- `merge_venues_and_repoint_refs.ts` / `merge_duplicate_venues_by_fingerprint.ts` — deduplication
- `link_venue_to_tournament.ts` — single venue–tournament link
- `ingest_venues_from_csv.mjs` / `ingest_tournaments_and_venues_from_csv.mjs` — CSV bulk ingest
- `null_bad_venue_urls.ts` — clear bad URL fields

**Owl's Eye:**
- `backfill_owlseye_gear_nearby.ts` — backfill gear/food/hotel nearby data
- `backfill_owlseye_place_coords_mapbox.mjs` — backfill place coordinates
- `rebuild_owls_eye_venue_duplicate_suspects.ts` — rebuild duplicate suspect table
- `purge_owlseye_residential_nearby_places.mjs` — remove residential false-positives

**Tournament sources / discovery:**
- `scan_tournament_seasons_2027.ts` — seasonal scanning workflow
- `import_season_scan_csv.ts` — import prior scan CSV without re-running searches
- `export_pending_upload_tournaments_csv.ts` — export pending uploads queue

**Tournament/venue data fixes (named/targeted):**
- `update_missing_director_emails_from_csv.mjs` — batch update director emails
- Various `fix_*`, `update_*`, `link_*` scripts for named tournaments or organizers

### Guidance for safe operation
- Prefer "dry run" modes when offered; only use `--apply` or write modes when intended.
- Many scripts have `--limit/--offset` for incremental runs.
- If a script calls external APIs, verify whether `ENABLE_EXTERNAL_API_CALL_TRACKING` is enabled (for usage visibility) and ensure you understand quotas/cost.

---

## Auth (requireAdmin)
### Key files
- RI admin gate: `apps/referee/lib/admin.ts` (`requireAdmin()`)
- RI admin login page: `apps/referee/app/admin/login/page.tsx`
- RI profile table reads: `apps/referee/lib/admin.ts` (`profiles.role`)
- TI admin gate (email allowlist): `apps/ti-web/lib/outreachAdmin.ts` (`requireTiOutreachAdmin()`)

### `requireAdmin()` (RefereeInsights)
Defined in `apps/referee/lib/admin.ts`:
- Behavior:
  - Uses `createSupabaseServerClient()` (cookie-based) to call `auth.getUser()`.
  - If not logged in: `redirect("/admin/login")`.
  - If logged in, checks admin privilege using service role:
    - `supabaseAdmin.from("profiles").select("user_id, role").eq("user_id", user.id).maybeSingle()`
  - If DB read fails: redirects to `/admin/login?error=server_error` (fails "softly").
  - If role is not `admin`: redirects to `/admin/login?error=not_authorized`.
  - Returns the Supabase user object when authorized.
- Admin role source of truth:
  - `public.profiles.role` must equal `"admin"`.

### `requireTiOutreachAdmin()` (TournamentInsights)
Defined in `apps/ti-web/lib/outreachAdmin.ts`:
- Uses `createSupabaseServerClient()` to get the current user.
- Gate is an allowlist by email:
  - `TI_ADMIN_EMAILS` (comma-separated) or fallback `RI_ADMIN_EMAIL`
  - In non-production, allows access if logged in and allowlist is not configured.
- Redirect behavior:
  - If not logged in: redirects to `/login` with optional `returnTo`.
  - If logged in but not allowed: redirects to `/`.

---

## Planned Features
### Key files
- `docs/notes.md` (primary running dev log — source of truth for forward-looking items)

This section is intentionally sourced from `docs/notes.md` only (no speculation). Items below are forward-looking notes present in `docs/notes.md` and may already have partial scaffolding in code.

Examples currently noted in `docs/notes.md`:
- TI affiliate sync: cron scaffold + rollup table to support pulling publisher transaction totals into admin dashboards later (see `apps/referee/app/api/cron/ti-affiliate-sync/route.ts`, `supabase/migrations/20260503_ti_affiliate_daily_metrics.sql`).
- TI saved tournaments digest enhancements: per-tournament "what changed" summary (see `docs/ti-saved-tournament-change-notifications.md` and referenced TI email job files).
- Scheels partner: planned addition as second affiliate partner alongside Fanatics. Requires partners row, partner_links rows, `getScheelsLinkAndDisclosure()` helper, tournament detail card, and clicks dashboard Fanatics tile fix (filter `properties->>'partner_key' = 'fanatics'` once a second partner is active).
- Admin UI incremental enhancements noted as "next/later" items in various entries (review `docs/notes.md` for the most current forward-looking bullets tied to specific file paths).

---

## How to Update This Doc
### Key files
- `docs/admin-reference.md`
- `docs/notes.md`

- When adding a new admin UI route, update **Admin Routes** with the new path and file location, and note which tables/RPCs it uses.
- When adding a new admin API route (`route.ts`), update **Admin Routes** and include the endpoint path and its authorization mechanism.
- When adding a new external API integration, add its value to the appropriate `EXTERNAL_API` constant and update **External APIs**.
- When adding a new call site for `trackExternalCall`, ensure the surface string is a constant and update **External API Surfaces** if needed.
- When modifying `external_api_calls` schema or API-usage RPCs, update **API Usage Tracking** with the migration filename and new behavior.
- When adding/changing alarm behavior, update **API Usage Tracking** and include the admin routes that create/evaluate alarms.
- When adding or changing ops scripts, update **Scripts** with the category it belongs to and any `--apply` / quota risks.
- When changing admin authorization rules, update **Auth (requireAdmin)** and include new failure modes / redirects.
- When adding new analytics events or RPCs, update **TI Analytics Tracking** with the migration filename, RPC signature, and dashboard impact.
- When adding forward-looking work, record it in `docs/notes.md` and then update **Planned Features** to reflect the latest items (do not add items that are not present in `docs/notes.md`).
