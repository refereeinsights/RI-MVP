-- Corralio Slice 4.5 Stage 1.
-- Prepared only: a human must apply this migration before Stage 2.
-- No canonical venue, household-origin, cron, or request-path behavior is changed.

alter table public.corralio_provisional_venue_evidence
  drop constraint corralio_provisional_evidence_type_check,
  add constraint corralio_provisional_evidence_type_check
    check (evidence_type in ('ics_observation', 'overture_place_match'));

create table public.corralio_overture_evidence_details (
  evidence_id uuid primary key
    references public.corralio_provisional_venue_evidence(id) on delete cascade,
  overture_feature_id text not null,
  overture_gers_confirmed boolean not null default false,
  overture_gers_id text null,
  overture_release text not null,
  overture_feature_version bigint not null,
  overture_category text not null,
  overture_existence_confidence double precision not null,
  match_rule_version text not null,
  match_outcome text not null,
  matched_at timestamptz not null,
  constraint corralio_overture_evidence_feature_check
    check (length(btrim(overture_feature_id)) between 1 and 100),
  constraint corralio_overture_evidence_gers_check
    check (
      (overture_gers_confirmed and overture_gers_id is not null and length(btrim(overture_gers_id)) between 1 and 100)
      or (not overture_gers_confirmed and overture_gers_id is null)
    ),
  constraint corralio_overture_evidence_release_check
    check (length(btrim(overture_release)) between 1 and 40),
  constraint corralio_overture_evidence_version_check
    check (overture_feature_version >= 0),
  constraint corralio_overture_evidence_category_check
    check (length(btrim(overture_category)) between 1 and 120),
  constraint corralio_overture_evidence_confidence_check
    check (overture_existence_confidence between 0 and 1),
  constraint corralio_overture_evidence_match_check
    check (
      match_rule_version = 'corralio-overture-match-v1'
      and match_outcome = 'matched'
    )
);

create unique index corralio_overture_evidence_identity_idx
  on public.corralio_overture_evidence_details
  (overture_feature_id, evidence_id);

create table public.corralio_overture_refreshes (
  id uuid primary key default gen_random_uuid(),
  overture_release text not null,
  mode text not null,
  status text not null default 'staging',
  max_venues integer not null,
  max_boxes integer not null,
  max_downloaded_bytes bigint not null,
  max_candidates_examined integer not null,
  max_candidates_per_category integer not null,
  max_duration_seconds integer not null,
  max_concurrency integer not null,
  venues_considered integer not null default 0,
  boxes_used integer not null default 0,
  downloaded_bytes bigint not null default 0,
  candidates_examined integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  failure_code text null,
  constraint corralio_overture_refresh_release_check check (length(btrim(overture_release)) between 1 and 40),
  constraint corralio_overture_refresh_mode_check check (mode in ('dry_run', 'apply')),
  constraint corralio_overture_refresh_status_check check (status in ('staging', 'active', 'failed')),
  constraint corralio_overture_refresh_bounds_check check (
    max_venues between 1 and 200
    and max_boxes between 1 and 200
    and max_downloaded_bytes between 1 and 1073741824
    and max_candidates_examined between 1 and 100000
    and max_candidates_per_category between 1 and 50
    and max_duration_seconds between 1 and 3600
    and max_concurrency between 1 and 4
    and venues_considered between 0 and max_venues
    and boxes_used between 0 and max_boxes
    and downloaded_bytes between 0 and max_downloaded_bytes
    and candidates_examined between 0 and max_candidates_examined
  ),
  constraint corralio_overture_refresh_completion_check check (
    (status = 'staging' and completed_at is null and failure_code is null)
    or (status = 'active' and mode = 'apply' and completed_at is not null and failure_code is null)
    or (status = 'failed' and completed_at is not null and failure_code is not null
        and length(failure_code) between 1 and 80)
  )
);

create table public.corralio_overture_candidates (
  id uuid primary key default gen_random_uuid(),
  refresh_id uuid not null references public.corralio_overture_refreshes(id) on delete restrict,
  canonical_venue_id uuid null,
  provisional_venue_id uuid null
    references public.corralio_provisional_venues(id) on delete restrict,
  category text not null,
  overture_feature_id text not null,
  overture_gers_confirmed boolean not null default false,
  overture_gers_id text null,
  overture_release text not null,
  overture_feature_version bigint not null,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  overture_existence_confidence double precision not null,
  distance_meters integer not null,
  active boolean not null default false,
  staged_at timestamptz not null default now(),
  activated_at timestamptz null,
  constraint corralio_overture_candidate_venue_exactly_one_check check (
    (canonical_venue_id is not null)::integer
      + (provisional_venue_id is not null)::integer = 1
  ),
  constraint corralio_overture_candidate_category_check check (category in ('food', 'coffee')),
  constraint corralio_overture_candidate_feature_check check (length(btrim(overture_feature_id)) between 1 and 100),
  constraint corralio_overture_candidate_gers_check check (
    (overture_gers_confirmed and overture_gers_id is not null and length(btrim(overture_gers_id)) between 1 and 100)
    or (not overture_gers_confirmed and overture_gers_id is null)
  ),
  constraint corralio_overture_candidate_release_check check (length(btrim(overture_release)) between 1 and 40),
  constraint corralio_overture_candidate_version_check check (overture_feature_version >= 0),
  constraint corralio_overture_candidate_name_check check (length(btrim(name)) between 1 and 200),
  constraint corralio_overture_candidate_coordinate_check
    check (latitude between -90 and 90 and longitude between -180 and 180),
  constraint corralio_overture_candidate_confidence_check
    check (overture_existence_confidence between 0 and 1),
  constraint corralio_overture_candidate_distance_check check (distance_meters between 0 and 4829),
  constraint corralio_overture_candidate_activation_check
    check (active = (activated_at is not null)),
  constraint corralio_overture_candidate_refresh_feature_unique
    unique nulls not distinct
      (refresh_id, canonical_venue_id, provisional_venue_id, category, overture_feature_id)
);

create unique index corralio_overture_candidates_active_canonical_idx
  on public.corralio_overture_candidates (canonical_venue_id, category, overture_feature_id)
  where active and canonical_venue_id is not null;
create unique index corralio_overture_candidates_active_provisional_idx
  on public.corralio_overture_candidates (provisional_venue_id, category, overture_feature_id)
  where active and provisional_venue_id is not null;
create index corralio_overture_candidates_refresh_idx
  on public.corralio_overture_candidates (refresh_id, active, category, id);

create table public.corralio_overture_refresh_scopes (
  id uuid primary key default gen_random_uuid(),
  refresh_id uuid not null references public.corralio_overture_refreshes(id) on delete restrict,
  canonical_venue_id uuid null,
  provisional_venue_id uuid null
    references public.corralio_provisional_venues(id) on delete restrict,
  category text not null,
  constraint corralio_overture_scope_venue_exactly_one_check check (
    (canonical_venue_id is not null)::integer
      + (provisional_venue_id is not null)::integer = 1
  ),
  constraint corralio_overture_scope_category_check check (category in ('food', 'coffee')),
  constraint corralio_overture_scope_unique
    unique nulls not distinct
      (refresh_id, canonical_venue_id, provisional_venue_id, category)
);

create table public.corralio_overture_provenance (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid null references public.corralio_overture_evidence_details(evidence_id) on delete cascade,
  candidate_id uuid null references public.corralio_overture_candidates(id) on delete cascade,
  property_name text null,
  dataset text not null,
  license_id text not null,
  source_record_id text null,
  source_update_time timestamptz null,
  constraint corralio_overture_provenance_parent_exactly_one_check check (
    (evidence_id is not null)::integer + (candidate_id is not null)::integer = 1
  ),
  constraint corralio_overture_provenance_property_check
    check (property_name is null or length(btrim(property_name)) between 1 and 80),
  constraint corralio_overture_provenance_dataset_check
    check (length(btrim(dataset)) between 1 and 80 and lower(dataset) <> 'foursquare'),
  constraint corralio_overture_provenance_license_check
    check (license_id in ('CDLA-Permissive-2.0', 'CC0-1.0', 'Apache-2.0-approved')),
  constraint corralio_overture_provenance_record_check
    check (source_record_id is null or length(btrim(source_record_id)) between 1 and 200),
  constraint corralio_overture_provenance_unique
    unique nulls not distinct (
      evidence_id, candidate_id, property_name, dataset, license_id,
      source_record_id, source_update_time
    )
);

alter table public.corralio_overture_evidence_details enable row level security;
alter table public.corralio_overture_evidence_details force row level security;
alter table public.corralio_overture_refreshes enable row level security;
alter table public.corralio_overture_refreshes force row level security;
alter table public.corralio_overture_candidates enable row level security;
alter table public.corralio_overture_candidates force row level security;
alter table public.corralio_overture_refresh_scopes enable row level security;
alter table public.corralio_overture_refresh_scopes force row level security;
alter table public.corralio_overture_provenance enable row level security;
alter table public.corralio_overture_provenance force row level security;

alter table public.corralio_overture_evidence_details owner to postgres;
alter table public.corralio_overture_refreshes owner to postgres;
alter table public.corralio_overture_candidates owner to postgres;
alter table public.corralio_overture_refresh_scopes owner to postgres;
alter table public.corralio_overture_provenance owner to postgres;

revoke all on table public.corralio_overture_evidence_details,
  public.corralio_overture_refreshes,
  public.corralio_overture_candidates,
  public.corralio_overture_refresh_scopes,
  public.corralio_overture_provenance
  from public, anon, authenticated, service_role;
grant select on table public.corralio_overture_evidence_details,
  public.corralio_overture_refreshes,
  public.corralio_overture_candidates,
  public.corralio_overture_refresh_scopes,
  public.corralio_overture_provenance
  to service_role;
grant insert on table public.corralio_overture_refreshes,
  public.corralio_overture_candidates,
  public.corralio_overture_refresh_scopes,
  public.corralio_overture_provenance
  to service_role;

create function public.corralio_validate_overture_candidate_venue_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.canonical_venue_id is not null
     and not exists (select 1 from public.venues v where v.id = new.canonical_venue_id) then
    raise exception 'invalid canonical venue';
  end if;
  if new.provisional_venue_id is not null
     and not exists (
       select 1 from public.corralio_provisional_venues p
       where p.id = new.provisional_venue_id and p.lifecycle_status = 'active'
     ) then
    raise exception 'invalid provisional enrichment target';
  end if;
  if not exists (
    select 1 from public.corralio_overture_refreshes r
    where r.id = new.refresh_id and r.mode = 'apply' and r.status = 'staging'
      and r.overture_release = new.overture_release
  ) then
    raise exception 'invalid staging refresh';
  end if;
  return new;
end
$function$;

create trigger corralio_validate_overture_candidate_venue
before insert on public.corralio_overture_candidates
for each row execute function public.corralio_validate_overture_candidate_venue_v1();

create function public.corralio_validate_overture_refresh_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.canonical_venue_id is not null
     and not exists (select 1 from public.venues v where v.id = new.canonical_venue_id) then
    raise exception 'invalid canonical venue';
  end if;
  if new.provisional_venue_id is not null
     and not exists (
       select 1 from public.corralio_provisional_venues p
       where p.id = new.provisional_venue_id and p.lifecycle_status = 'active'
     ) then
    raise exception 'invalid provisional enrichment target';
  end if;
  if not exists (
    select 1 from public.corralio_overture_refreshes r
    where r.id = new.refresh_id and r.mode = 'apply' and r.status = 'staging'
  ) then
    raise exception 'invalid staging refresh';
  end if;
  return new;
end
$function$;

create trigger corralio_validate_overture_refresh_scope
before insert on public.corralio_overture_refresh_scopes
for each row execute function public.corralio_validate_overture_refresh_scope_v1();

create function public.corralio_resolve_provisional_enrichment_target_v1(
  p_provisional_venue_id uuid
)
returns table(target_type text, target_id uuid, lifecycle_status text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    case p.lifecycle_status
      when 'active' then 'provisional'
      when 'merged' then 'provisional'
      when 'reconciled' then 'canonical'
      else null
    end,
    case p.lifecycle_status
      when 'active' then p.id
      when 'merged' then survivor.id
      when 'reconciled' then p.canonical_venue_id
      else null
    end,
    p.lifecycle_status
  from public.corralio_provisional_venues p
  left join public.corralio_provisional_venues survivor
    on p.lifecycle_status = 'merged'
   and survivor.id = p.merged_into_provisional_id
   and survivor.lifecycle_status = 'active'
  where p.id = p_provisional_venue_id
    and (
      p.lifecycle_status = 'active'
      or (p.lifecycle_status = 'merged' and survivor.id is not null)
      or (p.lifecycle_status = 'reconciled' and exists (
        select 1 from public.venues v where v.id = p.canonical_venue_id
      ))
      or p.lifecycle_status = 'suppressed'
    );
$function$;

create function public.corralio_read_canonical_venue_coordinate_v1(p_canonical_venue_id uuid)
returns table(canonical_venue_id uuid, latitude double precision, longitude double precision)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select v.id, v.latitude, v.longitude
  from public.venues v
  where v.id = p_canonical_venue_id
    and v.latitude between -90 and 90
    and v.longitude between -180 and 180;
$function$;

create function public.corralio_record_overture_place_match_v1(
  p_provisional_venue_id uuid,
  p_observation_fingerprint text,
  p_source_scope_fingerprint text,
  p_overture_feature_id text,
  p_overture_gers_confirmed boolean,
  p_overture_gers_id text,
  p_overture_release text,
  p_overture_feature_version bigint,
  p_overture_category text,
  p_overture_existence_confidence double precision,
  p_match_rule_version text,
  p_match_outcome text,
  p_matched_at timestamptz,
  p_source_datasets text[],
  p_source_properties text[],
  p_source_license_ids text[],
  p_source_record_ids text[],
  p_source_update_times timestamptz[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_evidence_id uuid;
  v_source_index integer;
  v_source_count integer := cardinality(p_source_datasets);
begin
  if p_match_rule_version <> 'corralio-overture-match-v1'
     or p_match_outcome <> 'matched'
     or p_observation_fingerprint !~ '^[0-9a-f]{64}$'
     or p_source_scope_fingerprint !~ '^[0-9a-f]{64}$'
     or v_source_count not between 1 and 20
     or cardinality(p_source_properties) <> v_source_count
     or cardinality(p_source_license_ids) <> v_source_count
     or cardinality(p_source_record_ids) <> v_source_count
     or cardinality(p_source_update_times) <> v_source_count
     or not exists (
       select 1 from public.corralio_provisional_venues p
       where p.id = p_provisional_venue_id and p.lifecycle_status = 'active'
     ) then
    return null;
  end if;

  insert into public.corralio_provisional_venue_evidence (
    provisional_venue_id, evidence_type, observation_fingerprint,
    source_scope_fingerprint, fingerprint_version, normalizer_version, observed_at
  ) values (
    p_provisional_venue_id, 'overture_place_match', p_observation_fingerprint,
    p_source_scope_fingerprint, 'corralio-evidence-hmac-v1',
    p_match_rule_version, p_matched_at
  )
  on conflict (provisional_venue_id, observation_fingerprint)
  do update set observed_at = excluded.observed_at
  returning id into v_evidence_id;

  insert into public.corralio_overture_evidence_details (
    evidence_id, overture_feature_id, overture_gers_confirmed,
    overture_gers_id, overture_release, overture_feature_version,
    overture_category, overture_existence_confidence,
    match_rule_version, match_outcome, matched_at
  ) values (
    v_evidence_id, btrim(p_overture_feature_id), p_overture_gers_confirmed,
    nullif(btrim(p_overture_gers_id), ''), btrim(p_overture_release),
    p_overture_feature_version, btrim(p_overture_category),
    p_overture_existence_confidence, p_match_rule_version,
    p_match_outcome, p_matched_at
  )
  on conflict (evidence_id) do update set
    matched_at = greatest(public.corralio_overture_evidence_details.matched_at, excluded.matched_at);

  for v_source_index in 1..v_source_count loop
    if length(btrim(p_source_datasets[v_source_index])) not between 1 and 80
       or lower(btrim(p_source_datasets[v_source_index])) = 'foursquare'
       or p_source_license_ids[v_source_index] not in (
         'CDLA-Permissive-2.0', 'CC0-1.0', 'Apache-2.0-approved'
       ) then
      raise exception 'invalid Overture provenance';
    end if;
    insert into public.corralio_overture_provenance (
      evidence_id, property_name, dataset, license_id,
      source_record_id, source_update_time
    ) values (
      v_evidence_id, nullif(btrim(p_source_properties[v_source_index]), ''),
      lower(btrim(p_source_datasets[v_source_index])),
      p_source_license_ids[v_source_index],
      nullif(btrim(p_source_record_ids[v_source_index]), ''),
      p_source_update_times[v_source_index]
    )
    on conflict on constraint corralio_overture_provenance_unique do nothing;
  end loop;

  return v_evidence_id;
end
$function$;

create function public.corralio_activate_overture_refresh_v1(p_refresh_id uuid)
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
  if not found or v_refresh.mode <> 'apply' or v_refresh.status <> 'staging' then return false; end if;

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

create function public.corralio_fail_overture_refresh_v1(
  p_refresh_id uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.corralio_overture_refreshes
  set status = 'failed', completed_at = now(), failure_code = btrim(p_failure_code)
  where id = p_refresh_id and status = 'staging'
    and length(btrim(p_failure_code)) between 1 and 80;
  return found;
end
$function$;

revoke all on function public.corralio_validate_overture_candidate_venue_v1() from public, anon, authenticated, service_role;
revoke all on function public.corralio_validate_overture_refresh_scope_v1() from public, anon, authenticated, service_role;
revoke all on function public.corralio_resolve_provisional_enrichment_target_v1(uuid) from public, anon, authenticated;
revoke all on function public.corralio_read_canonical_venue_coordinate_v1(uuid) from public, anon, authenticated;
revoke all on function public.corralio_record_overture_place_match_v1(uuid,text,text,text,boolean,text,text,bigint,text,double precision,text,text,timestamptz,text[],text[],text[],text[],timestamptz[]) from public, anon, authenticated;
revoke all on function public.corralio_activate_overture_refresh_v1(uuid) from public, anon, authenticated;
revoke all on function public.corralio_fail_overture_refresh_v1(uuid,text) from public, anon, authenticated;

grant execute on function public.corralio_resolve_provisional_enrichment_target_v1(uuid) to service_role;
grant execute on function public.corralio_read_canonical_venue_coordinate_v1(uuid) to service_role;
grant execute on function public.corralio_record_overture_place_match_v1(uuid,text,text,text,boolean,text,text,bigint,text,double precision,text,text,timestamptz,text[],text[],text[],text[],timestamptz[]) to service_role;
grant execute on function public.corralio_activate_overture_refresh_v1(uuid) to service_role;
grant execute on function public.corralio_fail_overture_refresh_v1(uuid,text) to service_role;

alter function public.corralio_validate_overture_candidate_venue_v1() owner to postgres;
alter function public.corralio_validate_overture_refresh_scope_v1() owner to postgres;
alter function public.corralio_resolve_provisional_enrichment_target_v1(uuid) owner to postgres;
alter function public.corralio_read_canonical_venue_coordinate_v1(uuid) owner to postgres;
alter function public.corralio_record_overture_place_match_v1(uuid,text,text,text,boolean,text,text,bigint,text,double precision,text,text,timestamptz,text[],text[],text[],text[],timestamptz[]) owner to postgres;
alter function public.corralio_activate_overture_refresh_v1(uuid) owner to postgres;
alter function public.corralio_fail_overture_refresh_v1(uuid,text) owner to postgres;

comment on function public.corralio_read_canonical_venue_coordinate_v1(uuid) is
  'Service-only minimal canonical coordinate boundary; does not broaden venues_public.';
comment on table public.corralio_overture_candidates is
  'Service-only shared Food/Coffee pool. Never keyed to households or private origins.';
