-- Corralio Slice 4.0A.1: expand the product-local planning taxonomy without
-- changing TournamentInsights eligibility or duplicating sport on event rows.

do $preflight$
declare
  v_incompatible_count bigint;
  v_incompatible_values text;
begin
  select count(*), string_agg(distinct source_name || ':' || sport, ', ' order by source_name || ':' || sport)
  into v_incompatible_count, v_incompatible_values
  from (
    select 'schedule_source'::text as source_name, sport
    from public.corralio_schedule_sources
    where sport is not null
    union all
    select 'team'::text as source_name, sport
    from public.corralio_teams
    where sport is not null
  ) existing
  where sport not in (
    'baseball', 'softball', 'soccer', 'basketball', 'volleyball',
    'hockey', 'lacrosse', 'football', 'tennis', 'swimming',
    'gymnastics', 'track_field', 'golf', 'wrestling', 'cheer',
    'dance', 'other'
  );

  if v_incompatible_count > 0 then
    raise exception
      'Corralio Slice 4.0A.1 preflight failed: % rows use unsupported sport values (%)',
      v_incompatible_count,
      left(coalesce(v_incompatible_values, ''), 500);
  end if;
end;
$preflight$;

alter table public.corralio_schedule_sources
  drop constraint if exists corralio_schedule_sources_sport_check;
alter table public.corralio_schedule_sources
  add constraint corralio_schedule_sources_sport_check
  check (
    sport is null
    or sport in (
      'baseball', 'softball', 'soccer', 'basketball', 'volleyball',
      'hockey', 'lacrosse', 'football', 'tennis', 'swimming',
      'gymnastics', 'track_field', 'golf', 'wrestling', 'cheer',
      'dance', 'other'
    )
  );

alter table public.corralio_teams
  drop constraint if exists corralio_teams_sport_check;
alter table public.corralio_teams
  add constraint corralio_teams_sport_check
  check (
    sport is null
    or sport in (
      'baseball', 'softball', 'soccer', 'basketball', 'volleyball',
      'hockey', 'lacrosse', 'football', 'tennis', 'swimming',
      'gymnastics', 'track_field', 'golf', 'wrestling', 'cheer',
      'dance', 'other'
    )
  );

create or replace function public.corralio_create_schedule_source_v2(
  p_household_id uuid,
  p_display_name text,
  p_source_url text,
  p_sport text default null,
  p_child_id uuid default null,
  p_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_source_id uuid;
  v_sport text := nullif(lower(btrim(p_sport)), '');
begin
  if v_sport is not null and v_sport not in (
    'baseball', 'softball', 'soccer', 'basketball', 'volleyball',
    'hockey', 'lacrosse', 'football', 'tennis', 'swimming',
    'gymnastics', 'track_field', 'golf', 'wrestling', 'cheer',
    'dance', 'other'
  ) then
    raise exception 'Schedule source sport is invalid' using errcode = '22023';
  end if;

  -- Preserve the reviewed V1 authentication, household, URL, assignment, and
  -- insert boundary rather than maintaining a parallel source writer.
  v_source_id := public.corralio_create_schedule_source(
    p_household_id,
    p_display_name,
    p_source_url,
    p_child_id,
    p_team_id
  );

  update public.corralio_schedule_sources source
  set sport = v_sport
  where source.id = v_source_id;

  return v_source_id;
end;
$function$;

create or replace function public.corralio_update_schedule_source_sport_v1(
  p_source_id uuid,
  p_sport text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_sport text := nullif(lower(btrim(p_sport)), '');
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if v_sport is not null and v_sport not in (
    'baseball', 'softball', 'soccer', 'basketball', 'volleyball',
    'hockey', 'lacrosse', 'football', 'tennis', 'swimming',
    'gymnastics', 'track_field', 'golf', 'wrestling', 'cheer',
    'dance', 'other'
  ) then
    raise exception 'Schedule source sport is invalid' using errcode = '22023';
  end if;

  update public.corralio_schedule_sources source
  set sport = v_sport
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
    );

  if not found then
    raise exception 'Schedule source not found or access denied' using errcode = '42501';
  end if;
end;
$function$;

alter function public.corralio_create_schedule_source_v2(uuid, text, text, text, uuid, uuid)
  owner to postgres;
alter function public.corralio_update_schedule_source_sport_v1(uuid, text)
  owner to postgres;

revoke all on function public.corralio_create_schedule_source_v2(uuid, text, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.corralio_update_schedule_source_sport_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.corralio_create_schedule_source_v2(uuid, text, text, text, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.corralio_update_schedule_source_sport_v1(uuid, text)
  to authenticated, service_role;

comment on column public.corralio_schedule_sources.sport is
  'Optional Corralio-local planning sport. Imported events derive presentation sport through schedule_source_id; TI eligibility is separate.';
comment on column public.corralio_teams.sport is
  'Optional private household team presentation sport. Corralio planning support does not imply TI tournament eligibility.';
comment on function public.corralio_create_schedule_source_v2(uuid, text, text, text, uuid, uuid) is
  'Authorized source creation with optional bounded Corralio-local sport metadata; returns only the source ID.';
comment on function public.corralio_update_schedule_source_sport_v1(uuid, text) is
  'Owner-authorized Corralio-local sport update for an active household ICS source.';
