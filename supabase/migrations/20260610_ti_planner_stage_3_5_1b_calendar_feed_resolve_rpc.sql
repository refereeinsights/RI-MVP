-- TI Weekend Planner (Stage 3.5-1B): resolve iCal feed token hashes through
-- a SQL function so public feed reads hit primary immediately after regenerate/revoke.

create or replace function public.resolve_planner_calendar_feed_by_token_hash(p_token_hash text)
returns setof public.planner_calendar_feeds
language sql
security definer
set search_path = public
as $$
  select *
  from public.planner_calendar_feeds
  where token_hash = lower(trim(coalesce(p_token_hash, '')))
  limit 1
$$;

revoke all on function public.resolve_planner_calendar_feed_by_token_hash(text) from public;
grant execute on function public.resolve_planner_calendar_feed_by_token_hash(text) to authenticated;
grant execute on function public.resolve_planner_calendar_feed_by_token_hash(text) to service_role;
