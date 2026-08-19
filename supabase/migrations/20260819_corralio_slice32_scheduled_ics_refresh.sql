-- Corralio Slice 3.2: bounded, service-role-only scheduled ICS refresh claims.
-- Apply manually in a controlled production migration. This migration creates
-- no network job and fetches no calendar URL.

alter table public.corralio_schedule_sources
  add column if not exists last_refresh_attempted_at timestamptz null,
  add column if not exists last_refresh_error_code text null,
  add column if not exists refresh_claim_token uuid null,
  add column if not exists refresh_claimed_at timestamptz null;

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.corralio_schedule_sources'::regclass
      and conname = 'corralio_schedule_sources_refresh_error_code_check'
  ) then
    alter table public.corralio_schedule_sources
      add constraint corralio_schedule_sources_refresh_error_code_check
      check (
        last_refresh_error_code is null
        or last_refresh_error_code in (
          'invalid_url', 'unsupported_protocol', 'private_url', 'fetch_failed',
          'not_ics', 'too_large', 'event_limit', 'persistence'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.corralio_schedule_sources'::regclass
      and conname = 'corralio_schedule_sources_refresh_claim_pair_check'
  ) then
    alter table public.corralio_schedule_sources
      add constraint corralio_schedule_sources_refresh_claim_pair_check
      check (num_nonnulls(refresh_claim_token, refresh_claimed_at) in (0, 2));
  end if;
end;
$block$;

comment on column public.corralio_schedule_sources.last_refresh_attempted_at is
  'Last scheduled refresh claim time. A 23-hour attempt-based freshness window prevents duplicate daily work.';
comment on column public.corralio_schedule_sources.last_refresh_error_code is
  'Bounded non-secret scheduled refresh failure category; never contains a source URL or provider response.';
comment on column public.corralio_schedule_sources.refresh_claim_token is
  'Private service-role claim token for scheduled refresh overlap control.';
comment on column public.corralio_schedule_sources.refresh_claimed_at is
  'Scheduled refresh claim timestamp. Claims become recoverable after 10 minutes.';

grant select (last_refresh_attempted_at, last_refresh_error_code)
  on table public.corralio_schedule_sources to authenticated;

create or replace function public.corralio_invalidate_refresh_claim_on_url_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if old.source_url is distinct from new.source_url then
    new.refresh_claim_token := null;
    new.refresh_claimed_at := null;
  end if;
  return new;
end;
$function$;

revoke all on function public.corralio_invalidate_refresh_claim_on_url_change()
  from public, anon, authenticated;

drop trigger if exists corralio_schedule_sources_invalidate_refresh_claim
  on public.corralio_schedule_sources;
create trigger corralio_schedule_sources_invalidate_refresh_claim
  before update of source_url on public.corralio_schedule_sources
  for each row execute function public.corralio_invalidate_refresh_claim_on_url_change();

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
      and length(btrim(source.source_url)) > 0
      and (
        (
          source.refresh_claim_token is null
          and (
            source.last_refresh_attempted_at is null
            or source.last_refresh_attempted_at <= now() - interval '23 hours'
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

create or replace function public.corralio_persist_claimed_ics_refresh_v1(
  p_source_id uuid,
  p_claim_token uuid,
  p_events jsonb,
  p_canceled_source_event_uids text[] default '{}'::text[]
)
returns table (upserted_count integer, canceled_count integer)
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

  select source.*
  into v_source
  from public.corralio_schedule_sources source
  where source.id = p_source_id
    and source.source_type = 'ics'
    and source.sync_status in ('pending', 'success', 'error')
    and source.refresh_claim_token = p_claim_token
    and source.refresh_claimed_at > now() - interval '10 minutes'
  for update;

  if not found then
    raise exception 'Schedule refresh claim not found' using errcode = '23503';
  end if;

  return query
  select result.upserted_count, result.canceled_count
  from public.corralio_persist_ics_ingestion_v1(
    v_source.household_id,
    v_source.id,
    p_events,
    coalesce(p_canceled_source_event_uids, '{}'::text[])
  ) result;

  update public.corralio_schedule_sources source
  set refresh_claim_token = null,
      refresh_claimed_at = null,
      last_refresh_error_code = null
  where source.id = v_source.id
    and source.refresh_claim_token = p_claim_token;
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

  update public.corralio_schedule_sources source
  set sync_status = 'error',
      last_refresh_error_code = v_failure_code,
      refresh_claim_token = null,
      refresh_claimed_at = null
  where source.id = p_source_id
    and source.source_type = 'ics'
    and source.sync_status in ('pending', 'success', 'error')
    and source.refresh_claim_token = p_claim_token;

  return found;
end;
$function$;

revoke all on function public.corralio_claim_ics_refresh_batch_v1(integer)
  from public, anon, authenticated;
revoke all on function public.corralio_persist_claimed_ics_refresh_v1(uuid, uuid, jsonb, text[])
  from public, anon, authenticated;
revoke all on function public.corralio_fail_claimed_ics_refresh_v1(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.corralio_claim_ics_refresh_batch_v1(integer)
  to service_role;
grant execute on function public.corralio_persist_claimed_ics_refresh_v1(uuid, uuid, jsonb, text[])
  to service_role;
grant execute on function public.corralio_fail_claimed_ics_refresh_v1(uuid, uuid, text)
  to service_role;

comment on function public.corralio_claim_ics_refresh_batch_v1(integer) is
  'Service-role-only deterministic claim of at most 10 active ICS sources using 23-hour freshness and 10-minute claim recovery.';
comment on function public.corralio_persist_claimed_ics_refresh_v1(uuid, uuid, jsonb, text[]) is
  'Service-role-only claimed refresh persistence delegating to canonical Corralio ICS ingestion and atomically clearing the claim.';
comment on function public.corralio_fail_claimed_ics_refresh_v1(uuid, uuid, text) is
  'Service-role-only failure finalization using a bounded non-secret category while preserving existing events and source URL.';
