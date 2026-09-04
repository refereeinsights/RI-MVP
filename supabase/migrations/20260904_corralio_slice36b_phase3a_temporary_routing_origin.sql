-- Corralio Slice 3.6B Phase 3A: private per-event temporary routing origins.
-- Prepared only. A human must apply this migration before database verification.

create table public.corralio_event_routing_origins (
  household_id uuid not null,
  event_id uuid not null,
  origin_kind text not null default 'alternate_address',
  origin_address text not null,
  origin_lat double precision null,
  origin_lng double precision null,
  origin_geocoded_at timestamptz null,
  origin_geocode_failed_at timestamptz null,
  origin_geocode_claimed_at timestamptz null,
  estimated_drive_minutes integer null,
  route_distance_meters integer null,
  route_provider text null,
  route_computed_at timestamptz null,
  route_failed_at timestamptz null,
  route_claimed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, event_id),
  constraint corralio_event_routing_origins_event_fk
    foreign key (household_id, event_id)
    references public.corralio_events(household_id, id) on delete cascade,
  constraint corralio_event_routing_origins_kind_check
    check (origin_kind = 'alternate_address'),
  constraint corralio_event_routing_origins_address_check
    check (length(btrim(origin_address)) between 1 and 100),
  constraint corralio_event_routing_origins_lat_check
    check (origin_lat is null or origin_lat between -90 and 90),
  constraint corralio_event_routing_origins_lng_check
    check (origin_lng is null or origin_lng between -180 and 180),
  constraint corralio_event_routing_origins_coordinate_pair_check
    check ((origin_lat is null) = (origin_lng is null)),
  constraint corralio_event_routing_origins_geocode_state_check
    check (
      (origin_geocoded_at is null or (origin_lat is not null and origin_lng is not null))
      and (origin_geocode_failed_at is null or (origin_lat is null and origin_lng is null and origin_geocoded_at is null))
      and (origin_geocoded_at is null or origin_geocode_failed_at is null)
    ),
  constraint corralio_event_routing_origins_drive_check
    check (estimated_drive_minutes is null or estimated_drive_minutes between 1 and 720),
  constraint corralio_event_routing_origins_distance_check
    check (route_distance_meters is null or route_distance_meters > 0),
  constraint corralio_event_routing_origins_provider_check
    check (route_provider is null or route_provider = 'openrouteservice'),
  constraint corralio_event_routing_origins_route_success_check
    check (num_nonnulls(estimated_drive_minutes, route_distance_meters, route_provider, route_computed_at) in (0, 4)),
  constraint corralio_event_routing_origins_route_failure_check
    check (
      route_failed_at is null
      or (estimated_drive_minutes is null and route_distance_meters is null and route_provider is null and route_computed_at is null)
    )
);

comment on table public.corralio_event_routing_origins is
  'Private typed alternate address and route duration for one household event; never venue evidence. Current-location coordinates/results are forbidden here.';
comment on column public.corralio_event_routing_origins.origin_address is
  'Private event-scoped routing input. Inactive after current event end/start plus 24 hours and deleted by bounded cleanup.';

create table public.corralio_current_location_route_claims (
  household_id uuid not null,
  event_id uuid not null,
  claim_token uuid not null,
  claimed_at timestamptz not null default statement_timestamp(),
  primary key (household_id, event_id),
  unique (claim_token),
  constraint corralio_current_location_route_claims_event_fk
    foreign key (household_id, event_id)
    references public.corralio_events(household_id, id) on delete cascade
);

comment on table public.corralio_current_location_route_claims is
  'Short-lived payload-free claim preventing concurrent current-location routing. Contains no coordinates or route result.';

create trigger corralio_event_routing_origins_set_updated_at
  before update on public.corralio_event_routing_origins
  for each row execute function public.corralio_set_updated_at_v1();

alter table public.corralio_event_routing_origins enable row level security;
alter table public.corralio_event_routing_origins force row level security;
alter table public.corralio_current_location_route_claims enable row level security;
alter table public.corralio_current_location_route_claims force row level security;

create policy corralio_event_routing_origins_select_owner
  on public.corralio_event_routing_origins for select to authenticated
  using (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_event_routing_origins.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner'
        and member.status = 'active'
    )
  );

revoke all on table public.corralio_event_routing_origins from public, anon, authenticated;
revoke all on table public.corralio_current_location_route_claims from public, anon, authenticated;
grant select on table public.corralio_event_routing_origins to authenticated;
grant select, insert, update, delete on table public.corralio_event_routing_origins to service_role;
grant select, insert, update, delete on table public.corralio_current_location_route_claims to service_role;

create function public.corralio_prepare_event_routing_origin_v1(
  p_event_id uuid,
  p_origin_address text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_address text := nullif(regexp_replace(btrim(p_origin_address), '\s+', ' ', 'g'), '');
  v_existing_address text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_event_id is null or v_address is null or length(v_address) > 100 then
    raise exception 'Valid event and origin address are required' using errcode = '22023';
  end if;

  select event.household_id into v_household_id
  from public.corralio_events event
  join public.corralio_household_members member
    on member.household_id = event.household_id
   and member.user_id = v_user_id
   and member.role = 'owner'
   and member.status = 'active'
  where event.id = p_event_id
    and coalesce(event.ends_at, event.starts_at) + interval '24 hours' > statement_timestamp()
  for update of event;

  if v_household_id is null then
    raise exception 'Event access denied' using errcode = '42501';
  end if;

  select origin.origin_address into v_existing_address
  from public.corralio_event_routing_origins origin
  where origin.household_id = v_household_id and origin.event_id = p_event_id
  for update;

  if found and v_existing_address = v_address then
    return v_household_id;
  end if;

  insert into public.corralio_event_routing_origins (
    household_id, event_id, origin_address
  ) values (
    v_household_id, p_event_id, v_address
  )
  on conflict (household_id, event_id) do update set
    origin_address = excluded.origin_address,
    origin_lat = null,
    origin_lng = null,
    origin_geocoded_at = null,
    origin_geocode_failed_at = null,
    origin_geocode_claimed_at = null,
    estimated_drive_minutes = null,
    route_distance_meters = null,
    route_provider = null,
    route_computed_at = null,
    route_failed_at = null,
    route_claimed_at = null;

  return v_household_id;
end;
$function$;

create function public.corralio_clear_event_routing_origin_v1(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  delete from public.corralio_event_routing_origins origin
  using public.corralio_household_members member
  where origin.event_id = p_event_id
    and member.household_id = origin.household_id
    and member.user_id = v_user_id
    and member.role = 'owner'
    and member.status = 'active';
  return found;
end;
$function$;

create function public.corralio_claim_current_location_route_v1(
  p_household_id uuid,
  p_event_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_claim_token uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted routing access is required' using errcode = '42501';
  end if;
  if p_household_id is null or p_event_id is null or p_claim_token is null then
    raise exception 'Routing claim context is required' using errcode = '22023';
  end if;

  insert into public.corralio_current_location_route_claims (
    household_id, event_id, claim_token, claimed_at
  ) values (
    p_household_id, p_event_id, p_claim_token, statement_timestamp()
  )
  on conflict (household_id, event_id) do update set
    claim_token = excluded.claim_token,
    claimed_at = statement_timestamp()
  where corralio_current_location_route_claims.claimed_at < statement_timestamp() - interval '2 minutes'
  returning claim_token into v_claim_token;

  return v_claim_token = p_claim_token;
end;
$function$;

create function public.corralio_release_current_location_route_v1(
  p_household_id uuid,
  p_event_id uuid,
  p_claim_token uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted routing access is required' using errcode = '42501';
  end if;
  delete from public.corralio_current_location_route_claims
  where household_id = p_household_id and event_id = p_event_id and claim_token = p_claim_token;
end;
$function$;

create function public.corralio_cleanup_event_routing_origins_v1(p_limit integer default 200)
returns table(overrides_deleted integer, claims_deleted integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_overrides integer := 0;
  v_claims integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted cleanup access is required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Cleanup limit must be between 1 and 500' using errcode = '22023';
  end if;

  with expired as (
    select origin.household_id, origin.event_id
    from public.corralio_event_routing_origins origin
    join public.corralio_events event
      on event.household_id = origin.household_id and event.id = origin.event_id
    where coalesce(event.ends_at, event.starts_at) + interval '24 hours' <= statement_timestamp()
    order by coalesce(event.ends_at, event.starts_at), origin.household_id, origin.event_id
    limit p_limit
    for update of origin skip locked
  )
  delete from public.corralio_event_routing_origins origin
  using expired
  where origin.household_id = expired.household_id and origin.event_id = expired.event_id;
  get diagnostics v_overrides = row_count;

  with stale as (
    select claim.household_id, claim.event_id
    from public.corralio_current_location_route_claims claim
    where claim.claimed_at < statement_timestamp() - interval '10 minutes'
    order by claim.claimed_at, claim.household_id, claim.event_id
    limit p_limit
    for update of claim skip locked
  )
  delete from public.corralio_current_location_route_claims claim
  using stale
  where claim.household_id = stale.household_id and claim.event_id = stale.event_id;
  get diagnostics v_claims = row_count;

  return query select v_overrides, v_claims;
end;
$function$;

revoke all on function public.corralio_prepare_event_routing_origin_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.corralio_prepare_event_routing_origin_v1(uuid, text) to authenticated, service_role;
revoke all on function public.corralio_clear_event_routing_origin_v1(uuid) from public, anon, authenticated;
grant execute on function public.corralio_clear_event_routing_origin_v1(uuid) to authenticated, service_role;
revoke all on function public.corralio_claim_current_location_route_v1(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.corralio_claim_current_location_route_v1(uuid, uuid, uuid) to service_role;
revoke all on function public.corralio_release_current_location_route_v1(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.corralio_release_current_location_route_v1(uuid, uuid, uuid) to service_role;
revoke all on function public.corralio_cleanup_event_routing_origins_v1(integer) from public, anon, authenticated;
grant execute on function public.corralio_cleanup_event_routing_origins_v1(integer) to service_role;

alter function public.corralio_prepare_event_routing_origin_v1(uuid, text) owner to postgres;
alter function public.corralio_clear_event_routing_origin_v1(uuid) owner to postgres;
alter function public.corralio_claim_current_location_route_v1(uuid, uuid, uuid) owner to postgres;
alter function public.corralio_release_current_location_route_v1(uuid, uuid, uuid) owner to postgres;
alter function public.corralio_cleanup_event_routing_origins_v1(integer) owner to postgres;
