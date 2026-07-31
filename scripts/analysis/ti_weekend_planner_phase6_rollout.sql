-- TournamentInsights Weekend Planner Phase 6 rollout funnel
--
-- Notes:
-- - Uses the implemented planner analytics field names:
--   `experiment_name`, `experiment_variant`, `feature_flag_state`,
--   `planner_session_id`, `auth_state`, `entitlement`.
-- - Device is derived from `ua` unless a dedicated `device_type` property exists.
-- - `plan_saved_sessions` currently uses anonymous claim success as the authoritative
--   save proxy for the anonymous-first treatment flow.
-- - `seven_day_return_sessions` is currently not measurable from the implemented
--   planner analytics contract because planner events do not persist a stable cross-session user key.
--
-- Replace the date window as needed.

with params as (
  select
    timestamptz '2026-07-01T00:00:00Z' as start_at,
    timestamptz '2026-08-01T00:00:00Z' as end_at
),
planner_events as (
  select
    event_name,
    created_at,
    properties,
    nullif(properties->>'planner_session_id', '') as planner_session_id,
    nullif(properties->>'experiment_name', '') as experiment_name,
    nullif(properties->>'experiment_variant', '') as experiment_variant,
    nullif(properties->>'feature_flag_state', '') as feature_flag_state,
    nullif(properties->>'auth_state', '') as auth_state,
    nullif(properties->>'entitlement', '') as entitlement,
    nullif(properties->>'entry_source', '') as entry_source,
    nullif(properties->>'tournament_id', '') as tournament_id,
    nullif(properties->>'venue_id', '') as venue_id,
    nullif(properties->>'source_page_type', '') as source_page_type,
    coalesce(
      nullif(properties->>'device_type', ''),
      case
        when coalesce(properties->>'ua', '') ilike '%mobile%' then 'mobile'
        else 'desktop'
      end
    ) as device_type
  from ti_map_events
  where created_at >= (select start_at from params)
    and created_at < (select end_at from params)
    and event_name in (
      'weekend_planner_contextual_cta_clicked',
      'weekend_planner_ready',
      'weekend_planner_activation_achieved',
      'weekend_planner_save_prompt_viewed',
      'weekend_planner_auth_started',
      'weekend_planner_auth_completed',
      'weekend_planner_anonymous_claim_started',
      'weekend_planner_anonymous_claim_succeeded',
      'weekend_planner_anonymous_claim_failed',
      'weekend_planner_first_authenticated_action_after_claim',
      'planner_manual_event_created'
    )
),
lodging_searches as (
  select
    created_at,
    planner_session_id::text as planner_session_id,
    id::text as lodging_search_id
  from lodging_search_session
  where created_at >= (select start_at from params)
    and created_at < (select end_at from params)
    and planner_session_id is not null
),
hotel_outbounds as (
  select
    created_at,
    planner_session_id::text as planner_session_id,
    id::text as outbound_id
  from ti_outbound_clicks
  where created_at >= (select start_at from params)
    and created_at < (select end_at from params)
    and planner_session_id is not null
    and coalesce(outbound_partner, 'hotelplanner') = 'hotelplanner'
),
by_session as (
  select
    planner_session_id,
    date_trunc('day', min(created_at))::date as day,
    max(experiment_name) filter (where experiment_name is not null) as experiment_name,
    max(experiment_variant) filter (where experiment_variant is not null) as experiment_variant,
    max(feature_flag_state) filter (where feature_flag_state is not null) as feature_flag_state,
    max(auth_state) filter (where auth_state is not null) as auth_state,
    max(entitlement) filter (where entitlement is not null) as entitlement,
    max(entry_source) filter (where entry_source is not null) as traffic_source,
    max(device_type) filter (where device_type is not null) as device_type,
    max(tournament_id) filter (where tournament_id is not null) as tournament_id,
    max(venue_id) filter (where venue_id is not null) as venue_id,
    max(source_page_type) filter (where source_page_type is not null) as source_page_type,
    count(*) filter (where event_name = 'planner_manual_event_created') as manual_event_created_count,
    bool_or(event_name = 'weekend_planner_contextual_cta_clicked') as cta_clicked,
    bool_or(event_name = 'weekend_planner_ready') as planner_ready,
    bool_or(event_name = 'weekend_planner_activation_achieved') as first_meaningful_action,
    bool_or(event_name = 'weekend_planner_save_prompt_viewed') as save_prompt_viewed,
    bool_or(event_name = 'weekend_planner_auth_started') as auth_started,
    bool_or(event_name = 'weekend_planner_auth_completed') as auth_completed,
    bool_or(event_name = 'weekend_planner_anonymous_claim_started') as claim_started,
    bool_or(event_name = 'weekend_planner_anonymous_claim_succeeded') as claim_completed,
    bool_or(event_name = 'weekend_planner_anonymous_claim_failed') as claim_failed,
    bool_or(event_name = 'weekend_planner_first_authenticated_action_after_claim') as first_authenticated_action_after_claim
  from planner_events
  where planner_session_id is not null
  group by planner_session_id
),
search_rollup as (
  select
    planner_session_id,
    count(*) as hotel_search_count
  from lodging_searches
  group by planner_session_id
),
outbound_rollup as (
  select
    planner_session_id,
    count(*) as hotel_outbound_count
  from hotel_outbounds
  group by planner_session_id
),
session_funnel as (
  select
    s.day,
    s.planner_session_id,
    s.experiment_name,
    s.experiment_variant,
    s.feature_flag_state,
    s.auth_state,
    s.entitlement,
    s.traffic_source,
    s.device_type,
    s.tournament_id,
    s.venue_id,
    s.source_page_type,
    s.cta_clicked,
    s.planner_ready,
    s.first_meaningful_action,
    s.save_prompt_viewed,
    s.auth_started,
    s.auth_completed,
    s.claim_started,
    s.claim_completed,
    s.claim_failed,
    (s.claim_completed) as plan_saved,
    (
      s.manual_event_created_count >= 2
      or s.first_authenticated_action_after_claim
    ) as second_meaningful_action,
    coalesce(sr.hotel_search_count, 0) > 0 as hotel_search_started,
    coalesce(orx.hotel_outbound_count, 0) > 0 as hotel_affiliate_outbound,
    null::boolean as seven_day_return
  from by_session s
  left join search_rollup sr on sr.planner_session_id = s.planner_session_id
  left join outbound_rollup orx on orx.planner_session_id = s.planner_session_id
)
select
  day,
  coalesce(experiment_name, 'unknown') as experiment_name,
  coalesce(experiment_variant, 'unknown') as experiment_variant,
  coalesce(feature_flag_state, 'unknown') as feature_flag_state,
  coalesce(auth_state, 'unknown') as auth_state,
  coalesce(entitlement, 'unknown') as entitlement,
  coalesce(device_type, 'unknown') as device_type,
  coalesce(traffic_source, 'unknown') as traffic_source,
  coalesce(tournament_id, 'unknown') as tournament_id,
  coalesce(venue_id, 'unknown') as venue_id,
  count(*) filter (where cta_clicked) as cta_clicks,
  count(*) filter (where planner_ready) as planner_ready_sessions,
  count(*) filter (where first_meaningful_action) as first_meaningful_action_sessions,
  count(*) filter (where save_prompt_viewed) as save_prompt_viewed_sessions,
  count(*) filter (where auth_started) as auth_started_sessions,
  count(*) filter (where auth_completed) as auth_completed_sessions,
  count(*) filter (where claim_started) as claim_started_sessions,
  count(*) filter (where claim_completed) as claim_completed_sessions,
  count(*) filter (where claim_failed) as claim_failed_sessions,
  count(*) filter (where plan_saved) as plan_saved_sessions,
  count(*) filter (where second_meaningful_action) as second_meaningful_action_sessions,
  count(*) filter (where hotel_search_started) as hotel_search_started_sessions,
  count(*) filter (where hotel_affiliate_outbound) as hotel_affiliate_outbound_sessions,
  cast(null as bigint) as seven_day_return_sessions,
  round(100.0 * count(*) filter (where planner_ready) / nullif(count(*) filter (where cta_clicked), 0), 2) as cta_to_ready_rate_pct,
  round(100.0 * count(*) filter (where first_meaningful_action) / nullif(count(*) filter (where planner_ready), 0), 2) as ready_to_first_action_rate_pct,
  round(100.0 * count(*) filter (where save_prompt_viewed) / nullif(count(*) filter (where first_meaningful_action), 0), 2) as first_action_to_save_prompt_rate_pct,
  round(100.0 * count(*) filter (where auth_started) / nullif(count(*) filter (where save_prompt_viewed), 0), 2) as save_prompt_to_auth_started_rate_pct,
  round(100.0 * count(*) filter (where auth_completed) / nullif(count(*) filter (where auth_started), 0), 2) as auth_started_to_completed_rate_pct,
  round(100.0 * count(*) filter (where claim_completed) / nullif(count(*) filter (where claim_started), 0), 2) as claim_started_to_completed_rate_pct,
  round(100.0 * count(*) filter (where plan_saved) / nullif(count(*) filter (where first_meaningful_action), 0), 2) as first_action_to_plan_saved_rate_pct,
  round(100.0 * count(*) filter (where hotel_search_started) / nullif(count(*) filter (where planner_ready), 0), 2) as ready_to_hotel_search_rate_pct,
  round(100.0 * count(*) filter (where hotel_affiliate_outbound) / nullif(count(*) filter (where planner_ready), 0), 2) as ready_to_hotel_outbound_rate_pct,
  round(100.0 * count(*) filter (where second_meaningful_action) / nullif(count(*) filter (where first_meaningful_action), 0), 2) as first_to_second_action_rate_pct
from session_funnel
group by 1,2,3,4,5,6,7,8,9,10
order by day desc, experiment_variant, traffic_source, tournament_id, venue_id;
