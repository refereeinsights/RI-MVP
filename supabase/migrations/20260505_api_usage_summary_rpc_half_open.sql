-- Update RPCs to use half-open windows: [from_ts, to_ts)
-- This avoids off-by-one issues at day boundaries and matches admin UI date-range helpers.

create or replace function public.api_usage_summary(from_ts timestamptz, to_ts timestamptz)
returns table(
  api            text,
  operation      text,
  surface        text,
  calls          bigint,
  errors         bigint,
  avg_latency_ms numeric
)
language sql stable security definer
set search_path = public
as $$
  select
    api,
    operation,
    surface,
    count(*)                                         as calls,
    count(*) filter (where status = 'error')         as errors,
    round(avg(latency_ms))                           as avg_latency_ms
  from public.external_api_calls
  where called_at >= from_ts and called_at < to_ts
  group by api, operation, surface
  order by calls desc;
$$;

create or replace function public.ti_map_event_summary(from_ts timestamptz, to_ts timestamptz, event_names text[])
returns table(
  event_name text,
  calls      bigint
)
language sql stable security definer
set search_path = public
as $$
  select
    event_name,
    count(*) as calls
  from public.ti_map_events
  where created_at >= from_ts and created_at < to_ts
    and event_name = any(event_names)
  group by event_name
  order by calls desc;
$$;

