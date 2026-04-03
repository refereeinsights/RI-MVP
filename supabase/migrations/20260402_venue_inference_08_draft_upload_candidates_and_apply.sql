-- Draft uploads: inferred venue candidates + apply helper (v1)
-- Purpose:
-- - Allow admins to preview/apply inferred venue links for draft tournaments waiting in the uploads queue.
-- Safety:
-- - Training remains confirmed-only via `public.city_state_sport_venue_clusters`.
-- - Writes are always `is_inferred = true` and never mutate confirmed rows.
-- - Candidates are only for draft tournaments with zero CONFIRMED venue links.
--
-- Note:
-- - These helpers are admin/service-role only. UI actions should promote/reject explicitly.

-- Read-only candidates for DRAFT tournaments missing CONFIRMED venue links.
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

-- Apply inferred candidates into tournament_venues for DRAFT tournaments (dry-run by default).
create or replace function public.apply_inferred_venue_candidates_for_drafts(
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
  v_tid_attnum smallint;
  v_vid_attnum smallint;
  v_pair_constraint text;
  v_sql text;
begin
  if coalesce(dry_run, true) then
    return query
      with c as (
        select *
        from public.get_inferred_venue_candidates_for_drafts(limit_per_tournament)
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

  -- Discover the constraint that uniquely identifies (tournament_id, venue_id).
  select a.attnum::smallint
  into v_tid_attnum
  from pg_attribute a
  where a.attrelid = 'public.tournament_venues'::regclass
    and a.attname = 'tournament_id'
    and a.attisdropped = false;

  select a.attnum::smallint
  into v_vid_attnum
  from pg_attribute a
  where a.attrelid = 'public.tournament_venues'::regclass
    and a.attname = 'venue_id'
    and a.attisdropped = false;

  if v_tid_attnum is null or v_vid_attnum is null then
    raise exception 'tournament_venues missing required columns tournament_id/venue_id';
  end if;

  select c.conname
  into v_pair_constraint
  from pg_constraint c
  where c.conrelid = 'public.tournament_venues'::regclass
    and c.contype in ('p', 'u')
    and array_length(c.conkey, 1) = 2
    and c.conkey @> array[v_tid_attnum, v_vid_attnum]
    and c.conkey <@ array[v_tid_attnum, v_vid_attnum]
  order by case when c.contype = 'p' then 0 else 1 end, c.conname asc
  limit 1;

  if v_pair_constraint is null then
    raise exception 'No unique/primary constraint found for tournament_venues(tournament_id, venue_id)';
  end if;

  v_sql := format($fmt$
    with c as (
      select *
      from public.get_inferred_venue_candidates_for_drafts($1)
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
        $2::text as inference_method,
        now() as inferred_at,
        $3::uuid as inference_run_id,
        null::uuid as venue_sport_profile_id
      from c
      on conflict on constraint %I do update
        set
          is_inferred = true,
          is_primary = false,
          inference_confidence = excluded.inference_confidence,
          inference_method = excluded.inference_method,
          inferred_at = excluded.inferred_at,
          inference_run_id = excluded.inference_run_id
        where public.tournament_venues.is_inferred = true
      returning
        public.tournament_venues.tournament_id as up_tournament_id,
        public.tournament_venues.venue_id as up_venue_id
    )
    select
      c.tournament_id,
      c.venue_id,
      c.confidence_score,
      $2::text as inference_method,
      c.rank_inference,
      true as wrote,
      'inferred' as existing_link_type
    from c
    join upserted u
      on u.up_tournament_id = c.tournament_id
     and u.up_venue_id = c.venue_id
    order by c.tournament_id, c.rank_inference
  $fmt$, v_pair_constraint);

  return query execute v_sql using limit_per_tournament, v_method, v_run_id;
end $$;

revoke all on function public.apply_inferred_venue_candidates_for_drafts(integer, boolean) from public;
grant execute on function public.apply_inferred_venue_candidates_for_drafts(integer, boolean) to service_role;

