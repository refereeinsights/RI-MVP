-- Corralio Phase A+B Stage 1: service-only channel identity and bounded SMS intake.
-- Unapplied. This migration configures no provider and sends no SMS or OTP.

create table public.corralio_channel_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.corralio_households(id) on delete cascade,
  channel text not null,
  address_hmac text not null,
  verified_at timestamptz not null,
  active boolean not null default true,
  deactivated_at timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint corralio_channel_identities_channel_check check (channel in ('phone', 'email')),
  constraint corralio_channel_identities_hmac_check check (address_hmac ~ '^[0-9a-f]{64}$'),
  constraint corralio_channel_identities_state_check check (
    (active and deactivated_at is null) or (not active and deactivated_at is not null)
  ),
  constraint corralio_channel_identities_membership_fk foreign key (household_id, user_id)
    references public.corralio_household_members(household_id, user_id) on delete cascade
);

create unique index corralio_channel_identities_active_address_idx
  on public.corralio_channel_identities(channel, address_hmac) where active;
create unique index corralio_channel_identities_active_user_channel_idx
  on public.corralio_channel_identities(user_id, channel) where active;
create unique index corralio_channel_identities_history_identity_idx
  on public.corralio_channel_identities(user_id, household_id, channel, address_hmac);
create index corralio_channel_identities_membership_idx
  on public.corralio_channel_identities(household_id, user_id, active);

create table public.corralio_telnyx_inbound_claims (
  event_id text primary key,
  state text not null default 'claimed',
  claimed_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz null,
  outcome text null,
  retain_until timestamptz not null default (clock_timestamp() + interval '30 days'),
  constraint corralio_telnyx_inbound_claims_event_check check (event_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint corralio_telnyx_inbound_claims_state_check check (state in ('claimed', 'completed')),
  constraint corralio_telnyx_inbound_claims_outcome_check check (
    (state = 'claimed' and completed_at is null and outcome is null)
    or (state = 'completed' and completed_at is not null and outcome in
      ('connected', 'clarification_pending', 'resolved', 'duplicate', 'ignored', 'failed'))
  ),
  constraint corralio_telnyx_inbound_claims_retention_check check (retain_until > claimed_at)
);

create index corralio_telnyx_inbound_claims_retention_idx
  on public.corralio_telnyx_inbound_claims(retain_until, event_id);

create table public.corralio_pending_schedule_intakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.corralio_households(id) on delete cascade,
  channel text not null,
  state text not null default 'pending',
  url_envelope text null,
  url_fingerprint text not null,
  candidate_team_ids uuid[] not null default '{}',
  candidate_child_ids uuid[] not null default '{}',
  claimed_by_event_id text null,
  source_id uuid null,
  expires_at timestamptz not null,
  terminal_at timestamptz null,
  retain_until timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint corralio_pending_schedule_intakes_channel_check check (channel = 'phone'),
  constraint corralio_pending_schedule_intakes_state_check check (
    state in ('pending', 'processing', 'resolved', 'expired', 'cancelled')
  ),
  constraint corralio_pending_schedule_intakes_fingerprint_check
    check (url_fingerprint ~ '^v1:[0-9a-f]{64}$'),
  constraint corralio_pending_schedule_intakes_secret_state_check check (
    (state in ('pending', 'processing') and url_envelope is not null and terminal_at is null)
    or (state in ('resolved', 'expired', 'cancelled') and url_envelope is null and terminal_at is not null)
  ),
  constraint corralio_pending_schedule_intakes_claim_check check (
    (state = 'processing' and claimed_by_event_id is not null)
    or (state <> 'processing' and claimed_by_event_id is null)
  ),
  constraint corralio_pending_schedule_intakes_time_check check (
    expires_at > created_at and retain_until > expires_at
  ),
  constraint corralio_pending_schedule_intakes_membership_fk foreign key (household_id, user_id)
    references public.corralio_household_members(household_id, user_id) on delete cascade,
  constraint corralio_pending_schedule_intakes_source_fk foreign key (household_id, source_id)
    references public.corralio_schedule_sources(household_id, id) on delete set null (source_id)
);

create unique index corralio_pending_schedule_intakes_one_open_fingerprint_idx
  on public.corralio_pending_schedule_intakes(household_id, url_fingerprint)
  where state in ('pending', 'processing');
create index corralio_pending_schedule_intakes_lookup_idx
  on public.corralio_pending_schedule_intakes(household_id, user_id, state, created_at desc);
create index corralio_pending_schedule_intakes_retention_idx
  on public.corralio_pending_schedule_intakes(retain_until, id);

comment on table public.corralio_channel_identities is
  'Service-only HMAC lookup projection. Supabase Auth remains authoritative for raw credentials.';
comment on table public.corralio_telnyx_inbound_claims is
  'Telnyx inbound-message idempotency only; separate from Supabase Send SMS Hook claims.';
comment on column public.corralio_pending_schedule_intakes.url_envelope is
  'Versioned authenticated-encryption envelope; never a plaintext calendar URL.';

alter table public.corralio_channel_identities enable row level security;
alter table public.corralio_channel_identities force row level security;
alter table public.corralio_telnyx_inbound_claims enable row level security;
alter table public.corralio_telnyx_inbound_claims force row level security;
alter table public.corralio_pending_schedule_intakes enable row level security;
alter table public.corralio_pending_schedule_intakes force row level security;

revoke all on table public.corralio_channel_identities,
  public.corralio_telnyx_inbound_claims,
  public.corralio_pending_schedule_intakes
  from public, anon, authenticated, service_role;

create function public.corralio_upsert_channel_identity_v1(
  p_user_id uuid, p_household_id uuid, p_channel text, p_address_hmac text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_id uuid; v_now timestamptz := clock_timestamp();
  v_user_lock bigint; v_address_lock bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted channel identity boundary is required' using errcode = '42501';
  end if;
  if p_channel not in ('phone', 'email') or coalesce(p_address_hmac, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid channel identity input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.corralio_household_members m
    where m.household_id = p_household_id and m.user_id = p_user_id
      and m.role = 'owner' and m.status = 'active') then
    raise exception 'Active household membership is required' using errcode = '42501';
  end if;
  v_user_lock := hashtextextended('channel-user:' || p_user_id::text || ':' || p_channel, 0);
  v_address_lock := hashtextextended('channel-address:' || p_channel || ':' || p_address_hmac, 0);
  if v_user_lock < v_address_lock then
    perform pg_advisory_xact_lock(v_user_lock); perform pg_advisory_xact_lock(v_address_lock);
  else
    perform pg_advisory_xact_lock(v_address_lock); perform pg_advisory_xact_lock(v_user_lock);
  end if;
  update public.corralio_channel_identities set active = false, deactivated_at = v_now, updated_at = v_now
    where channel = p_channel and address_hmac = p_address_hmac and active
      and (user_id, household_id) <> (p_user_id, p_household_id);
  update public.corralio_channel_identities set active = false, deactivated_at = v_now, updated_at = v_now
    where user_id = p_user_id and channel = p_channel and active
      and address_hmac <> p_address_hmac;
  select id into v_id from public.corralio_channel_identities
    where user_id = p_user_id and household_id = p_household_id
      and channel = p_channel and address_hmac = p_address_hmac
    order by created_at desc limit 1 for update;
  if v_id is null then
    insert into public.corralio_channel_identities
      (user_id, household_id, channel, address_hmac, verified_at)
      values (p_user_id, p_household_id, p_channel, p_address_hmac, v_now)
      returning id into v_id;
  else
    update public.corralio_channel_identities set verified_at = v_now, active = true,
      deactivated_at = null, updated_at = v_now where id = v_id;
  end if;
  return v_id;
end;
$function$;

create function public.corralio_resolve_channel_identity_v1(p_channel text, p_address_hmac text)
returns table(user_id uuid, household_id uuid)
language sql security definer set search_path = pg_catalog, public
as $function$
  select identity.user_id, identity.household_id
  from public.corralio_channel_identities identity
  join public.corralio_household_members member
    on member.household_id = identity.household_id and member.user_id = identity.user_id
  where coalesce(auth.role(), '') = 'service_role'
    and identity.channel = p_channel and identity.address_hmac = p_address_hmac
    and identity.active and member.role = 'owner' and member.status = 'active'
  limit 1
$function$;

create function public.corralio_deactivate_channel_identity_v1(
  p_user_id uuid, p_household_id uuid, p_channel text
) returns integer language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_rows integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted channel identity boundary is required' using errcode = '42501';
  end if;
  update public.corralio_channel_identities set active = false,
    deactivated_at = clock_timestamp(), updated_at = clock_timestamp()
    where user_id = p_user_id and household_id = p_household_id
      and channel = p_channel and active;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$;

create function public.corralio_claim_telnyx_inbound_v1(p_event_id text)
returns table(decision text)
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_rows integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted inbound webhook boundary is required' using errcode = '42501';
  end if;
  if coalesce(p_event_id, '') !~ '^[A-Za-z0-9_-]{1,128}$' then
    return query select 'blocked'::text; return;
  end if;
  insert into public.corralio_telnyx_inbound_claims(event_id) values (p_event_id)
    on conflict (event_id) do nothing;
  get diagnostics v_rows = row_count;
  return query select case when v_rows = 1 then 'claimed' else 'duplicate' end;
end;
$function$;

create function public.corralio_complete_telnyx_inbound_v1(p_event_id text, p_outcome text)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted inbound webhook boundary is required' using errcode = '42501';
  end if;
  if p_outcome not in ('connected', 'clarification_pending', 'resolved', 'duplicate', 'ignored', 'failed') then
    raise exception 'Invalid inbound outcome' using errcode = '22023';
  end if;
  update public.corralio_telnyx_inbound_claims set state = 'completed',
    completed_at = clock_timestamp(), outcome = p_outcome
    where event_id = p_event_id and state = 'claimed';
end;
$function$;

create function public.corralio_create_pending_schedule_intake_v1(
  p_user_id uuid, p_household_id uuid, p_url_envelope text, p_url_fingerprint text,
  p_candidate_team_ids uuid[], p_candidate_child_ids uuid[]
) returns table(intake_id uuid, created boolean)
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_id uuid; v_now timestamptz := clock_timestamp(); v_created boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted pending-intake boundary is required' using errcode = '42501';
  end if;
  if coalesce(p_url_envelope, '') = '' or length(p_url_envelope) > 65536
    or coalesce(p_url_fingerprint, '') !~ '^v1:[0-9a-f]{64}$'
    or cardinality(coalesce(p_candidate_team_ids, '{}')) > 20
    or cardinality(coalesce(p_candidate_child_ids, '{}')) > 20 then
    raise exception 'Invalid pending intake input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.corralio_household_members m
    where m.household_id = p_household_id and m.user_id = p_user_id
      and m.role = 'owner' and m.status = 'active') then
    raise exception 'Active household membership is required' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_candidate_team_ids, '{}')) id
    where not exists (select 1 from public.corralio_teams t where t.id = id
      and t.household_id = p_household_id and t.archived_at is null))
    or exists (select 1 from unnest(coalesce(p_candidate_child_ids, '{}')) id
    where not exists (select 1 from public.corralio_children c where c.id = id
      and c.household_id = p_household_id and c.archived_at is null)) then
    raise exception 'Pending target is not authorized' using errcode = '42501';
  end if;
  update public.corralio_pending_schedule_intakes set state = 'expired', url_envelope = null,
    terminal_at = v_now, updated_at = v_now
    where household_id = p_household_id and state = 'pending' and expires_at <= v_now;
  insert into public.corralio_pending_schedule_intakes
    (user_id, household_id, channel, url_envelope, url_fingerprint,
     candidate_team_ids, candidate_child_ids, expires_at, retain_until)
    values (p_user_id, p_household_id, 'phone', p_url_envelope, p_url_fingerprint,
      coalesce(p_candidate_team_ids, '{}'), coalesce(p_candidate_child_ids, '{}'),
      v_now + interval '30 minutes', v_now + interval '7 days')
    on conflict (household_id, url_fingerprint) where state in ('pending', 'processing')
    do nothing returning id into v_id;
  if v_id is not null then
    v_created := true;
  else
    select id into v_id from public.corralio_pending_schedule_intakes
      where household_id = p_household_id and url_fingerprint = p_url_fingerprint
        and state in ('pending', 'processing') limit 1;
  end if;
  return query select v_id, v_created;
end;
$function$;

create function public.corralio_claim_pending_schedule_resolution_v1(
  p_user_id uuid, p_household_id uuid, p_event_id text, p_choice integer
) returns table(intake_id uuid, url_envelope text, target_kind text, target_id uuid)
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_row public.corralio_pending_schedule_intakes%rowtype; v_target uuid; v_kind text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted pending-intake boundary is required' using errcode = '42501';
  end if;
  if p_choice < 1 or p_choice > 41 or coalesce(p_event_id, '') !~ '^[A-Za-z0-9_-]{1,128}$' then return; end if;
  select * into v_row from public.corralio_pending_schedule_intakes p
    where p.user_id = p_user_id and p.household_id = p_household_id and p.state = 'pending'
    order by p.created_at desc limit 1 for update skip locked;
  if not found then return; end if;
  if v_row.expires_at <= clock_timestamp() then
    update public.corralio_pending_schedule_intakes set state = 'expired', url_envelope = null,
      terminal_at = clock_timestamp(), updated_at = clock_timestamp() where id = v_row.id;
    return;
  end if;
  if p_choice <= cardinality(v_row.candidate_team_ids) then
    v_kind := 'team'; v_target := v_row.candidate_team_ids[p_choice];
  elsif p_choice <= cardinality(v_row.candidate_team_ids) + cardinality(v_row.candidate_child_ids) then
    v_kind := 'child'; v_target := v_row.candidate_child_ids[p_choice - cardinality(v_row.candidate_team_ids)];
  elsif p_choice = cardinality(v_row.candidate_team_ids) + cardinality(v_row.candidate_child_ids) + 1 then
    v_kind := 'unassigned'; v_target := null;
  else return;
  end if;
  if (v_kind = 'team' and not exists (select 1 from public.corralio_teams t
      where t.id = v_target and t.household_id = p_household_id and t.archived_at is null))
    or (v_kind = 'child' and not exists (select 1 from public.corralio_children c
      where c.id = v_target and c.household_id = p_household_id and c.archived_at is null)) then
    update public.corralio_pending_schedule_intakes set state = 'cancelled', url_envelope = null,
      terminal_at = clock_timestamp(), updated_at = clock_timestamp() where id = v_row.id;
    return;
  end if;
  update public.corralio_pending_schedule_intakes set state = 'processing',
    claimed_by_event_id = p_event_id, updated_at = clock_timestamp() where id = v_row.id;
  return query select v_row.id, v_row.url_envelope, v_kind, v_target;
end;
$function$;

create function public.corralio_finalize_pending_schedule_intake_v1(
  p_intake_id uuid, p_event_id text, p_outcome text, p_source_id uuid default null
) returns void language plpgsql security definer set search_path = pg_catalog, public
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted pending-intake boundary is required' using errcode = '42501';
  end if;
  if p_outcome not in ('resolved', 'cancelled') then
    raise exception 'Invalid pending outcome' using errcode = '22023';
  end if;
  update public.corralio_pending_schedule_intakes set state = p_outcome,
    url_envelope = null, claimed_by_event_id = null, source_id = p_source_id,
    terminal_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_intake_id and state = 'processing' and claimed_by_event_id = p_event_id;
  if not found then raise exception 'Pending intake is not claimable' using errcode = '40001'; end if;
end;
$function$;

create function public.corralio_cancel_pending_schedule_intake_v1(p_user_id uuid, p_household_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted pending-intake boundary is required' using errcode = '42501';
  end if;
  select id into v_id from public.corralio_pending_schedule_intakes
    where user_id = p_user_id and household_id = p_household_id and state = 'pending'
    order by created_at desc limit 1 for update skip locked;
  if v_id is null then return false; end if;
  update public.corralio_pending_schedule_intakes set state = 'cancelled', url_envelope = null,
    terminal_at = clock_timestamp(), updated_at = clock_timestamp() where id = v_id;
  return true;
end;
$function$;

create function public.corralio_cleanup_phase_ab_state_v1()
returns table(expired_intakes integer, deleted_intakes integer, deleted_claims integer)
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_now timestamptz := clock_timestamp(); v_expired integer; v_intakes integer; v_claims integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted cleanup boundary is required' using errcode = '42501';
  end if;
  update public.corralio_pending_schedule_intakes set state = 'expired', url_envelope = null,
    claimed_by_event_id = null, terminal_at = v_now, updated_at = v_now
    where state = 'pending' and expires_at <= v_now;
  get diagnostics v_expired = row_count;
  delete from public.corralio_pending_schedule_intakes where retain_until <= v_now;
  get diagnostics v_intakes = row_count;
  delete from public.corralio_telnyx_inbound_claims where retain_until <= v_now;
  get diagnostics v_claims = row_count;
  return query select v_expired, v_intakes, v_claims;
end;
$function$;

revoke all on function public.corralio_upsert_channel_identity_v1(uuid, uuid, text, text),
  public.corralio_resolve_channel_identity_v1(text, text),
  public.corralio_deactivate_channel_identity_v1(uuid, uuid, text),
  public.corralio_claim_telnyx_inbound_v1(text),
  public.corralio_complete_telnyx_inbound_v1(text, text),
  public.corralio_create_pending_schedule_intake_v1(uuid, uuid, text, text, uuid[], uuid[]),
  public.corralio_claim_pending_schedule_resolution_v1(uuid, uuid, text, integer),
  public.corralio_finalize_pending_schedule_intake_v1(uuid, text, text, uuid),
  public.corralio_cancel_pending_schedule_intake_v1(uuid, uuid),
  public.corralio_cleanup_phase_ab_state_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.corralio_upsert_channel_identity_v1(uuid, uuid, text, text),
  public.corralio_resolve_channel_identity_v1(text, text),
  public.corralio_deactivate_channel_identity_v1(uuid, uuid, text),
  public.corralio_claim_telnyx_inbound_v1(text),
  public.corralio_complete_telnyx_inbound_v1(text, text),
  public.corralio_create_pending_schedule_intake_v1(uuid, uuid, text, text, uuid[], uuid[]),
  public.corralio_claim_pending_schedule_resolution_v1(uuid, uuid, text, integer),
  public.corralio_finalize_pending_schedule_intake_v1(uuid, text, text, uuid),
  public.corralio_cancel_pending_schedule_intake_v1(uuid, uuid),
  public.corralio_cleanup_phase_ab_state_v1()
  to service_role;

alter function public.corralio_upsert_channel_identity_v1(uuid, uuid, text, text) owner to postgres;
alter function public.corralio_resolve_channel_identity_v1(text, text) owner to postgres;
alter function public.corralio_deactivate_channel_identity_v1(uuid, uuid, text) owner to postgres;
alter function public.corralio_claim_telnyx_inbound_v1(text) owner to postgres;
alter function public.corralio_complete_telnyx_inbound_v1(text, text) owner to postgres;
alter function public.corralio_create_pending_schedule_intake_v1(uuid, uuid, text, text, uuid[], uuid[]) owner to postgres;
alter function public.corralio_claim_pending_schedule_resolution_v1(uuid, uuid, text, integer) owner to postgres;
alter function public.corralio_finalize_pending_schedule_intake_v1(uuid, text, text, uuid) owner to postgres;
alter function public.corralio_cancel_pending_schedule_intake_v1(uuid, uuid) owner to postgres;
alter function public.corralio_cleanup_phase_ab_state_v1() owner to postgres;
