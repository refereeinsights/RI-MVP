-- Corralio Slice 4.2A Stage 1: weekly household usage measurement.
-- Prepared on 2026-08-24. A human must apply this migration manually before
-- any Stage 2 verification. Do not run it from an application deploy.

create table public.corralio_weekly_engagement (
  household_id uuid not null
    references public.corralio_households(id) on delete cascade,
  usage_week_start date not null,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  had_conflict boolean null,
  max_conflict_count integer null,
  conflict_check_unavailable boolean not null default false,
  primary key (household_id, usage_week_start),
  constraint corralio_weekly_engagement_conflict_consistency check (
    (had_conflict is null
     and max_conflict_count is null
     and conflict_check_unavailable is true)
    or (had_conflict is false and max_conflict_count = 0)
    or (had_conflict is true and max_conflict_count > 0)
  )
);

comment on table public.corralio_weekly_engagement is
  'One privacy-minimized engagement row per household per UTC ISO week; retained until household deletion.';
comment on column public.corralio_weekly_engagement.usage_week_start is
  'UTC ISO Monday for longitudinal measurement; distinct from the browser-local Fri-Sun product window.';

alter table public.corralio_weekly_engagement enable row level security;

revoke all on table public.corralio_weekly_engagement
  from public, anon, authenticated;
grant select on table public.corralio_weekly_engagement to service_role;

create function public.corralio_record_weekly_engagement_v1(
  p_had_conflict boolean,
  p_conflict_count integer,
  p_conflict_check_unavailable boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_usage_week_start date :=
    (date_trunc('week', timezone('utc', now())))::date;
begin
  if v_user_id is null then
    return;
  end if;

  select member.household_id
    into v_household_id
  from public.corralio_household_members member
  where member.user_id = v_user_id
    and member.role = 'owner'
    and member.status = 'active'
  limit 1;

  if v_household_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.corralio_schedule_sources source
    where source.household_id = v_household_id
      and source.sync_status <> 'disconnected'
  ) then
    return;
  end if;

  if p_conflict_check_unavailable is null then
    raise exception 'Conflict availability is required' using errcode = '22004';
  end if;

  if p_conflict_check_unavailable is false then
    if p_had_conflict is null then
      raise exception 'Conflict outcome is required for a verified check'
        using errcode = '22004';
    end if;
    if p_conflict_count is null then
      raise exception 'Conflict count is required for a verified check'
        using errcode = '22004';
    end if;
    if p_conflict_count < 0 then
      raise exception 'Conflict count cannot be negative' using errcode = '22023';
    end if;
    if p_had_conflict is true and p_conflict_count <= 0 then
      raise exception 'A conflict outcome requires a positive count'
        using errcode = '22023';
    end if;
    if p_had_conflict is false and p_conflict_count <> 0 then
      raise exception 'A no-conflict outcome requires a zero count'
        using errcode = '22023';
    end if;
  end if;

  if p_conflict_check_unavailable is true then
    insert into public.corralio_weekly_engagement (
      household_id,
      usage_week_start,
      had_conflict,
      max_conflict_count,
      conflict_check_unavailable
    ) values (
      v_household_id,
      v_usage_week_start,
      null,
      null,
      true
    )
    on conflict (household_id, usage_week_start) do update
      set last_viewed_at = now(),
          conflict_check_unavailable = true;
  else
    insert into public.corralio_weekly_engagement (
      household_id,
      usage_week_start,
      had_conflict,
      max_conflict_count,
      conflict_check_unavailable
    ) values (
      v_household_id,
      v_usage_week_start,
      p_had_conflict,
      p_conflict_count,
      false
    )
    on conflict (household_id, usage_week_start) do update
      set last_viewed_at = now(),
          had_conflict = coalesce(
            public.corralio_weekly_engagement.had_conflict,
            false
          ) or excluded.had_conflict,
          max_conflict_count = greatest(
            coalesce(public.corralio_weekly_engagement.max_conflict_count, 0),
            excluded.max_conflict_count
          );
  end if;
end;
$function$;

revoke all on function public.corralio_record_weekly_engagement_v1(boolean, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.corralio_record_weekly_engagement_v1(boolean, integer, boolean)
  to authenticated;
grant execute on function public.corralio_record_weekly_engagement_v1(boolean, integer, boolean)
  to service_role;
alter function public.corralio_record_weekly_engagement_v1(boolean, integer, boolean)
  owner to postgres;
comment on function public.corralio_record_weekly_engagement_v1(boolean, integer, boolean) is
  'Best-effort, privacy-minimized weekly engagement accumulation for the authenticated owner household.';
