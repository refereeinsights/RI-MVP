## TI Running Notes

This is the TI-only review log extracted from the mixed master log in `docs/notes.md`.

Review/use:
- Use this file first when reviewing TI changes.
- Cross-check `docs/notes.md` only if you need mixed RI/TI context or original neighboring entries.

Maintenance rules:
- Keep this file TI-only.
- Keep entries in reverse chronological order.
- Keep one `## YYYY-MM-DD` section per date.
- Do not add RI-only items here.
- When a TI change is recorded here, keep the corresponding mixed-history entry in `docs/notes.md`.

## 2026-06-30

- TI venue-map team hotel block flow:
  - Updated:
    - `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapClient.tsx`
    - `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMap.module.css`
    - `apps/ti-web/app/api/lodging/group-request/route.ts`
    - `apps/ti-web/lib/lodging/lodging-provider.ts`
    - `apps/ti-web/lib/lodging/hotelPlannerProvider.ts`
    - `apps/ti-web/lib/tiAnalyticsEvents.ts`
    - `CLAUDE.md`
  - Changes:
    - Restored a TI-branded team-block intake form instead of sending users directly to HotelPlanner `Group-Rate`.
    - `Need 5+ rooms?` remains in the main venue action block, but now opens a TI-owned inline RFP form in the venue panel.
    - The flow is area-based in the UI and does not require selecting a specific hotel first; TI still sends the first visible hotel result as the required internal `propertyId` anchor for HotelPlanner.
    - Form inputs collect team/contact information and fold `teamName`, `phone`, and notes into the API `comments` field.
    - Submit continues to use `/api/lodging/group-request` with hardcoded provider defaults for `split`, `rating`, `roomTypeCode`, and `groupTypeCode`.
    - Empty-results UX disables the CTA with the hint copy `Hotel results are required before requesting a team block.`; missing dates disable it with `Tournament dates are required before submitting a team hotel block request.`
    - Team-block analytics again cover CTA click, form open, and submit success/failure inside TI.

- TI HotelPlanner venue-map stale tournament date fix:
  - Updated `apps/ti-web/app/api/lodging/search/route.ts` so tournament-inferred hotel search windows no longer send stale start dates to HotelPlanner on in-progress or past tournaments.
  - Search-window policy now matches the existing `/go/hotels` handoff behavior more closely:
    - upcoming tournaments use `start_date` → `end_date + 1 day`,
    - in-progress tournaments use `today` as check-in with a short bounded checkout window,
  - fully past tournaments return the existing fallback/no-dates path instead of hitting HP with a past check-in.
  - This fixes venue-map `Provider failure` responses caused by HP `422 checkIn must not be in the past` errors on long-running or stale tournament records.

- TI HotelPlanner fallback naming cleanup:
  - Removed the stale hotel-side `showBookingFallback` naming from the HP lodging search flow and replaced it with neutral `showHotelFallback`.
  - Updated the provider normalization layer, `/api/lodging/search` response handling, venue-map client fallback handling, and provider tests so the TI hotel flow no longer carries Booking.com-specific semantics in its active HP API contract.

## 2026-06-11

- TI tournament card pre-hydration dead-tap fix on directory/state hub pages:
  - Verified the main tournament card body on `/tournaments` and `/{sport}/{state}` already used a real `cardOverlayLink` anchor, so the dead-tap issue was not a missing-link problem.
  - Updated `apps/ti-web/app/tournaments/tournaments.css` so the non-link `.cardFooter` wrapper no longer sits above the full-card overlay; only real CTA links and the venue map strip remain elevated.
  - This lets pre-hydration taps in empty footer gap regions fall through to the tournament detail overlay link instead of dying on a non-interactive wrapper.

- TI mobile state-map tap fix on sport/state hub pages:
  - Updated `apps/ti-web/app/_components/UsMapInteractions.tsx` so the delegated US map interaction layer now supports `touchstart` / `touchend` on the parent SVG in addition to the existing delegated desktop click behavior.
  - Preserved the existing `data-*` target lookup and analytics/navigation flow while routing both click and touch through the same shared state-activation handler.
  - Added a minimal `10px` touch-displacement guard so scrolling across the `Explore by State` map on iOS Safari does not accidentally trigger navigation.
  - Registered `touchend` with `{ passive: false }` so tap-qualified interactions can `preventDefault()` and avoid double-firing the synthetic follow-up click.
  - Updated `CLAUDE.md` mobile UAT guidance to verify that `Explore by State` map taps work on mobile Safari and that scrolling across the SVG does not navigate.

## 2026-06-09
- TI Weekend Planner Stage `3.5-1B` private family iCal subscription feed:
  - Added `supabase/migrations/20260609_ti_planner_stage_3_5_1b_calendar_feeds.sql` for owner-scoped planner calendar feeds, keeping iCal tokens separate from HTML guest-share tokens while enforcing one active family feed per owner, hash-only bearer token storage, `ON DELETE CASCADE`, and owner-only RLS.
  - Hardened the Stage `3.5-1B` migration so environments with the old prototype `planner_calendar_feeds` shape (`user_id`, `feed_token`, `feed_name`, `is_active`) automatically drop that legacy raw-token table before creating the secure schema, avoiding deploy failures from schema drift.
  - Added `apps/ti-web/lib/planner/calendarFeeds.ts` to centralize feed-token generation/hashing, deterministic reveal without raw-token persistence, bounded guest-safe family-event loading, stable HMAC-based UID generation, throttled `last_accessed_at`, and RFC 5545-safe iCal serialization with CRLF line endings and 75-octet folding.
  - Added the owner calendar-feed flow through `apps/ti-web/app/api/weekend-planner/calendar-feed/route.ts`, `apps/ti-web/app/weekend-planner/PlannerCalendarFeedPanel.tsx`, and `apps/ti-web/app/weekend-planner/PlannerCalendarFeedPanelClient.tsx`, allowing Weekend Pro owners to create, reveal-copy, regenerate, and revoke private subscription URLs while clearly warning that external calendar apps may retain previously fetched events until refresh or subscription removal.
  - Added the private calendar route `apps/ti-web/app/weekend-planner/calendar/[token]/route.ts` returning `text/calendar` with private caching, inline `.ics` filename headers, and empty valid calendars for unknown, revoked, inactive, or non-Pro feed states.
  - Tightened the tokenized feed route cache header to `Cache-Control: private, no-store` so revoke/regenerate take effect immediately in browser UAT instead of being hidden by cached `.ics` responses.
  - Updated `apps/ti-web/app/weekend-planner/page.tsx` and `apps/ti-web/app/robots.ts` so the planner now surfaces the subscription panel for authenticated owners and disallows `/weekend-planner/calendar/` from robots coverage.
  - Added focused tests in `apps/ti-web/lib/planner/calendarFeeds.test.ts` for token hashing, URL-safe helpers, iCal escaping, folding, CRLF output, and stable UID serialization.

- TI tournament directory dead-click cleanup on staged filters:
  - Updated `apps/ti-web/app/tournaments/TournamentDirectoryFiltersClient.tsx` so `/tournaments` now renders `Apply filters` and `Reset` as clearly separated semantic buttons, moves live helper/status text out of the shared action row, adds explicit no-change feedback, and prevents double-submit behavior while Apply is navigating.
  - Updated `apps/ti-web/app/tournaments/StateMultiSelect.tsx` and `apps/ti-web/app/tournaments/tournaments.css` so the state trigger has a stronger hitbox/focus treatment, the closed combobox no longer leaks hidden `All states` menu text into Clarity-style concatenated labels, and the action/toggle rows keep 44px+ tap targets with non-overlapping mobile spacing.
  - Preserved the staged `/tournaments` filter model, existing GET/query-param behavior, and filter analytics while improving accessibility through `aria-live` feedback and clearer focus styling on touched controls.

- TI Weekend Planner Stage `3.5-1` Weekend Pro guest family schedule sharing:
  - Added `supabase/migrations/20260609_ti_planner_stage_3_5_1_guest_family_shares.sql` for owner-scoped planner guest shares, including polymorphic future-scope comments, `token_hash` uniqueness, active-family-share enforcement, `ON DELETE CASCADE`, and owner-only RLS policies.
  - Added `apps/ti-web/lib/planner/guestShares.ts` to centralize guest-token generation/hashing, Weekend Pro share eligibility, owner panel state, family-scoped guest loading with bounded event windows, source/assignment projection, and throttled `last_accessed_at` updates.
  - Added the owner share-management flow through `apps/ti-web/app/api/weekend-planner/guest-share/route.ts`, `apps/ti-web/app/weekend-planner/PlannerGuestSharePanel.tsx`, and `apps/ti-web/app/weekend-planner/PlannerGuestSharePanelClient.tsx`, allowing Weekend Pro owners to create, reveal-copy, regenerate, and revoke family guest links without storing raw tokens.
  - Updated `apps/ti-web/app/weekend-planner/page.tsx` and `apps/ti-web/app/weekend-planner/WeekendPlanner.module.css` so the authenticated planner now surfaces a contained family-sharing card below the existing planner UI while leaving `/weekend-planner` itself accessible and unchanged for non-share flows.
  - Added the private guest route `apps/ti-web/app/weekend-planner/shared/[token]/page.tsx` with noindex metadata, guest-safe family schedule rendering, venue/directions actions, a clear zero-events empty state, and complete note/source metadata suppression.
  - Added defense-in-depth `robots.ts` coverage for `/weekend-planner/shared/` and unit coverage in `apps/ti-web/lib/planner/guestShares.test.ts` for token hashing, regeneration/version changes, and URL-safe helper behavior.

## 2026-06-08

- TI tournament directory filter dead-click cleanup:
  - Confirmed the `/tournaments` directory filter form was already scoped to actual filter controls, then replaced the mixed staged/immediate interaction model with one staged GET-driven model using controlled client state in `apps/ti-web/app/tournaments/TournamentDirectoryFiltersClient.tsx`.
  - Updated `apps/ti-web/app/tournaments/page.tsx` so search, ZIP, state, radius, month, sport chips, `Include past events`, and `AYSO only` now all wait for a single explicit `Apply filters` submit, while `Reset` performs a clean GET navigation back to `/tournaments`.
  - Extended `apps/ti-web/app/tournaments/StateMultiSelect.tsx` with an optional controlled mode so the custom state popover can reflect pending selections immediately without auto-submitting, while preserving the existing auto-submit behavior for other pages that still depend on it.
  - Kept tournament directory analytics tied to actual form submit events and updated the shared tournament filter CSS so staged controls keep large tap targets, clearer selected states, a truly disabled Apply button, and mobile-safe chip wrapping.
  - Fixed a follow-up runtime crash in `apps/ti-web/app/tournaments/TournamentDirectoryFiltersClient.tsx` by capturing `event.currentTarget` values before entering functional `setPendingState(...)` updaters, instead of reading synthetic event properties inside the updater callback after React releases the event object.
  - Fixed the state-summary follow-up (`F-2`) in `apps/ti-web/app/tournaments/TournamentDirectoryFiltersClient.tsx` so an applied single-state selection like `WA` no longer collapses back to `All states` simply because the currently available filtered state list also contains one item.

## 2026-06-05

- TI Weekend Planner Stage `3.3C-7` parent-friendly ICS normalization + TeamSnap One cleanup:
  - Updated `apps/ti-web/lib/planner/ics-import.ts` to parse TeamSnap One-style labeled descriptions so imported events keep useful planning notes like `Arrive 40 minutes early` and `Uniform: ...`, while using structured `Location` data for venue matching and suppressing redundant `Location`, `Duration`, and raw TeamSnap link noise from the main planner notes.
  - Tightened `apps/ti-web/lib/planner/venueResolution.ts` so weak one-token addresses no longer participate in global venue auto-linking, closing the false-positive path that was collapsing unrelated dry-run backfill rows onto `Casper Events Center`.
  - Added coverage in `apps/ti-web/lib/planner/ics-import.test.ts` and `apps/ti-web/lib/planner/venueResolution.test.ts` for TeamSnap cleanup, field-marker extraction, and the global weak-address safety guard.
- TI Weekend Planner Stage `3.3C-6` compact Season date-range filter:
  - Added a Season-only compact `Dates` control with start/end inputs, quick actions, and inclusive range handling so families can narrow loaded Season events without changing Upcoming / This Weekend behavior.
  - Wired the custom date range into the existing planner fetch path only for `Season`, preserving current family filters, calendar/list consistency, and the existing `seasonRange` presets as the default when no custom range is active.
  - Added mobile-safe planner styling so the date popover stays contained beside the family filter row rather than expanding the page layout.
  - Followed up so `Dates` remains visible in all planner views and applying a custom range automatically moves the planner into `Season`, which matches the intended mental model better than hiding the control behind the Season lens.
  - Tightened the month-view selected-event summary card so its title/time content is centered within the compact Schedule-X agenda surface, while deliberately not adding raw source-location text there because venue/location details already live in the richer planner card and detail surfaces.
  - Cleaned up planner list cards by removing the always-visible event-type/source chips, moving field labels inline with the time row, and collapsing maintenance actions under an `Actions` disclosure while preserving `Map` as the main visible quick action.
  - Followed up so linked-venue cards suppress the redundant `SOURCE LOCATION` row in the main list UI while keeping source location data available in edit for audit/debugging.
- TI venue detail map-click clarity:
  - Added a bottom-center overlay inside the static venue map preview that advertises the TI nearby-planning surface only when the existing map preview is already clickable through valid tournament context.
  - Kept the overlay as a non-interactive child of the existing planning-map link, preserved the external directions buttons, and left plain static-map / fallback venue-link states unchanged so the UI does not overpromise a planning destination where none exists.
- TI Weekend Planner Stage `3.3C-5` conservative venue matching + venue/map click paths:
  - Added conservative batch venue matching for imported/refreshing ICS events using internal TI venue data only, with no backfill and no overwrite of any existing non-null `venue_id`.
  - Updated planner list/calendar event location behavior so linked venues open TI venue pages in new tabs, meaningful unmatched source locations open maps, field-only labels stay informational, and month-view event chips more clearly signal clickability.
  - Tightened imported-event badge consistency so child-prefixed source labels like `Casey Owls 15U - TC` move into the same upper-right badge location already used by `Avery Sports · TI Owls 12U`, rather than rendering inline beside the event-type chip.
  - Hardened linked-venue hydration in `apps/ti-web/lib/planner/enrichVenueMetadata.ts` so planner cards fall back to the canonical `venues` table when a matched `venue_id` is missing from `venues_public`, restoring the TI venue-name link on matched event cards while preserving the separate map/directions path.
  - Fixed the final localhost hydration mismatch by removing planner-side assumptions that `venues_public` already exposes `seo_slug`, adding `supabase/migrations/20260605_ti_venues_public_add_seo_slug.sql` for long-term schema parity, and adding tests that cover both public-view hydration and fallback-to-`venues` behavior.
  - Localhost follow-up UAT now passes the matched-venue click-path blocker, so `Stage 3.3C-5` is ready; the remaining field-label coexistence check is still fixture-limited and the `375px` check remains tooling-limited.
  - Added `supabase/migrations/20260605_ti_fix_venue_slug_generator.sql` to fix the venue SEO slug generator/backfill path after observing broken slugs like `ast-esa-ports-omplex-as-ruces` from uppercase-character stripping.
  - Added shared planner assignment inference in `apps/ti-web/lib/planner/inferAssignmentFromSourceLabel.ts` and applied it to both list and calendar rendering so source-linked Casey-style events no longer show a badge in list view but unassigned state in calendar view when explicit source assignment is absent.
  - Moved planner source/profile lookup memos earlier in `apps/ti-web/app/_components/planner/PlannerClient.tsx` to fix a local `sourcesById` initialization-order crash triggered by list filtering/sorting after the Casey assignment follow-up.
  - Expanded conservative planner venue matching to cover venue names embedded in source-location text and full street-address strings with trailing sub-venue suffixes, then applied local planner-event backfills that linked the remaining Dwight Merkel, Warehouse, and Hub rows once they resolved uniquely.
  - Followed up on ICS location parsing so trailing field markers like `#6`, `Field 3`, and `Court 1` are promoted into `field_label` during import normalization and stripped before venue matching, allowing unique venue matches like `Fort Missoula Regional Park ... #6` while surfacing the extracted field inline on planner cards instead of burying it in raw location text.

## 2026-06-04

- TI Weekend Planner Stage `3.3C-4D` week-view time-window polish:
  - Week view now opens around `8:00 AM` instead of midnight and keeps later hours reachable through internal calendar scrolling.
  - Reduced the week-grid hour height modestly and constrained week-view scrolling inside the calendar frame so mobile users can reach later times without page-level overflow.
- TI Weekend Planner Stage `3.3C-4C` single-week calendar view:
  - Added explicit `Month`, `Week`, and `Agenda` calendar modes so families can switch into a true one-week planner view without losing existing month/agenda behavior.
  - Reused existing family filters, source-derived assignment, child colors, and event detail behavior in week view, with mobile-safe contained calendar overflow rather than page-level horizontal overflow.
- TI Weekend Planner Stage `3.3C-4B` child color selection + badge consistency:
  - Added optional curated child-color persistence on planner child profiles so families can choose ownership colors in the child edit UI instead of relying only on deterministic defaults.
  - Updated planner list/calendar/legend rendering to honor selected child colors and tightened long family badges so labels like `Casey · Owls TC` stay in the same upper-right badge location as shorter labels.
- TI Weekend Planner Stage `3.3C-4A` family color + assignment badge polish:
  - Added deterministic child colors and applied them to planner list/calendar display so family ownership is easier to scan without changing assignment behavior.
  - Replaced the list-view assignment row with a compact upper-right badge and added a compact family-color legend plus clearer calendar ownership display while preserving source identity and conflict separation.
- TI Weekend Planner Stage `3.3C-3` family filter + import assignment:
  - Added a compact `All schedules` family filter to the planner header so users can narrow visible schedule events by child or exact child/team assignment in both list and calendar views.
  - Extended the ICS import flow to accept optional child/team selection at connect time, using the existing source-level assignment model and server-side child→team validation.
- TI Weekend Planner Stage `3.3C-2` sign-off:
  - Re-run UAT on `localhost:3001` passed the remaining assignment checks: manual-event clear flow, imported-event family-context inheritance, and corrected child/team summary counts.
  - Final status: `Stage 3.3C-2 ready`; any remaining child/team manager affordance polish is non-blocking follow-up work.
- TI Weekend Planner Stage `3.3C-2` UAT follow-up:
  - Fixed imported-event family-context rendering in `apps/ti-web/app/_components/planner/PlannerClient.tsx` so connected calendar events now inherit and display child/team assignment from their linked source.
  - Updated `apps/ti-web/app/_components/planner/ChildTeamManager.tsx` to reuse already-loaded planner child/team profiles for its closed-state counts, eliminating the misleading `0 / 0` summary before opening the manager.
- TI Weekend Planner Stage `3.3C-2` assignment:
  - Added implementation prompt `docs/prompts/ti-planner-stage-3.3c-2-assignment.md`, explicitly verifying the `3.3C-1` prerequisite, deferring planner filters to `3.3C-3`, forbidding imported-event assignment/backfill, and requiring child→team validation in both UI and API paths.
  - Added `supabase/migrations/20260604_ti_planner_stage_3_3c2_assignment.sql` so `planner_event_sources` and `planner_events` can store optional `child_profile_id` / `team_profile_id` references without changing import or duplicate behavior.
  - Extended TI planner source/event APIs and types to persist assignment for connected sources and manual events while rejecting invalid child/team combinations and keeping imported events source-derived only.
  - Updated `apps/ti-web/app/_components/planner/PlannerClient.tsx`, `apps/ti-web/app/_components/planner/Planner.module.css`, and `apps/ti-web/app/_components/planner/ChildTeamManager.tsx` to add compact source assignment controls, manual-event assignment fields, family-context display on cards, and live selector refresh after child/team edits.

## 2026-06-02

- TI planner (Stage 2.9C-1): connected calendar card action-row polish.
  - Updated `apps/ti-web/app/_components/planner/PlannerClient.tsx` so each connected source card uses one grouped action row (`Edit label`, `Refresh schedule`, `Disconnect calendar`) and refresh/disconnect actions are disabled while source-level work is in flight.
  - Tightened disconnect confirmation copy to explicitly state that imported events from the feed remain.
  - Added UAT pointer in `CLAUDE.md` and checklist section in `docs/qa/ti-planner-ics-uat.md`.

- TI planner (Stage 2.10): venue metadata hydration for linked events.
  - Added shared planner event enrichment helper: `apps/ti-web/lib/planner/enrichVenueMetadata.ts`.
  - Enrichment is now applied in:
    - `GET /api/planner/events`
    - `POST /api/planner/events`
    - `PATCH /api/planner/events/[id]`
    - `GET /weekend-planner` server render.
  - List and calendar views now render linked venue-friendly location lines and use linked location for map action + merge-preview context.
  - Docs aligned with this change in `CLAUDE.md`, `docs/weekend-planner-current-state.md`, and `docs/admin-reference.md`.

- TI planner (Stage 2.9C follow-up): Insider at-limit calendar connect UX and hardening.
  - In `apps/ti-web/app/_components/planner/PlannerClient.tsx`, added centralized connect flow so `Connect calendar` now opens:
    - unverified-email gate (`planner` import gate `unverified`) when signed-in but not confirmed,
    - limit gate (`multi_calendar`) for Insider users who cannot add another source,
    - the import modal only when the flow is actually allowed.
  - Kept server-side enforcement intact by preserving limit handling in `onImportIcs`: `calendar_feed_limit_reached` now maps to the same limit gate UI instead of generic inline error text.
  - Added gate-state hardening for concurrent loading (`busy`/`sourcesBusy`) to avoid race-opening import modal while source state is still loading.

## 2026-06-01

- Weekend Planner (Stage 2.9B-0) — connected calendar feed labels.
  - Added a one-line label editor for connected calendars (stored in `planner_event_sources.source_name`) with fallback `Connected calendar`.
  - Imported event cards and Season calendar event detail now display the source label (or fallback) for ICS-linked events.
  - Files: `apps/ti-web/app/api/planner/sources/[id]/route.ts`, `apps/ti-web/app/_components/planner/PlannerClient.tsx`, `apps/ti-web/app/_components/planner/PlannerCalendar.tsx`, `CLAUDE.md`.

## 2026-05-31

- TI planner (Stage 2.7): UAT hardening + typed planner analytics.
  - Prompt: `docs/prompts/ti-planner-stage-2.7-uat-hardening-typed-analytics.md`.
  - Typed events: `apps/ti-web/lib/tiAnalyticsEvents.ts`.
  - Persistence allowlist: `apps/ti-web/app/api/analytics/route.ts` (`PLANNER_EVENTS` → `public.ti_map_events`).
  - Instrumentation: `apps/ti-web/app/_components/planner/PlannerClient.tsx` and `apps/ti-web/app/_components/planner/PlannerCalendar.tsx` (fail-open, privacy-safe).
  - Admin click dashboard list updated: `apps/referee/app/admin/ti/clicks/page.tsx`.
  - UAT docs alignment: `CLAUDE.md`, `docs/weekend-planner-uat.md`, `docs/qa/ti-planner-ics-uat.md`.

- TI planner (Stage 2.7B): post-UAT documentation snapshot.
  - Prompt: `docs/prompts/ti-planner-stage-2.7b-post-uat-snapshot.md`.
  - Current state: `docs/weekend-planner-current-state.md`.
  - Cross-doc links refreshed: `docs/weekend-planner-uat.md`, `docs/qa/ti-planner-ics-uat.md`, `docs/admin-reference.md`, and `CLAUDE.md` (local, gitignored).

- TI planner (UAT follow-ups): address local UAT flags (F1/F2/F7/F8).
  - Add top-of-page `Add event` entrypoint that opens/scrolls to the manual event form.
  - Remove global Weekend Pro upsell card from Upcoming/This Weekend; keep entitlement upgrade prompts scoped to Season.
  - Make Season calendar gate dismissal (“Continue with list”) persist for the session.
  - Tighten Duplicate button to manual-only events (`source_type="manual"` and no `source_id`).
  - Fix F7: ensure ICS-linked events never render as manual/duplicable by treating rows with `source_event_uid` (and/or `source_id`) as synced in `GET /api/planner/events` and the planner UI.

- TI planner (UAT follow-ups): address remaining UAT flags (F3/F4).
  - F3: calendar-limit UI gate now opens an actionable upgrade/verify prompt instead of a disabled/inert “Connect calendar” button.
  - F4: added `/account/logout` redirect to canonical `/logout`.

- TI planner (Stage 2.8): landed repo-validated Stage 2.8 prompt + minor polish.
  - Prompt: `docs/prompts/ti-planner-stage-2.8-uat-polish-launch-readiness.md`.
  - UAT runner checklist section added: `CLAUDE.md` (“Stage 2.8 UAT (polish + launch readiness)”).

## 2026-05-27

### Analytics: venue map panels fix — /admin/ti/clicks

**Root cause:** Two "No data yet" panels despite real event volume (66 `venue_map_opened` in last 30d).

- **"Top 10 venue maps opened" panel** — `admin_top_viewed_venues` RPC filtered `properties->>'venue_id' IS NOT NULL` on `venue_map_opened` events. But `venue_map_opened` is a page-level event (one fire per map page load); it has `tournament_id`, not `venue_id`. No rows ever matched.
- **"Top states by venue map opens" panel** — `admin_top_states_by_venue_opens` filtered `state IS NOT NULL`. The `state` column is populated from `props.state` at insert time, but `venue_map_opened` didn't include a `state` property in its payload. Always NULL.

**Fixes:**

*Fix 1 — RPC (`supabase/migrations/20260527_admin_venue_map_rpc_fix.sql`):*
- DROPs and recreates `admin_top_viewed_venues` to group by `properties->>'tournament_id'` instead of `venue_id`.
- Return type changes: `tournament_id`, `view_count`, `name`, `start_date`, `end_date` (JOINs `tournaments`).
- Panel retitled "Top 10 tournament venue maps — last 30d". **Must apply migration to see data.**

*Fix 3 — `state` propagation (5 files):*
- `map/page.tsx`: adds `state` to `TournamentRow` type + `.select()`, passes it in tournament prop.
- `TournamentVenueMapShellClient.tsx` + `TournamentVenueMapClient.tsx`: adds `state: string | null` to tournament prop type.
- `TournamentVenueMapClient.tsx`: passes `state: tournament.state ?? null` in `venue_map_opened` event payload.
- `tiAnalyticsEvents.ts`: adds `state` to `venue_map_opened` type.
- Historical events before this deploy won't have `state`; "Top states" panel populates from new events only.

**Files changed:**
- `supabase/migrations/20260527_admin_venue_map_rpc_fix.sql` — new migration (apply to prod)
- `apps/referee/app/admin/ti/clicks/page.tsx` — updated `TopVenueRow` type + panel rendering
- `apps/ti-web/app/tournaments/[slug]/map/page.tsx` — added `state` to query + prop
- `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapShellClient.tsx` — added `state` to tournament prop type
- `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapClient.tsx` — added `state` to prop type + event payload
- `apps/ti-web/lib/tiAnalyticsEvents.ts` — added `state` to `venue_map_opened` type

## 2026-05-25

### Analytics dashboard redesign — /admin/ti/clicks

**Files changed:**
- `apps/referee/app/admin/ti/clicks/page.tsx` — full rewrite
- `apps/referee/app/admin/ti/clicks/ClicksTableClient.tsx` — Today + Trend columns, fixed anomaly detector
- `supabase/migrations/20260525_admin_analytics_rpcs.sql` — 4 new Postgres RPC functions (**must apply before top-viewed/dimension sections render**)

**What changed:**
- **KPI health tiles** (6 tiles): Tournament detail views, Venue map opens, Weekend plan clicks (all sources), Travel search clicks, Owl's Eye opens, Premium CTA clicks — yesterday + 7d daily avg.
- **Conversion funnel**: Directory views → Detail views → Venue map opens → Weekend plan clicks → Travel search clicks. Shows yesterday counts + through-rate % between each step.
- **Event table — Today column**: "Today so far" count alongside Yesterday/Last 7d/Last 30d.
- **Event table — Trend column**: ↑↑ / ↑ / → / ↓ / ↓↓ based on yesterday vs 7d daily average. Green/red coloring.
- **Anomaly detector fix**: was comparing yesterday to the 7d SUM (never fired). Now: `r.last7d > 0 && r.yesterday > (r.last7d / 7) * 2`.
- **New event groups**: Discovery (`map_viewed`, `homepage_cta_clicked`, `homepage_sport_chip_clicked`, `venue_page_viewed`, `weekend_page_opened`) and Book Travel (8 `book_travel_*` events — fixes blind spot from 2026-05-12 audit). Also added `tournament_map_cta_clicked` which was in the analytics allowlist but missing from the dashboard.
- **Top 10 viewed tournaments** (last 30d): name + date range. Requires `admin_top_viewed_tournaments` RPC.
- **Top 10 venue maps opened** (last 30d): venue name + next upcoming tournament start date. Requires `admin_top_viewed_venues` RPC.
- **Dimension snapshot**: top 5 sports by tournament detail views, top 5 states by venue map opens — last 30d. Requires `admin_top_sports_by_views` and `admin_top_states_by_venue_opens` RPCs.

**RPCs (migration `20260525_admin_analytics_rpcs.sql`):**
- `admin_top_viewed_tournaments(since_iso, result_limit)` — aggregates JSONB `properties->>'tournament_id'`, JOINs `tournaments` for name/dates.
- `admin_top_viewed_venues(since_iso, result_limit)` — aggregates JSONB `properties->>'venue_id'`, JOINs `venues` for name, correlated subquery for next upcoming tournament date.
- `admin_top_sports_by_views(since_iso, result_limit)` — top sports by `tournament_detail_page_viewed` (top-level `sport` column).
- `admin_top_states_by_venue_opens(since_iso, result_limit)` — top states by `venue_map_opened` (top-level `state` column).
- All: `STABLE SECURITY DEFINER`. Apply via Supabase SQL editor or `supabase db push`.
- If migration is not yet applied, the top-viewed and dimension sections render an inline error hint rather than crashing.

## 2026-05-12

### /book-travel CRO / SEO / affiliate audit
- Full audit complete: `docs/audits/book-travel-cro-seo-affiliate-audit.md`
- **Top finding (high):** `book_travel_*` analytics events are typed in `tiAnalyticsEvents.ts` and fired client-side (`WeekendPlannerClient.tsx`) but `/api/analytics` does not persist them — they only reach console. We are blind to page-level funnel behavior; only late-funnel `ti_outbound_clicks` (server) is captured.
- **SEO (medium):** Title/H1/meta copy is generic "Book travel for your event" — no "youth sports tournament travel" anchoring. Likely attracts generic travel intent rather than tournament-specific queries.
- **CRO (medium):** Dates are optional; handoff to Booking.com / Vrbo without dates likely converts poorly. No `has_dates` signal in analytics to measure this.
- **Internal funnel (medium):** "Browse tournaments" CTA exists but no clear "next best action" copy for users who only know city/state.
- **Compliance (low):** `AffiliateDisclosure` renders below the planner UI — consider moving closer to outbound CTAs.
- Affiliate handoff mechanics reviewed: Booking.com (Awin) and Vrbo (CJ) wiring is correct; do not change partner IDs. Logging to `ti_outbound_clicks` is working on both `/go/hotels` and `/go/vrbo`.
- Minimal fix plan (in audit): (1) persist `book_travel_*` events, (2) fire `book_travel_viewed` on load, (3) add `has_dates`/`has_destination`/`travel_type` properties, (4) tighten title/H1/meta, (5) add FAQ block, (6) add 6 sport directory links, (7) move disclosure nearer CTAs.

## 2026-05-11

### Perplexity venue search for missing-venue tournaments
- New API endpoint: `POST /api/admin/tournaments/enrichment/venue-perplexity`
  - Input: `{ tournament_id }`. Looks up tournament (name, city, state, sport, dates), calls Perplexity `sonar` with a focused prompt asking for all venues as an array.
  - Returns `venues[]` (multiple venues supported — tournaments often use 2–4 complexes).
  - Each candidate written to `tournament_venue_candidates` with `evidence_text: "reason=perplexity_search; ..."` and `confidence: 0.75`.
  - Raw Perplexity response stored in `discovery_batches` (provider=perplexity, model=sonar, notes=`venue_search:<tournament_id>`) for audit.
  - Uses `EXTERNAL_API_SURFACE.tournament_enrichment` for call tracking.
- New client component: `PerplexityVenueButton.tsx` — purple button in the missing-venues actions column, below "Deep scan". Shows inserted count and venue names on success.
- Candidates feed into the **existing enrichment approval flow** (`/admin/tournaments/enrichment`). No new approval UI needed.
- `VENUE_REASON_CODES` updated in both `missing-venues/page.tsx` and `EnrichmentClient.tsx` to include `"perplexity_search"` (shown as "perplexity search" badge in the enrichment UI).
- Model choice: `sonar` (cheaper than `sonar-reasoning-pro`; focused single-tournament query doesn't need multi-step reasoning). Do NOT add `response_format` to the request body — `sonar` only accepts `text`, `json_schema`, or `regex`; `json_object` throws a validation error.
- Files: `apps/referee/app/api/admin/tournaments/enrichment/venue-perplexity/route.ts`, `apps/referee/app/admin/tournaments/missing-venues/PerplexityVenueButton.tsx`, `apps/referee/app/admin/tournaments/missing-venues/page.tsx`, `apps/referee/app/admin/tournaments/enrichment/EnrichmentClient.tsx`

### Missing-venues page: bulk venue inference panel for published tournaments
- New panel `MissingVenueBulkInferencePanel` at top of `/admin/tournaments/missing-venues` (both tabs).
- Mirrors the uploads-tab inference panel but targets **published** tournaments via new RPCs.
- Flow: Preview → shows candidates with confidence scores → Dry run → Apply (write) → writes `tournament_venues` rows with `is_inferred=true` → then promote/reject inline per venue.
- Per-tournament: Select all + Promote selected (bulk), or individual Promote/Reject per row.
- Promote calls `/api/admin/tournaments/enrichment/inferred/promote`; Reject calls inferred/reject — same endpoints as the uploads panel.
- New API route: `GET/POST /api/admin/tournaments/missing-venues/infer` — calls `apply_inferred_venue_candidates_for_published`.
- New DB functions (migration `20260511_venue_inference_for_published.sql`):
  - `get_inferred_venue_candidates_for_published(limit_per_tournament)` — same scoring as draft version (`city_state_sport_cluster_v2`, threshold 0.45, min 3 distinct tournaments) but filters `status='published'`.
  - `apply_inferred_venue_candidates_for_published(limit_per_tournament, dry_run)` — upserts inferred links, dry-run safe.
- **Must apply migration before panel will work.** Run in Supabase SQL editor or via `supabase db push`.

### Missing-venues page: inline inferred venue promote/reject
- Each tournament row in the actions column now shows any `tournament_venues` rows with `is_inferred=true` directly inline.
- Each inferred link shows venue name (purple) + **Promote** (green) and **Reject** (grey) buttons — no need to navigate to the uploads tab inference panel.
- Promote calls `POST /api/admin/tournaments/enrichment/inferred/promote`; Reject calls `POST /api/admin/tournaments/enrichment/inferred/reject` with `remove_link=true`.
- New component: `apps/referee/app/admin/tournaments/missing-venues/PromoteInferredButton.tsx`
- Page fetches inferred links in the same `Promise.all` as candidates/batches (`.eq("is_inferred", true)` on `tournament_venues`).

### Missing-venues page: Edit and Delete buttons per tournament
- Edit button (blue "Edit ↗") under each tournament UUID opens `/admin?tab=tournament-listings&q={slug}` in a new tab.
- Delete button (red "Delete") calls existing `POST /api/admin/tournaments/delete` with a confirm dialog; hides the row on success. Venue records are preserved.
- New component: `apps/referee/app/admin/tournaments/missing-venues/DeleteTournamentButton.tsx`

### Venue data fixes
- Venue `4f71d845` ("Fort Myers FL") updated to "5 Plex – Lee County Player Development Complex", 4301 Edison Ave, Fort Myers, FL 33916. Was a city/state placeholder linked to 30 Perfect Game baseball tournaments.
- Manual venue candidates inserted for Richard Moss-Solomon Legacy Cup: North Fields (1185 Centennial Boulevard, Port Charlotte, FL 33953) and South Fields (670 Cooper St, Punta Gorda, FL 33950), sourced from ccsfsoccer.com/tournaments/.

## 2026-05-10 (3)

### Deep scan: browser user-agent + GotSport URL rewrite
- **Browser user-agent**: replaced `"RI-FeesVenue-Scraper/2.0"` with a realistic Chrome UA in `fetchHtml`. Many tournament platforms (GotSport, SportsEngine, etc.) block obvious bot agents or redirect to login; a browser UA gets through to actual page content.
- **GotSport URL rewrite**: `system.gotsport.com/event_regs/ID` (auth-gated registration page) is rewritten to `www.gotsport.com/events/ID` (public event page) before crawling. Source URLs in the DB often point to the registration endpoint which returns 0 pages; the public event page has location/venue info without requiring login.
- File: `apps/referee/app/api/admin/tournaments/enrichment/fees-venue/route.ts`

## 2026-05-10 (2)

### /book-travel — new canonical travel booking URL
- Created `/book-travel` as the canonical URL for the travel booking surface (hotels + Vrbo). `/weekend-planner` remains live and renders the same experience; TODO redirect once the calendar-based Weekend Planner product launches.
- Both routes render `WeekendPlannerClient` from `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx` (no duplicate copy).
- Global nav: replaced "How it works" with "Book Travel" (`/book-travel`); moved "How it works" to the footer nav alongside Terms/Privacy/Disclaimer. Nav stays at 4 items.
- Copy updates throughout client: card titles ("Hotels", "Vacation Rentals"), card descriptions, CTAs ("Search hotels on Booking.com", "Search Vrbo rentals"), tournament bridge ("Planning around a listed tournament?"), missing event section renamed to "Don't see your event?" with two CTAs (scroll-to-destination + "Add event"), upsell heading updated, share block renamed ("Planning with a team or family?" / "Copy travel link").
- Share URL: `CANONICAL_BOOK_TRAVEL_URL` + `useEffect` both point to `/book-travel` (canonical shared from both routes).
- Analytics: all `weekend_planner_*` event names renamed to `book_travel_*`; `source` property changed from `"weekend_planner"` to `"book_travel"`; hidden form `source` fields updated on both hotel and Vrbo forms; `UpgradeWeekendProButton` props (`source_page`, `source_context`, `entry_point`) updated to `"book_travel"`.
- New analytics events added to `tiAnalyticsEvents.ts`: `book_travel_hotels_clicked`, `book_travel_vrbo_clicked`, `book_travel_shared`, `book_travel_search_by_city_clicked`, `book_travel_add_event_clicked`, `book_travel_tournament_directory_clicked`, `book_travel_weekend_pro_upsell_clicked`.
- Metadata: both `/book-travel` and `/weekend-planner` point canonical to `/book-travel`; title/description avoid "Weekend Planner" branding.

## 2026-05-10

### Venue cleanup (data)
- Deleted 269 non-venue records from the `venues` table (junk entries like "TBD", "Multiple X Venues", "Rules", "Format:", bare city-state strings, and Oregon/Wyoming/Montana geocode-bleed ingest bugs).
- 39 were orphaned (no tournament_venues links) — deleted directly.
- 230 had tournament_venues links — hotel outbound clicks for those venues cleared first (constraint `ti_outbound_clicks_destination_type_hotels_requires_venue_id` blocks SET NULL on delete), then venues deleted via cascade.
- Affected tournaments (283 with sole-venue junk link) now surface in `/admin/tournaments/missing-venues` (Published backlog) for venue re-assignment via deep scan + enrichment queue.

### Deep scan quality improvements
- **`cleanAddressText`**: new helper that strips trailing noise (`United States`, `+ Google Map`, `Open in Maps`) and extracts the innermost clean street address from paragraph blobs. The extraction regex limits street-name tokens to 1-4 words before the suffix, preventing greedy matches that absorbed surrounding table-row text (e.g. "Sat 16 Bethlehem Soccer Tournament ... 426 Wemple Rd" → "426 Wemple Rd, Glenmont, NY 12077"). Applied at all push sites for `inferredAddressPool`, `venuePageAddressPool`, and `venueEntriesPool`.
- **`cleanVenueName` dedup**: splits on `•`/`|`, deduplicates segments case-insensitively ("Gavin Park • Gavin Park" → "Gavin Park").
- **`searchFullAddressForVenue` → Mapbox**: replaced the DuckDuckGo scrape loop (which contributed ~5s/tournament to bulk scan timeouts) with a single Mapbox forward-geocode call (`/geocoding/v5/mapbox.places`). Uses existing `MAPBOX_ACCESS_TOKEN`.
- **`enrichAddressWithMapboxPOI`**: new function — on single-tournament deep scans, address-only candidates (no venue name) are passed to Mapbox to retrieve the POI name at that address (e.g. "10 Lewis Drive, Wilton, NY" → "Gavin Park"). Only runs in single-tournament mode to avoid bulk API cost.
- **Bulk min score raised**: `minScoreToInsert` changed from 5 to 7 for bulk scans (requires street address + zip + venue name), keeping 5 for single-tournament scans where Mapbox POI enrichment has already run.
- File: `apps/referee/app/api/admin/tournaments/enrichment/fees-venue/route.ts`

## 2026-05-06
- Affiliate revenue: fixed Awin pending not showing on `/admin/ti/revenue` — two root causes addressed:
  1. Cron (`apps/referee/app/api/cron/ti-affiliate-sync/route.ts`) only ever synced "yesterday"; added `?date=YYYY-MM-DD` query param override so specific days can be backfilled manually. Backfill scope: Apr 15–May 5.
  2. "Awin pending" and "CJ pending" tiles were scoped to yesterday-only (`awinYesterdayPending`); changed to all-time totals (`awinTotalPending`, `cjTotalPending`) since affiliate commissions accumulate across many days: `apps/referee/app/admin/ti/revenue/page.tsx`.
- Tournament discovery workbench migration: added `supabase/migrations/20260506_tournament_discovery_workbench.sql` — creates `discovery_searches`, `discovery_batches`, and `tournament_discovery_candidates` tables (service_role-only RLS; `updated_at` triggers on all three).

## 2026-04-20
- Hotels visibility: moved the existing “Hotels near this venue” list out of premium-only UI so names/distances render for all users while keeping non-sponsor “Directions” gated (sponsor links remain clickable): `apps/ti-web/app/venues/[venueId]/page.tsx`, `apps/ti-web/components/venues/OwlsEyeVenueCard.tsx`.
- Booking.com (Awin) hotel redirects: added `/go/hotels` server-side redirect with Booking URL build → Awin `cread.php` wrap → best-effort click logging → 302 with `no-store` headers (local dev can fall back to direct Booking if Awin env vars are missing): `apps/ti-web/app/go/hotels/route.ts`.
- Outbound click logging (hotels): extended `public.ti_outbound_clicks` so venue-level hotel clicks can be logged (nullable tournament fields, added `destination_type`, `partner`, `source_surface`, `venue_id`, constraints, and indexes): `supabase/migrations/20260420_ti_outbound_clicks_hotels.sql`.
- Booking CTA UX: “Check hotel availability” CTA with urgency microcopy and non-blocking analytics beacon (`venue_hotels_cta_clicked`): `apps/ti-web/components/venues/HotelBookingCta.tsx`, `apps/ti-web/components/venues/OwlsEyeVenueCard.tsx`, `apps/ti-web/app/tournaments/tournaments.css`.
- Booking visibility broadened beyond Owl’s Eye: show the Booking CTA for any venue card surface with a valid 5-digit US ZIP (keeps existing tracking/redirect flow via `/go/hotels`): `apps/ti-web/components/venues/VenueCard.tsx`, `apps/ti-web/components/venues/VenueCard.module.css`.
- Booking search-string helper: centralized Booking `ss` computation and updated `/go/hotels` to use Booking’s preferred order (`City+State+ZIP` → `City+State` → `ZIP` last resort), while continuing to avoid region labels like “Front Range”: `apps/ti-web/lib/booking/venueBooking.ts`, `apps/ti-web/app/go/hotels/route.ts`, `apps/ti-web/lib/booking/venueBooking.test.ts`.
- Venue page CTA placement: when Owl’s Eye is present, render the Booking CTA above the hotel list (within the Nearby Options card) without using Owl’s Eye as a visibility gate; non-Owl’s Eye venues still show the CTA above the Nearby Options section when ZIP is valid: `apps/ti-web/components/venues/OwlsEyeVenueCard.tsx`.

## 2026-04-15
- Weekend Pro unlock: regular venue reviews now also trigger the same 12-month Weekend Pro grant used by Quick Venue Check (one-time via `public.ti_promo_grants`; reconciles duplicate grants without extending the window): `apps/ti-web/app/api/venue-reviews/route.ts`.
- Supabase auth stability: fix “new tab logs me out” by setting Supabase auth cookies with `Domain=.tournamentinsights.com` (shared across `tournamentinsights.com` and `www.tournamentinsights.com`) for browser + middleware + key auth routes: `apps/ti-web/lib/supabaseClient.ts`, `apps/ti-web/middleware.ts`, `apps/ti-web/app/auth/confirm/route.ts`, `apps/ti-web/app/logout/route.ts`, `apps/ti-web/app/admin/sso/route.ts`, `apps/ti-web/app/api/account/{profile,change-email,email-preferences}/route.ts`.
- Weekend Pro claim UX hardening: fix a React effect that could leave the `/account` “Claiming Weekend Pro reward…” banner stuck, suppress the banner once the user is already Weekend Pro (clears stale localStorage), and avoid showing raw backend error codes (friendly message + retry): `apps/ti-web/app/account/QuickVenueCheckRewardClaim.tsx`, `apps/ti-web/app/account/page.tsx`.
- Quick Venue Check: after submit, attempt a best-effort immediate claim (signed-in + verified users upgrade immediately, logged-out users still claim after signup/verify): `apps/ti-web/components/venues/QuickVenueCheck.tsx`.
- Mobile UX: remove the homepage hero “Browse tournaments” CTA (header already includes Tournament Directory) to avoid iPhone/mobile-simulator horizontal overflow; also set explicit `viewport` width/scale and add coarse-pointer stacking guard: `apps/ti-web/app/page.tsx`, `apps/ti-web/app/layout.tsx`, `apps/ti-web/app/home.css`.

## 2026-04-02
- SEO: Metro/Region markets (v1):
  - Added service-role-only reference tables + seed:
    - `supabase/migrations/20260402_metro_markets_dc_new_england.sql`
  - Added region expansion seed (idempotent, insert-only mappings):
    - `supabase/migrations/20260402_metro_markets_region_expansion.sql`
  - Added California city-split rules (service-role-only) + seed data:
    - `supabase/migrations/20260402_metro_market_city_rules_ca_split.sql`
  - Added metro listing pages under `/tournaments/metro/[slug]` reusing the main directory listing UI/query shape:
    - `apps/ti-web/app/tournaments/metro/[slug]/page.tsx`
    - `apps/ti-web/app/tournaments/_lib/getMetroMarketTournaments.ts`
  - Added deterministic SEO copy (title/description/intro + FAQ) per market slug in the metro page.
  - Added metro/region internal links on the tournaments landing page:
    - `apps/ti-web/app/tournaments/page.tsx`
  - Tournament detail: added deterministic metro labels for DC Metro, New England, and a generic California regional label:
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`

## 2026-03-31
- Scheduled Tournament Alerts (v1):
  - Added:
    - `supabase/migrations/20260331_ti_user_tournament_alerts.sql` (alerts table + cron job lock RPCs)
    - `supabase/migrations/20260331_ti_tournament_alert_send_logs.sql` (send/error logs for admin KPIs)
    - `apps/ti-web/app/account/alerts/*` (account UI for create/edit/activate/delete)
    - `apps/ti-web/app/api/account/alerts/*` (server routes for alert CRUD)
    - `apps/ti-web/app/api/cron/tournament-alerts/route.ts` (cron send job; Resend)
    - `apps/ti-web/lib/tournamentAlerts*.ts` (matching, due logic, email rendering, send job)
    - `docs/ti-scheduled-tournament-alerts.md` (implementation notes)
    - `apps/ti-web/vercel.json` (Vercel cron config)
  - Updated:
    - `apps/ti-web/app/account/page.tsx` (account surfacing + cleanup)
    - `apps/ti-web/lib/types/supabase.ts` (generated types)
    - `apps/referee/app/admin/ti/page.tsx` (TI admin KPIs entrypoint)
  - Follow-ups:
    - Added a one-off “Send test alert” form on the TI admin KPIs panel (email/zip/radius/sport) for on-demand debugging.
    - Alert emails (Insider only) now include a lightweight Owl’s Eye™ teaser line (counts-only) for up to the first 1–2 matched tournaments that have persisted Owl’s Eye nearby data.
    - Updated Owl’s Eye “gear” emoji to `⚽` for consistency across the venue teaser and alert emails.
  - Fixes:
    - Fixed Supabase SSR cookie `path` handling to always set auth cookies on `/` so `/api/account/profile` and other API routes reliably see the signed-in session.
  - UI polish:
    - Alerts page copy now clarifies tier limits (“As an Insider…”) instead of sounding like the user already has an alert.

- Saved tournament change notifications (v1):
  - Added:
    - `supabase/migrations/20260331_ti_saved_tournament_change_notifications.sql`
    - `apps/ti-web/app/api/cron/saved-tournament-changes/route.ts`
    - `apps/ti-web/lib/savedTournamentChangeNotificationsJob.ts`
    - `apps/ti-web/lib/savedTournamentChangeNotificationsEmail.ts`
    - `docs/ti-saved-tournament-change-notifications.md`
  - Updated:
    - `apps/ti-web/app/account/page.tsx`
    - `apps/ti-web/app/account/SavedTournamentsSection.tsx`
    - `apps/ti-web/app/api/saved-tournaments/[tournamentId]/route.ts`
    - `apps/ti-web/vercel.json`
  - UI polish:
    - Saved tournament “Notify: On/Off” toggle is color-coded (green for On, red for Off).
    - Added a persistent `Browse tournaments` link in the Saved Tournaments section header.

- Admin:
  - Added a simple bulk email composer to `apps/referee/app/admin/ti/page.tsx` for sending a message to selected TI users (individual sends; max 50 recipients per send).

## 2026-03-04
- TI event-code redemption support + trial-aware entitlement gating:
  - Added:
    - `supabase/migrations/20260304_event_codes_redemption_support.sql`
  - Updated:
    - `apps/ti-web/lib/entitlements.ts`
    - `apps/ti-web/lib/entitlementsServer.ts`
    - `apps/ti-web/app/account/page.tsx`
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
    - `apps/ti-web/app/venues/[venueId]/page.tsx`
  - Changes:
    - aligned the TI event-code database shape with the RI admin tool by adding redemption metadata defaults and replacing the create/redeem RPCs,
    - redeeming a code now writes trial/permanent access state onto `ti_users` in a consistent way,
    - TI entitlement checks now grant Weekend Pro for active `trial_ends_at` windows instead of only honoring paid active subscriptions,
    - account/tournament/venue access checks now all use the same TI access fields and surface `Trial ends` when appropriate.
  - Validation:
    - `cd apps/ti-web && npm run build` passed.

## 2026-03-03
- TI verify links now preload the target tournament by id:
  - Updated:
    - `apps/ti-web/app/api/list-your-tournament/route.ts`
    - `apps/ti-web/app/list-your-tournament/ListYourTournamentForm.tsx`
  - Changes:
    - `GET /api/list-your-tournament` now supports `?tournamentId=<uuid>` lookup in addition to name/city/state duplicate search,
    - `/verify-your-tournament` email links now preload the exact tournament, linked venues, and tournament-wide sponsors from `tournamentId` instead of landing on a blank verify form,
    - verify-mode preload runs once from outreach context and reuses the existing duplicate-match mapping logic rather than introducing a separate write path.
  - Validation:
    - `cd apps/ti-web && npm run build` passed.

- TI outreach email refresh + deterministic A/B + send-mode tracking:
  - Added:
    - `supabase/migrations/20260303_email_outreach_preview_variant_and_provider.sql`
    - `apps/ti-web/lib/outreach/ab.ts`
    - `apps/ti-web/lib/outreach/templates/soccerDirectorVerify.ts`
    - `apps/ti-web/public/brand/ti-email-logo-520.png`
  - Updated:
    - `apps/ti-web/lib/outreach.ts`
    - `apps/ti-web/app/api/outreach/generate-previews/route.ts`
    - `apps/ti-web/app/admin/outreach-previews/page.tsx`
    - `apps/ti-web/app/verify-your-tournament/page.tsx`
    - `apps/ti-web/app/list-your-tournament/ListYourTournamentForm.tsx`
  - Changes:
    - replaced the original soccer director outreach copy with a shorter, more human template aimed at tournament directors,
    - added deterministic A/B subject assignment by `tournament_id`,
    - preview/send records now capture `variant` and `provider_message_id`,
    - `OUTREACH_MODE=send` now sends through TI Resend wiring while still respecting `OUTREACH_TEST_RECIPIENT` in local/dev,
    - verify links now include `ab`, `utm_campaign`, and `utm_term` so verify-page analytics can attribute completions back to the outreach variant,
    - verify-page analytics events now include `campaign_id`, `variant`, and `tournament_id`,
    - outreach emails now use the hosted TI email logo at `/brand/ti-email-logo-520.png`.
  - Validation:
    - `cd apps/ti-web && npm run build` passed.

## 2026-03-10
- TI admin polish (shared with RI note):
  - Added dashboard cards on `admin/tournaments/dashboard` for Total outreach sent and Total tournaments verified.
  - Restored badge SVG assets into `shared-assets/svg` and adjusted the SVG copy script to merge rather than delete app public/svg folders.
  - Owl’s Eye ready list now shows an “Edit” link to jump to venue admin.
  - Venues admin sport filter now includes Softball.
  - DB groundwork: added `venue_sport_profiles` table and `tournament_venues.venue_sport_profile_id` FK to support per-sport (indoor/outdoor) venue profiles and future field-level detail.

- TI sports taxonomy reuse + signup copy polish:
  - Updated:
    - `apps/ti-web/lib/tiProfile.ts`
    - `apps/ti-web/app/signup/page.tsx`
    - `apps/ti-web/app/tournaments/page.tsx`
    - `apps/ti-web/app/venues/page.tsx`
    - `apps/ti-web/app/tournaments/hubs/config.ts`
  - Changes:
    - signup sports interests now reuse the canonical TI sports constant instead of a one-off label list,
    - signup helper copy now matches the requested CMO wording,
    - tournament and venue surfaces now share the same TI sport label map instead of repeating local copies.

- TI auth-email smoke retry hardening:
  - Updated:
    - `apps/ti-web/smoke-auth-emails.ts`
  - Changes:
    - added retry/backoff handling for Supabase auth email cooldown responses so magic-link and password-reset smoke runs fail less often on temporary rate limits.

- TI outreach preview mode + admin review/send controls:
  - Added:
    - `supabase/migrations/20260303_email_outreach_previews.sql`
    - `apps/ti-web/lib/outreach.ts`
    - `apps/ti-web/lib/outreachAdmin.ts`
    - `apps/ti-web/lib/email.ts`
    - `apps/ti-web/app/api/outreach/generate-previews/route.ts`
    - `apps/ti-web/app/api/outreach/previews/route.ts`
    - `apps/ti-web/app/api/outreach/send-test/route.ts`
    - `apps/ti-web/app/admin/outreach-previews/page.tsx`
    - `apps/ti-web/app/admin/outreach-previews/CopyFieldButton.tsx`
    - `apps/ti-web/app/admin/outreach-previews/GeneratePreviewsForm.tsx`
    - `apps/ti-web/app/admin/outreach-previews/PreviewAdminActions.tsx`
  - Changes:
    - added a TI-only preview-mode outreach table and generator flow for soccer director verification emails,
    - added a reusable `buildSoccerVerifyEmail(...)` template and TI verify links with outreach UTM parameters,
    - added `/admin/outreach-previews` as an internal TI review surface for filtering, inspecting HTML/text email previews, and copying subject / verify URL / HTML,
    - added browser actions to generate preview batches, send a selected preview as a real test email, delete a single preview, or delete an entire campaign batch,
    - added TI-local email sending via Resend for test sends, defaulting the sender to `hello@mail.tournamentinsights.com` while keeping `EMAIL_REPLY_TO` separate for replies,
    - tightened the preview-review page layout by reducing wide table columns and moving verify-link / subject context into a denser detail panel with status pills.
  - Validation:
    - `cd apps/ti-web && npm run build` passed.

- TI outreach suppressions + one-click unsubscribe:
  - Added:
    - `supabase/migrations/20260303_email_outreach_suppressions.sql`
    - `apps/ti-web/app/api/outreach/suppressions/route.ts`
    - `apps/ti-web/app/unsubscribe-outreach/page.tsx`
  - Updated:
    - `apps/ti-web/app/api/outreach/generate-previews/route.ts`
    - `apps/ti-web/app/admin/outreach-previews/page.tsx`
    - `apps/ti-web/app/admin/outreach-previews/PreviewAdminActions.tsx`
    - `apps/ti-web/lib/outreach.ts`
  - Changes:
    - added a TI-only suppression table keyed by `tournament_id` so opt-outs persist across future outreach campaigns,
    - added a `Suppress tournament` action in the outreach preview admin that writes the suppression row and removes the current preview from the active batch,
    - preview generation now excludes suppressed tournaments automatically,
    - outreach emails now include a signed one-click unsubscribe link,
    - added `/unsubscribe-outreach` so directors can remove a tournament from future verification campaigns without requiring admin access,
    - unsubscribe writes to the same suppression table and clears matching preview rows for that tournament/email.
  - Validation:
    - `cd apps/ti-web && npm run build` passed.

- TI homepage/header brand refresh + mobile header tuning:
  - Updated:
    - `apps/ti-web/app/layout.tsx`
    - `apps/ti-web/app/globals.css`
    - `apps/ti-web/app/page.tsx`
    - `apps/ti-web/public/brand/ti-stacked-logo-white-transparent.svg`
  - Changes:
    - replaced the TI header mark with a stacked white transparent logo that reads cleanly on the blue TI header,
    - widened and centered the desktop header logo slot, then tuned the mobile header stack with a smaller logo, tighter nav spacing, and a shorter CTA/account block for smaller phones,
    - aligned the yellow `List your tournament` header CTA with the `Public Beta` pill and centered the account icon directly underneath it,
    - removed the duplicate homepage logo block and `Powered by Tournyx` line so the header carries the primary branding,
    - updated homepage hero CTAs to use TI blue branded button treatments for `Sign up`, `Explore Tournaments`, and `Request Premium Access` without changing the yellow header CTA.
  - Validation:
    - `cd apps/ti-web && npm run build` passed.

- TI homepage/header brand cleanup:
  - Updated:
    - `apps/ti-web/app/layout.tsx`
    - `apps/ti-web/app/globals.css`
    - `apps/ti-web/app/page.tsx`
    - `apps/ti-web/public/brand/ti-stacked-logo-white-transparent.svg`
  - Changes:
    - replaced the TI header logo with a larger stacked white transparent logo optimized for the blue header gradient,
    - removed the older boxed/logo-frame treatment and widened header logo sizing so the stacked mark remains visible on desktop and mobile,
    - updated the TI header gradient to the refined blue vertical treatment and tightened header spacing while keeping nav centered below the logo,
    - removed the duplicate homepage logo block and `Powered by Tournyx` line so the header is the sole brand anchor on the homepage.
  - Validation:
    - `cd apps/ti-web && npm run build` passed.

- TI verify-your-tournament conversion flow + in-place verification updates:
  - Added:
    - `apps/ti-web/app/verify-your-tournament/page.tsx`
    - `apps/ti-web/app/verify-your-tournament/VerifyYourTournamentPage.module.css`
    - `apps/ti-web/app/api/analytics/route.ts`
    - `apps/ti-web/lib/analytics.ts`
  - Updated:
    - `apps/ti-web/app/api/list-your-tournament/route.ts`
    - `apps/ti-web/app/list-your-tournament/ListYourTournamentForm.tsx`
    - `apps/ti-web/app/list-your-tournament/ListYourTournamentForm.module.css`
    - `apps/ti-web/lib/listTournamentForm.ts`
  - Changes:
    - added `/verify-your-tournament` as a sport-aware TI landing page that reuses the existing tournament submission form in `verify` mode,
    - verify copy now adapts by sport and includes a conversion-focused hero, success state, and lightweight TI-only analytics events,
    - duplicate-match lookup now returns existing venue ids plus any existing tournament-level sponsor rows so the verify form can prefill known details,
    - verify submissions now update the matched `tournaments` row in place instead of always creating a new row,
    - matched linked venues now update in place by `venue.id`, newly added venues are inserted normally, and removed venues are unlinked from `tournament_venues` without deleting shared venue records,
    - multi-venue matches now prefill all linked venues into a compact expandable venue list instead of only Venue #1,
    - duplicate-match prefill now includes venue `restrooms` and `bring_field_chairs` values so stored venue settings like `Starfire Sports Complex` render correctly in verify mode.
  - Validation:
    - `cd apps/ti-web && npm run build` passed.

- TI verify-your-tournament sponsor intake + broader tournament partner categories:
  - Updated:
    - `apps/ti-web/app/api/list-your-tournament/route.ts`
    - `apps/ti-web/app/list-your-tournament/ListYourTournamentForm.tsx`
    - `apps/ti-web/lib/listTournamentForm.ts`
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
    - `apps/ti-web/app/venues/[venueId]/page.tsx`
    - `apps/referee/app/api/admin/tournaments/[id]/partner-nearby/route.ts`
    - `apps/referee/components/admin/TournamentPartnerNearbyEditor.tsx`
    - `supabase/migrations/20260303_tournament_partner_nearby.sql`
    - `supabase/migrations/20260303_tournament_partner_nearby_add_venue_id.sql`
  - Changes:
    - verify mode now exposes a collapsed `Tournament Sponsors` section above `Venues`, capped at 4 entries and prefilled from existing tournament-wide sponsor rows when present,
    - each sponsor row collects `name`, `address`, `website URL`, and a category pick list of `Food`, `Coffee`, `Hotel`, `Apparel`, or `Other`,
    - selecting `Other` reveals a required free-text sponsor-type field that is normalized to a slug for storage,
    - verify submits now upsert only tournament-level sponsor rows (`venue_id = null`) so directors can manage general sponsors without overwriting venue-specific partner placements,
    - widened `tournament_partner_nearby.category` from the original fixed 3-value check to a slug-style category constraint,
    - RI admin tournament sponsor editor now accepts broader categories through a typed input/datalist instead of a fixed 3-option select,
    - TI venue pages still render only `food` / `coffee` / `hotel` sponsor rows inside Owl's Eye,
    - TI tournament detail pages now render non-trip-planning categories like `apparel` in a separate `Tournament Partners` section instead of forcing them into Owl's Eye.
  - Validation:
    - `cd apps/ti-web && npm run build` passed.
    - `npx tsc -p apps/referee/tsconfig.json --noEmit` passed.

## 2026-03-02
- TI tournament-specific Owl's Eye partner placements:
  - Updated:
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
    - `apps/ti-web/app/venues/[venueId]/page.tsx`
  - Changes:
    - tournament venue links now carry tournament slug context into TI venue pages,
    - TI venue pages now prepend active tournament-specific hotel / coffee / food partner rows ahead of the normal Owl's Eye nearby list when opened from a tournament context,
    - TI venue pages now hide the matching standard Owl's Eye row when the same partner is already shown as a tournament-sponsored result, preventing duplicate listings in the UI,
    - sponsored partner rows in the Owl's Eye accordion now use a dedicated tournament sponsor badge and warmer sponsor-name styling instead of inline `Sponsored` text,
    - this allows shared venues to show different sponsored partner recommendations depending on the tournament,
    - demo tournament partner rows were seeded and validated locally, including:
      - `Renton Memorial Stadium` with `Hampton Inn & Suites Seattle/Renton`
      - `Valley Ridge Park` with `Cedarbrook Lodge`
  - Validation:
    - `npx tsc -p apps/ti-web/tsconfig.json --noEmit` passed.
    - local TI venue-page smoke confirmed the tournament-specific partner rows render first for the demo tournament context.

- TI public tournament submission flow + duplicate-aware prefill:
  - Updated:
    - `apps/ti-web/app/list-your-tournament/page.tsx`
    - `apps/ti-web/app/list-your-tournament/ListYourTournamentForm.tsx`
    - `apps/ti-web/app/list-your-tournament/ListYourTournamentForm.module.css`
    - `apps/ti-web/app/api/list-your-tournament/route.ts`
    - `apps/ti-web/lib/listTournamentForm.ts`
  - Changes:
    - replaced the static `/list-your-tournament` contact page with a director-facing submission form split into `Tournament Details` and `Venues`,
    - added inline validation, segmented Yes/No and enum toggles, disabled-submit saving state, and dynamic venue add/remove with Venue #1 required,
    - submit path now creates one `public.tournaments` row, creates N `public.venues` rows, then links them through existing `public.tournament_venues`,
    - duplicate lookup now searches existing tournaments by normalized name plus Venue #1 city/state and surfaces a likely-match panel while the user types,
    - known tournament and Venue #1 details from a likely match auto-fill only still-empty fields so directors can keep editing without losing typed values,
    - new submissions currently save as `draft` with `source: "public_submission"` and are discoverable by the duplicate lookup even before any public-publish flow runs.
  - Validation:
    - `cd apps/ti-web && npm run build` passed.
    - local runtime smoke:
      - `GET http://localhost:3001/list-your-tournament` returned `200 OK`,
      - duplicate lookup found existing `Demo Tournament` in `Tukwila, WA`,
      - new smoke submission returned `ok: true` with one venue created,
      - duplicate lookup then found the newly created smoke submission.

- TI account settings + TI admin profile editor exposure:
  - Updated:
    - `apps/ti-web/app/account/page.tsx`
    - `apps/ti-web/app/account/AccountPage.module.css`
    - `apps/ti-web/lib/tiUserProfileServer.ts`
    - `apps/referee/app/admin/ti/page.tsx`
  - Changes:
    - `/account` now exposes editable profile settings for optional full name, username, ZIP code, and sports interests.
    - account updates reuse TI signup validation and persist to both auth user metadata and `public.ti_users` to avoid sync drift.
    - `/admin/ti` expanded user rows now display `display_name`, `username`, `zip_code`, and `sports_interests`.
    - admins can now edit those profile fields directly from the expanded TI user panel, with username uniqueness and ZIP validation enforced before save.
  - Validation:
    - `npx tsc -p apps/ti-web/tsconfig.json --noEmit` passed.
    - `npx tsc -p apps/referee/tsconfig.json --noEmit` passed.
    - local runtime smoke:
      - `GET http://localhost:3001/account` returned `307` redirect to `/login` when unauthenticated (expected),
      - `GET http://localhost:3000/admin/ti` returned `200 OK`.

- TI signup profile expansion + account-menu cleanup:
  - Updated:
    - `apps/ti-web/app/signup/page.tsx`
    - `apps/ti-web/app/account/page.tsx`
    - `apps/ti-web/app/verify-email/VerifyCodeExchange.tsx`
    - `apps/ti-web/app/api/account/profile/route.ts`
    - `apps/ti-web/app/api/signup/check-username/route.ts`
    - `apps/ti-web/components/AccountIconMenu.tsx`
    - `apps/ti-web/components/AccountIconMenu.module.css`
    - `apps/ti-web/lib/tiProfile.ts`
    - `apps/ti-web/lib/tiUserProfileServer.ts`
    - `apps/ti-web/lib/types/supabase.ts`
    - `apps/ti-web/sql/20260302_ti_signup_username_and_sports.sql`
  - Changes:
    - signup now uses `username` instead of `handle`,
    - `name` is optional,
    - `ZIP` is required and validated as US ZIP / ZIP+4,
    - required multi-select `Sports interests` added with personalization helper copy,
    - signup metadata + TI profile sync now persist `username`, `zip_code`, and `sports_interests`,
    - legacy `reviewer_handle` remains mirrored for backward compatibility and uniqueness enforcement,
    - added server-side username availability check and authenticated profile sync endpoint,
    - verify-email flow now triggers profile sync after code exchange,
    - removed the extra plus-icon signup link in the header; unauthenticated users now use the avatar menu and its `Create free account` action.
  - Validation:
    - `npx tsc -p apps/ti-web/tsconfig.json --noEmit` passed.
    - local validation smoke passed for optional name, required ZIP, required username, and required sports interests.
    - live TI Supabase smoke confirmed `username`, `zip_code`, and `sports_interests` round-trip and duplicate usernames are blocked.

- Homepage SEO + metadata update (no UI changes):
  - Updated:
    - `apps/ti-web/app/page.tsx`
    - `apps/ti-web/app/robots.ts`
    - `apps/ti-web/public/og/ti-og-premium.jpg` (new OG image asset)
  - Changes:
    - Homepage `metadata` export updated: new title/description, full Open Graph + Twitter card metadata, OG image set to `/og/ti-og-premium.jpg` (1200×630).
    - Title uses `{ absolute: "..." }` to bypass layout's `"%s | TournamentInsights"` template — prevents duplicate suffix.
    - `Organization` JSON-LD replaced with `WebSite` schema including `SearchAction` (sitelinks search box eligibility).
    - `robots.ts` — added `disallow` rules for `/account`, `/api/`, `/admin`; sitemap reference unchanged.
    - `sitemap.ts` — already existed with dynamic slug fetching; left untouched.
  - Validation:
    - `npx tsc -p apps/ti-web/tsconfig.json --noEmit` passed.

## 2026-02-28
- Tournament directory sport badge filtering UX:
  - Updated:
    - `apps/ti-web/app/tournaments/page.tsx`
  - Changes:
    - Active sport filter collapses the badge grid to only the selected sport(s); unselected badges hidden.
    - Selected sport badge count is drawn from `filteredSportCounts` (computed from `tournaments` after all filters) so it matches the result set exactly.
    - No-sport-selected behavior unchanged — all badges visible.
  - Validation:
    - `npx tsc -p apps/ti-web/tsconfig.json --noEmit` passed.


- Fix venue details mobile overflow (airport map links cut off):
  - Updated:
    - `apps/ti-web/components/venues/OwlsEyeVenueCard.tsx`
  - Changes:
    - Removed `flexWrap: "nowrap"`, `transform: scale(0.72)`, and `transformOrigin` from the airport map links row. The transform didn't affect layout space, so the 3 buttons still occupied full width in the document flow and overflowed their container; `.detailHero`'s `overflow: hidden` clipped the right side. Now buttons wrap naturally via the `.detailLinksRow` CSS class's `flex-wrap: wrap`.

- TI venue details page mobile centering fix:
  - Updated:
    - `apps/ti-web/app/venues/[venueId]/page.tsx`
    - `apps/ti-web/app/tournaments/tournaments.css`
  - Changes:
    - `.detailPanel` now has `justify-self: stretch; box-sizing: border-box` in CSS so it fills the full overlay grid area on mobile instead of shrinking to content width (caused by `justify-items: center` on `.detailHero__overlay`),
    - `article.detailPanel` on the venue page now overrides `padding-top` to `1.25rem` (was inheriting `5.25rem` reserved for the absent badge icon),
    - button row changed from `.cardFooter` grid to a plain flex row with `flex-wrap` and `justifyContent: center` so 1–3 buttons (Back / Venue site / View map) always center correctly on narrow screens.
  - Validation:
    - `npx tsc -p apps/ti-web/tsconfig.json --noEmit` passed.

## 2026-02-27
- TI header/nav cleanup + mobile alignment:
  - Updated:
    - `apps/ti-web/app/layout.tsx`
    - `apps/ti-web/app/globals.css`
  - Changes:
    - removed duplicate `List your tournament` nav link (primary CTA retained),
    - centered `Public Beta` pill in mobile layout.

- TI signup success confirmation flow:
  - Updated:
    - `apps/ti-web/app/signup/page.tsx`
  - Changes:
    - larger confirmation message after signup,
    - success screen persists for 12 seconds,
    - then auto-redirects to `/`,
    - includes manual “Go to home now” link.

- TI Owl’s Eye on-site vendor mapping:
  - Updated:
    - `apps/ti-web/lib/owlsEyeScores.ts`
    - `apps/ti-web/components/OwlsEyeDemoScoresPanel.tsx`
    - `apps/ti-web/app/premium/page.tsx`
    - `apps/ti-web/app/venues/[venueId]/page.tsx`
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Changes:
    - score panel now derives vendor booleans from `venue_reviews.food_vendors` and `venue_reviews.coffee_vendors`,
    - labels changed to:
      - `On-site food vendors`
      - `On-site coffee vendors`,
    - falls back to `—` if no review-derived signal is available.

## 2026-02-26
- Nightly smoke consolidation update (cross-app cadence):
  - Updated root workflow:
    - `.github/workflows/smoke.yml`
  - New nightly order:
    - RI smoke first (`ri-smoke` project)
    - TI smoke second (`ti-smoke` project)
  - Workflow now runs root `playwright.smoke.config.ts` directly and uploads combined XML reports.
  - TI-related secrets used by nightly smoke:
    - `TI_TARGET_URL`
    - `TI_SMOKE_EXPLORER_EMAIL`
    - `TI_SMOKE_EXPLORER_PASSWORD`
    - `TI_SMOKE_INSIDER_EMAIL`
    - `TI_SMOKE_INSIDER_PASSWORD`
    - `TI_SMOKE_JOIN_CODE`

- TI venues UX expansion (cards + details):
  - Added TI-only shared sport-surface mapping module:
    - `apps/ti-web/app/venues/sportSurface.ts`
  - Added venue details route:
    - `apps/ti-web/app/venues/[venueId]/page.tsx`
  - `/venues` card updates:
    - removed inline `Sport: ...` text from venue cards,
    - added “Venue details” action (3-button footer alignment),
    - added “Coming up at this venue” linked tournament list,
    - removed redundant hosted tournament count line,
    - hockey venue icon now uses puck asset for hockey contexts,
    - Owl's Eye badge now shows on venue cards (upper-left) when nearby data exists.
  - `/venues/[venueId]` updates:
    - centered top action row,
    - added Owl's Eye venue block parity with tournament detail pattern:
      - floating Owl's Eye badge (when nearby data exists),
      - Nearby Options counts (coffee/food/hotels),
      - map action set (Google Maps / Apple Maps / Waze),
      - Premium planning details section with paid/unpaid behavior.
  - Updated files:
    - `apps/ti-web/app/venues/page.tsx`
    - `apps/ti-web/components/venues/VenueCard.tsx`
    - `apps/ti-web/components/venues/VenueCard.module.css`

- TI brand asset added for auth/email template usage:
  - Added:
    - `apps/ti-web/public/brand/ti-email-logo.png`
  - Intended public path:
    - `/brand/ti-email-logo.png`

- Supabase + Resend auth email ops note (TI/RI shared project behavior):
  - Configured direction: use Supabase Auth custom SMTP with Resend.
  - Important project-level scope:
    - if TI + RI share one Supabase project, SMTP sender/template/rate-limit settings are shared across both apps.
  - Sender/API guidance recorded:
    - use send-only Resend API key,
    - sender must be on verified domain/subdomain (for current setup, `mail.tournamentinsights.com`).

- TI Venue Index (new composite venue scoring + UI):
  - Added shared scoring utility:
    - `apps/ti-web/lib/venueIndex.ts`
    - computes 0-100 index from:
      - `restroom_cleanliness_avg`, `parking_convenience_score_avg`, `shade_score_avg`, `vendor_score_avg`
      - `review_count`
      - `reviews_last_updated_at`
    - includes:
      - weighted base score,
      - freshness bucket scoring,
      - confidence factor by review volume,
      - null-safe component omission with weight renormalization,
      - `scoreToBars` + `indexLabel` helpers.
  - Added reusable badge component:
    - `apps/ti-web/components/VenueIndexBadge.tsx`
    - `apps/ti-web/components/VenueIndexBadge.module.css`
    - renders index value, 5-bar meter, review count, updated date, early-data helper copy.
  - Wired badge into TI public venue surfaces:
    - venue cards in `/venues`
    - venue detail page `/venues/[venueId]`
    - tournament detail venue blocks `/tournaments/[slug]`
  - Updated data queries to include venue aggregate fields where needed:
    - `apps/ti-web/app/venues/page.tsx`
    - `apps/ti-web/app/venues/[venueId]/page.tsx`
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Added unit tests:
    - `apps/ti-web/lib/venueIndex.test.ts`
    - cases: normal, low-review confidence, stale freshness, missing-component renormalization, zero-review not-enough-data.
  - Added implementation documentation:
    - `apps/ti-web/docs/venue-index.md`

- Supabase Auth Email Setup (RI + TI – Single Project):
  - Architecture:
    - single shared Supabase project for RI + TI
    - custom SMTP via Resend
    - auth sender identity:
      - `noreply@mail.tournamentinsights.com`
    - shared auth email templates across both apps
  - Supabase Auth SMTP configuration:
    - enable custom SMTP
    - host: `smtp.resend.com`
    - port: `465`
    - username: `resend`
    - password: `RESEND_API_KEY`
    - sender email: `noreply@mail.tournamentinsights.com`
    - sender name: `TournamentInsights`
    - Resend domain auth requirement:
      - SPF + DKIM verified for `mail.tournamentinsights.com`
  - Supabase Auth URL configuration:
    - Site URL:
      - `https://www.tournamentinsights.com`
    - Redirect allowlist (for both apps):
      - `https://www.tournamentinsights.com/*`
      - `https://www.refereeinsights.com/*`
    - intended flow coverage:
      - confirm signup
      - magic link
      - reset password
      - email change
  - Email logo hosting:
    - repo file:
      - `apps/ti-web/public/brand/ti-email-logo.png`
    - public URL:
      - `https://www.tournamentinsights.com/brand/ti-email-logo.png`
    - rationale:
      - same root domain alignment with sender
      - avoids third-party asset dependency
      - simple static deployment through Vercel
  - Auth templates customized:
    - Confirm Signup
    - Magic Link
    - Reset Password
    - Change Email
    - standards:
      - uses hosted TI logo
      - uses `{{ .ConfirmationURL }}`
      - includes fallback raw link
      - includes “ignore if not requested” language
      - minimal HTML for deliverability
      - no tracking pixels
      - no external fonts
    - button style:
      - background `#0B5FFF`
      - border radius `10px`
      - font weight `600`
  - Design principles:
    - security-first
    - minimal and clear
    - brand-consistent, not promotional
    - optimized for inbox placement
    - auth emails are not marketing emails
  - Future consideration:
    - when RI and TI split into separate Supabase projects:
      - separate branded templates
      - separate sender identities
      - isolated auth configurations

## 2026-02-25
- TI verify-email completion fix (confirmation links now complete auth):
  - Added:
    - `apps/ti-web/app/verify-email/VerifyCodeExchange.tsx`
  - Updated:
    - `apps/ti-web/app/verify-email/page.tsx`
  - `/verify-email?code=...` now exchanges the code for a session via Supabase and redirects to `returnTo` (or `/account`).
  - Expired/invalid links surface inline error text while preserving resend verification workflow.

- TI venue reviews parking model update (backend-only, UI labels unchanged):
  - Added migration:
    - `supabase/migrations/20260225_venue_reviews_parking_distance_backend.sql`
  - Data model changes:
    - added `public.venue_reviews.parking_distance` (`Close|Medium|Far`)
    - converted `public.venue_reviews.parking_convenience_score` to integer scoring (`5/3/1`)
  - Aggregate extension:
    - added `public.venues.parking_convenience_score_avg`
    - recompute function updated to populate this field from active reviews
  - Submit RPC contract update:
    - `public.submit_venue_review` now requires `p_parking_distance` and numeric `p_parking_convenience_score`
    - enforces mapping consistency (Close=5, Medium=3, Far=1)
  - TI API route updated:
    - `apps/ti-web/app/api/venue-reviews/route.ts`
    - maps existing parking radio selection to numeric score for RPC submit.

- TI public beta smoke test pack added (auth/join/tier gating):
  - Added Playwright smoke test infra:
    - `playwright.smoke.config.ts`
    - `tests/smoke/ti-auth-join-gating.spec.ts`
    - `tests/smoke/ri-auth-join-gating.spec.ts` (cross-app auth sanity)
  - TI smoke assertions now cover:
    - logged-out `/venues/reviews` -> `/login?returnTo=/venues/reviews`
    - Explorer gate -> `/account?notice=Insider required...`
    - Insider access to `/venues/reviews`
    - `/join?code=...` code preservation through login round-trip
    - `/join` missing-code friendly state (non-crash UX)
  - Added deterministic TI smoke-user provisioning:
    - `apps/ti-web/scripts/seed_smoke_test_users.ts`
    - creates/updates `explorer_test`, `insider_test`, `weekendpro_test` as confirmed users.
  - Added run/documentation wiring:
    - root scripts: `seed:smoke:users`, `test:smoke`, `test:smoke:ui`
    - `docs/qa/public-beta-smoke-test.md`
    - `.env.local.example`

- TI confirmation redirect reliability fix:
  - Updated:
    - `apps/ti-web/app/signup/page.tsx`
    - `apps/ti-web/app/verify-email/ResendVerificationForm.tsx`
  - Both signup and resend now compute a TI-safe `/verify-email` redirect origin and prefer:
    - `NEXT_PUBLIC_TI_SITE_URL` (new explicit TI env)
    - then safe TI/local/vercel fallbacks
    - finally `https://www.tournamentinsights.com`.
  - Prevents confirmation links from drifting to `refereeinsights.com` when shared env values are misconfigured.

- TI admin operations surfaced in RI admin:
  - `apps/referee/app/admin/ti/page.tsx`
  - Added TI-user delete workflow with two scopes:
    - TI-only delete (removes `ti_users` + `ti_saved_tournaments`)
    - optional full cross-app auth delete (`auth.users`) for RI+TI account removal.
  - Added required confirmation checkbox to reduce accidental destructive actions.
  - Refined TI-user table UX:
    - delete controls moved under user identity,
    - subtle zebra striping and row separators for readability in larger TI-user lists.
  - UI follow-up refinement:
    - delete options consolidated into one horizontal action row under user identity,
    - zebra striping contrast increased for clearer row-to-row separation.

- TI signup confirmation redirect hardening (shared Supabase project safety):
  - `apps/ti-web/app/signup/page.tsx`
  - signup now computes a TI-safe `emailRedirectTo` target for `/verify-email` and avoids accidental RI-domain redirect fallback when env values drift.
  - Added friendly existing-email signup message (log in / forgot password guidance).

- TI signup profile capture for future review attribution:
  - `apps/ti-web/app/signup/page.tsx`
  - added optional signup inputs + validation for:
    - full name
    - handle (`^[a-z0-9_]{3,20}$`)
    - ZIP (`12345` or `12345-6789`)
  - values are written to Supabase auth metadata:
    - `display_name`
    - `handle`
    - `zip_code`

- TI user-profile persistence wiring:
  - `apps/ti-web/app/account/page.tsx`
  - `apps/ti-web/lib/types/supabase.ts`
  - account bootstrap/update path now hydrates `ti_users` from auth metadata:
    - `display_name`
    - `reviewer_handle`
    - `zip_code`

- TI DB migration for attribution-ready profile fields:
  - `apps/ti-web/sql/20260225_ti_users_profile_fields.sql`
  - adds:
    - `public.ti_users.display_name`
    - `public.ti_users.reviewer_handle`
    - `public.ti_users.zip_code`
  - adds reviewer handle constraints/indexing:
    - format check (`^[a-z0-9_]{3,20}$`)
    - unique partial index on non-null handles.

- TI venue-review security hardening note:
  - `supabase/migrations/20260225_venue_reviews_phase1.sql`
  - policy scope tightened to own-row select and submit RPC now enforces authenticated + confirmed-email requirement.

- Validation:
  - `npm run build --workspace ti-web` passed.

## 2026-02-24
- Cross-app venue quality update (RI admin changes benefiting TI venue integrity):
  - Added duplicate-venue review panel in RI `/admin/venues` with suggested keep-target and one-click merge.
  - Duplicate groups are now surfaced by normalized:
    - exact address/city/state
    - same name + street/state
  - Verified and merged real duplicate venue case:
    - `1200 Alimagnet Pkwy, Burnsville, MN`
  - Effect for TI:
    - less fragmented venue coverage,
    - better Owl's Eye continuity on canonical venue IDs.

- TI/RI field inventory export added for product/review planning:
  - Added:
    - `docs/ti_ri_tournament_venue_fields.csv`
  - Captures tournament + venue fields with:
    - TI/RI scope flag,
    - access-tier classification,
    - data type metadata.

- Cross-app ops note (RI admin/ingest changes that improve TI venue quality downstream):
  - Added safer venue cleanup and dedupe tooling in RI:
    - safe removal of junk venue links when a clean linked venue already exists,
    - orphan junk venue cleanup for unlinked/no-Owl's-Eye rows.
  - Strengthened crawler matching before venue creation across deep/AYSO/USSSA venue ingest:
    - multi-key reuse of existing venues (`address/city/state`, `name/city/state`, ZIP/street fallbacks),
    - preference for venues with Owl's Eye run history and populated venue URL.
  - Added deep-crawler mode for tournaments that currently only have junk-linked venues:
    - `--include-junk-linked`, with timeout guards for crawl stability.
  - Net effect for TI:
    - better reuse of canonical venues already enriched with Owl's Eye data,
    - fewer duplicate/invalid venue rows flowing into TI-facing tournament detail coverage.

- Cross-app operational note (RI-side enrichment improvements that directly affect TI venue coverage):
  - Missing-venues scrape pipeline in RI now has stronger venue discovery and linking support:
    - pre-hunt URL seeding for venue pages (`fields/venues/locations/maps/directions`),
    - fallback web-search for venue pages when crawl is sparse,
    - map-link parsing (Google/Apple/Waze) into venue candidates,
    - strict auto-linking to existing canonical venues on exact `street+city+state` match.
  - Result for TI:
    - faster growth of linked venue coverage feeding TI tournament detail pages,
    - fewer manual merges for exact-match venue duplicates,
    - clearer admin scrape telemetry for venue candidate throughput.
  - Visibility telemetry now surfaced in enrichment status:
    - parsed/inserted venue candidates,
    - auto-linked existing venues,
    - venue URL backfills.

## 2026-02-23
- TI design sizing clarification (card vs hero):
  - Confirmed from CSS that tournament listing cards are responsive, not fixed 1200-wide assets:
    - `apps/ti-web/app/tournaments/tournaments.css`
    - `.grid` uses `minmax(290px, 1fr)` and `.card` uses `border-radius: 14px`.
  - Detail hero remains large-format:
    - `.detailHero` max-width `1200px`, min-height `320px`, border-radius `22px`.
  - Guidance updated:
    - card/container backgrounds should be designed for small responsive cards (around 290-360px rendered width).
    - detail hero backgrounds should remain larger source artwork (e.g., 1200x1000) for cover crop flexibility.
- TI art integration updates:
  - Added `apps/ti-web/public/textures/ti_baseball_hero_bg_1200x1000.svg` and wired baseball detail hero to use it.
  - Added `apps/ti-web/public/textures/ti_soccer_hero_bg_1200x1000.svg` and wired soccer detail hero to use it.
- TI tournament detail hero refreshes (new sport-specific assets):
  - Soccer hero switched to:
    - `apps/ti-web/public/textures/ti_soccer_hero_2_bg_1200x1000.png`
  - Basketball hero switched to:
    - `apps/ti-web/public/textures/ti_basketball_hero_bg_1200x1000.png`
  - Lacrosse hero enabled with dedicated mapping + texture:
    - `apps/ti-web/public/textures/ti_lacrosse_hero_bg_1200x1000.png`
    - `lacrosse -> bg-sport-lacrosse` in `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Hockey hero enabled with dedicated mapping + texture:
    - `apps/ti-web/public/textures/ti_hockey_hero_bg_1200x1000.png`
    - `hockey -> bg-sport-hockey` in `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Volleyball hero pre-wired (for future volleyball tournaments):
    - `apps/ti-web/public/textures/ti_volleyball_hero_bg_1200x1000.png`
    - `volleyball -> bg-sport-volleyball` in `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Hero CSS updates in:
    - `apps/ti-web/app/tournaments/tournaments.css`
- TI tournament listing card support for volleyball:
  - Added shared container artwork:
    - `shared-assets/svg/sports/volleyball_container.svg`
  - Synced to app public SVGs via:
    - `node scripts/copy-shared-svg.js`
  - Added listing class mapping:
    - `volleyball -> bg-sport-volleyball` in `apps/ti-web/app/tournaments/page.tsx`
  - Added listing card style:
    - `.card.bg-sport-volleyball` in `apps/ti-web/app/tournaments/tournaments.css`
  - Build verification completed after each change:
    - `npm run build --workspace ti-web`
- Volleyball counter badge prep + sizing benchmark:
  - Added raw + optimized volleyball counter assets:
    - `shared-assets/svg/sports/volleyball_count_badge.raw.svg`
    - `shared-assets/svg/sports/volleyball_count_badge.svg`
  - Optimization pass performed (safe whitespace/comment/header cleanup) and XML validated with `xmllint`.
  - Size reduced from `1,168,899` to `1,099,021` bytes (~6%).
  - Relative size check vs current counter assets:
    - smaller than soccer/basketball/lacrosse/total counters
    - slightly smaller than softball badge
    - larger than baseball badge
  - Decision note:
    - asset is acceptable to keep as volleyball counter source for now; can be re-optimized later with SVGO when package install/network is available.
- TI header auth icon follow-up:
  - Added signed-out circular signup bug (`+`) beside account icon.
  - Updated sign-out return path behavior to avoid landing on protected routes after sign out.
  - Kept icon ring state by auth tier; insider ring changed to mint green for consistency.

## 2026-02-19
- Hockey counter tile background update:
  - Added dedicated hockey summary-counter background style using:
    - `/svg/sports/hockey_container.svg`
  - File:
    - `apps/ti-web/app/tournaments/tournaments.css`

- Sport container background rollout for tournament cards:
  - Added new shared container assets and switched TI sport card containers to use them:
    - `soccer_container.svg`, `lacrosse_container.svg`, `basketball_court_container.svg`,
      `baseball_container.svg`, `softball_container.svg`, `football_container.svg`, `hockey_container.svg`.
  - Updated TI sport mapping to dedicated classes for lacrosse + hockey:
    - `lacrosse -> bg-sport-lacrosse`
    - `hockey -> bg-sport-hockey`
  - Updated TI container CSS to use zoomed fill (`230%`) so sport art fills the card container cleanly without gray framing:
    - `apps/ti-web/app/tournaments/page.tsx`
    - `apps/ti-web/app/tournaments/tournaments.css`
  - Shared asset source-of-truth:
    - `shared-assets/svg/sports/*_container.svg`

- TI tournament counters: new custom background assets by sport:
  - Added dedicated counter backgrounds for:
    - soccer (`/svg/sports/soccer_count_badge.svg`)
    - basketball (`/svg/sports/basketball_count_badge.svg`)
    - lacrosse (`/svg/sports/lacrosse_counter_badge.svg`)
    - total tournaments (`/svg/sports/total_tournaments_count.svg`)
  - Continued use of baseball/softball custom backgrounds from updated shared assets.
  - Introduced `summary-sport-*` and `summary-total` classes on summary tiles for independent counter styling.
  - Tuned soccer/baseball counter crop/zoom to hide source-image frame/shadow artifacts.
  - Removed baseball/softball badge overlay from tournament cards; counter backgrounds remain in summary grid only.
  - Files:
    - `apps/ti-web/app/tournaments/page.tsx`
    - `apps/ti-web/app/tournaments/tournaments.css`
    - `shared-assets/svg/sports/*`

- TI baseball/softball badge source replacements:
  - Updated baseball source artwork:
    - `shared-assets/svg/sports/baseball_badge.svg` (from `baseball_new_bg.svg`)
  - Updated softball source artwork:
    - `shared-assets/svg/sports/softball_badge.svg` (from `softball_new_bg.svg`)
  - Synced shared assets into TI public path with `node scripts/copy-shared-svg.js`.

- TI card/counter behavior refinement:
  - Kept baseball/softball badges on counter widgets as tile backgrounds.
  - Removed extra baseball/softball badge block overlay from tournament cards.
  - Preserved ball icons as foreground sport icons.
  - File:
    - `apps/ti-web/app/tournaments/tournaments.css`

- TI baseball/softball counter background refinement:
  - Kept baseball/softball balls (`⚾`, `🥎`) as the visible sport icons in summary/cards.
  - Applied baseball/softball SVGs as full summary-tile backgrounds for sport counters.
  - Replaced baseball badge source with a text-free file:
    - `/Users/roddavis/Downloads/artwork/baseball_new_bg.svg` -> `shared-assets/svg/sports/baseball_badge.svg`.
  - Improved summary tile clarity:
    - removed blur (`backdrop-filter`) from summary cards,
    - added stronger readability overlay above background art,
    - adjusted baseball background crop/zoom/position to remove frame/shadow artifacts.
  - Related files:
    - `apps/ti-web/app/tournaments/page.tsx`
    - `apps/ti-web/app/venues/page.tsx`
    - `apps/ti-web/app/tournaments/tournaments.css`
    - `shared-assets/svg/sports/baseball_badge.svg`

- TI sport badge/card refresh for baseball + softball:
  - Added shared badge assets:
    - `shared-assets/svg/sports/baseball_badge.svg`
    - `shared-assets/svg/sports/softball_badge.svg`
  - Replaced baseball tournament counter/card icon usage with `baseball_badge.svg`.
  - Added softball icon rendering in TI tournament + venue listing sport icons.
  - Added TI `bg-sport-softball` mapping and sport surface/card CSS treatment so softball cards/details get sport-specific presentation.
  - Updated files:
    - `apps/ti-web/app/tournaments/page.tsx`
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
    - `apps/ti-web/app/venues/page.tsx`
    - `apps/ti-web/app/tournaments/tournaments.css`
  - Asset sync run:
    - `node scripts/copy-shared-svg.js`

- Cross-app ops note:
  - Fixed RI `/admin/tournaments/sources` production render issue by avoiding closure-captured `URLSearchParams` in server actions.
  - RI-only runtime fix; no TI page behavior changes.

- Cross-app ops note:
  - RI admin home now includes an organized tournament/venue maintenance dashboard with missing-data widgets that deep-link into filtered edit/delete views.
  - This change is RI-only and does not alter TI pages/components.

- Cross-app ops note:
  - Added RI source-registry preservation of active filters after row actions (save/sweep/quick actions) so large source sets (including USSSA state sources) are manageable without losing selected sport/state filters.
  - RI-only change; no TI UI/behavior changes in this update.

- TI tournament detail access-tier update (paid planning fields):
  - Added a new **Premium Planning Details** section to `apps/ti-web/app/tournaments/[slug]/page.tsx` with a lock state for non-paid users.
  - Locked (public + free-login) behavior now shows:
    - "Locked — Upgrade to view Food vendors, restrooms, amenities, travel/lodging notes."
    - Upgrade CTA linking to `/pricing`.
  - Paid behavior now conditionally fetches and renders:
    - `tournaments.travel_lodging` (display label: "Travel/Lodging Notes")
    - `venues.food_vendors`
    - `venues.restrooms`
    - `venues.amenities`
  - Public/base detail query remains on `tournaments_public` and does not expose premium planning fields.
  - Added styling for the premium card in `apps/ti-web/app/tournaments/tournaments.css`.
  - Temporary entitlement stub added:
    - `TI_FORCE_PAID_TOURNAMENT_DETAILS=true` enables paid rendering path.
  - Validation:
    - `npx tsc -p apps/ti-web/tsconfig.json --noEmit` passed.
    - `next lint` for `ti-web` still requires initial ESLint setup prompt in this workspace.

## 2026-02-18
- Tournament directory summary tile updates:
  - Total tournaments tile now shows current on-page result count (post-filter), not global DB total:
    - `apps/ti-web/app/tournaments/page.tsx`.
  - Total tile icon switched to transparent TI mark:
    - `/svg/ti/tournamentinsights_mark_transparent.svg`.
  - Added new shared asset:
    - `shared-assets/svg/ti/tournamentinsights_mark_transparent.svg`.
  - Cropped transparent mark viewBox so the icon appears visually larger/centered in the tile.
  - Increased summary/tournament sport SVG icon sizes for better lacrosse visibility:
    - `apps/ti-web/app/tournaments/tournaments.css`.
- Homepage messaging update:
  - Committed `ed9cb02` (`TI: update homepage value props copy`) in `apps/ti-web/app/page.tsx`.
  - Replaced “What TournamentInsights provides” block copy with current value-prop language:
    - Verified tournament essentials — sport, dates, location, and official links
    - Clean filtering by sport, state, and month
    - Structured, moderated event insights
    - Logistics-focused detail pages built for real tournament planning
  - Replaced follow-up paragraph with:
    - “TournamentInsights delivers organized, moderated tournament intelligence designed to help families, coaches, and teams evaluate events faster and with greater confidence.”
  - Removed homepage defensive wording around “no ratings / no public reviews / not a review platform”.
- Homepage layout polish:
  - Center-aligned the “What TournamentInsights Provides” heading and bullet content (scoped styling only).
  - Files:
    - `apps/ti-web/app/page.tsx`
    - `apps/ti-web/app/globals.css`

## 2026-02-19
- TI premium detail + demo visibility update:
  - `apps/ti-web/app/tournaments/[slug]/page.tsx` now loads Owl's Eye nearby data (food, coffee, hotels) for linked venues from the latest run and renders it in Premium Planning Details.
  - Premium behavior remains paid-gated, with demo tournament pages now always allowed to show premium details for showcase use.
  - Nearby rows render with place links (Google Maps URL when present) and distance labels in miles.
  - Removed now-obsolete `demoPremium` URL toggle requirement from the TI detail page logic.
  - Added hockey counter icon support on TI tournaments summary cards:
    - `apps/ti-web/app/tournaments/page.tsx` now maps `sport=hockey` to `/svg/sports/hockey_puck_icon.svg`.
    - New shared icon asset: `shared-assets/svg/sports/hockey_puck_icon.svg`.
  - Validation:
    - `npx tsc -p apps/ti-web/tsconfig.json --noEmit` passed.

## 2026-02-20
- Cross-app operational note (RI-side infra that affects TI premium venue data freshness):
  - Owl's Eye hotel discovery pipeline was hardened in RI backend:
    - hotel radius increased to 30 miles
    - hotel output capped to 5 closest rows
    - Places API result-count bug fixed (maxResultCount clamped to 1..20)
    - added lodging text-search fallback/supplement when nearby results are sparse.
  - This improves likelihood that TI paid venue premium details show hotel rows after fresh Owl's Eye runs.

- TI SEO hardening pass (App Router metadata routes + dynamic detail metadata):
  - Global metadata defaults refined in `apps/ti-web/app/layout.tsx`:
    - canonical host pinned to `https://www.tournamentinsights.com`
    - `metadataBase` set to canonical domain
    - title template/default refreshed for TI directory positioning
    - default OG/Twitter image fallback added: `/og-default.png`
  - Added OG fallback asset:
    - `apps/ti-web/public/og-default.png`
  - Static route metadata copy/canonical updates:
    - `apps/ti-web/app/page.tsx`
    - `apps/ti-web/app/tournaments/page.tsx`
    - `apps/ti-web/app/how-it-works/page.tsx`
    - `apps/ti-web/app/list-your-tournament/page.tsx`
  - Tournament detail SEO improvements in `apps/ti-web/app/tournaments/[slug]/page.tsx`:
    - `generateMetadata` now returns cleaner title/description and canonical path
    - Open Graph/Twitter include fallback image
    - missing slug metadata returns noindex
    - render path now uses `notFound()` for missing tournaments
    - existing SportsEvent JSON-LD retained (name/date/location/url/sameAs)
  - Metadata routes aligned to canonical domain:
    - `apps/ti-web/app/sitemap.ts` absolute URLs on `www.tournamentinsights.com`
    - `apps/ti-web/app/robots.ts` with sitemap link and global allow rule

- TI tournaments filter update:
  - `apps/ti-web/app/tournaments/page.tsx`
  - Replaced `includeAYSO` with exclusive `aysoOnly` behavior.
  - UI now uses `AYSO only` control (non-additive mode):
    - default directory excludes AYSO tournaments
    - enabling `AYSO only` shows only tournaments with `tournament_association = AYSO`.
  - Summary-card links preserve `aysoOnly` in query params.

- TI venue-level premium detail UX update on tournament detail page:
  - `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Moved venue-specific premium content behind a per-venue expandable **Premium planning details** control on each venue card (instead of one long combined venue section).
  - Demo tournament preview now opens premium details per venue context only.
  - Reformatted Owl's Eye nearby listings under `Food`, `Coffee`, and `Hotels` as one-business-per-line clickable direction links with distance metadata.
  - Kept `Travel/Lodging Notes` in the main premium panel and added guidance to use per-venue premium controls.
  - Styling updates in:
    - `apps/ti-web/app/tournaments/tournaments.css`
- TI tournament card/detail follow-up polish:
  - `apps/ti-web/app/tournaments/page.tsx`
  - `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - `apps/ti-web/app/tournaments/tournaments.css`
  - Restored sport icon placement to the tournament card footer row.
  - Added stronger Owl's Eye badge detection/fallback so demo and linked Owl's Eye venues surface the badge consistently.
  - Set demo tournament official site behavior to show `TBD` on directory cards and hide public official-site link on detail.
  - Tuned venue-card Owl's Eye badge sizing/position so it sits left of venue identity without clipping and aligns with the venue block.

## 2026-02-21
- TI tournament detail venue link UX:
  - `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - `apps/ti-web/app/tournaments/tournaments.css`
  - Replaced raw venue URL display with centered `Venue URL/Map` button under venue address on linked venue cards.
  - Button uses same visual treatment as Google/Apple/Waze buttons and opens in a new tab.
  - Kept this venue URL button public (no login/pay gate).
  - Removed stale per-venue `Travel/Lodging Notes` row and removed unused paid tournament fetch wiring.

- TI venue sport labeling:
  - `apps/ti-web/app/venues/page.tsx`
  - Added `Futsal` display label mapping so venue sport tags render in title case consistently.

- TI state filter behavior:
  - `apps/ti-web/app/tournaments/StateMultiSelect.tsx`
  - Selecting any specific state now auto-clears `All states`; selecting `All states` clears specific state checks.

- Cross-app dependency note for TI venue data hygiene:
  - RI venue/admin APIs and DB constraints were updated to normalize/enforce venue values used by TI surfaces:
    - `restrooms`: `Portable | Building | Both | NULL`
    - `sport`: `soccer | baseball | lacrosse | basketball | hockey | volleyball | futsal | NULL`
  - Migration file: `supabase/migrations/20260221_venues_restrooms_and_sport_allowed_values.sql`.

- TI contact email routing update:
  - `apps/ti-web/app/list-your-tournament/page.tsx`
  - Updated the list-your-tournament CTA mailto target to `rod@refereeinsights.com`.

- TI legal pages (RI baseline adapted for TI) + legal UX visibility:
  - Added TI legal routes:
    - `apps/ti-web/app/terms/page.tsx`
    - `apps/ti-web/app/privacy/page.tsx`
    - `apps/ti-web/app/disclaimer/page.tsx`
  - Added shared legal module:
    - `apps/ti-web/app/(legal)/LegalPage.tsx`
    - `apps/ti-web/app/(legal)/LegalPage.module.css`
    - `apps/ti-web/app/(legal)/legalContent.ts`
  - Added TI-specific addenda:
    - Terms: Third-Party Links and Directory Accuracy
    - Disclaimer: Owl’s Eye Venue Insights informational-only guidance
    - Privacy: data collected/cookies-analytics clarification and venue coordinates note.
  - Added global legal links in TI layout footer:
    - `apps/ti-web/app/layout.tsx`
    - `apps/ti-web/app/globals.css`
  - Added subtle legal reminders on:
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
    - `apps/ti-web/app/venues/page.tsx`

## 2026-02-16
- TI branding: TI header/layout mirrors RI structure with TI colors and shared logo `shared-assets/svg/ti/tournamentinsights_logo.svg` (used in layout/home).
- TI pages: Added `/tournaments` (RI-style filters/cards, no ratings/reviews), `/tournaments/[slug]` (logistics-only detail), `/how-it-works`, `/list-your-tournament`, and updated home CTAs.
- Assets/infra: Copied shared logo to `apps/ti-web/public/brand/tournamentinsights_logo.svg`; build root `apps/ti-web`. Env needed: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (optional `NEXT_PUBLIC_SITE_URL`).
- Styling fixes: TI tournaments cards now use the same sport backgrounds/textures as RI, with `bg-sport-*` classes and copied textures under `apps/ti-web/public/textures/`.
- UI polish: Sport icon moved to bottom-center of TI cards; official/Details buttons centered with spacing to mirror RI layout.
- Filters/summary: TI tournaments filter bar uses RI-style Apply/Reset buttons; summary grid shows total tournaments and per-sport counts with sport icons (mirroring RI summary cards).
- Buttons: Card footers are bottom-aligned; both buttons are white; when official site is missing, the button still renders with a small “TBD” beneath the label.
- Header theme: TI header uses navy → electric blue gradient (`--ti-header-1/2/3`), white nav with blue hover, and yellow CTA (`--ti-cta`/`--ti-cta-text`), matching RI layout/behavior.
- Detail hero: TI tournament detail uses sport-based hero background; centered content; venue block with map links if address present; Google/Apple/Waze rendered as separate buttons; removed referee text. Official link matches directory styling; source link removed.
- Directory hero: Tournament directory intro panel uses a light TI gradient tint with soft blue border to keep text legible while matching the TI header theme.
- Detail buttons: Official site and map buttons use the white pill styling from directory cards; map buttons are hidden unless a real venue/address with city and state is available.
- Venue row: Detail venue section shows venue name + address with navigation buttons aligned to the right; nav buttons are suppressed when venue/address data is incomplete.
- Linked venues: Detail page now reads `tournament_venues -> venues` and renders all linked venues with address + map buttons; falls back to inline venue/address fields if no links exist.
- Header spacing: TI header now keeps Public Beta pill, nav links, and CTA on the same row for alignment.
- SEO: Added TI-specific metadata defaults (canonical, OG/Twitter), page-specific metadata, sitemap.xml and robots.txt, and JSON-LD (SportsEvent) on tournament detail pages.
- Analytics: Plausible script injected site-wide (configurable via `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, default `tournamentinsights.com`).
- Homepage: Added credibility/support band under hero with TI gradient tint and copy “Inspired by real tournament families…” (no referee mentions).

- TI sport hub pages (SEO hub implementation, TI-only):
  - Added dedicated sport hub routes with tournament-directory matching UI and behavior:
    - `/tournaments/soccer`
    - `/tournaments/baseball`
    - `/tournaments/lacrosse`
    - `/tournaments/basketball`
    - `/tournaments/hockey`
    - `/tournaments/ayso`
  - Implemented shared hub renderer/config:
    - `apps/ti-web/app/tournaments/hubs/HubTournamentsPage.tsx`
    - `apps/ti-web/app/tournaments/hubs/config.ts`
  - Hub pages intentionally hide the sport filter control (sport is fixed by route) while keeping the same listing/filter/card visual system as TI tournaments.
  - Added per-hub SEO metadata + canonical and ItemList JSON-LD on hub pages.
  - Updated TI sitemap to include hub URLs:
    - `apps/ti-web/app/sitemap.ts`
  - Build verification completed successfully:
    - `npm run build --workspace ti-web`

## 2026-02-22
- TI deploy fix for sport hub routes:
  - Updated hub route files:
    - `apps/ti-web/app/tournaments/soccer/page.tsx`
    - `apps/ti-web/app/tournaments/baseball/page.tsx`
    - `apps/ti-web/app/tournaments/lacrosse/page.tsx`
    - `apps/ti-web/app/tournaments/basketball/page.tsx`
    - `apps/ti-web/app/tournaments/hockey/page.tsx`
    - `apps/ti-web/app/tournaments/ayso/page.tsx`
  - Changed async hub rendering call pattern to avoid JSX on async function component:
    - `return await HubTournamentsPage({ hub: "...", searchParams });`
  - Fixes Vercel build error:
    - `HubTournamentsPage cannot be used as a JSX component`.

- TI signup production configuration guidance (operational):
  - Required TI env in Vercel:
    - `NEXT_PUBLIC_SITE_URL=https://www.tournamentinsights.com`
  - Supabase Auth URL configuration should include TI verify redirect:
    - `https://www.tournamentinsights.com/verify-email`
    - recommended additionally: `https://tournamentinsights.com/verify-email`
  - Browser auth continues to use `NEXT_PUBLIC_SUPABASE_ANON_KEY` (service role remains server-only).

- TI production env correction + redeploy result:
  - Fixed env typo in TI Vercel project:
    - from `EXT_PUBLIC_SUPABASE_ANON_KEY`
    - to `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - This resolved production error:
    - `Your project's URL and Key are required to create a Supabase client!`
  - Post-redeploy verification confirmed TI tournament detail and signup pages were working.

- TI manual test-user invite/entitlement seed and premium-interest lock artifact reference:
  - `apps/ti-web/scripts/seed_test_users.ts`
  - `apps/ti-web/sql/20260221_ti_premium_interest_lockdown.sql`

- TI Save Tournament MVP implemented (detail page only; no `/tournaments` listing changes):
  - DB migration added:
    - `supabase/migrations/20260222_ti_saved_tournaments.sql`
    - table `public.ti_saved_tournaments` + `unique(user_id,tournament_id)` + RLS own-row select/insert/delete.
  - Save API route added:
    - `apps/ti-web/app/api/saved-tournaments/[tournamentId]/route.ts`
    - `GET` saved state, `POST` save, `DELETE` unsave.
    - Auth required; unverified users blocked for write with `EMAIL_UNVERIFIED`.
  - Shared server helper:
    - `apps/ti-web/lib/savedTournaments.ts`
  - UI component + integration:
    - `apps/ti-web/components/SaveTournamentButton.tsx`
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Account page shows saved count:
    - `apps/ti-web/app/account/page.tsx`
  - Return path continuity through auth/verify:
    - `apps/ti-web/app/login/page.tsx`
    - `apps/ti-web/app/signup/page.tsx`
    - `apps/ti-web/app/verify-email/page.tsx`
    - `apps/ti-web/app/verify-email/ResendVerificationForm.tsx`
  - Build verification completed:
    - `npm run build --workspace ti-web`

- TI tournament detail premium CTA cleanup (duplicate block removal):
  - `apps/ti-web/app/tournaments/[slug]/page.tsx`
  - Removed the extra per-venue upgrade CTA under venue map buttons so premium upgrade/notify lives only in the bottom Premium Planning Details card.
  - Updated nearby teaser copy to direct users to the bottom premium section.
  - Build verification completed:
    - `npm run build --workspace ti-web`

- TI header auth control converted to single account icon menu:
  - Added:
    - `apps/ti-web/components/AccountIconMenu.tsx`
    - `apps/ti-web/components/AccountIconMenu.module.css`
    - `apps/ti-web/lib/returnTo.ts`
  - Updated:
    - `apps/ti-web/app/layout.tsx`
    - `apps/ti-web/app/logout/route.ts`
    - `apps/ti-web/app/login/page.tsx`
    - `apps/ti-web/app/signup/page.tsx`
    - `apps/ti-web/app/verify-email/page.tsx`
    - `apps/ti-web/app/verify-email/ResendVerificationForm.tsx`
  - Behavior:
    - Removed header text links (`My account`, `Log out`, `Sign in`, `Create free account`).
    - Added single user icon with ring-color state:
      - red signed out, amber unverified, blue insider, purple weekend_pro.
    - Menu options vary by state and include `returnTo` for login/signup/logout/verify.
  - Security hardening:
    - Centralized `returnTo` sanitization for auth/logout redirect paths to allow only safe relative routes.
  - Build verification completed:
    - `npm run build --workspace ti-web`
  - Follow-up polish:
    - Centered the account icon under the mobile `List your tournament` CTA.
    - Increased icon contrast with white fill + dark glyph for readability on blue header gradients.
    - Fixed dropdown menu text readability by overriding inherited header link styles in the popup.
    - Updated Insider ring color to mint green (`#6ee7b7`) to match Insider badge styling.
    - Added signed-out circular signup bug (`+`) next to account icon and kept sign-out return path on public pages (fallback `/` when signing out from protected pages).

- TI tournament detail hero background updates (sport-specific):
  - Added new texture assets:
    - `apps/ti-web/public/textures/ti_baseball_hero_bg_1200x1000.svg`
    - `apps/ti-web/public/textures/ti_soccer_hero_bg_1200x1000.svg`
  - Updated detail hero CSS in:
    - `apps/ti-web/app/tournaments/tournaments.css`
  - Baseball detail pages now use `ti_baseball_hero_bg_1200x1000.svg`.
  - Soccer detail pages now use `ti_soccer_hero_bg_1200x1000.svg`.
  - Build verification completed:
    - `npm run build --workspace ti-web`

## 2026-02-23

- TI join/event-code funnel wiring:
  - Added:
    - `apps/ti-web/app/join/page.tsx`
  - Updated:
    - `apps/ti-web/app/login/page.tsx`
    - `apps/ti-web/app/signup/page.tsx`
  - Behavior:
    - `/join` accepts `?code=` and prefills Event Code.
    - Logged-out users get `Create account` / `Log in` links preserving `code`.
    - Logged-in users can `Activate Trial`; server action calls `redeem_event_code` RPC and redirects to `/account?activated=1` on success.
    - Login/signup auth handoff preserves event code and routes users back into `/join?code=...`.

- Smoke verification (join/event):
  - Build + typecheck passed:
    - `npm run build --workspace ti-web`
  - Route output includes `/join`, `/login`, `/signup`, `/verify-email`, `/account`.

- TI admin functions now accessible from RI admin portal (single admin login path):
  - Added TI-blue `TI Admin` button to RI admin nav:
    - `apps/referee/components/admin/AdminNav.tsx`
  - Added RI route `/admin/ti` for TI operational administration:
    - `apps/referee/app/admin/ti/page.tsx`
  - Includes:
    - TI user management (`ti_users` fields: plan, subscription_status, trial_ends_at, current_period_end)
    - Event code management (create/list/status update)
  - Event code source compatibility:
    - Uses `create_event_code` RPC when available.
    - Falls back to `ti_event_codes` or `event_codes` table inserts/updates.
  - Build verification:
    - `npm run build --workspace referee-app` passed.

- TI signup source attribution tracking added:
  - Added `ti_users.signup_source` and `ti_users.signup_source_code` via migration:
    - `supabase/migrations/20260223_ti_users_signup_source.sql`
  - `/join` now stamps attribution after event-code redemption:
    - `signup_source='event_code'`
    - `signup_source_code=<submitted code>`
    - File: `apps/ti-web/app/join/page.tsx`
  - RI `/admin/ti` TI user table now displays source attribution:
    - `Source`
    - `Source code`
    - File: `apps/referee/app/admin/ti/page.tsx`
  - TI supabase type definitions updated for the new fields:
    - `apps/ti-web/lib/types/supabase.ts`
  - Build checks passed:
    - `npm run build --workspace ti-web`
    - `npm run build --workspace referee-app`

- Shared enrichment pipeline update (RI admin fees/venue scraper):
  - `apps/referee/app/api/admin/tournaments/enrichment/fees-venue/route.ts` now uses content-keyword fallback for venue page detection.
  - Venue extraction can trigger from page text/heading signals (`field/fields/map/venues/location/facility/directions`) even when URL path does not include venue terms.
  - Intended impact: improve venue-candidate yield for tournaments with non-obvious URL structures.

- Event Code Admin form clarity update (served from RI `/admin/ti`):
  - Added visible labels and required/optional indicators in the create-event-code form.
  - File: `apps/referee/app/admin/ti/page.tsx`

- Venue scrape effectiveness update:
  - Fees/venue enrichment now force-fetches and parses discovered internal venue landing pages for multi-venue extraction.
  - File: `apps/referee/app/api/admin/tournaments/enrichment/fees-venue/route.ts`
  - Intended impact: improve conversion from `venue_url` discovery into actual venue/address candidates.

- Event Code Admin enhancement in RI-hosted TI admin (`/admin/ti`):
  - Existing event codes are now editable in-place with row-level save.
  - Editable fields include duration, redemption counts/limits, status, dates, notes, and code value.
  - File: `apps/referee/app/admin/ti/page.tsx`
  - Build check passed (`npm run build --workspace referee-app`).

## 2026-02-24

- Venue linking workflow improvements from RI admin (used for TI venue quality):
  - Tournament edit “Add venue” now supports inline existing-venue suggestions and direct linking.
  - Added:
    - `apps/referee/components/admin/TournamentVenueMatcher.tsx`
  - Updated:
    - `apps/referee/app/admin/page.tsx`
  - Added linked-venue `Unlink` action in tournament edit panel.

- USSSA venue backfill run completed (one-time cleanup to improve venue coverage):
  - Added ingest utility:
    - `scripts/ingest/link_usssa_missing_venues.ts`
  - Apply run result:
    - 163 USSSA tournaments scanned, 109 missing linked venues targeted
    - 187 venues created
    - 625 tournament↔venue links upserted
    - 0 failures

- Validation:
  - `npm run build --workspace referee-app` passed.

## 2026-02-25

- TI SEO sport+state hub pages added (TI-only, no RI changes):
  - New dynamic route:
    - `apps/ti-web/app/[sport]/[state]/page.tsx`
  - URL behavior:
    - Supports sport+state slug URLs (examples: `/soccer/oregon`, `/basketball/idaho`, `/volleyball/washington`)
    - Normalizes sport slug via `normalizeSportSlug(...)`
    - Normalizes state slug or 2-letter code via `mapStateSlugToCode(...)`
    - Invalid sport/state returns `notFound()`
  - Data behavior:
    - Server-side Supabase query against `tournaments_public`
    - Upcoming only (`end_date >= today`)
    - Sort: `start_date ASC`, then `name ASC`
    - Pagination enabled with `?page=` and page size `60` using `.range(...)`
    - “Load more” CTA renders when additional pages exist
  - UI/layout behavior:
    - Reuses TI homepage global class patterns (`page`, `shell`, `hero`, `muted heroCopy`, `ctaRow`, `cta primary/secondary`, `bodyCard`, `bodyCardCenteredList`, `list`, `notice`, `clarity`)
    - Reuses existing tournament card class structure from TI tournaments styles (`tournaments.css`)
    - Includes empty-state fallback with curated nearby-state links and back link to `/tournaments`
    - Includes FAQ section and matching FAQ JSON-LD on the page
  - Metadata/SEO behavior:
    - Implements `generateMetadata()` with canonical set to `/{sport}/{stateSlug}`
    - Title format includes state, sport, and “Updated {Month YYYY}”
    - Adds OG title/description/url

- TI sitemap extended with sport+state SEO hubs:
  - Updated:
    - `apps/ti-web/app/sitemap.ts`
  - Added all `/{sport}/{state}` combinations from `curatedSports x curatedStates` to sitemap output.

- Build verification (TI):
  - `npm run build --workspace ti-web` passed.

- Cross-app venue schema rename (RI DB change consumed by TI premium venue details):
  - `public.venues` columns renamed:
    - `player_parking` -> `player_parking_fee`
    - `food_concessions_quality_score` -> `vendor_score`
    - `shade_weather_protection_score` -> `shade_score`
  - TI detail page updated to select/render `venues.player_parking_fee` in Premium planning details.
  - Files:
    - `supabase/migrations/20260225_venues_field_renames.sql`
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`

- Tournyx bridge-domain update (separate app, no TI/RI runtime changes):
  - Tournyx (`apps/corp`) homepage converted to a minimal bridge with outbound links to TI and RI.
  - Added `noindex,follow` metadata and robots route in Tournyx app to avoid search competition with TI/RI.
  - Added Tournyx redirects:
    - `/tournaments` + `/tournament/:path*` -> TI tournaments
    - `/referees` -> RI
    - `/about` + unknown paths -> Tournyx `/`

- TI Insider-gated venue review tool (Phase 1) added at `/venues/reviews`:
  - New route/page:
    - `apps/ti-web/app/venues/reviews/page.tsx`
    - `apps/ti-web/app/venues/reviews/_components/VenueReviewsClient.tsx`
    - `apps/ti-web/app/venues/reviews/_components/VenueReviews.module.css`
  - Access control:
    - server-side auth + TI tier gate (Insider+ required)
    - unauthenticated -> `/login?returnTo=/venues/reviews`
    - non-Insider -> `/account` with friendly notice
  - UX flow:
    - Step 1 tournament identify by code or debounced name search
    - Step 2 venue selection from `tournament_venues`
    - Step 3 review form with required validation and post-submit redirect to `/tournaments/[slug]`
  - Gauge reuse:
    - reused RI segmented gauge (`WhistleScale`) by import (no component recreation)
  - Secure server path:
    - `apps/ti-web/app/api/venue-reviews/route.ts`
    - server-enforced Insider auth on lookup + submit endpoints
    - submit calls Supabase RPC `submit_venue_review` (no service role exposed in browser)
  - Supporting TI files for shared RI imports/assets:
    - `apps/ti-web/lib/badges.ts`
    - `apps/ti-web/lib/types/refereeReview.ts`
    - `apps/ti-web/public/shared-assets/svg/ri/{red_card_transparent,yellow_card_transparent,green_card_transparent}.svg`

- Venue reviews DB migration (append-only + aggregates + RLS + RPC):
  - Added:
    - `supabase/migrations/20260225_venue_reviews_phase1.sql`
  - Includes:
    - new `public.venue_reviews` table
    - unique `(user_id, venue_id)` upsert key (MVP “one active review per user per venue”)
    - aggregate columns on `public.venues`
    - `recompute_venue_review_aggregates(...)` + trigger refresh
    - RLS policies (authenticated select, own insert/update)
    - security-definer RPC `public.submit_venue_review(...)`

- SQL migration fix (function defaults):
  - Resolved PostgreSQL error:
    - `input parameters after one with a default value must also have defaults`
  - Fix:
    - removed default from `p_tournament_id` in `submit_venue_review(...)` so only trailing param keeps default (`p_venue_notes`).

- TI `/venues/reviews` gauge visual refinement (Insider venue form):
  - Updated review gauge styling to match intended TI venue-review UX:
    - selected segments use solid color fills
    - unselected segments now have a visible dark border + light gray fill for click affordance
    - removed inner icon/white center rendering from TI venue review bars
  - Added TI-local gauge assets/support used by the page:
    - `apps/ti-web/public/whistle-score.png`
    - `apps/ti-web/public/shared-assets/svg/ri/*`

- TI admin user management UI compaction + readability:
  - Updated:
    - `apps/referee/app/admin/ti/page.tsx`
  - Reworked TI user rows into collapsible `details/summary` cards showing:
    - top-line name/email and plan/subscription badge text
    - expanded metadata and edit controls on demand
  - Added derived display name helper from email local-part for faster scanning.
  - Styled alternate-row card backgrounds/borders for more apparent zebra-style separation.
  - Kept existing update/delete actions intact while moving destructive controls into a condensed section inside each expanded card.

- TI Auth email TokenHash support:
  - Added:
    - `apps/ti-web/app/auth/confirm/route.ts`
    - `apps/ti-web/app/auth/error/page.tsx`
    - `docs/auth-email-tokenhash.md`
  - Updated:
    - `apps/ti-web/middleware.ts`
  - Summary:
    - Supabase email templates can now use TokenHash links pointing to `/auth/confirm`.
    - Route validates `token_hash`, `type`, and safe relative `next`, then calls server-side `supabase.auth.verifyOtp`.
    - Success redirects:
      - default `/account`
      - `recovery` default `/account/reset-password` (unless explicit safe `next`)
    - Failure redirects to `/auth/error` with a short `notice` code.

- TI auth email redirect standardization (`RedirectTo` + `/auth/confirm`):
  - Updated TI email-triggering flows to consistently set auth callback to:
    - `https://www.tournamentinsights.com/auth/confirm` (env-aware in code)
  - Updated files:
    - `apps/ti-web/app/signup/page.tsx`
    - `apps/ti-web/app/verify-email/ResendVerificationForm.tsx`
    - `apps/ti-web/scripts/seed_test_users.ts`
    - `apps/ti-web/smoke-auth-emails.ts`
  - Added missing TI recovery destination page so reset links no longer 404:
    - `apps/ti-web/app/account/reset-password/page.tsx`
  - Auth email docs updated with finalized enterprise template standard:
    - `docs/auth-email-tokenhash.md`

- Build verification (TI):
  - `npm run build --workspace ti-web` passed with `/account/reset-password` route present.

- TI mobile-first polish updates:
  - Updated:
    - `apps/ti-web/components/PremiumInterestForm.tsx`
    - `apps/ti-web/app/join/page.tsx`
    - `apps/ti-web/app/venues/maps/[venueId]/page.tsx`
  - Removed rigid min-width constraints on key CTA/form controls.
  - Improved header wrapping on venue map page for narrow/mobile screens.

- TI homepage messaging update (Public Beta):
  - Updated:
    - `apps/ti-web/app/page.tsx`
  - Hero copy replaced with Public Beta positioning and Owl’s Eye™ value framing.
  - CTA set simplified:
    - `Explore Tournaments` -> `/tournaments`
    - `Unlock Premium Access` -> `/account`
  - Added dedicated `What is Owl’s Eye™?` section with:
    - existing badge icon (`/svg/ri/owls_eye_badge.svg`)
    - explainer lead line
    - required feature bullets
    - Premium access note
    - micro CTA to `/tournaments`
  - Homepage metadata updated to match Public Beta messaging.

- Build verification (TI):
  - `npm run build --workspace ti-web` passed after homepage + mobile polish changes.

- TI Public Beta legal consent gating + policy pages:
  - Updated signup legal consent behavior:
    - `apps/ti-web/app/signup/page.tsx`
  - Added required checkbox + validation copy:
    - `I agree to the Terms of Service and Privacy Policy.`
    - `Please agree to the Terms of Service and Privacy Policy.`
  - Submit is now disabled until consent is checked.
  - Added TI community-guidelines notice on signup linking to:
    - `/content-standards`
  - Added new TI legal route:
    - `apps/ti-web/app/content-standards/page.tsx`
  - Updated TI legal copy/content:
    - `apps/ti-web/app/(legal)/legalContent.ts`
    - `apps/ti-web/app/terms/page.tsx`
    - `apps/ti-web/app/privacy/page.tsx`
  - Terms/Privacy/Content Standards now include:
    - TI branding, `Last updated: 2026-02-26`, and support contact `support@tournamentinsights.com`
    - informational listing disclaimer, UGC responsibilities, moderation rights, arbitration/class waiver, privacy processor list, retention + deletion rights
  - Added implementation + QA checklist:
    - `apps/ti-web/docs/legal-beta-checklist.md`

- Build verification (TI):
  - `npm run build --workspace ti-web` passed with routes:
    - `/terms`
    - `/privacy`
    - `/content-standards`

- Reply-to handling clarification (RI + TI):
  - RI custom app-sent emails now include `reply_to` with default:
    - `hello@tournamentinsights.com`
  - Env override:
    - `EMAIL_REPLY_TO`
  - TI auth emails are Supabase-driven (`signUp`/`resend`/`reset`/`email_change`) and do not set `reply_to` in TI app code.
  - For TI auth emails, configure reply-to in Supabase SMTP/provider settings.

- TI homepage/header CTA update (Public Beta flow):
  - Updated:
    - `apps/ti-web/app/page.tsx`
    - `apps/ti-web/app/layout.tsx`
    - `apps/ti-web/app/globals.css`
  - Hero CTA now reads `Request Premium Access` and routes into existing waitlist capture flow on homepage (`#premium-request`) using `PremiumInterestForm`.
  - Added hero `Sign up` button (white background, green text) positioned left of `Explore Tournaments`.
  - Added logged-out header `Sign up` link to make Insider onboarding explicit.
  - Signup targets use existing redirect convention:
    - `/signup?returnTo=%2Faccount`

- TI Premium page + Owl's Eye demo/public-beta updates:
  - Added Premium value route and wired homepage CTA:
    - `apps/ti-web/app/premium/page.tsx`
    - `apps/ti-web/app/page.tsx`
  - `/premium` now renders a Starfire demo preview using the same venue Owl's Eye UI shell used on venue pages.
  - Introduced shared Owl's Eye venue card component and reused it across pages:
    - `apps/ti-web/components/venues/OwlsEyeVenueCard.tsx`
    - `apps/ti-web/app/venues/[venueId]/page.tsx`
    - `apps/ti-web/app/premium/page.tsx`
  - Added independent Weekend Guide accordions (Coffee/Food/Hotels):
    - `apps/ti-web/components/OwlsEyeWeekendGuideAccordion.tsx`
    - Defaults: Coffee open, Food closed, Hotels closed.
  - Added demo-only Owl's Eye scores panel + derivation helper:
    - `apps/ti-web/components/OwlsEyeDemoScoresPanel.tsx`
    - `apps/ti-web/lib/owlsEyeScores.ts`
    - Uses available aggregates and safe fallbacks when mode fields are unavailable.
  - Opened premium-planning preview for Grand Canyon University venue to all users on TI:
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
    - `apps/ti-web/app/venues/[venueId]/page.tsx`
  - Venue index visual polish:
    - `apps/ti-web/components/VenueIndexBadge.module.css`
    - reduced excess top spacing and centered index label/value treatment.

- Validation:
  - `npm run build --workspace ti-web` passed after these changes.

- TI venue-reviews + Owl's Eye parity follow-ups (2026-02-27):
  - Added per-review notes support end-to-end for venue reviews:
    - Migration: `supabase/migrations/20260227_venue_reviews_notes_fields.sql`
    - New `venue_reviews` columns:
      - `parking_notes` (<=60 chars)
      - `seating_notes` (<=60 chars)
    - Updated `submit_venue_review(...)` RPC signature + insert/upsert mapping for both fields.
  - Updated TI review submission flow to capture and send new fields:
    - `apps/ti-web/app/venues/reviews/_components/VenueReviewsClient.tsx`
    - `apps/ti-web/app/api/venue-reviews/route.ts`
    - Added 60-char inputs:
      - `Parking notes (optional)` above `Bring field chairs`
      - `Seating notes (optional)` above `Shade score`
  - Added venue-first lookup option on TI review page:
    - users can search/select a venue even when tournament is unknown.
  - Aligned Owl's Eye score derivation + presentation across TI:
    - `apps/ti-web/lib/owlsEyeScores.ts`
    - `apps/ti-web/components/OwlsEyeDemoScoresPanel.tsx`
    - `apps/ti-web/components/OwlsEyeWeekendGuideAccordion.tsx`
    - logic now includes:
      - bring-field-chairs most-selected
      - player parking fee range (high→low)
      - latest two parking/seating note lines from review history
      - safe fallbacks when optional fields are unavailable
  - Mirrored `/premium` premium-planning behavior/data into tournament venue detail cards:
    - `apps/ti-web/app/tournaments/[slug]/page.tsx`
    - Uses same score panel + weekend guide accordion path as `/premium`.
    - Keeps venue details collapsed by default and premium groups all-collapsed by default.
  - Visual polish updates:
    - `apps/ti-web/app/premium/page.tsx`
      - centered "Preview: Starfire Field (Demo)" heading block above the demo card.
    - `apps/ti-web/app/tournaments/tournaments.css`
      - reduced Owl's Eye badge vertical whitespace on tournament venue cards.
      - improved `Venue details` summary click behavior so second click/tap closes reliably.

- Validation:
  - `npm run build --workspace ti-web` passed after these updates.

- TI outreach multi-sport refinements + RI launch links (2026-03-04):
  - Sport-aware outreach + verify updates (TI only):
    - `apps/ti-web/lib/outreach.ts`
      - expanded `OutreachSport` to `soccer | baseball | softball`
      - normalized sport parsing for all three
      - shared sport-aware email builder path added
    - `apps/ti-web/lib/outreach/templates/soccerDirectorVerify.ts`
      - retained existing soccer header block format
      - added sport-aware body copy (`referee` for soccer, `umpire` for baseball/softball)
    - `apps/ti-web/app/verify-your-tournament/page.tsx`
      - sport-aware hero/benefit text for official role wording
    - `apps/ti-web/app/list-your-tournament/ListYourTournamentForm.tsx`
      - verify-mode-only role label switching (`Referee`/`Umpire`)
      - submit mode copy unchanged for `/list-your-tournament`
    - `apps/ti-web/app/outreach/preview/page.tsx`
      - lightweight internal preview wrapper for sport + tournament email rendering
  - Baseball/softball outreach accessibility from RI admin:
    - `apps/referee/app/admin/ti/page.tsx`
      - added `Baseball TD Outreach` and `Softball TD Outreach` buttons beside existing soccer button
      - links target TI `/admin/outreach-previews?sport=<sport>`
  - Generator robustness for placeholder emails:
    - `apps/ti-web/app/api/outreach/generate-previews/route.ts`
      - ignores placeholder email strings (`null`, `none`, `n/a`, etc.)
      - scans tournaments in paged batches (range queries) until up to requested valid recipients are found
      - applies suppression filtering per batch
      - fixes under-generation when early ordered rows contain placeholder values
  - Validation:
    - `npx tsc -p apps/ti-web/tsconfig.json --noEmit` passed
    - local baseball generate-previews smoke with `limit=50` returned `created: 50` in preview mode

- 2026-03-12: Admin dashboard tiles now filter sport counts to published canonical + date window; added venue address CSV upsert helper and ran WA venue enrich (34 rows). Files: apps/referee/app/admin/tournaments/dashboard/page.tsx, scripts/ingest/update_venue_addresses.ts. Ingested wa_tournaments_combined.csv (120 rows) and venue_address_enrichment.csv (34 venues).

- 2026-03-13: Fixed tournament counts alignment.
  - Admin dashboard and directory now paginate `tournaments_public` (no 1k cap) and include AYSO and demo tournaments with upcoming filter.
  - Files: apps/referee/app/admin/page.tsx, apps/ti-web/app/tournaments/page.tsx.


- 2026-03-13: Added volleyball support to tournament badges and admin filters (sport icon, dropdown options).

- 2026-03-13: TI tournament directory badge layout stabilized (no resize, 3+4 rows).
  - Files: apps/ti-web/app/tournaments/page.tsx, apps/ti-web/app/tournaments/tournaments.css.
  - Replaced auto-fit grid with two explicit flex rows (3 on top, 4 on bottom) and enforced non-shrinking badges (`min-width: 145px`) while keeping badge component sizes unchanged.

- 2026-03-13: RI tournaments directory parity (pagination >1000, demo first, volleyball styling).
  - Files: apps/referee/app/tournaments/page.tsx, apps/referee/app/tournaments/tournaments.css, apps/referee/lib/ui/sportBackground.ts.
  - Added range-based pagination to remove the 1000-row cap, sorted the demo tournament first then by date, and aligned volleyball badge/background with TI.

- 2026-03-13: Ingested inland_west_youth_volleyball_tournaments_2026.csv into RI (draft uploads, sport=volleyball, source=external_crawl).
  - Script: `apps/referee/scripts/ingest-csv.ts --sport=volleyball --status=draft --source=external_crawl tmp/inland_west_youth_volleyball_tournaments_2026.csv`
  - Inserted ~50 Inland West volleyball tournaments for approval.

- 2026-03-13: Venue SEO slugs added.
  - Migration: `supabase/migrations/20260313_add_venues_seo_slug.sql` (+ down file).
  - Adds `seo_slug` column, backfills with deduped slugs, unique index, NOT NULL, and trigger to auto-generate on insert with collision handling; helper function `fn_make_venue_slug`.
  - App: shared helper `apps/referee/lib/venues/slug.ts`; venue creation in `scripts/ingest/link_missing_venues_deep.ts` and `apps/referee/lib/admin/topTierCrawler.ts` now sets `seo_slug`.

- 2026-03-14: Venue slug routing rollout (RI).
  - Files: `apps/referee/app/venues/[venueId]/page.tsx`, `apps/referee/app/tournaments/[slug]/page.tsx`, `apps/referee/lib/venues/{getVenueHref,isUuid}.ts`.
  - Venue page now resolves by `seo_slug` or UUID, redirects UUIDs to slug URLs, sets canonical to slug; public venue links prefer slug with UUID fallback.

- 2026-05-17: Owl's Eye hangouts targeted re-run: clean overwrite fix + backfill script.
  - Problem: targeted category re-run (`categories: ["hangouts"], force: true`) only upserted by `run_id,place_id` — old parks/places with non-matching place_ids survived alongside fresh results.
  - Fix: `apps/referee/src/owlseye/nearby/upsertNearbyForRun.ts` — when `force && isTargetedRun`, delete existing rows for the requested categories from `owls_eye_nearby_food` immediately before the upsert (safe: only runs after confirming `uniqueRows.length > 0`).
  - Script: `scripts/ingest/backfill_owls_eye_hangouts.ts` — re-runs hangouts for venues with upcoming tournaments (now → Oct 31 2026), sorted by nearest tournament date. Validates first 2 venues interactively before bulk processing. Stops automatically on FSQ budget exhaustion.
  - Usage: `tsx scripts/ingest/backfill_owls_eye_hangouts.ts` (dry run) / `--apply` (execute). Requires OWLS_EYE_ADMIN_TOKEN + REFEREE_APP_URL in env. Referee app must be running.
  - FSQ budget context: ~7k calls remaining this month (10k free tier, ~3k used); ~4105 venues targeted at avg 1.5 calls/venue ≈ 6150 calls. Budget guard in withinBudgets() stops automatically if cap is hit. Verify FOURSQUARE_MONTHLY_CALL_LIMIT=10000 is set in referee app env (code default is 35000).

- 2026-07-01: TI team-block RFP success normalization fixed for HotelPlanner.
  - Files:
    - `apps/ti-web/lib/lodging/hotelPlannerProvider.ts`
    - `docs/notes-ti.md`
    - `docs/notes.md`
  - Changes:
    - Fixed `normalizeGroupRequest()` to treat a returned HotelPlanner request/posting ID as a successful submission even when the payload does not include the expected `success: true` flag.
    - This corrects a live venue-map issue where HotelPlanner accepted the RFP and generated a request ID, but TI incorrectly showed the submission as failed.
    - No payload/tracking-field changes were required; the bug was response interpretation only.
- 2026-05-17: Backfill confirmed free accounts to plan='insider'.
  - Root cause: legacy ti_users rows had plan='free'; getTier() already granted insider to all confirmed users but the plan field was misaligned, causing the daily admin email to report "Insider: 2" (only explicit plan='insider' rows) instead of the real ~45 confirmed users.
  - Migration: `supabase/migrations/20260517_backfill_confirmed_free_to_insider.sql` — promotes all confirmed free/null-plan accounts to plan='insider' (~45 rows).
  - App fix: `apps/ti-web/lib/tiUserProfileServer.ts` — `syncTiUserProfileFromAuthUser` (called at email confirmation) now promotes plan='free'/null to 'insider' in the UPDATE path so future confirmations of legacy free accounts are handled automatically.
  - No entitlement behavior change; no schema change. Daily email "Insider" count now reflects actual confirmed user base.
- 2026-06-30: TI venue-map lodging flow simplified to property-page handoff.
  - Files:
    - `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapClient.tsx`
    - `apps/ti-web/lib/lodging/lodging-provider.ts`
    - `apps/ti-web/lib/lodging/hotelPlannerProvider.ts`
    - `CLAUDE.md`
  - Changes:
    - Removed map click dependency on `/api/lodging/availability` and room-option rendering inside the TI venue-map panel.
    - Hotel marker and left-panel hotel clicks now open HotelPlanner white-label property pages directly in a new tab using `/Hotel/HotelRoomTypes.htm`.
    - Property handoff URL now carries TI tracking params (`sc`, `source`, `kw`, `jobCode`, `Custom1`, `Custom2`) and ends with `#content`.
    - Reused `/api/lodging/search` resolved dates for handoff and converted them from `MM/DD/YYYY` to `MM/DD/YY` for HP property URLs.
    - Hotel markers now show name + rating + from-price; hotel list rows remain highlightable without expanding into room state.
    - Search normalization now preserves `detailUrl` when available and defaults `hotelIDTypeID` to `0` when missing.
- 2026-06-30: TI hotel outbound partner cutover to HotelPlanner.
  - Files:
    - `apps/ti-web/app/go/hotels/route.ts`
    - `apps/ti-web/lib/booking/venueBooking.ts`
    - `apps/ti-web/lib/booking/venueBooking.test.ts`
    - `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
    - `CLAUDE.md`
  - Changes:
    - `/go/hotels` now routes TI hotel traffic to HotelPlanner only; Booking.com is no longer used as a TI hotel destination or fallback.
    - Missing lat/lng now falls back to HotelPlanner generic `/Search/` destination queries instead of Booking.com.
    - `buildHotelsHref()` now defaults to `provider=hotelplanner`.
    - Removed remaining visible Booking.com hotel copy from TI hotel surfaces (`Search hotels on Booking.com` -> `Search hotels`).
    - Updated UAT guidance so hotel fallback expectations are HotelPlanner + VRBO, not Booking.com + VRBO.
- 2026-06-30: RI admin hotel click reporting scoped to HotelPlanner partner only.
  - Files:
    - `apps/referee/app/admin/ti/outbound/page.tsx`
    - `apps/referee/app/admin/ti/clicks/page.tsx`
  - Changes:
    - Hotel click queries now filter on `partner = 'hotelplanner'` in addition to `destination_type = 'hotels'`, excluding any legacy Booking.com rows.
    - Renamed tile labels from "Total hotel clicks (Booking)" / "Hotels clicks" to "HotelPlanner clicks".
    - No schema change needed; `partner` column already exists in `ti_outbound_clicks` (migration `20260420_ti_outbound_clicks_hotels.sql`).
