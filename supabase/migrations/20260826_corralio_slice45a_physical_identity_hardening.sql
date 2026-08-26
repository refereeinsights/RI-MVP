-- Corralio Slice 4.5A: deterministic physical-place identity hardening.
-- Prepared only. A human must apply this migration before database UAT.
-- Existing active pools remain readable; only newly staged V2 pools may activate.

do $require_slice45a$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'corralio_overture_candidates'
      and column_name = 'quality_rule_version'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'corralio_overture_candidates'
      and column_name = 'dedupe_rule_version'
  ) or to_regclass('public.corralio_overture_candidate_food_tags') is null then
    raise exception 'Apply 20260825_corralio_slice45a_candidate_quality_hardening.sql before this V2 migration';
  end if;
end
$require_slice45a$;

do $drop_prior_rule_checks$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_info.conname
    from pg_catalog.pg_constraint constraint_info
    where constraint_info.conrelid = 'public.corralio_overture_candidates'::regclass
      and constraint_info.contype = 'c'
      and (
        pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%quality_rule_version%'
        or pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%dedupe_rule_version%'
      )
  loop
    execute format(
      'alter table public.corralio_overture_candidates drop constraint %I',
      v_constraint.conname
    );
  end loop;
end
$drop_prior_rule_checks$;

alter table public.corralio_overture_candidates
  alter column quality_rule_version set default 'corralio-overture-candidate-quality-v2',
  alter column dedupe_rule_version set default 'corralio-overture-dedupe-v2',
  add constraint corralio_overture_candidate_quality_rule_check
    check (quality_rule_version in (
      'corralio-overture-candidate-quality-legacy-v0',
      'corralio-overture-candidate-quality-v1',
      'corralio-overture-candidate-quality-v2'
    )),
  add constraint corralio_overture_candidate_dedupe_rule_check
    check (dedupe_rule_version in (
      'corralio-overture-dedupe-legacy-v0',
      'corralio-overture-dedupe-v1',
      'corralio-overture-dedupe-v2'
    ));

comment on column public.corralio_overture_candidates.quality_rule_version is
  'Versioned candidate eligibility rule; V2 rejects unconfirmed sub-0.80 physical identities.';
comment on column public.corralio_overture_candidates.dedupe_rule_version is
  'Versioned physical-place collision rule; V2 resolves compatible identities and excludes unresolved collisions before staging.';

create or replace function public.corralio_activate_overture_refresh_v1(p_refresh_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_refresh public.corralio_overture_refreshes%rowtype;
begin
  select * into v_refresh from public.corralio_overture_refreshes
  where id = p_refresh_id for update;
  if not found or v_refresh.mode <> 'apply' or v_refresh.status <> 'staging' then
    return false;
  end if;

  if exists (
    select 1
    from public.corralio_overture_candidates candidate
    where candidate.refresh_id = p_refresh_id
      and (
        candidate.operating_status = 'confirmed_closed'
        or candidate.quality_rule_version <> 'corralio-overture-candidate-quality-v2'
        or candidate.dedupe_rule_version <> 'corralio-overture-dedupe-v2'
        or not (
          (candidate.category = 'coffee' and candidate.intent_category = 'coffee')
          or (
            candidate.category = 'food'
            and candidate.intent_category in (
              'quick_service', 'pizza', 'sandwiches', 'brewery', 'other_food'
            )
          )
        )
        or not exists (
          select 1 from public.corralio_overture_provenance provenance
          where provenance.candidate_id = candidate.id
        )
        or not exists (
          select 1 from public.corralio_overture_refresh_scopes scope
          where scope.refresh_id = p_refresh_id
            and scope.category = candidate.category
            and scope.canonical_venue_id is not distinct from candidate.canonical_venue_id
            and scope.provisional_venue_id is not distinct from candidate.provisional_venue_id
        )
        or exists (
          select 1 from public.corralio_overture_candidate_food_tags food_tag
          where food_tag.candidate_id = candidate.id
            and (
              candidate.category <> 'food'
              or food_tag.tag_rule_version <> 'corralio-overture-food-tags-v1'
            )
        )
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.corralio_overture_candidates candidate
    where candidate.refresh_id = p_refresh_id
    group by candidate.canonical_venue_id, candidate.provisional_venue_id, candidate.category
    having count(*) > v_refresh.max_candidates_per_category
  ) then
    return false;
  end if;

  update public.corralio_overture_candidates old
  set active = false, activated_at = null
  where old.active
    and exists (
      select 1 from public.corralio_overture_refresh_scopes scope
      where scope.refresh_id = p_refresh_id
        and scope.category = old.category
        and scope.canonical_venue_id is not distinct from old.canonical_venue_id
        and scope.provisional_venue_id is not distinct from old.provisional_venue_id
    );

  update public.corralio_overture_candidates
  set active = true, activated_at = now()
  where refresh_id = p_refresh_id and not active;

  update public.corralio_overture_refreshes
  set status = 'active', completed_at = now()
  where id = p_refresh_id;
  return true;
end
$function$;

revoke all on function public.corralio_activate_overture_refresh_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.corralio_activate_overture_refresh_v1(uuid)
  to service_role;
alter function public.corralio_activate_overture_refresh_v1(uuid)
  owner to postgres;
