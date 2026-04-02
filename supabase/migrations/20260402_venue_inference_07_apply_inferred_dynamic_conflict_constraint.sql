-- Venue inference apply RPC fix (v3)
-- Some environments have `tournament_venues` with a surrogate PK and a separate UNIQUE constraint
-- on `(tournament_id, venue_id)` (e.g. `tournament_venues_tournament_id_venue_id_key`).
-- If we upsert on the wrong constraint (like the PK), inserts can still fail with duplicate key
-- violations on the unique pair constraint.
--
-- This version dynamically discovers the constraint name for the `(tournament_id, venue_id)` pair
-- and uses `ON CONFLICT ON CONSTRAINT <that_constraint>` via dynamic SQL.

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
  v_tid_attnum smallint;
  v_vid_attnum smallint;
  v_pair_constraint text;
  v_sql text;
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
      from public.get_inferred_venue_candidates($1)
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

revoke all on function public.apply_inferred_venue_candidates(integer, boolean) from public;
grant execute on function public.apply_inferred_venue_candidates(integer, boolean) to service_role;

