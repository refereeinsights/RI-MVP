-- Admin dashboard: public directory tournament counts by state (v1)
-- Used for the admin email US heatmap image.

create or replace function public.get_public_directory_tournament_counts_by_state(p_now timestamptz default now())
returns table(state text, count integer)
language plpgsql
security definer
as $$
declare
  v_today_date_utc date;
begin
  v_today_date_utc := (p_now at time zone 'utc')::date;

  return query
  select
    upper(trim(t.state)) as state,
    count(*)::int as count
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and t.state is not null
    and length(trim(t.state)) = 2
    and (
      coalesce(t.is_demo, false) = true
      or t.start_date >= v_today_date_utc
      or t.end_date >= v_today_date_utc
    )
  group by 1
  order by 2 desc, 1 asc;
end;
$$;

revoke all on function public.get_public_directory_tournament_counts_by_state(timestamptz) from public;
grant execute on function public.get_public_directory_tournament_counts_by_state(timestamptz) to service_role;

