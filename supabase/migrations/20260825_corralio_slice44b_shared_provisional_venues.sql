-- Corralio Slice 4.4B Stage 1: structurally isolated shared provisional venues.
-- Prepared on 2026-08-25. A human must apply this migration before Stage 2.
-- It performs no historical sweep and does not alter public.venues.

create table public.corralio_provisional_venues (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique,
  place_name text not null,
  normalized_place_name text not null,
  normalized_address text null,
  city text not null,
  state text not null,
  latitude double precision not null,
  longitude double precision not null,
  lifecycle_status text not null default 'active',
  discovery_method text not null default 'ics_event_geocode',
  geocode_provider text not null default 'geocodio',
  normalizer_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  suppressed_at timestamptz null,
  constraint corralio_provisional_venues_identity_key_check
    check (identity_key ~ '^[0-9a-f]{64}$'),
  constraint corralio_provisional_venues_place_name_check
    check (length(btrim(place_name)) between 2 and 160),
  constraint corralio_provisional_venues_normalized_name_check
    check (length(normalized_place_name) between 2 and 200),
  constraint corralio_provisional_venues_address_check
    check (normalized_address is null or length(normalized_address) between 3 and 240),
  constraint corralio_provisional_venues_city_check
    check (length(btrim(city)) between 1 and 100),
  constraint corralio_provisional_venues_state_check
    check (state ~ '^[A-Z]{2}$'),
  constraint corralio_provisional_venues_coordinate_check
    check (latitude between -90 and 90 and longitude between -180 and 180),
  constraint corralio_provisional_venues_lifecycle_check
    check (lifecycle_status in ('active', 'suppressed')),
  constraint corralio_provisional_venues_provenance_check
    check (discovery_method = 'ics_event_geocode' and geocode_provider = 'geocodio'),
  constraint corralio_provisional_venues_version_check
    check (length(btrim(normalizer_version)) between 1 and 80),
  constraint corralio_provisional_venues_suppression_check
    check ((lifecycle_status = 'suppressed') = (suppressed_at is not null))
);

create index corralio_provisional_venues_name_locality_idx
  on public.corralio_provisional_venues
  (normalized_place_name, state, city, lifecycle_status, id);

create index corralio_provisional_venues_coordinates_idx
  on public.corralio_provisional_venues (latitude, longitude, id)
  where lifecycle_status = 'active';

alter table public.corralio_provisional_venues enable row level security;
alter table public.corralio_provisional_venues force row level security;
alter table public.corralio_provisional_venues owner to postgres;
revoke all on table public.corralio_provisional_venues
  from public, anon, authenticated;
grant select, insert, update on table public.corralio_provisional_venues
  to service_role;

comment on table public.corralio_provisional_venues is
  'Service-only shared preliminary place identities; structurally excluded from canonical/public venue surfaces.';
comment on column public.corralio_provisional_venues.identity_key is
  'Versioned SHA-256 of normalized place identity; retained as the durable suppression tombstone key.';
comment on column public.corralio_provisional_venues.place_name is
  'Conservatively parsed bounded place name, never the complete event location string.';

alter table public.corralio_event_venue_matches
  drop constraint corralio_event_venue_matches_status_check,
  drop constraint corralio_event_venue_matches_state_check,
  add column provisional_venue_id uuid null,
  add constraint corralio_event_venue_matches_provisional_fk
    foreign key (provisional_venue_id)
    references public.corralio_provisional_venues(id)
    on delete restrict,
  add constraint corralio_event_venue_matches_status_check
    check (match_status in ('matched', 'provisional', 'unmatched', 'private_skipped', 'insufficient_location')),
  add constraint corralio_event_venue_matches_state_check
    check (
      (
        match_status = 'matched'
        and venue_id is not null
        and provisional_venue_id is null
        and matched_at is not null
        and recheck_after is null
      )
      or
      (
        match_status = 'provisional'
        and venue_id is null
        and provisional_venue_id is not null
        and matched_at is not null
        and recheck_after is not null
        and recheck_after > evaluated_at
      )
      or
      (
        match_status = 'unmatched'
        and venue_id is null
        and provisional_venue_id is null
        and matched_at is null
        and recheck_after is not null
        and recheck_after > evaluated_at
      )
      or
      (
        match_status in ('private_skipped', 'insufficient_location')
        and venue_id is null
        and provisional_venue_id is null
        and matched_at is null
        and recheck_after is null
      )
    );

create index corralio_event_venue_matches_provisional_idx
  on public.corralio_event_venue_matches (provisional_venue_id, event_id)
  where provisional_venue_id is not null;

create function public.corralio_create_or_reuse_provisional_venue_v1(
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
  p_normalizer_version text
)
returns table(outcome text, provisional_venue_id uuid)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_event public.corralio_events%rowtype;
  v_match public.corralio_event_venue_matches%rowtype;
  v_existing public.corralio_provisional_venues%rowtype;
  v_candidate_count integer := 0;
  v_now timestamptz := statement_timestamp();
begin
  if p_identity_key !~ '^[0-9a-f]{64}$'
     or length(btrim(p_place_name)) not between 2 and 160
     or length(p_normalized_place_name) not between 2 and 200
     or (p_normalized_address is not null and length(p_normalized_address) not between 3 and 240)
     or length(btrim(p_city)) not between 1 and 100
     or p_state !~ '^[A-Z]{2}$'
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180
     or length(btrim(p_normalizer_version)) not between 1 and 80 then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  -- Serialize the broader name/locality scope so concurrent address-present
  -- and address-absent observations cannot create parallel identities.
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
     or v_event.location_geocoded_at is null
     or v_event.location_lat is distinct from p_latitude
     or v_event.location_lng is distinct from p_longitude then
    return query select 'ineligible'::text, null::uuid;
    return;
  end if;

  select * into v_match
  from public.corralio_event_venue_matches
  where event_id = p_event_id and household_id = p_household_id
  for update;

  if not found or v_match.match_status <> 'unmatched'
     or v_match.venue_id is not null or v_match.provisional_venue_id is not null then
    return query select 'ineligible'::text, null::uuid;
    return;
  end if;

  -- The application has just completed the full canonical matcher. Repeat a
  -- narrow exact-name/locality check inside this transaction so a concurrent
  -- canonical insert cannot be followed by provisional creation.
  if exists (
    select 1
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
  ) then
    return query select 'canonical_conflict'::text, null::uuid;
    return;
  end if;

  select * into v_existing
  from public.corralio_provisional_venues
  where identity_key = p_identity_key
  for update;

  if found and v_existing.lifecycle_status = 'suppressed' then
    return query select 'suppressed'::text, null::uuid;
    return;
  end if;

  if not found then
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
      )
    ;

    if v_candidate_count > 1 then
      return query select 'ambiguous'::text, null::uuid;
      return;
    end if;

    if v_candidate_count = 1 then
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
      limit 1;
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
    )
    returning * into v_existing;
    outcome := 'created';
  else
    outcome := 'reused';
  end if;

  update public.corralio_event_venue_matches
  set venue_id = null,
      provisional_venue_id = v_existing.id,
      match_status = 'provisional',
      evaluated_at = v_now,
      matched_at = v_now,
      recheck_after = v_now + interval '30 days'
  where event_id = p_event_id and household_id = p_household_id;

  provisional_venue_id := v_existing.id;
  return next;
end;
$function$;

revoke all on function public.corralio_create_or_reuse_provisional_venue_v1(
  uuid, uuid, text, text, text, text, text, text,
  double precision, double precision, text
) from public, anon, authenticated;
grant execute on function public.corralio_create_or_reuse_provisional_venue_v1(
  uuid, uuid, text, text, text, text, text, text,
  double precision, double precision, text
) to service_role;
alter function public.corralio_create_or_reuse_provisional_venue_v1(
  uuid, uuid, text, text, text, text, text, text,
  double precision, double precision, text
) owner to postgres;

create function public.corralio_suppress_provisional_venue_v1(p_provisional_venue_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_now timestamptz := statement_timestamp();
begin
  update public.corralio_provisional_venues
  set lifecycle_status = 'suppressed', suppressed_at = v_now, updated_at = v_now
  where id = p_provisional_venue_id and lifecycle_status = 'active';
  if not found then return false; end if;

  update public.corralio_event_venue_matches
  set provisional_venue_id = null,
      match_status = 'unmatched',
      evaluated_at = v_now,
      matched_at = null,
      recheck_after = v_now + interval '30 days'
  where provisional_venue_id = p_provisional_venue_id;
  return true;
end;
$function$;

revoke all on function public.corralio_suppress_provisional_venue_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.corralio_suppress_provisional_venue_v1(uuid)
  to service_role;
alter function public.corralio_suppress_provisional_venue_v1(uuid) owner to postgres;
