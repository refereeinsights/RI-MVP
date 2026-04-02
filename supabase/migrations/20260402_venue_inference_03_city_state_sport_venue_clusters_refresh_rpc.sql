-- Refresh helper for `public.city_state_sport_venue_clusters` (v1)
--
-- Note on CONCURRENT refresh:
-- `REFRESH MATERIALIZED VIEW CONCURRENTLY` cannot run inside a transaction block.
-- Supabase RPC/function calls typically run inside a transaction, so the default here is
-- non-concurrent refresh. If you need concurrent refresh, run the SQL statement directly
-- from a SQL client outside an explicit transaction.

create or replace function public.refresh_city_state_sport_venue_clusters(p_concurrently boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.city_state_sport_venue_clusters') is null then
    raise exception 'city_state_sport_venue_clusters does not exist';
  end if;

  if coalesce(p_concurrently, false) then
    begin
      execute 'refresh materialized view concurrently public.city_state_sport_venue_clusters';
    exception
      when others then
        raise exception
          'Concurrent refresh failed (likely due to transaction context): %. Run `REFRESH MATERIALIZED VIEW CONCURRENTLY public.city_state_sport_venue_clusters` outside a transaction.',
          sqlerrm;
    end;
  else
    execute 'refresh materialized view public.city_state_sport_venue_clusters';
  end if;
end $$;

revoke all on function public.refresh_city_state_sport_venue_clusters(boolean) from public;
grant execute on function public.refresh_city_state_sport_venue_clusters(boolean) to service_role;

