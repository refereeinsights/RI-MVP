-- Draft inference hardening: exclude stale candidate venue_ids that no longer exist.
-- Fixes FK failures like:
--   tournament_venues_venue_id_fkey
-- when city_state_sport_venue_clusters still references deleted venues.

create or replace function public.get_inferred_venue_candidates_for_drafts(limit_per_tournament integer default 3)
returns table (
  tournament_id uuid,
  venue_id uuid,
  confidence_score numeric(5,4),
  inference_method text,
  rank_inference integer,
  distinct_tournament_count integer,
  last_used_date date
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      least(greatest(coalesce(limit_per_tournament, 3), 1), 10) as n,
      'city_state_sport_cluster_v2'::text as method
  ),
  missing as (
    select
      t.id as tournament_id,
      lower(trim(t.city)) as city_norm,
      upper(trim(t.state)) as state,
      lower(trim(t.sport)) as sport
    from public.tournaments t
    where t.status = 'draft'
      and coalesce(t.skip_venue_discovery, false) = false
      and nullif(trim(t.city), '') is not null
      and nullif(trim(t.state), '') is not null
      and nullif(trim(t.sport), '') is not null
      and not exists (
        select 1
        from public.tournament_venues tv
        where tv.tournament_id = t.id
          and tv.is_inferred = false
      )
  ),
  scored as (
    select
      m.tournament_id,
      c.venue_id,
      c.distinct_tournament_count,
      c.last_used_date,
      (1 - exp(-c.distinct_tournament_count::numeric / 6)) as freq_score,
      exp(-(greatest(0, (current_date - c.last_used_date))::numeric) / 180) as recency_score
    from missing m
    join public.city_state_sport_venue_clusters c
      on c.state = m.state
     and c.city_norm = m.city_norm
     and c.sport = m.sport
    join public.venues v
      on v.id = c.venue_id
    left join public.tournament_venue_inference_feedback f
      on f.tournament_id = m.tournament_id
     and f.venue_id = c.venue_id
     and f.inference_method = (select method from params)
     and f.feedback_status = 'rejected'
    where f.id is null
  ),
  ranked as (
    select
      s.tournament_id,
      s.venue_id,
      (0.7 * s.freq_score + 0.3 * s.recency_score) as confidence_score_raw,
      s.distinct_tournament_count,
      s.last_used_date,
      row_number() over (
        partition by s.tournament_id
        order by (0.7 * s.freq_score + 0.3 * s.recency_score) desc,
                 s.distinct_tournament_count desc,
                 s.last_used_date desc,
                 s.venue_id asc
      ) as rn
    from scored s
    where s.distinct_tournament_count >= 3
      and (0.7 * s.freq_score + 0.3 * s.recency_score) >= 0.45
  )
  select
    r.tournament_id,
    r.venue_id,
    round(r.confidence_score_raw::numeric, 4)::numeric(5,4) as confidence_score,
    (select method from params) as inference_method,
    r.rn as rank_inference,
    r.distinct_tournament_count,
    r.last_used_date
  from ranked r
  where r.rn <= (select n from params)
  order by r.tournament_id, r.rn;
$$;

revoke all on function public.get_inferred_venue_candidates_for_drafts(integer) from public;
grant execute on function public.get_inferred_venue_candidates_for_drafts(integer) to service_role;

