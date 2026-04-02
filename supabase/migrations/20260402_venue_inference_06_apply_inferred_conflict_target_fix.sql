-- Venue inference apply RPC fix (v2)
-- Fixes remaining PL/pgSQL ambiguity by avoiding unqualified column references in the
-- ON CONFLICT target. In PL/pgSQL, OUT params named `tournament_id` / `venue_id` can
-- conflict with column identifiers used in SQL statements.
--
-- Use the primary-key constraint name as the conflict target instead of `(tournament_id, venue_id)`.

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
      on conflict on constraint tournament_venues_pkey do update
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
      v_method as inference_method,
      c.rank_inference,
      true as wrote,
      'inferred' as existing_link_type
    from c
    join upserted u
      on u.up_tournament_id = c.tournament_id
     and u.up_venue_id = c.venue_id
    order by c.tournament_id, c.rank_inference;
end $$;

revoke all on function public.apply_inferred_venue_candidates(integer, boolean) from public;
grant execute on function public.apply_inferred_venue_candidates(integer, boolean) to service_role;

