-- TI admin email: aggregate first-game activation metrics in Postgres.
-- Avoids PostgREST's row response cap and keeps the first_game_inline_v1 cohort isolated.

create index if not exists ti_map_events_first_game_activation_reporting_idx
  on public.ti_map_events (
    event_name,
    created_at,
    ((properties ->> 'planner_session_id'))
  )
  where (properties ->> 'activation_flow') = 'first_game_inline_v1';

create or replace function public.get_ti_first_game_activation_metrics_v1(
  p_yesterday_start timestamptz,
  p_today_start timestamptz,
  p_trailing_7d_start timestamptz
)
returns table (
  window_key text,
  event_name text,
  unique_sessions bigint,
  missing_session_events bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with reporting_windows as (
    select 'yesterday'::text as window_key, p_yesterday_start as starts_at, p_today_start as ends_at
    union all
    select 'trailing_7d'::text, p_trailing_7d_start, p_today_start
  ),
  filtered_events as (
    select
      created_at,
      event_name,
      nullif(btrim(properties ->> 'planner_session_id'), '') as planner_session_id
    from public.ti_map_events
    where created_at >= p_trailing_7d_start
      and created_at < p_today_start
      and (properties ->> 'activation_flow') = 'first_game_inline_v1'
      and event_name in (
        'weekend_planner_first_action_available',
        'weekend_planner_first_action_cta_viewed',
        'weekend_planner_manual_event_form_started',
        'weekend_planner_manual_event_submitted',
        'weekend_planner_temporary_event_persisted',
        'weekend_planner_manual_event_failed',
        'weekend_planner_save_prompt_viewed',
        'weekend_planner_auth_started',
        'weekend_planner_auth_completed'
      )
      and (
        event_name <> 'weekend_planner_temporary_event_persisted'
        or (properties ->> 'event_type') = 'game'
      )
  )
  select
    reporting_windows.window_key,
    filtered_events.event_name,
    count(distinct filtered_events.planner_session_id)
      filter (where filtered_events.planner_session_id is not null) as unique_sessions,
    count(*)
      filter (where filtered_events.planner_session_id is null) as missing_session_events
  from reporting_windows
  join filtered_events
    on filtered_events.created_at >= reporting_windows.starts_at
   and filtered_events.created_at < reporting_windows.ends_at
  group by reporting_windows.window_key, filtered_events.event_name
  order by reporting_windows.window_key, filtered_events.event_name;
$function$;

revoke all on function public.get_ti_first_game_activation_metrics_v1(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_ti_first_game_activation_metrics_v1(timestamptz, timestamptz, timestamptz)
  to service_role;
