-- TournamentInsights Weekend Planner Phase 6 rollout funnel
-- Replace the date window as needed.

with params as (
  select
    timestamptz '2026-07-01T00:00:00Z' as start_at,
    timestamptz '2026-08-01T00:00:00Z' as end_at
),
events as (
  select
    event_name,
    created_at,
    properties,
    properties->>'planner_session_id' as planner_session_id,
    properties->>'experiment_name' as experiment_name,
    properties->>'experiment_variant' as experiment_variant,
    properties->>'feature_flag_state' as feature_flag_state,
    properties->>'entry_source' as entry_source,
    properties->>'tournament_id' as tournament_id,
    properties->>'venue_id' as venue_id,
    coalesce(properties->>'traffic_source', properties->>'entry_source', 'unknown') as traffic_source,
    coalesce(properties->>'device_type', case when coalesce(properties->>'ua', '') ilike '%mobile%' then 'mobile' else 'desktop' end) as device_type
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
      'weekend_planner_first_authenticated_action_after_claim'
    )
),
by_session as (
  select
    date_trunc('day', min(created_at)) as day,
    planner_session_id,
    max(experiment_name) filter (where experiment_name is not null) as experiment_name,
    max(experiment_variant) filter (where experiment_variant is not null) as experiment_variant,
    max(feature_flag_state) filter (where feature_flag_state is not null) as feature_flag_state,
    max(traffic_source) filter (where traffic_source is not null) as traffic_source,
    max(device_type) filter (where device_type is not null) as device_type,
    max(tournament_id) filter (where tournament_id is not null) as tournament_id,
    max(venue_id) filter (where venue_id is not null) as venue_id,
    bool_or(event_name = 'weekend_planner_contextual_cta_clicked') as cta_clicked,
    bool_or(event_name = 'weekend_planner_ready') as planner_ready,
    bool_or(event_name = 'weekend_planner_activation_achieved') as first_meaningful_action,
    bool_or(event_name = 'weekend_planner_save_prompt_viewed') as save_prompt_viewed,
    bool_or(event_name = 'weekend_planner_auth_started') as auth_started,
    bool_or(event_name = 'weekend_planner_auth_completed') as auth_completed,
    bool_or(event_name = 'weekend_planner_anonymous_claim_started') as claim_started,
    bool_or(event_name = 'weekend_planner_anonymous_claim_succeeded') as claim_completed,
    bool_or(event_name = 'weekend_planner_first_authenticated_action_after_claim') as second_meaningful_action
  from events
  where planner_session_id is not null
  group by planner_session_id
)
select
  day::date as day,
  coalesce(experiment_variant, 'unknown') as experiment_variant,
  coalesce(feature_flag_state, 'unknown') as feature_flag_state,
  coalesce(traffic_source, 'unknown') as traffic_source,
  coalesce(device_type, 'unknown') as device_type,
  count(*) filter (where cta_clicked) as cta_clicks,
  count(*) filter (where planner_ready) as planner_ready,
  count(*) filter (where first_meaningful_action) as first_meaningful_action,
  count(*) filter (where save_prompt_viewed) as save_prompt_viewed,
  count(*) filter (where auth_started) as auth_started,
  count(*) filter (where auth_completed) as auth_completed,
  count(*) filter (where claim_started) as claim_started,
  count(*) filter (where claim_completed) as claim_completed,
  count(*) filter (where second_meaningful_action) as second_meaningful_action,
  round(100.0 * count(*) filter (where planner_ready) / nullif(count(*) filter (where cta_clicked), 0), 2) as cta_to_ready_rate_pct,
  round(100.0 * count(*) filter (where first_meaningful_action) / nullif(count(*) filter (where planner_ready), 0), 2) as ready_to_first_meaningful_action_rate_pct,
  round(100.0 * count(*) filter (where auth_started) / nullif(count(*) filter (where save_prompt_viewed), 0), 2) as save_prompt_to_auth_started_rate_pct,
  round(100.0 * count(*) filter (where auth_completed) / nullif(count(*) filter (where auth_started), 0), 2) as auth_started_to_completed_rate_pct,
  round(100.0 * count(*) filter (where claim_completed) / nullif(count(*) filter (where claim_started), 0), 2) as claim_started_to_completed_rate_pct
from by_session
group by 1,2,3,4,5
order by 1 desc, 2, 4, 5;
