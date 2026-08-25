-- Read-only Corralio Slice 4.3 usage/cost report.
-- The event window uses a UTC Friday-through-Sunday reporting proxy; the UI's
-- exact displayed weekend remains browser-local by design.

with household_origin as (
  select
    count(*) as households,
    count(*) filter (
      where origin_geocoded_at is not null
        and origin_lat is not null
        and origin_lng is not null
    ) as origin_geocoded,
    count(*) filter (where origin_geocode_failed_at is not null) as origin_failed,
    count(*) filter (
      where origin_address is not null
        and origin_geocoded_at is null
        and origin_geocode_failed_at is null
    ) as origin_pending_or_retryable,
    count(*) filter (where origin_address is null) as origin_never_set
  from public.corralio_households
)
select * from household_origin;

with utc_today as (
  select (timezone('utc', now()))::date as today
), weekend_start as (
  select case extract(isodow from today)::integer
    when 5 then today
    when 6 then today - 1
    when 7 then today - 2
    else today + (5 - extract(isodow from today)::integer)
  end as starts_on
  from utc_today
), current_window_events as (
  select
    event.*,
    household.origin_geocoded_at as household_origin_geocoded_at,
    household.origin_geocode_failed_at as household_origin_geocode_failed_at
  from public.corralio_events event
  join public.corralio_households household on household.id = event.household_id
  cross join weekend_start window
  where event.starts_at >= window.starts_on::timestamptz
    and event.starts_at < (window.starts_on + 3)::timestamptz
    and (
      event.schedule_source_id is null
      or exists (
        select 1
        from public.corralio_schedule_sources source
        where source.id = event.schedule_source_id
          and source.household_id = event.household_id
          and source.sync_status <> 'disconnected'
      )
    )
), categorized as (
  select case
    when coalesce(nullif(btrim(source_location_text), ''), nullif(btrim(display_location_text), '')) is null
      then 'no_location_text'
    when household_origin_geocode_failed_at is not null
      then 'origin_geocode_failed'
    when household_origin_geocoded_at is null
      then 'origin_not_set_or_pending'
    when location_geocode_failed_at is not null
      then 'event_geocode_failed'
    when route_failed_at is not null
      then 'route_definitively_failed'
    when estimated_drive_minutes is not null
      and leave_by_computed_at >= household_origin_geocoded_at
      and leave_by_computed_at >= location_geocoded_at
      then 'leave_by_ready'
    else 'pending_or_retryable'
  end as outcome
  from current_window_events
)
select
  outcome,
  count(*) as events,
  round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 2) as event_percent
from categorized
group by outcome
order by outcome;

select
  api,
  operation,
  status,
  retryable,
  billable,
  error_code,
  count(*) as rows,
  count(*) filter (where billable) as vendor_quota_units,
  round(avg(latency_ms) filter (where latency_ms is not null), 1) as average_latency_ms
from public.corralio_external_api_calls
where called_at >= now() - interval '7 days'
group by api, operation, status, retryable, billable, error_code
order by api, operation, status, error_code;

select
  household_id,
  count(*) filter (where billable) as vendor_quota_units_last_7_days,
  count(*) filter (where error_code = 'household_result_reused') as household_reuses,
  count(*) filter (where error_code = 'batch_duplicate_skipped') as batch_duplicates,
  count(*) filter (where error_code = 'concurrent_claim_skipped') as concurrent_claim_skips,
  count(*) filter (where error_code = 'daily_cap_reached') as daily_cap_blocks
from public.corralio_external_api_calls
where called_at >= now() - interval '7 days'
  and household_id is not null
group by household_id
order by vendor_quota_units_last_7_days desc, household_id
limit 25;

select
  household_id,
  quota_date,
  reserved_count,
  50 - reserved_count as remaining_against_slice43_default
from public.corralio_external_call_daily_quota
where quota_date >= (timezone('utc', now()))::date - 7
order by reserved_count desc, quota_date desc, household_id
limit 25;
