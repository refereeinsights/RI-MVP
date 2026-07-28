-- TournamentInsights Weekend Planner activation funnel
-- Usage:
--   Replace the params CTE values before running.
-- Notes:
-- - For exact production verification, set `planner_session_filter`.
-- - This script filters by `planner_session_id` in SQL.
-- - Do not fetch a broad limited set and filter client-side; that can produce false negatives.

with params as (
  select
    timestamptz '2026-07-23T00:00:00Z' as start_ts,
    timestamptz '2026-07-24T00:00:00Z' as end_ts,
    null::uuid as planner_session_filter
),
planner_events as (
  select
    created_at,
    event_name,
    properties,
    nullif(properties->>'planner_session_id', '')::uuid as planner_session_id,
    properties->>'entry_source' as entry_source,
    properties->>'entry_page_type' as entry_page_type,
    properties->>'entry_path' as entry_path,
    properties->>'entry_placement' as entry_placement,
    properties->>'current_page_type' as current_page_type,
    properties->>'current_page_path' as current_page_path,
    properties->>'tournament_id' as tournament_id,
    properties->>'venue_id' as venue_id,
    properties->>'first_action_type' as first_action_type
  from ti_map_events
  where created_at >= (select start_ts from params)
    and created_at < (select end_ts from params)
    and (
      (select planner_session_filter from params) is null
      or nullif(properties->>'planner_session_id', '')::uuid = (select planner_session_filter from params)
    )
    and event_name in (
      'weekend_planner_contextual_cta_clicked',
      'weekend_planner_entry_viewed',
      'weekend_planner_auth_gate_viewed',
      'weekend_planner_auth_started',
      'weekend_planner_auth_completed',
      'weekend_planner_loaded',
      'weekend_planner_first_action'
    )
),
filtered_events as (
  select *
  from planner_events
),
funnel as (
  select
    planner_session_id,
    min(created_at) filter (where event_name = 'weekend_planner_contextual_cta_clicked') as click_ts,
    min(created_at) filter (where event_name = 'weekend_planner_entry_viewed') as entry_ts,
    min(created_at) filter (where event_name = 'weekend_planner_auth_gate_viewed') as auth_gate_ts,
    min(created_at) filter (where event_name = 'weekend_planner_auth_started') as auth_started_ts,
    min(created_at) filter (where event_name = 'weekend_planner_auth_completed') as auth_completed_ts,
    min(created_at) filter (where event_name = 'weekend_planner_loaded') as loaded_ts,
    min(created_at) filter (where event_name = 'weekend_planner_first_action') as first_action_ts,
    min(entry_source) as entry_source,
    min(entry_page_type) as entry_page_type,
    min(entry_path) as entry_path,
    min(entry_placement) as entry_placement,
    min(tournament_id) as tournament_id,
    min(venue_id) as venue_id
  from filtered_events
  where planner_session_id is not null
  group by planner_session_id
),
metrics as (
  select
    count(*) filter (where click_ts is not null) as planner_clicks,
    count(*) filter (where entry_ts is not null) as planner_entries,
    count(*) filter (where auth_gate_ts is not null) as auth_gate_views,
    count(*) filter (where auth_started_ts is not null) as auth_starts,
    count(*) filter (where auth_completed_ts is not null) as auth_completions,
    count(*) filter (where loaded_ts is not null) as planner_loads,
    count(*) filter (where first_action_ts is not null) as first_actions
  from funnel
)
select
  planner_clicks,
  planner_entries,
  auth_gate_views,
  auth_starts,
  auth_completions,
  planner_loads,
  first_actions,
  case when planner_clicks = 0 then null else round(planner_entries::numeric / planner_clicks, 4) end as click_to_entry_rate,
  case when planner_entries = 0 then null else round(auth_starts::numeric / planner_entries, 4) end as entry_to_auth_start_rate,
  case when auth_starts = 0 then null else round(auth_completions::numeric / auth_starts, 4) end as auth_start_to_completion_rate,
  case when auth_completions = 0 then null else round(planner_loads::numeric / auth_completions, 4) end as auth_completion_to_load_rate,
  case when planner_loads = 0 then null else round(first_actions::numeric / planner_loads, 4) end as load_to_first_action_rate,
  case when planner_entries = 0 then null else round(first_actions::numeric / planner_entries, 4) end as entry_to_first_action_rate
from metrics;

-- Exact-ID verification helper
select
  created_at,
  event_name,
  planner_session_id,
  entry_source,
  entry_page_type,
  entry_path,
  entry_placement,
  current_page_type,
  current_page_path,
  tournament_id,
  venue_id,
  first_action_type
from filtered_events
where planner_session_id is not null
order by created_at, event_name;

-- Full chain by planner session
select *
from filtered_events
where planner_session_id is not null
order by planner_session_id, created_at, event_name;

-- Duplicate diagnostics
select
  planner_session_id,
  event_name,
  count(*) as row_count
from filtered_events
where planner_session_id is not null
group by planner_session_id, event_name
having count(*) > 1
order by row_count desc, planner_session_id, event_name;

-- Missing context diagnostics
select
  event_name,
  count(*) as row_count,
  count(*) filter (where planner_session_id is null) as missing_planner_session_id,
  count(*) filter (where coalesce(entry_source, '') = '') as missing_entry_source,
  count(*) filter (where coalesce(entry_page_type, '') = '') as missing_entry_page_type,
  count(*) filter (where coalesce(entry_path, '') = '') as missing_entry_path
from filtered_events
group by event_name
order by event_name;

-- Source-preservation diagnostics for planner-origin lodging/group rows
select
  endpoint,
  count(*) as rows,
  count(*) filter (where planner_session_id is null) as missing_planner_session_id,
  count(*) filter (where coalesce(entry_source, '') = '') as missing_entry_source,
  count(*) filter (where coalesce(entry_page_type, '') = '') as missing_entry_page_type,
  count(*) filter (where coalesce(current_page_type, '') = '') as missing_current_page_type
from lodging_search_session
where created_at >= (select start_ts from params)
  and created_at < (select end_ts from params)
  and endpoint in ('/api/lodging/search', '/api/lodging/group-request')
group by endpoint
order by endpoint;
