-- Inferred venue candidates + admin helpers (v1)
-- Builds on:
-- - `tournament_venues.is_inferred` guardrail
-- - `city_state_sport_venue_clusters` confirmed-only history MV
-- - `tournament_venue_inference_feedback` rejection memory
--
-- Inference method (v1): city/state/sport confirmed usage clusters.
-- This is intentionally conservative and admin-oriented.

-- Read-only candidates for tournaments missing CONFIRMED venue links.
create or replace function public.get_inferred_venue_candidates(limit_per_tournament integer default 3)
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
    where t.status = 'published'
      and t.is_canonical = true
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
      -- Query-time scoring (stable MV + current_date).
      (1 - exp(-c.distinct_tournament_count::numeric / 6)) as freq_score,
      exp(-(greatest(0, (current_date - c.last_used_date))::numeric) / 180) as recency_score
    from missing m
    join public.city_state_sport_venue_clusters c
      on c.state = m.state
     and c.city_norm = m.city_norm
     and c.sport = m.sport
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

revoke all on function public.get_inferred_venue_candidates(integer) from public;
grant execute on function public.get_inferred_venue_candidates(integer) to service_role;

-- Apply inferred candidates into tournament_venues (dry-run by default).
create or replace function public.apply_inferred_venue_candidates(
  limit_per_tournament integer default 3,
  dry_run boolean default true
)
returns table (
  tournament_id uuid,
  venue_id uuid,
  confidence_score numeric(5,4),
  inference_method text,
  rank_inference integer,
  wrote boolean,
  existing_link_type text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method text := 'city_state_sport_cluster_v2';
  v_run_id uuid := gen_random_uuid();
begin
  if coalesce(dry_run, true) then
    return query
      with c as (
        select *
        from public.get_inferred_venue_candidates(limit_per_tournament)
      ),
      e as (
        select
          c.*,
          tv.is_inferred as existing_is_inferred
        from c
        left join public.tournament_venues tv
          on tv.tournament_id = c.tournament_id
         and tv.venue_id = c.venue_id
      )
      select
        e.tournament_id,
        e.venue_id,
        e.confidence_score,
        e.inference_method,
        e.rank_inference,
        false as wrote,
        case
          when e.existing_is_inferred is null then 'none'
          when e.existing_is_inferred = true then 'inferred'
          else 'confirmed'
        end as existing_link_type
      from e
      order by e.tournament_id, e.rank_inference;
    return;
  end if;

  return query
    with c as (
      select *
      from public.get_inferred_venue_candidates(limit_per_tournament)
    ),
    upserted as (
      insert into public.tournament_venues (
        tournament_id,
        venue_id,
        is_inferred,
        is_primary,
        inference_confidence,
        inference_method,
        inferred_at,
        inference_run_id,
        venue_sport_profile_id
      )
      select
        c.tournament_id,
        c.venue_id,
        true as is_inferred,
        false as is_primary,
        c.confidence_score as inference_confidence,
        v_method as inference_method,
        now() as inferred_at,
        v_run_id as inference_run_id,
        null::uuid as venue_sport_profile_id
      from c
      on conflict (tournament_id, venue_id) do update
        set
          is_inferred = true,
          is_primary = false,
          inference_confidence = excluded.inference_confidence,
          inference_method = excluded.inference_method,
          inferred_at = excluded.inferred_at,
          inference_run_id = excluded.inference_run_id
        where public.tournament_venues.is_inferred = true
      returning tournament_id, venue_id
    )
    select
      c.tournament_id,
      c.venue_id,
      c.confidence_score,
      v_method as inference_method,
      c.rank_inference,
      true as wrote,
      'inferred' as existing_link_type
    from c
    join upserted u
      on u.tournament_id = c.tournament_id
     and u.venue_id = c.venue_id
    order by c.tournament_id, c.rank_inference;
end $$;

revoke all on function public.apply_inferred_venue_candidates(integer, boolean) from public;
grant execute on function public.apply_inferred_venue_candidates(integer, boolean) to service_role;

-- Admin listing helpers (read-only).
create or replace function public.list_tournaments_with_inferred_venues(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  tournament_id uuid,
  name text,
  city text,
  state text,
  sport text,
  start_date date,
  inferred_count integer,
  max_inference_confidence numeric(5,4)
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id as tournament_id,
    t.name,
    t.city,
    t.state,
    t.sport,
    t.start_date,
    count(*)::int as inferred_count,
    max(tv.inference_confidence)::numeric(5,4) as max_inference_confidence
  from public.tournaments t
  join public.tournament_venues tv
    on tv.tournament_id = t.id
   and tv.is_inferred = true
  where t.status = 'published'
    and t.is_canonical = true
  group by t.id, t.name, t.city, t.state, t.sport, t.start_date
  order by max(tv.inference_confidence) desc nulls last, count(*) desc, t.start_date asc nulls last
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.list_tournaments_with_inferred_venues(integer, integer) from public;
grant execute on function public.list_tournaments_with_inferred_venues(integer, integer) to service_role;

create or replace function public.list_tournaments_with_only_inferred_venues(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  tournament_id uuid,
  name text,
  city text,
  state text,
  sport text,
  start_date date,
  inferred_count integer,
  max_inference_confidence numeric(5,4)
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id as tournament_id,
    t.name,
    t.city,
    t.state,
    t.sport,
    t.start_date,
    count(*)::int as inferred_count,
    max(tv.inference_confidence)::numeric(5,4) as max_inference_confidence
  from public.tournaments t
  join public.tournament_venues tv
    on tv.tournament_id = t.id
   and tv.is_inferred = true
  where t.status = 'published'
    and t.is_canonical = true
    and not exists (
      select 1
      from public.tournament_venues tv2
      where tv2.tournament_id = t.id
        and tv2.is_inferred = false
    )
  group by t.id, t.name, t.city, t.state, t.sport, t.start_date
  order by max(tv.inference_confidence) desc nulls last, count(*) desc, t.start_date asc nulls last
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.list_tournaments_with_only_inferred_venues(integer, integer) from public;
grant execute on function public.list_tournaments_with_only_inferred_venues(integer, integer) to service_role;

-- Promote an inferred link to confirmed (manual/admin action).
create or replace function public.promote_inferred_venue(
  p_tournament_id uuid,
  p_venue_id uuid,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method text;
begin
  select tv.inference_method
  into v_method
  from public.tournament_venues tv
  where tv.tournament_id = p_tournament_id
    and tv.venue_id = p_venue_id
    and tv.is_inferred = true;

  update public.tournament_venues tv
  set is_inferred = false
  where tv.tournament_id = p_tournament_id
    and tv.venue_id = p_venue_id
    and tv.is_inferred = true;

  if found and v_method is not null then
    insert into public.tournament_venue_inference_feedback (
      tournament_id, venue_id, inference_method, feedback_status, feedback_notes
    )
    values (
      p_tournament_id, p_venue_id, v_method, 'confirmed', p_notes
    )
    on conflict (tournament_id, venue_id, inference_method) do update
      set feedback_status = 'confirmed',
          feedback_notes = excluded.feedback_notes,
          feedback_at = now();
  end if;

  return found;
end $$;

revoke all on function public.promote_inferred_venue(uuid, uuid, text) from public;
grant execute on function public.promote_inferred_venue(uuid, uuid, text) to service_role;

-- Reject an inferred candidate so it will not be suggested again.
create or replace function public.reject_inferred_venue(
  p_tournament_id uuid,
  p_venue_id uuid,
  p_method text,
  p_notes text default null,
  p_remove_link boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tournament_venue_inference_feedback (
    tournament_id, venue_id, inference_method, feedback_status, feedback_notes
  )
  values (
    p_tournament_id, p_venue_id, p_method, 'rejected', p_notes
  )
  on conflict (tournament_id, venue_id, inference_method) do update
    set feedback_status = 'rejected',
        feedback_notes = excluded.feedback_notes,
        feedback_at = now();

  if coalesce(p_remove_link, true) then
    delete from public.tournament_venues tv
    where tv.tournament_id = p_tournament_id
      and tv.venue_id = p_venue_id
      and tv.is_inferred = true
      and (p_method is null or tv.inference_method is not distinct from p_method);
  end if;

  return true;
end $$;

revoke all on function public.reject_inferred_venue(uuid, uuid, text, text, boolean) from public;
grant execute on function public.reject_inferred_venue(uuid, uuid, text, text, boolean) to service_role;

