-- RPC: api_usage_summary
-- Aggregates external_api_calls server-side to avoid the PostgREST max_rows=1000 cap
-- that silently truncates raw-row fetches on the free/starter plan.
-- Returns one row per (api, operation, surface) bucket — never hits the row cap.

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
  where called_at between from_ts and to_ts
  group by api, operation, surface
  order by calls desc;
$$;

-- RPC: ti_map_event_summary
-- Same pattern for ti_map_events to avoid the same row cap on that table.

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
  where created_at between from_ts and to_ts
    and event_name = any(event_names)
  group by event_name
  order by calls desc;
$$;

-- Service role only — these functions read internal tracking tables.
revoke execute on function public.api_usage_summary(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.api_usage_summary(timestamptz, timestamptz) to service_role;

revoke execute on function public.ti_map_event_summary(timestamptz, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.ti_map_event_summary(timestamptz, timestamptz, text[]) to service_role;
