-- Corralio Slice 3.5.5: schedule freshness and household-scoped manual refresh.
-- Apply only after Stage 1 review. This migration performs no feed/event
-- reprocessing; it initializes only the failure-window metadata needed to keep
-- existing failure states internally consistent.

alter table public.corralio_schedule_sources
  add column if not exists refresh_failure_started_at timestamptz null;

update public.corralio_schedule_sources source
set refresh_failure_started_at = coalesce(
  source.refresh_failure_started_at,
  source.last_refresh_attempted_at,
  source.refresh_paused_at,
  now()
)
where source.consecutive_refresh_failures > 0
  and source.refresh_failure_started_at is null;

create or replace function public.corralio_normalize_refresh_failure_window_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if new.consecutive_refresh_failures = 0 then
    new.refresh_failure_started_at := null;
  elsif new.refresh_failure_started_at is null then
    new.refresh_failure_started_at := coalesce(
      old.refresh_failure_started_at,
      new.last_refresh_attempted_at,
      now()
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists corralio_schedule_sources_normalize_refresh_failure_window
  on public.corralio_schedule_sources;
create trigger corralio_schedule_sources_normalize_refresh_failure_window
  before update of consecutive_refresh_failures, refresh_failure_started_at
  on public.corralio_schedule_sources
  for each row execute function public.corralio_normalize_refresh_failure_window_v1();

alter table public.corralio_schedule_sources
  drop constraint if exists corralio_schedule_sources_refresh_pause_state_check;
alter table public.corralio_schedule_sources
  add constraint corralio_schedule_sources_refresh_pause_state_check check (
    (consecutive_refresh_failures = 0 and refresh_failure_started_at is null and refresh_paused_at is null)
    or
    (consecutive_refresh_failures between 1 and 2 and refresh_failure_started_at is not null and refresh_paused_at is null)
    or
    (consecutive_refresh_failures = 3 and refresh_failure_started_at is not null)
  );

comment on column public.corralio_schedule_sources.refresh_failure_started_at is
  'Trusted first failure in the current consecutive sequence; never browser-readable and cleared by successful canonical persistence.';
comment on column public.corralio_schedule_sources.last_refresh_attempted_at is
  'Last trusted automatic, manual, or successful replacement attempt; automatic eligibility is 3 hours and manual cooldown is 5 minutes.';

create or replace function public.corralio_claim_ics_refresh_batch_v1(
  p_limit integer default 10
)
returns table (
  source_id uuid,
  household_id uuid,
  source_url text,
  claim_token uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 10);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted schedule refresh is required' using errcode = '42501';
  end if;

  return query
  with candidates as materialized (
    select source.id
    from public.corralio_schedule_sources source
    where source.source_type = 'ics'
      and source.sync_status in ('pending', 'success', 'error')
      and source.refresh_paused_at is null
      and length(btrim(source.source_url)) > 0
      and (
        (
          source.refresh_claim_token is null
          and (
            source.last_refresh_attempted_at is null
            or source.last_refresh_attempted_at <= now() - interval '3 hours'
          )
        )
        or (
          source.refresh_claim_token is not null
          and source.refresh_claimed_at <= now() - interval '10 minutes'
        )
      )
    order by source.last_refresh_attempted_at asc nulls first, source.id asc
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.corralio_schedule_sources source
    set refresh_claim_token = gen_random_uuid(),
        refresh_claimed_at = now(),
        last_refresh_attempted_at = now()
    from candidates
    where source.id = candidates.id
    returning source.id, source.household_id, source.source_url, source.refresh_claim_token
  )
  select claimed.id, claimed.household_id, claimed.source_url, claimed.refresh_claim_token
  from claimed
  order by claimed.id asc;
end;
$function$;

create or replace function public.corralio_claim_ics_refresh_source_v1(
  p_household_id uuid,
  p_source_id uuid
)
returns table (
  outcome text,
  source_id uuid,
  household_id uuid,
  source_url text,
  claim_token uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_source public.corralio_schedule_sources%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted schedule refresh is required' using errcode = '42501';
  end if;

  select source.* into v_source
  from public.corralio_schedule_sources source
  where source.id = p_source_id
    and source.household_id = p_household_id
    and source.source_type = 'ics'
    and source.sync_status in ('pending', 'success', 'error')
    and length(btrim(source.source_url)) > 0
  for update;

  if not found then
    return query select 'unavailable'::text, null::uuid, null::uuid, null::text, null::uuid;
    return;
  end if;
  if v_source.refresh_paused_at is not null then
    return query select 'paused'::text, null::uuid, null::uuid, null::text, null::uuid;
    return;
  end if;
  if v_source.refresh_claim_token is not null
     and v_source.refresh_claimed_at > now() - interval '10 minutes' then
    return query select 'busy'::text, null::uuid, null::uuid, null::text, null::uuid;
    return;
  end if;
  if v_source.last_refresh_attempted_at is not null
     and v_source.last_refresh_attempted_at > now() - interval '5 minutes' then
    return query select 'cooldown'::text, null::uuid, null::uuid, null::text, null::uuid;
    return;
  end if;

  return query
  update public.corralio_schedule_sources source
  set refresh_claim_token = gen_random_uuid(),
      refresh_claimed_at = now(),
      last_refresh_attempted_at = now()
  where source.id = v_source.id
    and source.household_id = v_source.household_id
  returning 'claimed'::text, source.id, source.household_id, source.source_url, source.refresh_claim_token;
end;
$function$;

create or replace function public.corralio_fail_claimed_ics_refresh_v1(
  p_source_id uuid,
  p_claim_token uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_failure_code text := lower(btrim(coalesce(p_failure_code, '')));
  v_source public.corralio_schedule_sources%rowtype;
  v_failure_started_at timestamptz;
  v_failure_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted schedule refresh is required' using errcode = '42501';
  end if;
  if v_failure_code not in (
    'invalid_url', 'unsupported_protocol', 'private_url', 'fetch_failed',
    'not_ics', 'too_large', 'event_limit', 'persistence'
  ) then
    raise exception 'Schedule refresh failure code is invalid' using errcode = '22023';
  end if;

  select source.* into v_source
  from public.corralio_schedule_sources source
  where source.id = p_source_id
    and source.source_type = 'ics'
    and source.sync_status in ('pending', 'success', 'error')
    and source.refresh_paused_at is null
    and source.refresh_claim_token = p_claim_token
    and source.refresh_claimed_at > now() - interval '10 minutes'
  for update;
  if not found then return false; end if;

  v_failure_started_at := coalesce(v_source.refresh_failure_started_at, now());
  v_failure_count := least(v_source.consecutive_refresh_failures + 1, 3);

  update public.corralio_schedule_sources source
  set sync_status = 'error',
      last_refresh_error_code = v_failure_code,
      consecutive_refresh_failures = v_failure_count,
      refresh_failure_started_at = v_failure_started_at,
      refresh_paused_at = case
        when v_failure_count >= 3
          and v_failure_started_at <= now() - interval '24 hours'
        then coalesce(source.refresh_paused_at, now())
        else null
      end,
      refresh_claim_token = null,
      refresh_claimed_at = null
  where source.id = v_source.id
    and source.refresh_claim_token = p_claim_token;
  return found;
end;
$function$;

revoke all on function public.corralio_normalize_refresh_failure_window_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.corralio_claim_ics_refresh_batch_v1(integer)
  from public, anon, authenticated;
revoke all on function public.corralio_claim_ics_refresh_source_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.corralio_fail_claimed_ics_refresh_v1(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.corralio_claim_ics_refresh_batch_v1(integer)
  to service_role;
grant execute on function public.corralio_claim_ics_refresh_source_v1(uuid, uuid)
  to service_role;
grant execute on function public.corralio_fail_claimed_ics_refresh_v1(uuid, uuid, text)
  to service_role;

alter function public.corralio_normalize_refresh_failure_window_v1() owner to postgres;
alter function public.corralio_claim_ics_refresh_batch_v1(integer) owner to postgres;
alter function public.corralio_claim_ics_refresh_source_v1(uuid, uuid) owner to postgres;
alter function public.corralio_fail_claimed_ics_refresh_v1(uuid, uuid, text) owner to postgres;

comment on function public.corralio_claim_ics_refresh_batch_v1(integer) is
  'Service-role-only deterministic claim of at most 10 unpaused ICS sources using 3-hour freshness and 10-minute claim recovery.';
comment on function public.corralio_claim_ics_refresh_source_v1(uuid, uuid) is
  'Service-role-only household/source-bound manual claim with 5-minute per-source cooldown; source URL and token never cross the trusted server boundary.';
comment on function public.corralio_fail_claimed_ics_refresh_v1(uuid, uuid, text) is
  'Service-role-only claimed failure finalization; count saturates at 3 and pause requires at least 24 elapsed hours in the failure sequence.';
