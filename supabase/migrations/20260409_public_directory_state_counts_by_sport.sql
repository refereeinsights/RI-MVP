-- Public directory: tournament counts by state + optional sport (v1)
-- Used by the public interactive heatmap (`/heatmap`) and admin/email variants.
--
-- Mirrors the public directory "upcoming" definition:
-- - tournaments.status = 'published'
-- - tournaments.is_canonical = true
-- - valid 2-letter `state`
-- - include demos OR tournaments with start_date/end_date >= today (UTC)
-- - optional sport filter (`p_sport`), normalized to lowercase

create or replace function public.get_public_directory_tournament_counts_by_state_sport(
  p_sport text default null,
  p_now timestamptz default now()
)
returns table(state text, count integer)
language plpgsql
security definer
as $$
declare
  v_today_date_utc date;
  v_sport text;
begin
  v_today_date_utc := (p_now at time zone 'utc')::date;
  v_sport := nullif(lower(trim(coalesce(p_sport, ''))), '');

  return query
  select
    upper(trim(t.state)) as state,
    count(*)::int as count
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and t.state is not null
    and length(trim(t.state)) = 2
    and (v_sport is null or lower(trim(coalesce(t.sport, ''))) = v_sport)
    and (
      coalesce(t.is_demo, false) = true
      or t.start_date >= v_today_date_utc
      or t.end_date >= v_today_date_utc
    )
  group by 1
  order by 2 desc, 1 asc;
end;
$$;

revoke all on function public.get_public_directory_tournament_counts_by_state_sport(text, timestamptz) from public;
grant execute on function public.get_public_directory_tournament_counts_by_state_sport(text, timestamptz) to service_role;

