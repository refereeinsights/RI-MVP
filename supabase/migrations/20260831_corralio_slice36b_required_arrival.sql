-- Corralio Slice 3.6B Phase 1: converge required-arrival resolution by adding
-- one bounded household-owned schedule-source preference. Apply manually only
-- after repository review. This migration performs no backfill or reprocessing.

alter table public.corralio_schedule_sources
  add column arrival_buffer_minutes smallint null,
  add constraint corralio_schedule_sources_arrival_buffer_check
    check (
      arrival_buffer_minutes is null
      or (
        arrival_buffer_minutes between 0 and 120
        and arrival_buffer_minutes % 5 = 0
      )
    );

comment on column public.corralio_schedule_sources.arrival_buffer_minutes is
  'Optional household-private source arrival preference; valid feed/event explicit arrival remains authoritative.';

-- Preserve the row boundary and expose only the bounded preference alongside
-- the already-approved connected-source metadata. source_url remains private.
alter table public.corralio_schedule_sources enable row level security;
alter table public.corralio_schedule_sources force row level security;
grant select (arrival_buffer_minutes)
  on table public.corralio_schedule_sources to authenticated;

create function public.corralio_update_schedule_source_arrival_v1(
  p_source_id uuid,
  p_arrival_buffer_minutes smallint default null
)
returns smallint
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_arrival_buffer_minutes smallint;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_source_id is null then
    raise exception 'Schedule source is required' using errcode = '22023';
  end if;
  if p_arrival_buffer_minutes is not null and (
    p_arrival_buffer_minutes < 0
    or p_arrival_buffer_minutes > 120
    or p_arrival_buffer_minutes % 5 <> 0
  ) then
    raise exception 'Schedule source arrival preference is invalid' using errcode = '22023';
  end if;

  update public.corralio_schedule_sources source
  set arrival_buffer_minutes = p_arrival_buffer_minutes
  where source.id = p_source_id
    and source.source_type = 'ics'
    and source.sync_status in ('pending', 'success', 'error')
    and exists (
      select 1
      from public.corralio_household_members member
      where member.household_id = source.household_id
        and member.user_id = v_user_id
        and member.role = 'owner'
        and member.status = 'active'
    )
  returning source.arrival_buffer_minutes into v_arrival_buffer_minutes;

  if not found then
    raise exception 'Schedule source not found or access denied' using errcode = '42501';
  end if;
  return v_arrival_buffer_minutes;
end;
$function$;

alter function public.corralio_update_schedule_source_arrival_v1(uuid, smallint)
  owner to postgres;
revoke all on function public.corralio_update_schedule_source_arrival_v1(uuid, smallint)
  from public, anon, authenticated, service_role;
grant execute on function public.corralio_update_schedule_source_arrival_v1(uuid, smallint)
  to authenticated;

comment on function public.corralio_update_schedule_source_arrival_v1(uuid, smallint) is
  'Active-owner-only update of one bounded source arrival preference; returns only the saved preference.';
