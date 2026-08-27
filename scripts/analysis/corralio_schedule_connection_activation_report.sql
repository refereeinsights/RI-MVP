-- Corralio Slice 3.4 schedule-connection activation report.
-- Read-only. Interaction rows are reported separately from state derived from
-- schedules, events, and weekly engagement. Bearer-secret columns are excluded.

with interaction_counts as (
  select event_name, platform, reason, count(*)::bigint as interaction_count
  from public.corralio_schedule_connection_events
  where occurred_at >= now() - interval '180 days'
  group by event_name, platform, reason
),
active_schedule_counts as (
  select household_id, count(*)::integer as active_schedule_count
  from public.corralio_schedule_sources
  where sync_status <> 'disconnected'
  group by household_id
),
activation as (
  select
    count(*) filter (where active_schedule_count >= 1)::bigint as households_with_schedule,
    count(*) filter (where active_schedule_count >= 2)::bigint as households_with_two_schedules
  from active_schedule_counts
),
activated_weekend as (
  select count(distinct schedules.household_id)::bigint as activated_households_with_weekend_view
  from active_schedule_counts schedules
  join public.corralio_weekly_engagement engagement
    on engagement.household_id = schedules.household_id
  where schedules.active_schedule_count >= 2
)
select
  'interaction'::text as metric_group,
  event_name as metric,
  platform,
  reason,
  interaction_count::numeric as value
from interaction_counts
union all
select 'activation', 'households_with_schedule', null, null, households_with_schedule from activation
union all
select 'activation', 'households_with_two_schedules', null, null, households_with_two_schedules from activation
union all
select 'activation', 'activated_households_with_weekend_view', null, null, activated_households_with_weekend_view from activated_weekend
union all
select
  'activation', 'two_schedule_to_weekend_rate', null, null,
  case when activation.households_with_two_schedules = 0 then null
       else activated_weekend.activated_households_with_weekend_view::numeric
         / activation.households_with_two_schedules end
from activation cross join activated_weekend
order by metric_group, metric, platform nulls first, reason nulls first;
