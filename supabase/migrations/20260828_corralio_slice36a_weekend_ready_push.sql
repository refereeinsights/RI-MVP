-- Corralio Slice 3.6A Stage 1: service-only Weekend Ready Web Push state.
-- Prepared for human review/application. This migration sends no notification,
-- registers no cron, and performs no backfill or event reprocessing.

create table public.corralio_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.corralio_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  endpoint_hash bytea generated always as (digest(endpoint, 'sha256')) stored,
  p256dh text not null,
  auth_secret text not null,
  state text not null default 'active',
  deactivation_reason text null,
  deactivated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corralio_push_subscriptions_endpoint_check
    check (length(endpoint) between 1 and 4096 and endpoint ~ '^https://'),
  constraint corralio_push_subscriptions_p256dh_check
    check (length(p256dh) between 1 and 512 and p256dh ~ '^[A-Za-z0-9_-]+$'),
  constraint corralio_push_subscriptions_auth_check
    check (length(auth_secret) between 1 and 256 and auth_secret ~ '^[A-Za-z0-9_-]+$'),
  constraint corralio_push_subscriptions_state_check
    check (state in ('active', 'revoked', 'dead')),
  constraint corralio_push_subscriptions_deactivation_check check (
    (state = 'active' and deactivation_reason is null and deactivated_at is null)
    or
    (state <> 'active'
      and deactivation_reason in ('user_unsubscribed', 'membership_lost', 'dead_endpoint', 'replaced')
      and deactivated_at is not null)
  ),
  constraint corralio_push_subscriptions_endpoint_hash_unique unique (endpoint_hash)
);

create index corralio_push_subscriptions_household_active_idx
  on public.corralio_push_subscriptions (household_id, user_id, id)
  where state = 'active';

create table public.corralio_weekend_ready_campaigns (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.corralio_households(id) on delete cascade,
  planning_weekend_start date not null,
  window_strategy text not null default 'fixed_us_v1',
  event_window_start timestamptz not null,
  event_window_end timestamptz not null,
  created_at timestamptz not null default now(),
  constraint corralio_weekend_ready_campaigns_strategy_check
    check (window_strategy = 'fixed_us_v1'),
  constraint corralio_weekend_ready_campaigns_window_check
    check (event_window_end > event_window_start),
  constraint corralio_weekend_ready_campaigns_household_week_unique
    unique (household_id, planning_weekend_start)
);

create table public.corralio_weekend_ready_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    references public.corralio_weekend_ready_campaigns(id) on delete cascade,
  subscription_id uuid null
    references public.corralio_push_subscriptions(id) on delete set null,
  subscription_hash bytea not null,
  state text not null default 'pending',
  attempt_count integer not null default 0,
  claim_token uuid null,
  claimed_at timestamptz null,
  next_attempt_at timestamptz null default now(),
  last_attempted_at timestamptz null,
  accepted_at timestamptz null,
  error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corralio_weekend_ready_deliveries_state_check
    check (state in ('pending', 'accepted', 'transient_failure', 'permanent_failure', 'dead_endpoint')),
  constraint corralio_weekend_ready_deliveries_attempt_check
    check (attempt_count between 0 and 2),
  constraint corralio_weekend_ready_deliveries_error_check
    check (error_code is null or error_code in (
      'rate_limited', 'provider_error', 'invalid_request', 'dead_endpoint', 'retry_exhausted'
    )),
  constraint corralio_weekend_ready_deliveries_state_consistency check (
    (state = 'pending' and accepted_at is null and error_code is null)
    or (state = 'accepted' and accepted_at is not null and error_code is null)
    or (state = 'transient_failure' and accepted_at is null
      and error_code in ('rate_limited', 'provider_error'))
    or (state = 'permanent_failure' and accepted_at is null
      and error_code in ('invalid_request', 'retry_exhausted'))
    or (state = 'dead_endpoint' and accepted_at is null and error_code = 'dead_endpoint')
  ),
  constraint corralio_weekend_ready_deliveries_campaign_subscription_unique
    unique (campaign_id, subscription_hash)
);

create index corralio_weekend_ready_deliveries_claim_idx
  on public.corralio_weekend_ready_deliveries (next_attempt_at, created_at, id)
  where state in ('pending', 'transient_failure') and attempt_count < 2;

create table public.corralio_push_interactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.corralio_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  interaction_type text not null,
  occurred_at timestamptz not null default now(),
  constraint corralio_push_interactions_type_check check (
    interaction_type in ('soft_ask_shown', 'permission_granted', 'permission_denied', 'permission_dismissed')
  )
);

create unique index corralio_push_interactions_minute_dedupe_idx
  on public.corralio_push_interactions (
    household_id,
    user_id,
    interaction_type,
    date_trunc('minute', occurred_at at time zone 'UTC')
  );

comment on table public.corralio_push_subscriptions is
  'Service-only Web Push capabilities. Endpoint, p256dh and auth_secret are never browser-readable or logged.';
comment on table public.corralio_weekend_ready_campaigns is
  'One idempotent Weekend Ready campaign per household and approved planning weekend.';
comment on table public.corralio_weekend_ready_deliveries is
  'Minimum per-subscription delivery state for acceptance, bounded retry and dead-endpoint handling; not device delivery proof.';
comment on table public.corralio_push_interactions is
  'Closed, service-written notification soft-ask/permission outcomes; no endpoint, device attribute or arbitrary payload.';

alter table public.corralio_push_subscriptions enable row level security;
alter table public.corralio_push_subscriptions force row level security;
alter table public.corralio_weekend_ready_campaigns enable row level security;
alter table public.corralio_weekend_ready_campaigns force row level security;
alter table public.corralio_weekend_ready_deliveries enable row level security;
alter table public.corralio_weekend_ready_deliveries force row level security;
alter table public.corralio_push_interactions enable row level security;
alter table public.corralio_push_interactions force row level security;

revoke all on table public.corralio_push_subscriptions,
  public.corralio_weekend_ready_campaigns,
  public.corralio_weekend_ready_deliveries,
  public.corralio_push_interactions
  from public, anon, authenticated;
grant select, insert, update, delete on table public.corralio_push_subscriptions,
  public.corralio_weekend_ready_campaigns,
  public.corralio_weekend_ready_deliveries,
  public.corralio_push_interactions
  to service_role;

create function public.corralio_upsert_push_subscription_v1(
  p_user_id uuid,
  p_household_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_existing public.corralio_push_subscriptions%rowtype;
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted push subscription boundary is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.corralio_household_members member
    where member.household_id = p_household_id and member.user_id = p_user_id
      and member.role = 'owner' and member.status = 'active'
  ) then raise exception 'Household access denied' using errcode = '42501'; end if;
  if length(v_endpoint) not between 1 and 4096 or v_endpoint !~ '^https://'
     or length(coalesce(p_p256dh, '')) not between 1 and 512
     or p_p256dh !~ '^[A-Za-z0-9_-]+$'
     or length(coalesce(p_auth, '')) not between 1 and 256
     or p_auth !~ '^[A-Za-z0-9_-]+$'
  then raise exception 'Push subscription is invalid' using errcode = '22023'; end if;

  select subscription.* into v_existing
  from public.corralio_push_subscriptions subscription
  where subscription.endpoint_hash = digest(v_endpoint, 'sha256')
  for update;

  if found and (v_existing.user_id <> p_user_id or v_existing.household_id <> p_household_id) then
    raise exception 'Push endpoint is already registered' using errcode = '23505';
  end if;
  if found then
    update public.corralio_push_subscriptions subscription
    set endpoint = v_endpoint, p256dh = p_p256dh, auth_secret = p_auth,
        state = 'active', deactivation_reason = null, deactivated_at = null, updated_at = now()
    where subscription.id = v_existing.id;
  else
    insert into public.corralio_push_subscriptions (
      household_id, user_id, endpoint, p256dh, auth_secret
    ) values (p_household_id, p_user_id, v_endpoint, p_p256dh, p_auth);
  end if;
  return 'subscribed';
end;
$function$;

create function public.corralio_deactivate_push_subscription_v1(
  p_user_id uuid,
  p_household_id uuid,
  p_endpoint text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted push subscription boundary is required' using errcode = '42501';
  end if;
  update public.corralio_push_subscriptions subscription
  set state = 'revoked', deactivation_reason = 'user_unsubscribed',
      deactivated_at = now(), updated_at = now()
  where subscription.user_id = p_user_id
    and subscription.household_id = p_household_id
    and subscription.endpoint_hash = digest(btrim(coalesce(p_endpoint, '')), 'sha256')
    and subscription.state = 'active';
  return 'unsubscribed';
end;
$function$;

create function public.corralio_record_push_interaction_v1(
  p_user_id uuid,
  p_household_id uuid,
  p_interaction_type text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted push interaction boundary is required' using errcode = '42501';
  end if;
  if p_interaction_type not in (
    'soft_ask_shown', 'permission_granted', 'permission_denied', 'permission_dismissed'
  ) then raise exception 'Push interaction is invalid' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.corralio_household_members member
    where member.household_id = p_household_id and member.user_id = p_user_id
      and member.role = 'owner' and member.status = 'active'
  ) then raise exception 'Household access denied' using errcode = '42501'; end if;
  insert into public.corralio_push_interactions (household_id, user_id, interaction_type)
  values (p_household_id, p_user_id, p_interaction_type)
  on conflict do nothing;
end;
$function$;

create function public.corralio_deactivate_member_push_subscriptions_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'DELETE' then
    update public.corralio_push_subscriptions subscription
    set state = 'revoked', deactivation_reason = 'membership_lost',
        deactivated_at = now(), updated_at = now()
    where subscription.household_id = old.household_id
      and subscription.user_id = old.user_id
      and subscription.state = 'active';
    return old;
  end if;
  if new.role <> 'owner' or new.status <> 'active' then
    update public.corralio_push_subscriptions subscription
    set state = 'revoked', deactivation_reason = 'membership_lost',
        deactivated_at = now(), updated_at = now()
    where subscription.household_id = old.household_id
      and subscription.user_id = old.user_id
      and subscription.state = 'active';
  end if;
  return new;
end;
$function$;

create trigger corralio_household_members_deactivate_push_subscriptions
  after delete or update of role, status on public.corralio_household_members
  for each row execute function public.corralio_deactivate_member_push_subscriptions_v1();

create function public.corralio_claim_weekend_ready_deliveries_v1(
  p_planning_weekend_start date,
  p_event_window_start timestamptz,
  p_event_window_end timestamptz,
  p_limit integer default 50
)
returns table (
  delivery_id uuid,
  claim_token uuid,
  attempt_count integer,
  endpoint text,
  p256dh text,
  auth_secret text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted Weekend Ready worker is required' using errcode = '42501';
  end if;
  if p_planning_weekend_start is null
     or p_event_window_start is null or p_event_window_end <= p_event_window_start
  then raise exception 'Weekend Ready window is invalid' using errcode = '22023'; end if;

  insert into public.corralio_weekend_ready_campaigns (
    household_id, planning_weekend_start, window_strategy, event_window_start, event_window_end
  )
  select distinct subscription.household_id, p_planning_weekend_start,
    'fixed_us_v1', p_event_window_start, p_event_window_end
  from public.corralio_push_subscriptions subscription
  join public.corralio_household_members member
    on member.household_id = subscription.household_id
   and member.user_id = subscription.user_id
   and member.role = 'owner' and member.status = 'active'
  where subscription.state = 'active'
    and exists (
      select 1 from public.corralio_events event
      where event.household_id = subscription.household_id
        and event.starts_at >= p_event_window_start and event.starts_at < p_event_window_end
        and (
          event.schedule_source_id is null
          or exists (
            select 1 from public.corralio_schedule_sources source
            where source.id = event.schedule_source_id
              and source.household_id = event.household_id
              and source.sync_status <> 'disconnected'
          )
        )
    )
  on conflict (household_id, planning_weekend_start) do nothing;

  insert into public.corralio_weekend_ready_deliveries (
    campaign_id, subscription_id, subscription_hash
  )
  select campaign.id, subscription.id, subscription.endpoint_hash
  from public.corralio_weekend_ready_campaigns campaign
  join public.corralio_push_subscriptions subscription
    on subscription.household_id = campaign.household_id and subscription.state = 'active'
  join public.corralio_household_members member
    on member.household_id = subscription.household_id
   and member.user_id = subscription.user_id
   and member.role = 'owner' and member.status = 'active'
  where campaign.planning_weekend_start = p_planning_weekend_start
  on conflict (campaign_id, subscription_hash) do nothing;

  return query
  with candidates as materialized (
    select delivery.id
    from public.corralio_weekend_ready_deliveries delivery
    join public.corralio_weekend_ready_campaigns campaign on campaign.id = delivery.campaign_id
    join public.corralio_push_subscriptions subscription
      on subscription.id = delivery.subscription_id and subscription.state = 'active'
    join public.corralio_household_members member
      on member.household_id = subscription.household_id
     and member.user_id = subscription.user_id
     and member.role = 'owner' and member.status = 'active'
    where campaign.planning_weekend_start = p_planning_weekend_start
      and delivery.state in ('pending', 'transient_failure')
      and delivery.attempt_count < 2
      and coalesce(delivery.next_attempt_at, now()) <= now()
      and (delivery.claim_token is null or delivery.claimed_at <= now() - interval '10 minutes')
      and exists (
        select 1 from public.corralio_events event
        where event.household_id = campaign.household_id
          and event.starts_at >= campaign.event_window_start
          and event.starts_at < campaign.event_window_end
          and (
            event.schedule_source_id is null
            or exists (
              select 1 from public.corralio_schedule_sources source
              where source.id = event.schedule_source_id
                and source.household_id = event.household_id
                and source.sync_status <> 'disconnected'
            )
          )
      )
    order by delivery.next_attempt_at asc nulls first, delivery.created_at asc, delivery.id asc
    for update of delivery skip locked
    limit v_limit
  ), claimed as (
    update public.corralio_weekend_ready_deliveries delivery
    set claim_token = gen_random_uuid(), claimed_at = now(),
        attempt_count = delivery.attempt_count + 1,
        last_attempted_at = now(), updated_at = now()
    from candidates where delivery.id = candidates.id
    returning delivery.id, delivery.subscription_id, delivery.claim_token, delivery.attempt_count
  )
  select claimed.id, claimed.claim_token, claimed.attempt_count,
    subscription.endpoint, subscription.p256dh, subscription.auth_secret
  from claimed
  join public.corralio_push_subscriptions subscription on subscription.id = claimed.subscription_id
  order by claimed.id;
end;
$function$;

create function public.corralio_finish_weekend_ready_delivery_v1(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_delivery public.corralio_weekend_ready_deliveries%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted Weekend Ready worker is required' using errcode = '42501';
  end if;
  if p_outcome not in ('accepted', 'transient_failure', 'permanent_failure', 'dead_endpoint')
  then raise exception 'Delivery outcome is invalid' using errcode = '22023'; end if;

  select delivery.* into v_delivery
  from public.corralio_weekend_ready_deliveries delivery
  where delivery.id = p_delivery_id and delivery.claim_token = p_claim_token
    and delivery.claimed_at > now() - interval '10 minutes'
    and delivery.state in ('pending', 'transient_failure')
  for update;
  if not found then return false; end if;

  if p_outcome = 'accepted' then
    update public.corralio_weekend_ready_deliveries set
      state = 'accepted', accepted_at = now(), error_code = null,
      next_attempt_at = null, claim_token = null, claimed_at = null, updated_at = now()
    where id = v_delivery.id;
  elsif p_outcome = 'transient_failure' and v_delivery.attempt_count < 2 then
    if p_error_code not in ('rate_limited', 'provider_error') then
      raise exception 'Transient error code is invalid' using errcode = '22023';
    end if;
    update public.corralio_weekend_ready_deliveries set
      state = 'transient_failure', error_code = p_error_code,
      next_attempt_at = now() + interval '90 minutes',
      claim_token = null, claimed_at = null, updated_at = now()
    where id = v_delivery.id;
  elsif p_outcome = 'dead_endpoint' then
    update public.corralio_weekend_ready_deliveries set
      state = 'dead_endpoint', error_code = 'dead_endpoint', next_attempt_at = null,
      claim_token = null, claimed_at = null, updated_at = now()
    where id = v_delivery.id;
    update public.corralio_push_subscriptions subscription set
      state = 'dead', deactivation_reason = 'dead_endpoint',
      deactivated_at = now(), updated_at = now()
    where subscription.id = v_delivery.subscription_id and subscription.state = 'active';
  else
    if p_outcome = 'permanent_failure' and p_error_code <> 'invalid_request' then
      raise exception 'Permanent error code is invalid' using errcode = '22023';
    end if;
    update public.corralio_weekend_ready_deliveries set
      state = 'permanent_failure',
      error_code = case when p_outcome = 'permanent_failure' then 'invalid_request' else 'retry_exhausted' end,
      next_attempt_at = null, claim_token = null, claimed_at = null, updated_at = now()
    where id = v_delivery.id;
  end if;
  return true;
end;
$function$;

revoke all on function public.corralio_upsert_push_subscription_v1(uuid,uuid,text,text,text),
  public.corralio_deactivate_push_subscription_v1(uuid,uuid,text),
  public.corralio_record_push_interaction_v1(uuid,uuid,text),
  public.corralio_deactivate_member_push_subscriptions_v1(),
  public.corralio_claim_weekend_ready_deliveries_v1(date,timestamptz,timestamptz,integer),
  public.corralio_finish_weekend_ready_delivery_v1(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.corralio_upsert_push_subscription_v1(uuid,uuid,text,text,text),
  public.corralio_deactivate_push_subscription_v1(uuid,uuid,text),
  public.corralio_record_push_interaction_v1(uuid,uuid,text),
  public.corralio_claim_weekend_ready_deliveries_v1(date,timestamptz,timestamptz,integer),
  public.corralio_finish_weekend_ready_delivery_v1(uuid,uuid,text,text)
  to service_role;

alter function public.corralio_upsert_push_subscription_v1(uuid,uuid,text,text,text) owner to postgres;
alter function public.corralio_deactivate_push_subscription_v1(uuid,uuid,text) owner to postgres;
alter function public.corralio_record_push_interaction_v1(uuid,uuid,text) owner to postgres;
alter function public.corralio_deactivate_member_push_subscriptions_v1() owner to postgres;
alter function public.corralio_claim_weekend_ready_deliveries_v1(date,timestamptz,timestamptz,integer) owner to postgres;
alter function public.corralio_finish_weekend_ready_delivery_v1(uuid,uuid,text,text) owner to postgres;
