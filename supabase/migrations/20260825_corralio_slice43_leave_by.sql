-- Corralio Slice 4.3 Stage 1: household-origin geocoding and estimated leave-by.
-- Prepared on 2026-08-25. A human must apply this migration manually before
-- any Stage 2 verification. Do not run it from an application deploy.

alter table public.corralio_households
  add column origin_address text null,
  add column origin_lat double precision null,
  add column origin_lng double precision null,
  add column origin_geocoded_at timestamptz null,
  add column origin_geocode_failed_at timestamptz null,
  add column origin_geocode_claimed_at timestamptz null,
  add constraint corralio_households_origin_address_check
    check (origin_address is null or length(btrim(origin_address)) between 1 and 100),
  add constraint corralio_households_origin_lat_check
    check (origin_lat is null or origin_lat between -90 and 90),
  add constraint corralio_households_origin_lng_check
    check (origin_lng is null or origin_lng between -180 and 180),
  add constraint corralio_households_origin_coordinate_pair_check
    check ((origin_lat is null) = (origin_lng is null)),
  add constraint corralio_households_origin_state_check
    check (
      (origin_geocoded_at is null or (origin_lat is not null and origin_lng is not null))
      and (origin_geocode_failed_at is null or (origin_lat is null and origin_lng is null and origin_geocoded_at is null))
      and (origin_geocoded_at is null or origin_geocode_failed_at is null)
    );

comment on column public.corralio_households.origin_address is
  'Private household origin used only for that household leave-by calculations; never venue evidence.';
comment on column public.corralio_households.origin_geocode_claimed_at is
  'Short-lived server-only claim preventing duplicate origin geocoding calls.';

alter table public.corralio_events
  add column location_lat double precision null,
  add column location_lng double precision null,
  add column location_normalized text null,
  add column location_geocoded_at timestamptz null,
  add column location_geocode_failed_at timestamptz null,
  add column location_geocode_claimed_at timestamptz null,
  add column estimated_drive_minutes integer null,
  add column route_distance_meters integer null,
  add column route_provider text null,
  add column route_failed_at timestamptz null,
  add column route_claimed_at timestamptz null,
  add column leave_by_computed_at timestamptz null,
  add constraint corralio_events_location_lat_check
    check (location_lat is null or location_lat between -90 and 90),
  add constraint corralio_events_location_lng_check
    check (location_lng is null or location_lng between -180 and 180),
  add constraint corralio_events_location_coordinate_pair_check
    check ((location_lat is null) = (location_lng is null)),
  add constraint corralio_events_location_normalized_check
    check (location_normalized is null or length(location_normalized) between 1 and 1000),
  add constraint corralio_events_location_state_check
    check (
      (location_geocoded_at is null or (location_lat is not null and location_lng is not null))
      and (location_geocode_failed_at is null or (location_lat is null and location_lng is null and location_geocoded_at is null))
      and (location_geocoded_at is null or location_geocode_failed_at is null)
    ),
  add constraint corralio_events_drive_minutes_check
    check (estimated_drive_minutes is null or estimated_drive_minutes between 1 and 720),
  add constraint corralio_events_route_distance_check
    check (route_distance_meters is null or route_distance_meters > 0),
  add constraint corralio_events_route_provider_check
    check (route_provider is null or route_provider = 'openrouteservice'),
  add constraint corralio_events_route_success_state_check
    check (
      num_nonnulls(
        estimated_drive_minutes,
        route_distance_meters,
        route_provider,
        leave_by_computed_at
      ) in (0, 4)
    ),
  add constraint corralio_events_route_failure_state_check
    check (
      route_failed_at is null
      or (
        estimated_drive_minutes is null
        and route_distance_meters is null
        and route_provider is null
        and leave_by_computed_at is null
      )
    );

comment on column public.corralio_events.location_normalized is
  'Household-scoped normalized raw event location used for geocode and route reuse; not canonical venue evidence.';
comment on column public.corralio_events.route_failed_at is
  'Terminal no-route marker for the current origin/location pair; cleared whenever either endpoint changes.';

create index corralio_events_household_location_normalized_idx
  on public.corralio_events (household_id, location_normalized, id)
  where location_normalized is not null;

create table public.corralio_external_api_calls (
  id uuid primary key default gen_random_uuid(),
  called_at timestamptz not null default now(),
  household_id uuid null
    references public.corralio_households(id) on delete set null,
  api text not null,
  operation text not null,
  status text not null,
  error_code text null,
  retryable boolean null,
  billable boolean not null default true,
  latency_ms integer null,
  constraint corralio_external_api_calls_api_check
    check (api in ('geocodio', 'openrouteservice')),
  constraint corralio_external_api_calls_operation_check
    check (operation in ('geocode_origin', 'geocode_event', 'route_event')),
  constraint corralio_external_api_calls_status_check
    check (status in ('ok', 'error', 'skipped')),
  constraint corralio_external_api_calls_error_code_check
    check (
      error_code is null
      or error_code in (
        'no_results',
        'low_accuracy',
        'invalid_result',
        'rate_limited',
        'timeout',
        'provider_error',
        'no_route_found',
        'household_result_reused',
        'batch_duplicate_skipped',
        'concurrent_claim_skipped',
        'daily_cap_reached'
      )
    ),
  constraint corralio_external_api_calls_latency_check
    check (latency_ms is null or latency_ms >= 0),
  constraint corralio_external_api_calls_state_check
    check (
      (status = 'ok' and billable is true and retryable is null and error_code is null)
      or
      (
        status = 'error'
        and billable is true
        and retryable is not null
        and error_code in (
          'no_results',
          'low_accuracy',
          'invalid_result',
          'rate_limited',
          'timeout',
          'provider_error',
          'no_route_found'
        )
      )
      or
      (
        status = 'skipped'
        and billable is false
        and retryable is null
        and error_code in (
          'household_result_reused',
          'batch_duplicate_skipped',
          'concurrent_claim_skipped',
          'daily_cap_reached'
        )
      )
    )
);

create index corralio_external_api_calls_called_at_idx
  on public.corralio_external_api_calls (called_at desc);
create index corralio_external_api_calls_household_called_at_idx
  on public.corralio_external_api_calls (household_id, called_at desc)
  where household_id is not null;

create table public.corralio_external_call_daily_quota (
  household_id uuid not null
    references public.corralio_households(id) on delete cascade,
  quota_date date not null,
  reserved_count integer not null default 0,
  primary key (household_id, quota_date),
  constraint corralio_external_call_daily_quota_count_check
    check (reserved_count >= 0)
);

comment on table public.corralio_external_api_calls is
  'Payload-free Corralio vendor-call audit log; one billable row equals one vendor request/quota unit in Slice 4.3.';
comment on table public.corralio_external_call_daily_quota is
  'Atomic UTC-day household quota reservations for Corralio external calls.';

alter table public.corralio_external_api_calls enable row level security;
alter table public.corralio_external_call_daily_quota enable row level security;

revoke all on table public.corralio_external_api_calls
  from public, anon, authenticated;
revoke all on table public.corralio_external_call_daily_quota
  from public, anon, authenticated;
grant select, insert on table public.corralio_external_api_calls to service_role;
grant select, insert, update, delete on table public.corralio_external_call_daily_quota to service_role;

-- Existing table-level INSERT/UPDATE grants would otherwise include every new
-- server-computed column. Preserve manual-event access with an explicit column
-- allowlist while keeping geocode/route state service-role-only.
revoke insert, update on table public.corralio_events from authenticated;
grant insert (
  household_id,
  origin_type,
  title,
  starts_at,
  ends_at,
  timezone,
  child_id,
  team_id,
  display_location_text,
  field_label,
  notes
) on table public.corralio_events to authenticated;
grant update (
  title,
  starts_at,
  ends_at,
  timezone,
  child_id,
  team_id,
  display_location_text,
  field_label,
  notes
) on table public.corralio_events to authenticated;

create function public.corralio_events_prepare_location_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_location text;
begin
  v_location := nullif(btrim(coalesce(new.source_location_text, new.display_location_text)), '');

  if tg_op = 'INSERT'
     or new.source_location_text is distinct from old.source_location_text
     or new.display_location_text is distinct from old.display_location_text then
    new.location_normalized := nullif(
      regexp_replace(lower(v_location), '[[:space:]]+', ' ', 'g'),
      ''
    );
    new.location_lat := null;
    new.location_lng := null;
    new.location_geocoded_at := null;
    new.location_geocode_failed_at := null;
    new.location_geocode_claimed_at := null;
    new.estimated_drive_minutes := null;
    new.route_distance_meters := null;
    new.route_provider := null;
    new.route_failed_at := null;
    new.route_claimed_at := null;
    new.leave_by_computed_at := null;
  end if;

  return new;
end;
$function$;

revoke all on function public.corralio_events_prepare_location_v1()
  from public, anon, authenticated;
grant execute on function public.corralio_events_prepare_location_v1() to service_role;
alter function public.corralio_events_prepare_location_v1() owner to postgres;

create trigger corralio_events_prepare_location
  before insert or update of source_location_text, display_location_text
  on public.corralio_events
  for each row execute function public.corralio_events_prepare_location_v1();

create function public.corralio_prepare_household_origin_v1(
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
  v_origin_address text := nullif(btrim(p_origin_address), '');
  v_origin_changed boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if v_origin_address is not null and length(v_origin_address) > 100 then
    raise exception 'Origin address is too long' using errcode = '22001';
  end if;

  select member.household_id
    into v_household_id
  from public.corralio_household_members member
  where member.user_id = v_user_id
    and member.role = 'owner'
    and member.status = 'active'
  order by member.created_at, member.household_id
  limit 1
  for update of member;

  if v_household_id is null then
    raise exception 'Household access denied' using errcode = '42501';
  end if;

  select household.origin_address is distinct from v_origin_address
    into v_origin_changed
  from public.corralio_households household
  where household.id = v_household_id
  for update;

  update public.corralio_households household
    set origin_address = v_origin_address,
        origin_lat = null,
        origin_lng = null,
        origin_geocoded_at = null,
        origin_geocode_failed_at = null,
        origin_geocode_claimed_at = null
  where household.id = v_household_id
    and v_origin_changed;

  update public.corralio_events event
    set estimated_drive_minutes = null,
        route_distance_meters = null,
        route_provider = null,
        route_failed_at = null,
        route_claimed_at = null,
        leave_by_computed_at = null
  where event.household_id = v_household_id
    and v_origin_changed
    and num_nonnulls(
      event.estimated_drive_minutes,
      event.route_distance_meters,
      event.route_provider,
      event.route_failed_at,
      event.route_claimed_at,
      event.leave_by_computed_at
    ) > 0;

  return v_household_id;
end;
$function$;

revoke all on function public.corralio_prepare_household_origin_v1(text)
  from public, anon, authenticated;
grant execute on function public.corralio_prepare_household_origin_v1(text)
  to authenticated;
grant execute on function public.corralio_prepare_household_origin_v1(text)
  to service_role;
alter function public.corralio_prepare_household_origin_v1(text) owner to postgres;
comment on function public.corralio_prepare_household_origin_v1(text) is
  'Atomically replaces the authenticated owner household origin and invalidates only its cached routes.';

create function public.corralio_reserve_external_call_v1(
  p_household_id uuid,
  p_cap integer
)
returns boolean
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_reserved_count integer;
begin
  if p_household_id is null then
    raise exception 'Household is required' using errcode = '22004';
  end if;
  if p_cap is null or p_cap not between 1 and 10000 then
    raise exception 'External-call cap is invalid' using errcode = '22023';
  end if;

  insert into public.corralio_external_call_daily_quota (
    household_id,
    quota_date,
    reserved_count
  ) values (
    p_household_id,
    (timezone('utc', now()))::date,
    1
  )
  on conflict (household_id, quota_date) do update
    set reserved_count = public.corralio_external_call_daily_quota.reserved_count + 1
    where public.corralio_external_call_daily_quota.reserved_count < p_cap
  returning reserved_count into v_reserved_count;

  return v_reserved_count is not null;
end;
$function$;

revoke all on function public.corralio_reserve_external_call_v1(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.corralio_reserve_external_call_v1(uuid, integer)
  to service_role;
alter function public.corralio_reserve_external_call_v1(uuid, integer)
  owner to postgres;
comment on function public.corralio_reserve_external_call_v1(uuid, integer) is
  'Atomically reserves one UTC-day household vendor-call unit; service-role only.';
