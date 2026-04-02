-- City/State/Sport venue clusters (v1)
-- Materialized view of historical CONFIRMED venue usage keyed by (state, city_norm, sport).
-- This view stores stable signals only; recency/confidence scoring should be computed at query time.
--
-- Training data guardrails:
-- - Only confirmed tournament_venues rows (`is_inferred = false`)
-- - Only published canonical tournaments (status='published' and is_canonical=true)
-- - Requires non-empty city/state/sport

do $$
begin
  if to_regclass('public.tournament_venues') is null then
    return;
  end if;

  if to_regclass('public.city_state_sport_venue_clusters') is null then
    execute $sql$
      create materialized view public.city_state_sport_venue_clusters as
      select
        lower(trim(t.city)) as city_norm,
        upper(trim(t.state)) as state,
        lower(trim(t.sport)) as sport,
        tv.venue_id,
        count(*)::int as usage_count,
        count(distinct t.id)::int as distinct_tournament_count,
        max(coalesce(t.end_date, t.start_date, (t.created_at at time zone 'utc')::date)) as last_used_date
      from public.tournaments t
      join public.tournament_venues tv
        on tv.tournament_id = t.id
       and tv.is_inferred = false
      where t.status = 'published'
        and t.is_canonical = true
        and nullif(trim(t.city), '') is not null
        and nullif(trim(t.state), '') is not null
        and nullif(trim(t.sport), '') is not null
      group by 1,2,3,4;
    $sql$;
  end if;
end $$;

-- Required unique index for concurrent refresh support and stable row identity.
create unique index if not exists city_state_sport_venue_clusters_uniq_idx
  on public.city_state_sport_venue_clusters (state, city_norm, sport, venue_id);

create index if not exists city_state_sport_venue_clusters_lookup_idx
  on public.city_state_sport_venue_clusters (state, city_norm, sport);

create index if not exists city_state_sport_venue_clusters_venue_idx
  on public.city_state_sport_venue_clusters (venue_id);

revoke all on table public.city_state_sport_venue_clusters from public;
grant select on table public.city_state_sport_venue_clusters to service_role;

