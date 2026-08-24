-- Corralio Slice 4.2A manual, read-only founder-gate report.
-- Activation is derived from current source state. It is not a historical
-- cohort: a household that disconnected a source no longer appears in today's
-- >=2-source cut, even if it qualified during an earlier week.

with source_state as (
  select
    household.id as household_id,
    count(source.id) filter (where source.sync_status <> 'disconnected') as active_source_count,
    bool_or(
      source.sync_status <> 'disconnected'
      and (source.child_id is not null or source.team_id is not null)
    ) as has_assigned_active_source
  from public.corralio_households household
  left join public.corralio_schedule_sources source
    on source.household_id = household.id
  group by household.id
)
select
  count(*) as total_households,
  count(*) filter (where active_source_count >= 1) as households_with_active_source,
  count(*) filter (where active_source_count >= 2) as activated_households,
  count(*) filter (
    where active_source_count >= 2 and has_assigned_active_source
  ) as activated_households_with_assignment
from source_state;

-- Current-week pulse only. This UTC week is incomplete and must not be used as
-- either side of a retention comparison.
with activated as (
  select source.household_id
  from public.corralio_schedule_sources source
  where source.sync_status <> 'disconnected'
  group by source.household_id
  having count(*) >= 2
), current_week as (
  select date_trunc('week', timezone('utc', now()))::date as week_start
)
select
  current_week.week_start as partial_current_usage_week_start,
  count(engagement.household_id) as partial_current_week_activated_households
from current_week
left join public.corralio_weekly_engagement engagement
  on engagement.usage_week_start = current_week.week_start
 and engagement.household_id in (select household_id from activated)
group by current_week.week_start;

-- Primary retention metric: currently activated households present in both of
-- the two most recently fully completed UTC weeks.
with activated as (
  select source.household_id
  from public.corralio_schedule_sources source
  where source.sync_status <> 'disconnected'
  group by source.household_id
  having count(*) >= 2
), completed_weeks as (
  select
    (date_trunc('week', timezone('utc', now()))::date - 7) as recent_week,
    (date_trunc('week', timezone('utc', now()))::date - 14) as earlier_week
), presence as (
  select
    activated.household_id,
    bool_or(engagement.usage_week_start = completed_weeks.recent_week) as in_recent_week,
    bool_or(engagement.usage_week_start = completed_weeks.earlier_week) as in_earlier_week
  from activated
  cross join completed_weeks
  left join public.corralio_weekly_engagement engagement
    on engagement.household_id = activated.household_id
   and engagement.usage_week_start in (
     completed_weeks.recent_week,
     completed_weeks.earlier_week
   )
  group by activated.household_id
)
select
  completed_weeks.recent_week,
  completed_weeks.earlier_week,
  count(*) filter (where presence.in_recent_week) as activated_in_recent_completed_week,
  count(*) filter (where presence.in_earlier_week) as activated_in_earlier_completed_week,
  count(*) filter (
    where presence.in_recent_week and presence.in_earlier_week
  ) as weekly_returning_activated_households
from presence
cross join completed_weeks
group by completed_weeks.recent_week, completed_weeks.earlier_week;

-- Overlapping conflict-exposure sets for the most recently completed UTC week.
-- "Verified" and "unavailable" are deliberately not treated as a partition.
with activated as (
  select source.household_id
  from public.corralio_schedule_sources source
  where source.sync_status <> 'disconnected'
  group by source.household_id
  having count(*) >= 2
), completed_week as (
  select (date_trunc('week', timezone('utc', now()))::date - 7) as week_start
)
select
  completed_week.week_start,
  count(*) filter (where engagement.had_conflict is not null) as verified_check_households,
  count(*) filter (where engagement.had_conflict is true) as conflict_exposed_households,
  count(*) filter (
    where engagement.conflict_check_unavailable is true
  ) as unavailable_check_households,
  count(*) filter (
    where engagement.had_conflict is not null
      and engagement.conflict_check_unavailable is true
  ) as verified_and_unavailable_households
from completed_week
left join public.corralio_weekly_engagement engagement
  on engagement.usage_week_start = completed_week.week_start
 and engagement.household_id in (select household_id from activated)
group by completed_week.week_start;
