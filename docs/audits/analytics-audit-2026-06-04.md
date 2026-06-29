# Analytics Audit Report

## Summary
TournamentInsights uses a mixed analytics stack:

- baseline page analytics via Plausible in `apps/ti-web/app/layout.tsx`
- custom product event logging via `sendTiAnalytics()` in `apps/ti-web/lib/analytics.ts`
- typed wrappers for many TI events via `trackTiEvent()` in `apps/ti-web/lib/tiAnalyticsClient.ts`
- server-side persistence into `public.ti_map_events` and `public.venue_quick_check_events` via `apps/ti-web/app/api/analytics/route.ts`
- server-side affiliate/outbound logging via redirect routes such as `apps/ti-web/app/go/hotels/route.ts`, `apps/ti-web/app/go/vrbo/route.ts`, and `apps/ti-web/app/go/partner/[partnerLinkId]/route.ts`
- admin reporting in the referee app, mainly `apps/referee/app/admin/ti/clicks/page.tsx`

The implementation is functional but uneven:

- there is strong coverage for tournament detail, venue map, Owl’s Eye gating, planner actions, book-travel clicks, and partner redirects
- persistence is allowlist-based, so several fired events never reach `ti_map_events`
- the admin dashboard is hardcoded to a curated event list and requires explicit updates for new events
- the monetization funnel stops at `premium_cta_clicked`; there is no custom analytics event for checkout started, purchase completed, checkout cancelled, signup completed, or login completed

## Existing Analytics Architecture

### Client utilities
- `apps/ti-web/lib/analytics.ts`
  - `sendTiAnalytics(event, properties)` posts to `/api/analytics`
  - prefers `navigator.sendBeacon()` and falls back to `fetch(..., keepalive: true)`
  - fail-open by design
- `apps/ti-web/lib/tiAnalyticsClient.ts`
  - typed wrapper around `sendTiAnalytics`
- `apps/ti-web/lib/tiAnalyticsEvents.ts`
  - union of typed TI event names
  - event-property typing for many TI surfaces

### Vendor analytics
- `apps/ti-web/components/PlausibleScript.tsx`
  - injects Plausible script for TI web
- `apps/referee/providers/PostHogProvider.tsx`
  - PostHog exists in the referee app, not the TI web app event pipeline reviewed here

### Ingestion + storage
- `apps/ti-web/app/api/analytics/route.ts`
  - console-logs every inbound analytics payload
  - persists only allowlisted events
  - splits persistence into:
    - `QUICK_CHECK_EVENTS` → `public.venue_quick_check_events`
    - `MAP_EVENTS` → `public.ti_map_events`
    - `TRAVEL_EVENTS` → `public.ti_map_events`
    - `PLANNER_EVENTS` → `public.ti_map_events`
    - `SAVED_TOURNAMENT_EVENTS` → `public.ti_map_events`
  - skips localhost/private-network traffic unless `ENABLE_TI_ANALYTICS_TRACKING=true`
- `supabase/migrations/20260409_ti_map_analytics_events.sql`
  - `public.ti_map_events`
  - schema: `event_name`, `properties jsonb`, `page_type`, `sport`, `state`, `href`, `filter_name`, `old_value`, `new_value`, `cta`, `created_at`
- `supabase/migrations/20260316_quick_check_analytics.sql`
  - `public.venue_quick_check_events`
  - quick-check-specific RPC `get_venue_quick_check_metrics`

### Server-side affiliate / outbound tracking
- `apps/ti-web/app/go/hotels/route.ts`
  - writes `ti_outbound_clicks` rows with `destination_type='hotels'`
- `apps/ti-web/app/go/vrbo/route.ts`
  - writes `ti_outbound_clicks` rows with `destination_type='vrbo'`
- `apps/ti-web/app/go/partner/[partnerLinkId]/route.ts`
  - writes `partner_click_clicked` directly into `public.ti_map_events`
  - includes partner metadata, placement, campaign, tournament/venue IDs when present

### Dashboard / reporting flow
- `apps/referee/app/admin/ti/clicks/page.tsx`
  - manually defines the event inventory shown in admin
  - computes today / yesterday / 7d / 30d counts per hardcoded event name
  - pulls top-viewed tournaments / venues / dimensions through RPCs
- `apps/referee/app/admin/ti/clicks/ClicksTableClient.tsx`
  - groups rows by hardcoded category matchers
- `supabase/migrations/20260525_admin_analytics_rpcs.sql`
  - `admin_top_viewed_tournaments`
  - `admin_top_viewed_venues`
  - `admin_top_sports_by_views`
  - `admin_top_states_by_venue_opens`

## Event Inventory

### Inventory notes
- **Dashboard label** is from `apps/referee/app/admin/ti/clicks/page.tsx` when present; otherwise `none found`
- **Client/server** means where the event is emitted, not merely persisted
- **Dashboard** means visible in the TI clicks admin dashboard; quick-check has its own metrics path
- **Persistence notes** call out major allowlist gaps

| Event name | Dashboard label | Category | Trigger / file path | Properties | Client/server | Dashboard | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `map_viewed` | `Map: viewed` | Discovery | homepage / heatmap pageview; typed in `apps/ti-web/lib/tiAnalyticsEvents.ts` | `page_type`, `sport` | client | yes | persisted via `MAP_EVENTS` |
| `map_filter_changed` | `none found` on TI admin homepage; clicks dashboard label is group-only | Discovery | `apps/ti-web/app/heatmap/SportFilter.tsx`, `apps/ti-web/components/homepage/HomepageSportFilter.tsx` | `page_type`, `filter_name`, `old_value`, `new_value` | client | yes | persisted |
| `map_state_clicked` | `none found` on TI admin homepage; clicks dashboard label is group-only | Discovery | homepage / heatmap state link clicks; typed | `page_type`, `sport`, `state`, `href` | client | yes | persisted |
| `homepage_cta_clicked` | `Homepage: CTA clicked` | Discovery | homepage tracked links | `cta` | client | yes | persisted |
| `homepage_sport_chip_clicked` | `Homepage: sport chip clicked` | Discovery | homepage sport chip clicks | `sport` | client | yes | persisted |
| `tournament_directory_page_viewed` | `Tournament directory: page viewed` | Directory | `apps/ti-web/app/tournaments/TournamentDirectoryAnalyticsClient.tsx` pageview effect | `page_type`, `result_count` | client | yes | render-time event, ref-deduped |
| `search_submitted` | `Search submitted` | Directory | same file, form submit listener | `page_type`, `sport`, `state`, `date_range_set`, `result_count` | client | yes | persisted |
| `tournament_card_plan_weekend_clicked` | `Tournament directory card: plan weekend clicked` | Directory | `apps/ti-web/app/tournaments/PlanWeekendCtaClient.tsx` | `page_type`, `tournament_id`, `tournament_slug`, `source_page`, `cta`, `href`, `sport`, `state` | client | yes | only plan-weekend CTA is tracked; generic card/detail click is not |
| `tournament_detail_page_viewed` | `Tournament detail: page viewed` | Tournament Detail | `apps/ti-web/app/tournaments/[slug]/TournamentDetailViewTrackerClient.tsx` | `page_type`, `tournament_id`, `slug`, `sport`, `state` | client | yes | render-time event |
| `tournament_detail_more_in_state_clicked` | `none found` | Tournament Detail | `apps/ti-web/app/tournaments/_components/MoreTournamentsInStateLinks.tsx` | `page_type`, `tournament_slug`, `sport`, `state`, `href`, `link_kind`, `month` | client | no | persisted, but missing from clicks dashboard |
| `tournament_detail_weekend_plan_clicked` | `Tournament detail: weekend plan clicked` | Tournament Detail | `apps/ti-web/app/tournaments/[slug]/TournamentPlanningCtasClient.tsx` | `page_type`, `tournament_id`, `tournament_slug`, `source_page`, `cta`, `href` | client | yes | persisted |
| `tournament_detail_venue_map_clicked` | `Tournament detail: venue map clicked` | Tournament Detail | same file | `page_type`, `tournament_id`, `tournament_slug`, `source_page`, `cta`, `href` | client | yes | persisted |
| `tournament_detail_travel_search_clicked` | `Tournament detail: travel search clicked` | Tournament Detail | same file | `page_type`, `tournament_id`, `tournament_slug`, `source_page`, `cta`, `href` | client | yes | persisted |
| `tournament_map_cta_clicked` | `Tournament map CTA clicked` | Tournament Detail / Map | `apps/ti-web/components/tournaments/TournamentMapCta.tsx`, `apps/ti-web/components/tournaments/TournamentDetailStickyMapCta.tsx` | untyped, source-specific CTA metadata | client | yes | persisted through `MAP_EVENTS`, but untyped |
| `venue_page_viewed` | `Venue page viewed` | Venue | `apps/ti-web/components/analytics/VenuePageViewTracker.tsx` | `page_type`, `href`, `venue_id`, `venue_slug`, `sport`, `state`, `source_tournament_id`, `source_tournament_slug` | client | yes | sessionStorage dedupe present |
| `venue_map_opened` | `Venue map opened` | Venue Map | `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapClient.tsx` | `page_type`, `tournament_id`, `tournament_slug`, `sport`, `state`, `venue_count`, `href` | client | yes | render-time event |
| `venue_map_loaded` | `Venue map loaded` | Venue Map | same file after map load | `page_type`, `tournament_id`, `tournament_slug`, `sport`, `venue_count`, `href` | client | yes | persisted |
| `tournament_map_loaded_from_venue` | `none found` | Venue Map | `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapShellClient.tsx` | `tournament_id`, `tournament_slug`, `venue_id`, `source` | client | no | typed + fired, but not allowlisted in `MAP_EVENTS` |
| `venue_select` | `none found` | Venue Map | `TournamentVenueMapClient.tsx` on card/marker selection | `page_type`, `tournament_id`, `tournament_slug`, `venue_id`, `venue_name`, `source`, `hasCoordinates`, `hasOwlEyeData` | client | no | typed + fired, not persisted |
| `directions_click` | `none found` | Venue Map | `TournamentVenueMapClient.tsx` directions actions | `page_type`, `tournament_id`, `tournament_slug`, `venue_id`, `venue_name`, `source`, `provider`, `hasCoordinates`, `hasOwlEyeData` | client | no | typed + fired, not persisted |
| `hotels_click` | `none found` | Venue Map | `TournamentVenueMapClient.tsx` hotel click from venue panel | `page_type`, `tournament_id`, `tournament_slug`, `venue_id`, `venue_name`, `source` | client | no | typed + fired, not persisted |
| `venue_view_click` | `none found` | Venue Map | `TournamentVenueMapClient.tsx` venue detail clicks | `page_type`, `tournament_id`, `tournament_slug`, `venue_id`, `venue_name`, `source` | client | no | typed + fired, not persisted |
| `venue_directory_plan_map_click` | `none found` | Venue Directory | `apps/ti-web/components/venues/VenueCardCtasClient.tsx` | `venue_id`, `venue_name`, `tournament_slug`, `city`, `state`, `sport`, `source`, `position` | client | no | typed + fired, not persisted |
| `venue_details_plan_map_click` | `none found` | Venue Detail | `apps/ti-web/components/venues/VenuePlanningMapLinkClient.tsx` | typed in `tiAnalyticsEvents` | client | no | typed event defined; no clear literal emit found in this audit |
| `venue_details_directions_click` | `none found` | Venue Detail | `apps/ti-web/components/venues/MobileMapLink.tsx` / venue detail surfaces | typed in `tiAnalyticsEvents` | client | no | typed event defined; no allowlist persistence path found |
| `venue_directory_view_venue_click` | `none found` | Venue Directory | `apps/ti-web/components/venues/VenueCardCtasClient.tsx` | `venue_id`, `venue_name`, `tournament_slug`, `position` | client | no | typed + fired, not persisted |
| `nearest_airport_click` | `none found` | Venue Map | `TournamentVenueMapClient.tsx` | `page_type`, `tournament_id`, `tournament_slug`, `venue_id`, `venue_name`, `source`, `provider`, `airport_id`, `airport_name`, `airport_iata` | client | no | typed + fired, not persisted |
| `tier_gate_hit` | `Tier gate hit` | Premium / Gating | `TournamentVenueMapClient.tsx` | `feature`, `user_tier`, optional `page_type`, `tournament_id`, `tournament_slug`, `venue_id` | client | yes | persisted |
| `premium_modal_viewed` | `Premium modal viewed` | Premium / Paywall | `apps/ti-web/components/premium/WeekendProUpgradeModal.tsx` | `source`, `source_context`, `tournament_slug`, `venue_slug`, `entry_point`, `cta_label`, `user_tier`, `has_affiliate_visible` | client | yes | not typed in `tiAnalyticsEvents`; ref-dedupes per open cycle |
| `premium_cta_clicked` | `Premium CTA clicked` | Premium / Paywall | `apps/ti-web/components/UpgradeWeekendProButton.tsx`, `apps/ti-web/components/UpgradeWeekendPassButton.tsx`, `apps/ti-web/app/premium/PremiumAutoCheckout.tsx` | `source`, `source_context`, `tournament_slug`, `venue_slug`, `entry_point`, `cta_label`, `user_tier`, optional `offer`, `has_affiliate_visible` | client | yes | used for both annual and 30-day offers; no dedicated checkout-start event |
| `owls_eye_unlock_prompt_shown` | `Owl's Eye unlock prompt shown` | Owl’s Eye | `TournamentVenueMapClient.tsx` | typed Owl’s Eye prompt context | client | yes | persisted |
| `owls_eye_full_opened` | `Owl's Eye full opened` | Owl’s Eye | same | typed context | client | yes | persisted |
| `owls_eye_category_pins_enabled` | `Owl's Eye category pins enabled` | Owl’s Eye | same | typed context | client | yes | persisted |
| `owls_eye_category_expanded` | `Owl's Eye category expanded` | Owl’s Eye | same | typed context | client | yes | persisted |
| `owls_eye_result_selected` | `Owl's Eye result selected` | Owl’s Eye | same | typed context | client | yes | persisted |
| `owls_eye_directions_clicked` | `Owl's Eye directions clicked` | Owl’s Eye | same | typed context | client | yes | persisted |
| `owls_eye_limited_continue` | `none found` | Owl’s Eye | `TournamentVenueMapClient.tsx` | `page_type`, `tournament_id`, `tournament_slug`, `venue_id` | client | no | typed + fired, not allowlisted |
| `owls_eye_preview_shown` | `none found` | Owl’s Eye Preview | `TournamentVenueMapClient.tsx` | typed preview context | client | no | typed + fired, not allowlisted |
| `owls_eye_preview_pin_click` | `none found` | Owl’s Eye Preview | same | typed preview context | client | no | typed + fired, not allowlisted |
| `owls_eye_preview_directions_click` | `none found` | Owl’s Eye Preview | same | typed preview context | client | no | typed + fired, not allowlisted |
| `owls_eye_preview_upgrade_click` | `none found` | Owl’s Eye Preview | same | typed preview context | client | no | typed + fired, not allowlisted |
| `owls_eye_preview_hotel_booking_click` | `none found` | Owl’s Eye Preview | same | typed preview context | client | no | typed + fired, not allowlisted |
| `venue_map_hotels_clicked` | `Map panel hotels clicked` | Venue Map | `TournamentVenueMapClient.tsx` | typed venue/tournament context | client | yes | persisted |
| `weekend_share_clicked` | `Weekend share clicked` | Weekend Share | `apps/ti-web/components/ShareWeekendButton.tsx` | `source_page`, `channel`, `tournament_slug`, `venue` | client | yes | persisted |
| `weekend_page_opened` | `Weekend page opened` | Weekend Share | `apps/ti-web/app/weekend/[slug]/WeekendShareOpenTracker.tsx` | typed weekend page context | client | yes | render-time event |
| `weekend_share_venue_map_clicked` | `Weekend share: venue map clicked` | Weekend Share | `apps/ti-web/app/weekend/[slug]/WeekendPlanningCtasClient.tsx` | typed share context | client | yes | persisted |
| `weekend_share_travel_clicked` | `Weekend share: travel clicked` | Weekend Share | same | typed share context | client | yes | persisted |
| `weekend_share_planner_hub_clicked` | `Weekend share: planner hub clicked` | Weekend Share | same | typed share context | client | yes | persisted |
| `weekend_share_directions_clicked` | `Weekend share: directions clicked` | Weekend Share | `apps/ti-web/app/weekend/[slug]/DirectionsChooserClient.tsx` | typed provider/source context | client | yes | persisted |
| `weekend_share_airport_directions_clicked` | `Weekend share: airport directions clicked` | Weekend Share | same | typed provider/airport context | client | yes | persisted |
| `weekend_share_owls_eye_directions_clicked` | `Weekend share: Owl's Eye directions clicked` | Weekend Share | same | typed Owl’s Eye directions context | client | yes | persisted |
| `tournament_map_weekend_plan_clicked` | `Tournament map: weekend plan clicked` | Tournament Map | `TournamentVenueMapClient.tsx` | typed tournament/map context | client | yes | persisted |
| `tournament_map_back_to_tournament_clicked` | `Tournament map: back to tournament clicked` | Tournament Map | `TournamentVenueMapShellClient.tsx` | typed context | client | yes | persisted |
| `tournament_map_add_to_planner_clicked` | `Tournament map: add to planner clicked` | Tournament Map | `TournamentVenueMapClient.tsx` | typed context | client | yes | persisted |
| `weekend_planner_saved_tournament_clicked` | `Weekend planner: saved open tournament clicked` | Weekend Planner | `apps/ti-web/app/weekend-planner/SavedTournamentActionsClient.tsx` | typed tournament context | client | yes | persisted |
| `weekend_planner_saved_weekend_plan_clicked` | `Weekend planner: saved weekend plan clicked` | Weekend Planner | same | typed context | client | yes | persisted |
| `weekend_planner_saved_venue_map_clicked` | `Weekend planner: saved venue map clicked` | Weekend Planner | same | typed context | client | yes | persisted |
| `weekend_planner_saved_travel_clicked` | `Weekend planner: saved travel clicked` | Weekend Planner | same | typed context | client | yes | persisted |
| `planner_calendar_feed_connect_succeeded` | `Planner: calendar connect succeeded` | Planner | `apps/ti-web/app/_components/planner/PlannerClient.tsx` | typed planner props | client | yes | persisted |
| `planner_calendar_feed_connect_failed` | `Planner: calendar connect failed` | Planner | same | typed planner props incl. `reason_code` | client | yes | persisted |
| `planner_calendar_feed_limit_reached` | `Planner: calendar feed limit reached` | Planner | typed event exists in `tiAnalyticsEvents` | typed planner props | client | yes | defined + allowlisted, but no literal emitter found in this audit |
| `planner_calendar_feed_refresh_clicked` | `Planner: calendar refresh clicked` | Planner | `PlannerClient.tsx` | typed planner props | client | yes | persisted |
| `planner_calendar_feed_refresh_succeeded` | `Planner: calendar refresh succeeded` | Planner | `PlannerClient.tsx` | typed planner props | client | yes | persisted |
| `planner_calendar_feed_refresh_failed` | `Planner: calendar refresh failed` | Planner | `PlannerClient.tsx` | typed planner props incl. `reason_code` | client | yes | persisted |
| `planner_view_toggle_clicked` | `Planner: view toggle clicked` | Planner | `PlannerClient.tsx` | `from_view`, `to_view`, `toggle_type`, planner context | client | yes | persisted |
| `planner_calendar_timezone_changed` | `Planner: calendar timezone changed` | Planner | `PlannerClient.tsx` | typed planner props | client | yes | persisted |
| `planner_load_more_clicked` | `Planner: load more clicked` | Planner | `PlannerClient.tsx` | typed planner props incl. count buckets | client | yes | persisted |
| `planner_manual_event_created` | `Planner: manual event created` | Planner | `PlannerClient.tsx` | typed planner props | client | yes | persisted |
| `planner_manual_event_updated` | `Planner: manual event updated` | Planner | `PlannerClient.tsx` | typed planner props | client | yes | persisted |
| `planner_manual_event_deleted` | `Planner: manual event deleted` | Planner | `PlannerClient.tsx` | typed planner props | client | yes | persisted |
| `planner_duplicate_keep_separate_clicked` | `Planner: duplicate keep separate clicked` | Planner | `PlannerClient.tsx` | typed planner props | client | yes | persisted |
| `planner_duplicate_merge_modal_opened` | `Planner: merge modal opened` | Planner | `PlannerClient.tsx` | typed planner props | client | yes | persisted |
| `planner_duplicate_merge_succeeded` | `Planner: merge succeeded` | Planner | `PlannerClient.tsx` | typed planner props | client | yes | persisted |
| `planner_duplicate_merge_failed` | `Planner: merge failed` | Planner | `PlannerClient.tsx` | typed planner props incl. `reason_code` | client | yes | persisted |
| `planner_weekend_pro_gate_viewed` | `Planner: Weekend Pro gate viewed` | Planner | `PlannerClient.tsx` | typed planner props | client | yes | render/state-driven |
| `planner_weekend_pro_gate_clicked` | `Planner: Weekend Pro gate clicked` | Planner | `PlannerClient.tsx` | typed planner props | client | yes | persisted |
| `planner_map_view_opened` | `Planner: map opened` | Planner | `PlannerClient.tsx` | typed planner props | client | yes | persisted |
| `planner_calendar_event_detail_opened` | `Planner: calendar event detail opened` | Planner | `apps/ti-web/app/_components/planner/PlannerCalendar.tsx` | typed planner props | client | yes | persisted |
| `Tournament Save Clicked` | `none found` | Saved Tournament | `apps/ti-web/components/SaveTournamentButton.tsx` | `tournamentId`, `saved_before`, `logged_in`, `verified` | client | no | persisted into `ti_map_events`; not in clicks dashboard |
| `Tournament Save Auth Redirect` | `none found` | Saved Tournament | same | `tournamentId`, `reason`, `returnTo` | client | no | persisted |
| `Tournament Saved` | `none found` | Saved Tournament | same | `tournamentId` | client | no | persisted |
| `Saved Tournament Notify Prompt Shown` | `none found` | Saved Tournament | same | `tournamentId` | client | no | persisted |
| `Saved Tournament Notify Enabled` | `none found` | Saved Tournament | same | `tournamentId` | client | no | persisted |
| `Saved Tournament Notify Dismissed` | `none found` | Saved Tournament | same | `tournamentId` | client | no | persisted |
| `book_travel_viewed` | `Book travel: page viewed` | Book Travel | `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx` pageview effect | actual emitted props: `page_path`, `source_page`, `referrer_path`, `has_destination`, `has_dates` | client | yes | persisted via `TRAVEL_EVENTS`; **typed as `Record<string, never>` in `tiAnalyticsEvents.ts`** |
| `book_travel_hotels_clicked` | `Book travel: hotels clicked` | Book Travel | same | emitted props include destination/date presence, `travel_type`, `cta_location`, partner params | client | yes | persisted |
| `book_travel_vrbo_clicked` | `Book travel: vrbo clicked` | Book Travel | same | similar travel props | client | yes | persisted |
| `book_travel_shared` | `Book travel: shared` | Book Travel | same | `travel_type`, `cta_location`, `channel`, `share_url` | client | yes | persisted |
| `book_travel_search_by_city_clicked` | `Book travel: search by city clicked` | Book Travel | typed only | typed as empty object | client | yes | defined + dashboarded, but no literal emitter found |
| `book_travel_add_event_clicked` | `Book travel: add event clicked` | Book Travel | typed only | typed as empty object | client | yes | defined + dashboarded, but no literal emitter found |
| `book_travel_tournament_directory_clicked` | `Book travel: tournament directory clicked` | Book Travel | typed only | typed as empty object | client | yes | defined + dashboarded, but no literal emitter found |
| `book_travel_weekend_pro_upsell_clicked` | `Book travel: weekend pro upsell clicked` | Book Travel | typed only; premium button instead emits `premium_cta_clicked` | typed as empty object | client | yes | likely stale event definition; no literal emitter found |
| `partner_click_clicked` | `Partner click: outbound clicked` | Partner / Affiliate | `apps/ti-web/app/go/partner/[partnerLinkId]/route.ts` | `partner_key`, `partner_name`, `partner_link_id`, `partner_link_label`, `destination_type`, `sport`, `campaign`, `placement`, `source_component`, `page_type`, `tournament_id`, `venue_id`, `user_tier`, `outbound_url`, `href` | server | yes | direct server persistence, avoids navigation loss |
| `Venue Quick Check Opened` | `none found` | Quick Check | `apps/ti-web/components/venues/QuickVenueCheck.tsx` | quick-check context fields | client | quick-check RPC only | persisted to `venue_quick_check_events` |
| `Venue Quick Check Started` | `none found` | Quick Check | same | quick-check context | client | quick-check RPC only | persisted |
| `Venue Quick Check Dismissed` | `none found` | Quick Check | same | quick-check context | client | quick-check RPC only | persisted |
| `Venue Quick Check Submitted` | `none found` | Quick Check | same | quick-check context + fields completed | client | quick-check RPC only | persisted |
| `Venue Quick Check Signup Prompt Shown` | `none found` | Quick Check | same | quick-check signup prompt context | client | quick-check RPC only | persisted |
| `Venue Quick Check Signup Clicked` | `none found` | Quick Check | same | quick-check signup click context | client | quick-check RPC only | persisted |
| `Venue Quick Check Signup Dismissed` | `none found` | Quick Check | same | quick-check signup dismissal context | client | quick-check RPC only | persisted |
| `Venue Quick Check Login Clicked` | `none found` | Quick Check | same | quick-check login click context | client | no | fired, but **not in `QUICK_CHECK_EVENTS`**, so not persisted |
| `venue_hotels_cta_clicked` | `none found` | Venue / Affiliate | `apps/ti-web/components/venues/HotelBookingCta.tsx` | `venue_id`, `tournament_id`, `href` | client | no | fired, but not typed and not allowlisted |
| `verify_page_view` | `none found` | Verification funnel | `apps/ti-web/app/list-your-tournament/ListYourTournamentForm.tsx` | verify flow metadata | client | no | fired, no persistence path found |
| `verify_form_started` | `none found` | Verification funnel | same | verify flow metadata | client | no | fired, no persistence path found |
| `verify_submission_success` | `none found` | Verification funnel | same | verify flow metadata | client | no | fired, no persistence path found |
| `verify_time_to_completion` | `none found` | Verification funnel | same | elapsed time metadata | client | no | fired, no persistence path found |
| `weekend_planner_cta_clicked` | `none found` | Verification / cross-sell | same | CTA metadata | client | no | fired, no persistence path found |

## Monetization Funnel Coverage

| Funnel step | Covered? | Existing event / data source | Missing properties / gaps | Notes |
| --- | --- | --- | --- | --- |
| tournament card visible | missing | none found | no impression logging | no directory-card impression event |
| tournament card clicked | missing | none found | no generic card click event | recent clickable-card UX fix is not instrumented |
| tournament details click | missing | none found | no “view tournament details” CTA/click event | downstream `tournament_detail_page_viewed` exists only after navigation |
| plan weekend click | covered | `tournament_card_plan_weekend_clicked`, `tournament_detail_weekend_plan_clicked`, `tournament_map_weekend_plan_clicked` | no unified funnel naming | good coverage by surface |
| venue / planner page viewed | partially covered | `venue_page_viewed`, `venue_map_opened`, `weekend_page_opened`, `book_travel_viewed` | no single canonical “planner page viewed” | fragmented by route |
| venue map click | covered | `tournament_detail_venue_map_clicked`, `venue_directory_plan_map_click`, `weekend_share_venue_map_clicked` | some map-adjacent clicks not persisted | surface-specific names |
| directions click | partially covered | `directions_click`, `weekend_share_directions_clicked`, `owls_eye_directions_clicked` | core `directions_click` is not persisted | share and Owl’s Eye variants persist, base map version does not |
| hotel click | partially covered | `hotels_click`, `venue_map_hotels_clicked`, `book_travel_hotels_clicked`, `venue_hotels_cta_clicked`, `ti_outbound_clicks` hotel rows | multiple naming patterns; some client events unpersisted | strongest trusted signal is server-side `ti_outbound_clicks` |
| rental / VRBO click | covered | `book_travel_vrbo_clicked`, `ti_outbound_clicks` vrbo rows | no venue-level rental event outside book-travel page | outbound server log is authoritative |
| Booking.com outbound click | covered | `ti_outbound_clicks.destination_type='hotels'` | no matching custom event name | server-side only |
| VRBO outbound click | covered | `ti_outbound_clicks.destination_type='vrbo'` | no matching custom event name | server-side only |
| Fanatics outbound click | covered | `partner_click_clicked` | dashboard assumes all partner clicks are Fanatics | breaks when more partners go live |
| premium CTA click | covered | `premium_cta_clicked` | no explicit pricing option normalization beyond body fields | used for both annual + 30-day offers |
| premium modal viewed / opened | covered | `premium_modal_viewed` | untyped; no session-level dedupe beyond per-open ref | counted once per open cycle |
| continue with limited results | partially covered | `owls_eye_limited_continue` | event is not persisted or dashboarded | fired client-side only |
| 30-day / preview purchase CTA click | partially covered | `premium_cta_clicked` from `UpgradeWeekendPassButton` | no dedicated event name; relies on `offer: weekend_pass_30d` | analyzable only through payload inspection |
| annual purchase CTA click | partially covered | `premium_cta_clicked` from `UpgradeWeekendProButton` | no dedicated event name | analyzable only through `cta_label` / source context |
| Stripe checkout start | missing | none found | no event between CTA click and `/api/stripe/checkout` success | checkout POST happens with no custom analytics confirmation |
| purchase completed | missing | none found | webhook updates entitlement, not analytics | no `checkout.session.completed` analytics event |
| cancelled checkout | missing | none found | no cancel telemetry | cannot measure recovery |
| signup started | missing | none found for premium funnel | save-tournament and quick-check have auth redirect clicks only | no standardized signup funnel |
| signup completed | missing | none found | no completion event | not tied to premium or planner |
| login completed | missing | none found | no completion event | not tied to funnel source |
| saved tournament | covered | `Tournament Saved` | not on admin clicks dashboard | persisted |
| saved weekend plan | covered | `weekend_planner_saved_weekend_plan_clicked` | naming is click-oriented, not completion-oriented | persisted |
| share weekend plan | covered | `weekend_share_clicked` and share CTA variants | uses `venue` instead of `venue_id`/`venue_slug` | persisted |
| Owl’s Eye locked prompt shown | covered | `owls_eye_unlock_prompt_shown` | none major | persisted |
| Owl’s Eye unlocked view | covered | `owls_eye_full_opened` | none major | persisted |

## Affiliate Tracking Coverage

| Partner | Event / source | Placements tracked | Properties | Gaps |
| --- | --- | --- | --- | --- |
| Booking.com | `ti_outbound_clicks` from `apps/ti-web/app/go/hotels/route.ts` | book-travel page, tournament detail, venue contexts, generic weekend planner | destination type, partner, source path, venue/tournament context in redirect query handling | no custom named event for checkout handoff; client-side `venue_hotels_cta_clicked` is not persisted |
| VRBO | `ti_outbound_clicks` from `apps/ti-web/app/go/vrbo/route.ts` | book-travel page and generic travel surfaces | destination type, partner, source path, venue/tournament context | no venue-level VRBO event outside book-travel surface |
| Fanatics | `partner_click_clicked` from `apps/ti-web/app/go/partner/[partnerLinkId]/route.ts` | whatever placements populate partner links | partner key/name/link id, campaign, placement, source component, page type, tournament_id, venue_id, user_tier, outbound_url | admin tile currently assumes all partner clicks are Fanatics |
| Hotels / rentals pre-click | `book_travel_hotels_clicked`, `book_travel_vrbo_clicked` | `WeekendPlannerClient` panels | `travel_type`, `cta_location`, date/destination context | strong for book-travel page, not unified with server outbound rows |

## Premium / Paywall Tracking Coverage

| Action | Event name | Properties | Gaps |
| --- | --- | --- | --- |
| modal viewed | `premium_modal_viewed` | `source`, `source_context`, `tournament_slug`, `venue_slug`, `entry_point`, `cta_label`, `user_tier`, `has_affiliate_visible` | untyped; only per-open dedupe |
| upgrade CTA clicked (annual) | `premium_cta_clicked` | same base payload as above | no dedicated event name for annual plan |
| upgrade CTA clicked (30-day pass) | `premium_cta_clicked` | same + `offer: weekend_pass_30d` in `UpgradeWeekendPassButton` | only inferable from payload |
| tier gate shown | `tier_gate_hit` | `feature`, `user_tier`, optional tournament/venue context | narrow feature enum |
| Owl’s Eye unlock prompt | `owls_eye_unlock_prompt_shown` | typed venue/tournament context | good |
| continue with limited results | `owls_eye_limited_continue` | typed venue/tournament context | fired but not persisted |
| checkout start | none found | n/a | missing |
| purchase complete | none found | n/a | missing |
| checkout cancelled | none found | n/a | missing |

## Property Consistency Issues

1. **Typed vs actual payload mismatch**
   - `book_travel_viewed`, `book_travel_search_by_city_clicked`, `book_travel_add_event_clicked`, `book_travel_tournament_directory_clicked`, and `book_travel_weekend_pro_upsell_clicked` are typed as empty objects in `apps/ti-web/lib/tiAnalyticsEvents.ts`, but `book_travel_viewed` currently sends real properties.

2. **Premium events are untyped**
   - `premium_modal_viewed` and `premium_cta_clicked` are emitted directly with `sendTiAnalytics` and do not appear in `TiAnalyticsEventName`.

3. **Legacy naming remains in saved-tournament flow**
   - Title Case event names (`Tournament Save Clicked`, `Tournament Saved`) coexist with snake_case TI events.
   - properties use camelCase (`tournamentId`, `returnTo`) and are normalized later in `/api/analytics`.

4. **Source metadata is inconsistent**
   - multiple patterns exist: `source`, `source_page`, `source_context`, `entry_point`, `page_type`, `placement`, `cta`, `cta_label`, `target`
   - this complicates unified funnel reporting

5. **Venue identity keys are inconsistent**
   - some events use `venue_id`
   - some use `venue_slug`
   - share flow uses `venue`

6. **Partner event naming is awkward**
   - `partner_click_clicked` duplicates the notion of click in both noun and verb
   - not a reason to rename now, but it is a standardization issue

7. **Device/auth/pricing normalization is weak**
   - no consistent `device_type`
   - no consistent `is_logged_in`
   - no normalized `pricing_option` field across premium flows

## Data Quality Risks

1. **Allowlist drift: fired but not persisted**
   - `tournament_map_loaded_from_venue`
   - `venue_select`
   - `directions_click`
   - `hotels_click`
   - `venue_view_click`
   - `venue_directory_plan_map_click`
   - `venue_directory_view_venue_click`
   - `nearest_airport_click`
   - `owls_eye_limited_continue`
   - all `owls_eye_preview_*`
   - `venue_hotels_cta_clicked`
   - `Venue Quick Check Login Clicked`

2. **Dashboard drift**
   - `apps/referee/app/admin/ti/clicks/page.tsx` is a hardcoded inventory
   - events can persist correctly but remain invisible in admin unless added manually

3. **Render-time counting**
   - `tournament_directory_page_viewed`
   - `tournament_detail_page_viewed`
   - `venue_page_viewed`
   - `book_travel_viewed`
   - `weekend_page_opened`
   - `premium_modal_viewed`
   - these are expected, but they are mount/open driven rather than user-click driven

4. **Partial dedupe only**
   - `VenuePageViewTracker` uses sessionStorage dedupe
   - `TournamentDirectoryAnalyticsClient` uses a component ref only
   - `WeekendProUpgradeModal` dedupes per open cycle, not per session

5. **Navigation-loss risk on unpersisted outbound-ish client events**
   - `sendBeacon` helps, but `venue_hotels_cta_clicked` relies solely on client-side analytics before external navigation
   - server redirect logging is more reliable and should remain the trust source

6. **No checkout / purchase closure**
   - CTA clicks exist
   - Stripe webhook success is not converted into analytics rows
   - there is no way to connect checkout start to completed purchase inside the current analytics model

7. **Fanatics tile will overcount once more partners exist**
   - current admin assumption: all `partner_click_clicked` rows ≈ Fanatics

8. **Stale typed events**
   - `book_travel_weekend_pro_upsell_clicked` exists in types and dashboard, but current premium upsell buttons emit `premium_cta_clicked` instead

## Recommended Next Analytics Changes

### 1. Must fix now
1. Close the **allowlist gap** for already-fired, already-typed high-value events:
   - `venue_select`
   - `directions_click`
   - `hotels_click`
   - `venue_view_click`
   - `tournament_map_loaded_from_venue`
   - `owls_eye_limited_continue`
   - selected `owls_eye_preview_*` events if they matter product-wise
2. Add typed support for `premium_modal_viewed` and `premium_cta_clicked` so premium instrumentation stops bypassing the typed layer.
3. Fix `book_travel_*` typings so emitted payloads and type definitions agree.

### 2. Should add next
1. Add explicit premium funnel events for:
   - checkout started
   - checkout completed
   - checkout cancelled
2. Normalize premium payloads with a single `pricing_option` field, e.g. `annual_weekend_pro` vs `weekend_pass_30d`.
3. Add admin dashboard support for persisted but currently hidden events like `tournament_detail_more_in_state_clicked` and saved-tournament events if they are useful.

### 3. Nice to have
1. Unify source metadata naming across surfaces.
2. Add normalized `device_type` and `is_logged_in` where it materially improves funnel analysis.
3. Split partner clicks by `partner_key` in the admin dashboard instead of treating all partner clicks as Fanatics.

### 4. Do not add / avoid duplication
1. Do not add client-side `/api/analytics` calls for `partner_click_clicked`; server redirect already owns it.
2. Do not create new event names when existing events plus normalized properties can solve the analysis problem.
3. Do not add raw IDs/URLs beyond the current privacy-safe pattern without a strong reason.

## Safe Stage 3 Implementation Plan

### Stage 3A — inventory alignment
- typed-event cleanup only
- no product behavior change
- bring `premium_modal_viewed`, `premium_cta_clicked`, and live `book_travel_*` payloads into `tiAnalyticsEvents.ts`

### Stage 3B — persistence alignment
- extend `/api/analytics` allowlists for already-fired high-value TI events
- keep using `public.ti_map_events`
- no schema change required

### Stage 3C — monetization closure
- add explicit analytics rows for:
  - checkout start
  - checkout success
  - checkout cancel / abandon if available
- write from server-side Stripe paths when possible to avoid client-loss

### Stage 3D — dashboard alignment
- update `apps/referee/app/admin/ti/clicks/page.tsx`
- replace hardcoded partner assumptions with `partner_key` breakdown
- optionally add a small premium-funnel view

## Files inspected
- `apps/ti-web/app/layout.tsx`
- `apps/ti-web/components/PlausibleScript.tsx`
- `apps/ti-web/lib/analytics.ts`
- `apps/ti-web/lib/tiAnalyticsClient.ts`
- `apps/ti-web/lib/tiAnalyticsEvents.ts`
- `apps/ti-web/app/api/analytics/route.ts`
- `apps/ti-web/app/tournaments/TournamentDirectoryAnalyticsClient.tsx`
- `apps/ti-web/app/tournaments/PlanWeekendCtaClient.tsx`
- `apps/ti-web/app/tournaments/[slug]/TournamentDetailViewTrackerClient.tsx`
- `apps/ti-web/app/tournaments/[slug]/TournamentPlanningCtasClient.tsx`
- `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapClient.tsx`
- `apps/ti-web/app/tournaments/[slug]/map/TournamentVenueMapShellClient.tsx`
- `apps/ti-web/components/analytics/VenuePageViewTracker.tsx`
- `apps/ti-web/components/ShareWeekendButton.tsx`
- `apps/ti-web/app/weekend/[slug]/WeekendShareOpenTracker.tsx`
- `apps/ti-web/app/weekend/[slug]/WeekendPlanningCtasClient.tsx`
- `apps/ti-web/app/weekend/[slug]/DirectionsChooserClient.tsx`
- `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- `apps/ti-web/app/weekend-planner/SavedTournamentActionsClient.tsx`
- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/_components/planner/PlannerCalendar.tsx`
- `apps/ti-web/components/SaveTournamentButton.tsx`
- `apps/ti-web/components/UpgradeWeekendProButton.tsx`
- `apps/ti-web/components/UpgradeWeekendPassButton.tsx`
- `apps/ti-web/components/premium/WeekendProUpgradeModal.tsx`
- `apps/ti-web/app/premium/PremiumAutoCheckout.tsx`
- `apps/ti-web/components/venues/QuickVenueCheck.tsx`
- `apps/ti-web/components/venues/HotelBookingCta.tsx`
- `apps/ti-web/components/venues/VenueCardCtasClient.tsx`
- `apps/ti-web/app/go/hotels/route.ts`
- `apps/ti-web/app/go/vrbo/route.ts`
- `apps/ti-web/app/go/partner/[partnerLinkId]/route.ts`
- `apps/referee/app/admin/ti/clicks/page.tsx`
- `apps/referee/app/admin/ti/clicks/ClicksTableClient.tsx`
- `supabase/migrations/20260409_ti_map_analytics_events.sql`
- `supabase/migrations/20260316_quick_check_analytics.sql`
- `supabase/migrations/20260525_admin_analytics_rpcs.sql`
