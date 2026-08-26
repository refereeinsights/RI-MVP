-- Corralio Slice 4.5A: typed Overture candidate quality hardening.
-- Prepared only. A human must apply this migration before database UAT.
-- Existing canonical/provisional identities and lifecycle evidence are untouched.

alter table public.corralio_overture_candidates
  add column intent_category text null,
  add column operating_status text not null default 'status_unknown',
  add column quality_rule_version text not null default 'corralio-overture-candidate-quality-legacy-v0',
  add column dedupe_rule_version text not null default 'corralio-overture-dedupe-legacy-v0';

update public.corralio_overture_candidates
set intent_category = case category
  when 'coffee' then 'coffee'
  else 'other_food'
end
where intent_category is null;

alter table public.corralio_overture_candidates
  alter column intent_category set not null,
  alter column quality_rule_version set default 'corralio-overture-candidate-quality-v1',
  alter column dedupe_rule_version set default 'corralio-overture-dedupe-v1',
  add constraint corralio_overture_candidate_intent_check
    check (intent_category in (
      'quick_service', 'pizza', 'sandwiches', 'coffee', 'brewery', 'other_food'
    )),
  add constraint corralio_overture_candidate_pool_intent_coherence_check
    check (
      (category = 'coffee' and intent_category = 'coffee')
      or (
        category = 'food'
        and intent_category in ('quick_service', 'pizza', 'sandwiches', 'brewery', 'other_food')
      )
    ),
  add constraint corralio_overture_candidate_operating_status_check
    check (operating_status in ('confirmed_open', 'confirmed_closed', 'status_unknown')),
  add constraint corralio_overture_candidate_quality_rule_check
    check (quality_rule_version in (
      'corralio-overture-candidate-quality-legacy-v0',
      'corralio-overture-candidate-quality-v1'
    )),
  add constraint corralio_overture_candidate_dedupe_rule_check
    check (dedupe_rule_version in (
      'corralio-overture-dedupe-legacy-v0',
      'corralio-overture-dedupe-v1'
    ));

create index corralio_overture_candidates_active_intent_idx
  on public.corralio_overture_candidates
  (canonical_venue_id, provisional_venue_id, category, intent_category, distance_meters, id)
  where active;

alter table public.corralio_overture_provenance
  add constraint corralio_overture_provenance_id_candidate_unique
    unique (id, candidate_id);

create table public.corralio_overture_candidate_food_tags (
  candidate_id uuid not null
    constraint corralio_overture_candidate_food_tag_candidate_fk
    references public.corralio_overture_candidates(id) on delete cascade,
  food_tag text not null,
  tag_rule_version text not null,
  evidence_field text not null,
  provenance_id uuid not null,
  created_at timestamptz not null default now(),
  constraint corralio_overture_candidate_food_tags_pkey
    primary key (candidate_id, food_tag),
  constraint corralio_overture_candidate_food_tag_value_check
    check (food_tag in (
      'mexican', 'chinese', 'italian', 'japanese',
      'sushi', 'american', 'burgers', 'bbq'
    )),
  constraint corralio_overture_candidate_food_tag_rule_check
    check (tag_rule_version = 'corralio-overture-food-tags-v1'),
  constraint corralio_overture_candidate_food_tag_evidence_field_check
    check (evidence_field in (
      'taxonomy_primary', 'taxonomy_hierarchy', 'taxonomy_alternates',
      'category_primary', 'category_alternates'
    )),
  constraint corralio_overture_candidate_food_tag_provenance_fk
    foreign key (provenance_id, candidate_id)
    references public.corralio_overture_provenance(id, candidate_id)
    on delete cascade
);

create index corralio_overture_candidate_food_tags_lookup_idx
  on public.corralio_overture_candidate_food_tags (food_tag, candidate_id);

create function public.corralio_validate_overture_candidate_food_tag_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_category text;
  v_active boolean;
  v_refresh_status text;
  v_property_name text;
begin
  select candidate.category, candidate.active, refresh.status, provenance.property_name
  into v_category, v_active, v_refresh_status, v_property_name
  from public.corralio_overture_candidates candidate
  join public.corralio_overture_refreshes refresh on refresh.id = candidate.refresh_id
  join public.corralio_overture_provenance provenance
    on provenance.id = new.provenance_id
   and provenance.candidate_id = candidate.id
  where candidate.id = new.candidate_id;

  if not found
     or v_category <> 'food'
     or v_active
     or v_refresh_status <> 'staging'
     or (
       v_property_name is not null
       and (
         (new.evidence_field in ('taxonomy_primary', 'taxonomy_hierarchy', 'taxonomy_alternates')
           and v_property_name <> '/properties/taxonomy')
         or (new.evidence_field in ('category_primary', 'category_alternates')
           and v_property_name <> '/properties/categories')
       )
     )
  then
    raise check_violation using message = 'invalid Overture food-tag evidence';
  end if;
  return new;
end
$function$;

create trigger corralio_validate_overture_candidate_food_tag
before insert on public.corralio_overture_candidate_food_tags
for each row execute function public.corralio_validate_overture_candidate_food_tag_v1();

alter table public.corralio_overture_candidate_food_tags enable row level security;
alter table public.corralio_overture_candidate_food_tags force row level security;
alter table public.corralio_overture_candidate_food_tags owner to postgres;
revoke all on table public.corralio_overture_candidate_food_tags
  from public, anon, authenticated, service_role;
grant select, insert on table public.corralio_overture_candidate_food_tags
  to service_role;
revoke all on function public.corralio_validate_overture_candidate_food_tag_v1()
  from public, anon, authenticated, service_role;
alter function public.corralio_validate_overture_candidate_food_tag_v1()
  owner to postgres;

comment on column public.corralio_overture_candidates.category is
  'Broad atomic-refresh pool category: food or coffee.';
comment on column public.corralio_overture_candidates.intent_category is
  'Versioned Corralio intent classification. It does not perform Slice 4.6 routing or ranking.';
comment on column public.corralio_overture_candidates.operating_status is
  'Explicit Overture-derived state. status_unknown never implies confirmed open.';
comment on table public.corralio_overture_candidate_food_tags is
  'Service-only structured metadata for retained accepted Food candidates; never a selection or acceptance signal.';
comment on column public.corralio_overture_candidate_food_tags.evidence_field is
  'Bounded structured field that produced the tag; provenance_id references the actual permitted candidate source.';

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
        or candidate.quality_rule_version <> 'corralio-overture-candidate-quality-v1'
        or candidate.dedupe_rule_version <> 'corralio-overture-dedupe-v1'
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
