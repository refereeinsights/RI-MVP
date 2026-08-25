-- Corralio Slice 4.4C Stage 1: provisional lifecycle, ICS-only evidence,
-- immutable transitions, redirects, and derived promotion eligibility.
-- Prepared on 2026-08-25. A human must apply this migration before Stage 2.
-- It performs no backfill, provider request, canonical venue write, or bulk lifecycle operation.

alter table public.corralio_provisional_venues
  drop constraint corralio_provisional_venues_lifecycle_check,
  drop constraint corralio_provisional_venues_suppression_check,
  add column merged_into_provisional_id uuid null,
  add column canonical_venue_id uuid null,
  add column lifecycle_changed_at timestamptz null,
  add constraint corralio_provisional_venues_merged_target_fk
    foreign key (merged_into_provisional_id)
    references public.corralio_provisional_venues(id)
    on delete restrict,
  add constraint corralio_provisional_venues_lifecycle_check
    check (lifecycle_status in ('active', 'suppressed', 'merged', 'reconciled')),
  add constraint corralio_provisional_venues_no_self_merge_check
    check (merged_into_provisional_id is null or merged_into_provisional_id <> id);

update public.corralio_provisional_venues
set lifecycle_changed_at = coalesce(suppressed_at, updated_at)
where lifecycle_status = 'suppressed' and lifecycle_changed_at is null;

alter table public.corralio_provisional_venues
  add constraint corralio_provisional_venues_lifecycle_state_check
    check (
      (
        lifecycle_status = 'active'
        and suppressed_at is null
        and merged_into_provisional_id is null
        and canonical_venue_id is null
        and lifecycle_changed_at is null
      )
      or
      (
        lifecycle_status = 'suppressed'
        and suppressed_at is not null
        and merged_into_provisional_id is null
        and canonical_venue_id is null
        and lifecycle_changed_at is not null
      )
      or
      (
        lifecycle_status = 'merged'
        and suppressed_at is null
        and merged_into_provisional_id is not null
        and canonical_venue_id is null
        and lifecycle_changed_at is not null
      )
      or
      (
        lifecycle_status = 'reconciled'
        and suppressed_at is null
        and merged_into_provisional_id is null
        and canonical_venue_id is not null
        and lifecycle_changed_at is not null
      )
    );

comment on column public.corralio_provisional_venues.canonical_venue_id is
  'Advisory existing-canonical redirect; no cross-domain FK by deliberate Corralio boundary.';

create index corralio_provisional_venues_merge_target_idx
  on public.corralio_provisional_venues (merged_into_provisional_id, id)
  where merged_into_provisional_id is not null;

create index corralio_provisional_venues_canonical_target_idx
  on public.corralio_provisional_venues (canonical_venue_id, id)
  where canonical_venue_id is not null;

-- Runtime writes now flow only through narrow audited functions.
revoke insert, update, delete on table public.corralio_provisional_venues from service_role;
grant select on table public.corralio_provisional_venues to service_role;

create table public.corralio_provisional_venue_evidence (
  id uuid primary key default gen_random_uuid(),
  provisional_venue_id uuid not null,
  evidence_type text not null,
  observation_fingerprint text not null,
  source_scope_fingerprint text not null,
  fingerprint_version text not null,
  normalizer_version text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint corralio_provisional_evidence_venue_fk
    foreign key (provisional_venue_id)
    references public.corralio_provisional_venues(id)
    on delete restrict,
  constraint corralio_provisional_evidence_type_check
    check (evidence_type = 'ics_observation'),
  constraint corralio_provisional_evidence_observation_check
    check (observation_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint corralio_provisional_evidence_source_scope_check
    check (source_scope_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint corralio_provisional_evidence_fingerprint_version_check
    check (fingerprint_version = 'corralio-evidence-hmac-v1'),
  constraint corralio_provisional_evidence_normalizer_version_check
    check (length(btrim(normalizer_version)) between 1 and 80),
  constraint corralio_provisional_evidence_observation_unique
    unique (provisional_venue_id, observation_fingerprint)
);

create index corralio_provisional_evidence_source_scope_idx
  on public.corralio_provisional_venue_evidence
  (provisional_venue_id, source_scope_fingerprint, id);

alter table public.corralio_provisional_venue_evidence enable row level security;
alter table public.corralio_provisional_venue_evidence force row level security;
alter table public.corralio_provisional_venue_evidence owner to postgres;
revoke all on table public.corralio_provisional_venue_evidence
  from public, anon, authenticated, service_role;
grant select on table public.corralio_provisional_venue_evidence to service_role;

comment on table public.corralio_provisional_venue_evidence is
  'Service-readable, function-written typed anonymized evidence. V1 supports ICS observations only and has no production strong-evidence writer.';
comment on column public.corralio_provisional_venue_evidence.source_scope_fingerprint is
  'Versioned keyed non-reversible scope retained as anonymized historical provenance; never a raw URL/source/household identifier.';

create table public.corralio_provisional_venue_transitions (
  id uuid primary key default gen_random_uuid(),
  provisional_venue_id uuid not null,
  transition_type text not null,
  from_state text not null,
  to_state text not null,
  target_provisional_venue_id uuid null,
  canonical_venue_id uuid null,
  reason_code text not null,
  operation_version text not null,
  actor_class text not null,
  transitioned_at timestamptz not null default now(),
  constraint corralio_provisional_transitions_venue_fk
    foreign key (provisional_venue_id)
    references public.corralio_provisional_venues(id)
    on delete restrict,
  constraint corralio_provisional_transitions_target_fk
    foreign key (target_provisional_venue_id)
    references public.corralio_provisional_venues(id)
    on delete restrict,
  constraint corralio_provisional_transitions_type_check
    check (transition_type in ('suppression', 'merge', 'reconciliation')),
  constraint corralio_provisional_transitions_actor_check
    check (actor_class in ('system', 'trusted_operation')),
  constraint corralio_provisional_transitions_version_check
    check (operation_version = 'corralio-provisional-lifecycle-v1'),
  constraint corralio_provisional_transitions_state_check
    check (
      from_state = 'active'
      and (
        (
          transition_type = 'suppression'
          and to_state = 'suppressed'
          and target_provisional_venue_id is null
          and canonical_venue_id is null
          and reason_code in ('trusted_suppression', 'privacy_or_quality')
        )
        or
        (
          transition_type = 'merge'
          and to_state = 'merged'
          and target_provisional_venue_id is not null
          and target_provisional_venue_id <> provisional_venue_id
          and canonical_venue_id is null
          and reason_code in ('exact_duplicate', 'normalized_address_duplicate', 'trusted_manual_duplicate')
        )
        or
        (
          transition_type = 'reconciliation'
          and to_state = 'reconciled'
          and target_provisional_venue_id is null
          and canonical_venue_id is not null
          and reason_code = 'canonical_match'
        )
      )
    )
);

create index corralio_provisional_transitions_venue_time_idx
  on public.corralio_provisional_venue_transitions
  (provisional_venue_id, transitioned_at, id);

alter table public.corralio_provisional_venue_transitions enable row level security;
alter table public.corralio_provisional_venue_transitions force row level security;
alter table public.corralio_provisional_venue_transitions owner to postgres;
revoke all on table public.corralio_provisional_venue_transitions
  from public, anon, authenticated, service_role;
grant select on table public.corralio_provisional_venue_transitions to service_role;

comment on table public.corralio_provisional_venue_transitions is
  'Append-only typed lifecycle history; mutations occur atomically inside narrow postgres-owned functions.';

-- The pre-4.4C functions cannot write evidence or lifecycle history. Remove
-- them rather than leave a generic unaudited mutation path available.
drop function public.corralio_create_or_reuse_provisional_venue_v1(
  uuid, uuid, text, text, text, text, text, text,
  double precision, double precision, text
);
drop function public.corralio_suppress_provisional_venue_v1(uuid);

create function public.corralio_create_or_reuse_provisional_venue_v2(
  p_household_id uuid,
  p_event_id uuid,
  p_identity_key text,
  p_place_name text,
  p_normalized_place_name text,
  p_normalized_address text,
  p_city text,
  p_state text,
  p_latitude double precision,
  p_longitude double precision,
  p_normalizer_version text,
  p_observation_fingerprint text,
  p_source_scope_fingerprint text,
  p_fingerprint_version text
)
returns table(outcome text, provisional_venue_id uuid, canonical_venue_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_event public.corralio_events%rowtype;
  v_match public.corralio_event_venue_matches%rowtype;
  v_existing public.corralio_provisional_venues%rowtype;
  v_target public.corralio_provisional_venues%rowtype;
  v_candidate_count integer := 0;
  v_canonical_count integer := 0;
  v_canonical_id uuid := null;
  v_now timestamptz := statement_timestamp();
begin
  if p_household_id is null
     or p_event_id is null
     or p_identity_key is null
     or p_place_name is null
     or p_normalized_place_name is null
     or p_city is null
     or p_state is null
     or p_latitude is null
     or p_longitude is null
     or p_normalizer_version is null
     or p_observation_fingerprint is null
     or p_source_scope_fingerprint is null
     or p_fingerprint_version is null
     or p_identity_key !~ '^[0-9a-f]{64}$'
     or p_observation_fingerprint !~ '^[0-9a-f]{64}$'
     or p_source_scope_fingerprint !~ '^[0-9a-f]{64}$'
     or p_fingerprint_version <> 'corralio-evidence-hmac-v1'
     or length(btrim(p_place_name)) not between 2 and 160
     or length(p_normalized_place_name) not between 2 and 200
     or (p_normalized_address is not null and length(p_normalized_address) not between 3 and 240)
     or length(btrim(p_city)) not between 1 and 100
     or p_state !~ '^[A-Z]{2}$'
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180
     or length(btrim(p_normalizer_version)) not between 1 and 80 then
    return query select 'invalid'::text, null::uuid, null::uuid;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_normalized_place_name || chr(31) || p_city || chr(31) || p_state,
    0
  ));

  select * into v_event
  from public.corralio_events
  where id = p_event_id and household_id = p_household_id
  for update;

  if not found
     or v_event.origin_type <> 'ics'
     or v_event.schedule_source_id is null
     or v_event.source_event_uid is null
     or v_event.location_geocoded_at is null
     or v_event.location_lat is distinct from p_latitude
     or v_event.location_lng is distinct from p_longitude then
    return query select 'ineligible'::text, null::uuid, null::uuid;
    return;
  end if;

  select * into v_match
  from public.corralio_event_venue_matches
  where event_id = p_event_id and household_id = p_household_id
  for update;

  if not found or v_match.match_status <> 'unmatched'
     or v_match.venue_id is not null or v_match.provisional_venue_id is not null then
    return query select 'ineligible'::text, null::uuid, null::uuid;
    return;
  end if;

  select count(*) into v_canonical_count
  from public.venues_public venue
  where public.identity_normalize_text(venue.city) = p_city
    and upper(btrim(venue.state)) = p_state
    and (
      public.identity_normalize_text(venue.name) = p_normalized_place_name
      or (
        p_normalized_address is not null
        and public.identity_normalize_text(venue.address) = p_normalized_address
      )
    );

  if v_canonical_count > 1 then
    return query select 'ambiguous'::text, null::uuid, null::uuid;
    return;
  elsif v_canonical_count = 1 then
    select venue.id into v_canonical_id
    from public.venues_public venue
    where public.identity_normalize_text(venue.city) = p_city
      and upper(btrim(venue.state)) = p_state
      and (
        public.identity_normalize_text(venue.name) = p_normalized_place_name
        or (
          p_normalized_address is not null
          and public.identity_normalize_text(venue.address) = p_normalized_address
        )
      )
    order by venue.id
    limit 1;

    update public.corralio_event_venue_matches
    set venue_id = v_canonical_id,
        provisional_venue_id = null,
        match_status = 'matched',
        evaluated_at = v_now,
        matched_at = v_now,
        recheck_after = null
    where event_id = p_event_id and household_id = p_household_id;

    return query select 'canonical'::text, null::uuid, v_canonical_id;
    return;
  end if;

  select * into v_existing
  from public.corralio_provisional_venues
  where identity_key = p_identity_key
  for update;

  if found and v_existing.lifecycle_status = 'suppressed' then
    return query select 'suppressed'::text, null::uuid, null::uuid;
    return;
  elsif found and v_existing.lifecycle_status = 'reconciled' then
    if not exists (select 1 from public.venues_public where id = v_existing.canonical_venue_id) then
      return query select 'canonical_missing'::text, null::uuid, null::uuid;
      return;
    end if;
    insert into public.corralio_provisional_venue_evidence (
      provisional_venue_id, evidence_type, observation_fingerprint,
      source_scope_fingerprint, fingerprint_version, normalizer_version,
      observed_at
    ) values (
      v_existing.id, 'ics_observation', p_observation_fingerprint,
      p_source_scope_fingerprint, p_fingerprint_version,
      btrim(p_normalizer_version), v_now
    ) on conflict (provisional_venue_id, observation_fingerprint) do nothing;
    update public.corralio_event_venue_matches
    set venue_id = v_existing.canonical_venue_id,
        provisional_venue_id = null,
        match_status = 'matched', evaluated_at = v_now,
        matched_at = v_now, recheck_after = null
    where event_id = p_event_id and household_id = p_household_id;
    return query select 'reconciled_canonical'::text, null::uuid, v_existing.canonical_venue_id;
    return;
  elsif found and v_existing.lifecycle_status = 'merged' then
    select * into v_target
    from public.corralio_provisional_venues
    where id = v_existing.merged_into_provisional_id
    for update;
    if not found or v_target.lifecycle_status <> 'active' then
      return query select 'redirect_invalid'::text, null::uuid, null::uuid;
      return;
    end if;
    v_existing := v_target;
    outcome := 'redirected_provisional';
  end if;

  if v_existing.id is null then
    select count(*) into v_candidate_count
    from public.corralio_provisional_venues candidate
    where candidate.lifecycle_status = 'active'
      and candidate.normalized_place_name = p_normalized_place_name
      and candidate.state = p_state
      and candidate.city = p_city
      and (
        candidate.normalized_address = p_normalized_address
        or candidate.normalized_address is null
        or p_normalized_address is null
      );

    if v_candidate_count > 1 then
      return query select 'ambiguous'::text, null::uuid, null::uuid;
      return;
    elsif v_candidate_count = 1 then
      select candidate.* into v_existing
      from public.corralio_provisional_venues candidate
      where candidate.lifecycle_status = 'active'
        and candidate.normalized_place_name = p_normalized_place_name
        and candidate.state = p_state
        and candidate.city = p_city
        and (
          candidate.normalized_address = p_normalized_address
          or candidate.normalized_address is null
          or p_normalized_address is null
        )
      order by candidate.id
      limit 1
      for update;
    end if;
  end if;

  if v_existing.id is null then
    insert into public.corralio_provisional_venues (
      identity_key, place_name, normalized_place_name, normalized_address,
      city, state, latitude, longitude, normalizer_version
    ) values (
      p_identity_key, btrim(p_place_name), p_normalized_place_name,
      p_normalized_address, btrim(p_city), p_state, p_latitude, p_longitude,
      btrim(p_normalizer_version)
    ) returning * into v_existing;
    outcome := 'created';
  elsif outcome is null then
    outcome := 'reused';
  end if;

  insert into public.corralio_provisional_venue_evidence (
    provisional_venue_id, evidence_type, observation_fingerprint,
    source_scope_fingerprint, fingerprint_version, normalizer_version,
    observed_at
  ) values (
    v_existing.id, 'ics_observation', p_observation_fingerprint,
    p_source_scope_fingerprint, p_fingerprint_version,
    btrim(p_normalizer_version), v_now
  ) on conflict (provisional_venue_id, observation_fingerprint) do nothing;

  update public.corralio_event_venue_matches
  set venue_id = null,
      provisional_venue_id = v_existing.id,
      match_status = 'provisional',
      evaluated_at = v_now,
      matched_at = v_now,
      recheck_after = v_now + interval '30 days'
  where event_id = p_event_id and household_id = p_household_id;

  provisional_venue_id := v_existing.id;
  canonical_venue_id := null;
  return next;
end;
$function$;

revoke all on function public.corralio_create_or_reuse_provisional_venue_v2(
  uuid, uuid, text, text, text, text, text, text,
  double precision, double precision, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.corralio_create_or_reuse_provisional_venue_v2(
  uuid, uuid, text, text, text, text, text, text,
  double precision, double precision, text, text, text, text
) to service_role;
alter function public.corralio_create_or_reuse_provisional_venue_v2(
  uuid, uuid, text, text, text, text, text, text,
  double precision, double precision, text, text, text, text
) owner to postgres;

create function public.corralio_suppress_provisional_venue_v2(
  p_provisional_venue_id uuid,
  p_reason_code text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_row public.corralio_provisional_venues%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if p_provisional_venue_id is null
     or p_reason_code is null
     or p_reason_code not in ('trusted_suppression', 'privacy_or_quality') then
    return false;
  end if;
  select * into v_row from public.corralio_provisional_venues
  where id = p_provisional_venue_id;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_row.normalized_place_name || chr(31) || v_row.city || chr(31) || v_row.state, 0
  ));
  select * into v_row from public.corralio_provisional_venues
  where id = p_provisional_venue_id for update;
  if not found then return false; end if;
  if v_row.lifecycle_status = 'suppressed' then return true; end if;
  if v_row.lifecycle_status <> 'active' then return false; end if;

  update public.corralio_event_venue_matches
  set provisional_venue_id = null, match_status = 'unmatched',
      evaluated_at = v_now, matched_at = null,
      recheck_after = v_now + interval '30 days'
  where provisional_venue_id = p_provisional_venue_id;

  update public.corralio_provisional_venues
  set lifecycle_status = 'suppressed', suppressed_at = v_now,
      lifecycle_changed_at = v_now, updated_at = v_now
  where id = p_provisional_venue_id;

  insert into public.corralio_provisional_venue_transitions (
    provisional_venue_id, transition_type, from_state, to_state,
    reason_code, operation_version, actor_class, transitioned_at
  ) values (
    p_provisional_venue_id, 'suppression', 'active', 'suppressed',
    p_reason_code, 'corralio-provisional-lifecycle-v1',
    'trusted_operation', v_now
  );
  return true;
end;
$function$;

revoke all on function public.corralio_suppress_provisional_venue_v2(uuid, text)
  from public, anon, authenticated;
grant execute on function public.corralio_suppress_provisional_venue_v2(uuid, text)
  to service_role;
alter function public.corralio_suppress_provisional_venue_v2(uuid, text)
  owner to postgres;

create function public.corralio_merge_provisional_venue_internal_v1(
  p_source_id uuid,
  p_target_id uuid,
  p_mode text,
  p_reason_code text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_source public.corralio_provisional_venues%rowtype;
  v_target public.corralio_provisional_venues%rowtype;
  v_final public.corralio_provisional_venues%rowtype;
  v_now timestamptz := statement_timestamp();
  v_lock text;
begin
  if p_source_id is null or p_target_id is null or p_source_id = p_target_id then return false; end if;

  for v_lock in
    select lock_value from (values (p_source_id::text), (p_target_id::text)) locks(lock_value)
    order by lock_value
  loop
    perform pg_advisory_xact_lock(hashtextextended('corralio-provisional-row:' || v_lock, 0));
  end loop;

  select * into v_source from public.corralio_provisional_venues
  where id = p_source_id;
  select * into v_target from public.corralio_provisional_venues
  where id = p_target_id;
  if v_source.id is null or v_target.id is null then return false; end if;

  for v_lock in
    select lock_value from (values
      (v_source.normalized_place_name || chr(31) || v_source.city || chr(31) || v_source.state),
      (v_target.normalized_place_name || chr(31) || v_target.city || chr(31) || v_target.state)
    ) locks(lock_value)
    order by lock_value
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_lock, 0));
  end loop;

  select * into v_source from public.corralio_provisional_venues
  where id = p_source_id for update;
  select * into v_target from public.corralio_provisional_venues
  where id = p_target_id for update;

  if v_target.lifecycle_status = 'merged' then
    select * into v_final from public.corralio_provisional_venues
    where id = v_target.merged_into_provisional_id for update;
    if not found or v_final.lifecycle_status <> 'active' then return false; end if;
    perform pg_advisory_xact_lock(hashtextextended(
      v_final.normalized_place_name || chr(31) || v_final.city || chr(31) || v_final.state, 0
    ));
    v_target := v_final;
  end if;

  if v_source.lifecycle_status = 'merged' then
    return v_source.merged_into_provisional_id = v_target.id;
  end if;
  if v_source.lifecycle_status <> 'active' or v_target.lifecycle_status <> 'active'
     or v_source.id = v_target.id then return false; end if;

  if p_mode = 'exact' then
    if p_reason_code <> 'exact_duplicate'
       or v_source.normalized_place_name <> v_target.normalized_place_name
       or v_source.city <> v_target.city
       or v_source.state <> v_target.state
       or v_source.normalized_address is null
       or v_target.normalized_address is null
       or v_source.normalized_address <> v_target.normalized_address then
      return false;
    end if;
  elsif p_mode = 'trusted' then
    if p_reason_code <> 'trusted_manual_duplicate' then return false; end if;
  else
    return false;
  end if;

  update public.corralio_event_venue_matches
  set provisional_venue_id = v_target.id, venue_id = null,
      match_status = 'provisional', evaluated_at = v_now,
      matched_at = v_now, recheck_after = v_now + interval '30 days'
  where provisional_venue_id = v_source.id;

  -- Keep every older redirect one hop from the final active survivor. Original
  -- transition rows remain immutable and preserve how each merge occurred.
  update public.corralio_provisional_venues
  set merged_into_provisional_id = v_target.id, updated_at = v_now
  where lifecycle_status = 'merged'
    and merged_into_provisional_id = v_source.id;

  update public.corralio_provisional_venues
  set lifecycle_status = 'merged', merged_into_provisional_id = v_target.id,
      lifecycle_changed_at = v_now, updated_at = v_now
  where id = v_source.id;

  insert into public.corralio_provisional_venue_transitions (
    provisional_venue_id, transition_type, from_state, to_state,
    target_provisional_venue_id, reason_code, operation_version,
    actor_class, transitioned_at
  ) values (
    v_source.id, 'merge', 'active', 'merged', v_target.id,
    p_reason_code, 'corralio-provisional-lifecycle-v1',
    case when p_mode = 'exact' then 'system' else 'trusted_operation' end,
    v_now
  );
  return true;
end;
$function$;

revoke all on function public.corralio_merge_provisional_venue_internal_v1(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
alter function public.corralio_merge_provisional_venue_internal_v1(uuid, uuid, text, text)
  owner to postgres;

create function public.corralio_merge_provisional_venue_exact_v1(
  p_source_id uuid,
  p_target_id uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $function$
  select public.corralio_merge_provisional_venue_internal_v1(
    p_source_id, p_target_id, 'exact', 'exact_duplicate'
  );
$function$;

revoke all on function public.corralio_merge_provisional_venue_exact_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.corralio_merge_provisional_venue_exact_v1(uuid, uuid)
  to service_role;
alter function public.corralio_merge_provisional_venue_exact_v1(uuid, uuid)
  owner to postgres;

create function public.corralio_merge_provisional_venue_trusted_v1(
  p_source_id uuid,
  p_target_id uuid,
  p_reason_code text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $function$
  select case
    when p_reason_code = 'trusted_manual_duplicate'
      then public.corralio_merge_provisional_venue_internal_v1(
        p_source_id, p_target_id, 'trusted', p_reason_code
      )
    else false
  end;
$function$;

revoke all on function public.corralio_merge_provisional_venue_trusted_v1(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.corralio_merge_provisional_venue_trusted_v1(uuid, uuid, text)
  to service_role;
alter function public.corralio_merge_provisional_venue_trusted_v1(uuid, uuid, text)
  owner to postgres;

create function public.corralio_reconcile_provisional_venue_v1(
  p_provisional_venue_id uuid,
  p_canonical_venue_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_row public.corralio_provisional_venues%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if p_provisional_venue_id is null or p_canonical_venue_id is null then return false; end if;
  select * into v_row from public.corralio_provisional_venues
  where id = p_provisional_venue_id;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_row.normalized_place_name || chr(31) || v_row.city || chr(31) || v_row.state, 0
  ));
  select * into v_row from public.corralio_provisional_venues
  where id = p_provisional_venue_id for update;
  if not found then return false; end if;

  if v_row.lifecycle_status = 'reconciled' then
    return v_row.canonical_venue_id = p_canonical_venue_id;
  end if;
  if v_row.lifecycle_status <> 'active' then return false; end if;

  if not exists (
    select 1 from public.venues_public venue
    where venue.id = p_canonical_venue_id
      and public.identity_normalize_text(venue.city) = v_row.city
      and upper(btrim(venue.state)) = v_row.state
      and (
        public.identity_normalize_text(venue.name) = v_row.normalized_place_name
        or (
          v_row.normalized_address is not null
          and public.identity_normalize_text(venue.address) = v_row.normalized_address
        )
      )
  ) then return false; end if;

  update public.corralio_event_venue_matches
  set venue_id = p_canonical_venue_id, provisional_venue_id = null,
      match_status = 'matched', evaluated_at = v_now,
      matched_at = v_now, recheck_after = null
  where provisional_venue_id = p_provisional_venue_id;

  update public.corralio_provisional_venues
  set lifecycle_status = 'reconciled', canonical_venue_id = p_canonical_venue_id,
      lifecycle_changed_at = v_now, updated_at = v_now
  where id = p_provisional_venue_id;

  insert into public.corralio_provisional_venue_transitions (
    provisional_venue_id, transition_type, from_state, to_state,
    canonical_venue_id, reason_code, operation_version,
    actor_class, transitioned_at
  ) values (
    p_provisional_venue_id, 'reconciliation', 'active', 'reconciled',
    p_canonical_venue_id, 'canonical_match',
    'corralio-provisional-lifecycle-v1', 'system', v_now
  );
  return true;
end;
$function$;

revoke all on function public.corralio_reconcile_provisional_venue_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.corralio_reconcile_provisional_venue_v1(uuid, uuid)
  to service_role;
alter function public.corralio_reconcile_provisional_venue_v1(uuid, uuid)
  owner to postgres;

create function public.corralio_provisional_venue_promotion_eligible_v1(
  p_provisional_venue_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select coalesce((
    select provisional.lifecycle_status = 'active'
      and not exists (
        select 1 from public.corralio_provisional_venues duplicate
        where duplicate.id <> provisional.id
          and duplicate.lifecycle_status = 'active'
          and duplicate.normalized_place_name = provisional.normalized_place_name
          and duplicate.city = provisional.city
          and duplicate.state = provisional.state
      )
      and exists (
        -- No production evidence row can currently satisfy this branch. A
        -- future audited migration may add a recognized strong type and writer.
        select 1 from public.corralio_provisional_venue_evidence evidence
        where evidence.provisional_venue_id = provisional.id
          and evidence.evidence_type in (
            'overture_place_match',
            'trusted_ti_ri_verification'
          )
      )
    from public.corralio_provisional_venues provisional
    where provisional.id = p_provisional_venue_id
  ), false);
$function$;

revoke all on function public.corralio_provisional_venue_promotion_eligible_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.corralio_provisional_venue_promotion_eligible_v1(uuid)
  to service_role;
alter function public.corralio_provisional_venue_promotion_eligible_v1(uuid)
  owner to postgres;

comment on function public.corralio_provisional_venue_promotion_eligible_v1(uuid) is
  'Derived eligibility rule corralio-promotion-eligibility-v1. With ICS-only production evidence, the correct result is false.';
