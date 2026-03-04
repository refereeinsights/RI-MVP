alter table public.event_codes
  add column if not exists status text,
  add column if not exists trial_days integer,
  add column if not exists max_redemptions integer,
  add column if not exists redeemed_count integer,
  add column if not exists expires_at timestamptz,
  add column if not exists notes text;

update public.event_codes
set
  status = coalesce(status, case when coalesce(is_active, true) then 'active' else 'inactive' end),
  trial_days = coalesce(trial_days, 7),
  max_redemptions = coalesce(max_redemptions, 1),
  redeemed_count = coalesce(redeemed_count, 0)
where status is null
   or trial_days is null
   or max_redemptions is null
   or redeemed_count is null;

alter table public.event_codes
  alter column status set default 'active',
  alter column trial_days set default 7,
  alter column max_redemptions set default 1,
  alter column redeemed_count set default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_codes_status_check'
  ) then
    alter table public.event_codes
      add constraint event_codes_status_check
      check (status in ('active', 'inactive', 'expired', 'exhausted'));
  end if;
end $$;

create unique index if not exists event_codes_code_lower_uidx
  on public.event_codes (lower(code));

drop function if exists public.create_event_code(
  text,
  integer,
  integer,
  timestamptz,
  timestamptz,
  text,
  boolean
);

create or replace function public.create_event_code(
  p_code text,
  p_trial_days integer default 7,
  p_max_redemptions integer default 1,
  p_starts_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_notes text default null,
  p_founding_access boolean default false
)
returns public.event_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.event_codes;
begin
  insert into public.event_codes (
    code,
    status,
    is_active,
    trial_days,
    max_redemptions,
    redeemed_count,
    starts_at,
    expires_at,
    notes,
    founding_access
  )
  values (
    trim(p_code),
    'active',
    true,
    greatest(coalesce(p_trial_days, 7), 1),
    greatest(coalesce(p_max_redemptions, 1), 1),
    0,
    p_starts_at,
    p_expires_at,
    nullif(trim(p_notes), ''),
    coalesce(p_founding_access, false)
  )
  returning * into v_row;

  return v_row;
end;
$$;

drop function if exists public.redeem_event_code(text);

create or replace function public.redeem_event_code(p_code text)
returns public.event_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_code public.event_codes;
  v_trial_end timestamptz;
  v_existing_current_period_end timestamptz;
  v_existing_trial_end timestamptz;
  v_email text := nullif(trim(coalesce(auth.jwt()->>'email', '')), '');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_code
  from public.event_codes
  where lower(code) = lower(trim(p_code))
  limit 1
  for update;

  if v_code.id is null then
    raise exception 'Invalid event code';
  end if;

  if coalesce(v_code.status, 'active') <> 'active' or coalesce(v_code.is_active, true) = false then
    raise exception 'This event code is not active';
  end if;

  if v_code.starts_at is not null and v_code.starts_at > v_now then
    raise exception 'This event code is not active yet';
  end if;

  if v_code.expires_at is not null and v_code.expires_at <= v_now then
    update public.event_codes
    set status = 'expired',
        is_active = false
    where id = v_code.id;
    raise exception 'This event code has expired';
  end if;

  if coalesce(v_code.redeemed_count, 0) >= coalesce(v_code.max_redemptions, 1) then
    update public.event_codes
    set status = 'exhausted',
        is_active = false
    where id = v_code.id;
    raise exception 'This event code has already been fully redeemed';
  end if;

  v_trial_end := v_now + make_interval(days => greatest(coalesce(v_code.trial_days, 7), 1));

  select current_period_end, trial_ends_at
  into v_existing_current_period_end, v_existing_trial_end
  from public.ti_users
  where id = v_user_id;

  insert into public.ti_users (
    id,
    email,
    plan,
    subscription_status,
    current_period_end,
    trial_ends_at,
    signup_source,
    signup_source_code,
    first_seen_at,
    last_seen_at,
    updated_at
  )
  values (
    v_user_id,
    v_email,
    case when coalesce(v_code.founding_access, false) then 'weekend_pro' else 'weekend_pro' end,
    case when coalesce(v_code.founding_access, false) then 'active' else 'trialing' end,
    case
      when coalesce(v_code.founding_access, false) then null
      else v_trial_end
    end,
    case
      when coalesce(v_code.founding_access, false) then null
      else v_trial_end
    end,
    'event_code',
    trim(p_code),
    v_now,
    v_now,
    v_now
  )
  on conflict (id) do update
  set
    email = coalesce(excluded.email, public.ti_users.email),
    plan = case
      when coalesce(v_code.founding_access, false) then 'weekend_pro'
      else 'weekend_pro'
    end,
    subscription_status = case
      when coalesce(v_code.founding_access, false) then 'active'
      when public.ti_users.subscription_status = 'active'
        and (public.ti_users.current_period_end is null or public.ti_users.current_period_end > v_now)
        then public.ti_users.subscription_status
      else 'trialing'
    end,
    current_period_end = case
      when coalesce(v_code.founding_access, false) then public.ti_users.current_period_end
      when public.ti_users.current_period_end is not null and public.ti_users.current_period_end > v_trial_end
        then public.ti_users.current_period_end
      else v_trial_end
    end,
    trial_ends_at = case
      when coalesce(v_code.founding_access, false) then public.ti_users.trial_ends_at
      when public.ti_users.trial_ends_at is not null and public.ti_users.trial_ends_at > v_trial_end
        then public.ti_users.trial_ends_at
      else v_trial_end
    end,
    signup_source = 'event_code',
    signup_source_code = trim(p_code),
    last_seen_at = v_now,
    updated_at = v_now;

  update public.event_codes
  set
    redeemed_count = coalesce(redeemed_count, 0) + 1,
    status = case
      when coalesce(redeemed_count, 0) + 1 >= coalesce(max_redemptions, 1) then 'exhausted'
      else 'active'
    end,
    is_active = case
      when coalesce(redeemed_count, 0) + 1 >= coalesce(max_redemptions, 1) then false
      else true
    end
  where id = v_code.id
  returning * into v_code;

  return v_code;
end;
$$;
