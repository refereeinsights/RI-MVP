-- Corralio Slice 4.2A Stage 1: immutable household acquisition provenance.
-- Prepared on 2026-08-24. A human must apply this migration manually after
-- 20260824_corralio_slice42a_core_usage_measurement.sql.

alter table public.corralio_households
  add column acquisition_provenance text not null default 'direct'
  constraint corralio_households_acquisition_provenance_check
  check (acquisition_provenance in ('direct', 'ti_weekend_planner_opt_in'));

comment on column public.corralio_households.acquisition_provenance is
  'Immutable first-household-creation origin; contains no TI identity or session identifier.';

create function public.corralio_households_lock_acquisition_provenance()
returns trigger
language plpgsql
as $function$
begin
  if new.acquisition_provenance is distinct from old.acquisition_provenance then
    raise exception 'acquisition_provenance is immutable' using errcode = '23514';
  end if;
  return new;
end;
$function$;

alter function public.corralio_households_lock_acquisition_provenance()
  owner to postgres;
revoke all on function public.corralio_households_lock_acquisition_provenance()
  from public, anon, authenticated;

create trigger corralio_households_lock_acquisition_provenance
  before update on public.corralio_households
  for each row
  execute function public.corralio_households_lock_acquisition_provenance();

-- A changed argument list creates an overload, so the one-argument function
-- must be dropped before the replacement is created. A dependency failure is
-- intentionally fatal and must be investigated rather than worked around.
drop function public.corralio_ensure_owner_household(text);

create function public.corralio_ensure_owner_household(
  p_display_name text default null,
  p_acquisition_provenance text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_display_name text := nullif(btrim(p_display_name), '');
  v_acquisition_provenance text := case
    when p_acquisition_provenance = 'ti_weekend_planner_opt_in'
      then p_acquisition_provenance
    else 'direct'
  end;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if v_display_name is not null and length(v_display_name) > 100 then
    raise exception 'Household name is too long' using errcode = '22001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 1129270345)
  );

  select member.household_id
    into v_household_id
  from public.corralio_household_members member
  where member.user_id = v_user_id
    and member.role = 'owner'
    and member.status = 'active'
  limit 1;

  if v_household_id is not null then
    return v_household_id;
  end if;

  insert into public.corralio_households (display_name, acquisition_provenance)
  values (v_display_name, v_acquisition_provenance)
  returning id into v_household_id;

  insert into public.corralio_household_members (household_id, user_id, role, status)
  values (v_household_id, v_user_id, 'owner', 'active');

  return v_household_id;
end;
$function$;

revoke all on function public.corralio_ensure_owner_household(text, text)
  from public, anon, authenticated;
grant execute on function public.corralio_ensure_owner_household(text, text)
  to authenticated;
grant execute on function public.corralio_ensure_owner_household(text, text)
  to service_role;
alter function public.corralio_ensure_owner_household(text, text) owner to postgres;
comment on function public.corralio_ensure_owner_household(text, text) is
  'Idempotently creates the authenticated user V1 owner household under an advisory transaction lock.';
