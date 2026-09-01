-- Corralio Gate 3 Stage 1: centralized durable SMS send-safety state.
-- Prepared for human application to the authorized isolated database. This
-- migration sends no SMS, enables no phone Auth, and configures no provider.

create table public.corralio_sms_test_policy (
  id smallint primary key default 1,
  policy_version text not null default 'gate3-isolated-v1',
  enabled boolean not null default false,
  send_mode text not null default 'test_allowlist',
  global_daily_segment_limit smallint not null default 20,
  destination_daily_segment_limit smallint not null default 5,
  max_segments_per_message smallint not null default 1,
  phone_requests_per_hour smallint not null default 3,
  ip_requests_per_hour smallint not null default 5,
  resend_cooldown_seconds smallint not null default 60,
  permit_ttl_seconds smallint not null default 180,
  updated_at timestamptz not null default now(),
  constraint corralio_sms_test_policy_singleton_check check (id = 1),
  constraint corralio_sms_test_policy_version_check check (policy_version = 'gate3-isolated-v1'),
  constraint corralio_sms_test_policy_mode_check check (send_mode = 'test_allowlist'),
  constraint corralio_sms_test_policy_limits_check check (
    global_daily_segment_limit = 20
    and destination_daily_segment_limit = 5
    and max_segments_per_message = 1
    and phone_requests_per_hour between 1 and 10
    and ip_requests_per_hour between 1 and 20
    and resend_cooldown_seconds between 30 and 300
    and permit_ttl_seconds between 60 and 300
  )
);

insert into public.corralio_sms_test_policy (id) values (1);

create table public.corralio_sms_test_allowlist (
  destination_hmac text primary key,
  policy_id smallint not null default 1 references public.corralio_sms_test_policy(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint corralio_sms_test_allowlist_hmac_check check (destination_hmac ~ '^[0-9a-f]{64}$')
);

create table public.corralio_sms_request_rate_state (
  bucket_type text not null,
  bucket_hmac text not null,
  window_started_at timestamptz not null,
  request_count smallint not null,
  cooldown_until timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (bucket_type, bucket_hmac),
  constraint corralio_sms_request_rate_type_check check (bucket_type in ('destination', 'ip')),
  constraint corralio_sms_request_rate_hmac_check check (bucket_hmac ~ '^[0-9a-f]{64}$'),
  constraint corralio_sms_request_rate_count_check check (request_count between 0 and 32767),
  constraint corralio_sms_request_rate_cooldown_check check (
    (bucket_type = 'destination' and cooldown_until is not null)
    or (bucket_type = 'ip' and cooldown_until is null)
  )
);

create table public.corralio_sms_request_decisions (
  id uuid primary key default gen_random_uuid(),
  destination_hmac text not null,
  ip_hmac text not null,
  decision text not null,
  decided_at timestamptz not null,
  retain_until timestamptz not null,
  constraint corralio_sms_request_decisions_destination_check check (destination_hmac ~ '^[0-9a-f]{64}$'),
  constraint corralio_sms_request_decisions_ip_check check (ip_hmac ~ '^[0-9a-f]{64}$'),
  constraint corralio_sms_request_decisions_decision_check check (
    decision in ('authorized', 'rate_limited', 'cooldown', 'invalid_mode', 'policy_disabled', 'not_allowlisted', 'blocked')
  ),
  constraint corralio_sms_request_decisions_retention_check check (retain_until > decided_at)
);

create index corralio_sms_request_decisions_retention_idx
  on public.corralio_sms_request_decisions (retain_until, id);

create table public.corralio_sms_phone_send_permits (
  id uuid primary key default gen_random_uuid(),
  destination_hmac text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  consumed_by_webhook_id text null,
  closed_at timestamptz null,
  close_reason text null,
  retain_until timestamptz not null,
  constraint corralio_sms_phone_send_permits_hmac_check check (destination_hmac ~ '^[0-9a-f]{64}$'),
  constraint corralio_sms_phone_send_permits_expiry_check check (expires_at > issued_at),
  constraint corralio_sms_phone_send_permits_webhook_check check (
    consumed_by_webhook_id is null or consumed_by_webhook_id ~ '^[A-Za-z0-9_-]{1,128}$'
  ),
  constraint corralio_sms_phone_send_permits_state_check check (
    (consumed_at is null and consumed_by_webhook_id is null and closed_at is null and close_reason is null)
    or (consumed_at is not null and consumed_by_webhook_id is not null and closed_at is null and close_reason is null)
    or (consumed_at is null and consumed_by_webhook_id is null and closed_at is not null
      and close_reason in ('expired', 'policy_disabled', 'invalid_mode', 'not_allowlisted', 'segment_limit', 'global_cap', 'destination_cap'))
  ),
  constraint corralio_sms_phone_send_permits_retention_check check (retain_until > expires_at)
);

create unique index corralio_sms_phone_send_permits_one_live_idx
  on public.corralio_sms_phone_send_permits (destination_hmac)
  where consumed_at is null and closed_at is null;
create unique index corralio_sms_phone_send_permits_webhook_idx
  on public.corralio_sms_phone_send_permits (consumed_by_webhook_id)
  where consumed_by_webhook_id is not null;
create index corralio_sms_phone_send_permits_retention_idx
  on public.corralio_sms_phone_send_permits (retain_until, id);

create table public.corralio_sms_webhook_claims (
  webhook_id text primary key,
  destination_hmac text not null,
  permit_id uuid null references public.corralio_sms_phone_send_permits(id),
  decision text not null,
  first_seen_at timestamptz not null,
  provider_attempt_authorized_at timestamptz null,
  utc_budget_date date null,
  reserved_segments smallint not null default 0,
  retain_until timestamptz not null,
  constraint corralio_sms_webhook_claims_id_check check (webhook_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint corralio_sms_webhook_claims_hmac_check check (destination_hmac ~ '^[0-9a-f]{64}$'),
  constraint corralio_sms_webhook_claims_permit_unique unique (permit_id),
  constraint corralio_sms_webhook_claims_decision_check check (
    decision in ('authorized', 'duplicate', 'missing_permit', 'expired_permit', 'invalid_mode',
      'policy_disabled', 'not_allowlisted', 'segment_limit', 'global_cap', 'destination_cap', 'blocked')
  ),
  constraint corralio_sms_webhook_claims_authorization_check check (
    (decision = 'authorized' and permit_id is not null and provider_attempt_authorized_at is not null
      and utc_budget_date is not null and reserved_segments = 1)
    or (decision <> 'authorized' and provider_attempt_authorized_at is null
      and utc_budget_date is null and reserved_segments = 0)
  ),
  constraint corralio_sms_webhook_claims_retention_check check (retain_until > first_seen_at)
);

create index corralio_sms_webhook_claims_retention_idx
  on public.corralio_sms_webhook_claims (retain_until, webhook_id);

create table public.corralio_sms_daily_segment_budgets (
  utc_date date primary key,
  reserved_segments smallint not null default 0,
  updated_at timestamptz not null,
  constraint corralio_sms_daily_segment_budgets_count_check check (reserved_segments between 0 and 20)
);

create table public.corralio_sms_destination_segment_budgets (
  utc_date date not null,
  destination_hmac text not null,
  reserved_segments smallint not null default 0,
  updated_at timestamptz not null,
  primary key (utc_date, destination_hmac),
  constraint corralio_sms_destination_segment_budgets_hmac_check check (destination_hmac ~ '^[0-9a-f]{64}$'),
  constraint corralio_sms_destination_segment_budgets_count_check check (reserved_segments between 0 and 5)
);

comment on table public.corralio_sms_test_policy is
  'Durable, disabled-by-default isolated Gate 3 policy. Secrets and destinations never appear here.';
comment on table public.corralio_sms_phone_send_permits is
  'One-use short-lived destination-HMAC permits; contains no raw phone, IP, OTP, token, or message.';
comment on table public.corralio_sms_webhook_claims is
  'Durable webhook idempotency and at-most-one provider-attempt authorization; no provider payload.';

alter table public.corralio_sms_test_policy enable row level security;
alter table public.corralio_sms_test_policy force row level security;
alter table public.corralio_sms_test_allowlist enable row level security;
alter table public.corralio_sms_test_allowlist force row level security;
alter table public.corralio_sms_request_rate_state enable row level security;
alter table public.corralio_sms_request_rate_state force row level security;
alter table public.corralio_sms_request_decisions enable row level security;
alter table public.corralio_sms_request_decisions force row level security;
alter table public.corralio_sms_phone_send_permits enable row level security;
alter table public.corralio_sms_phone_send_permits force row level security;
alter table public.corralio_sms_webhook_claims enable row level security;
alter table public.corralio_sms_webhook_claims force row level security;
alter table public.corralio_sms_daily_segment_budgets enable row level security;
alter table public.corralio_sms_daily_segment_budgets force row level security;
alter table public.corralio_sms_destination_segment_budgets enable row level security;
alter table public.corralio_sms_destination_segment_budgets force row level security;

revoke all on table public.corralio_sms_test_policy, public.corralio_sms_test_allowlist,
  public.corralio_sms_request_rate_state, public.corralio_sms_request_decisions,
  public.corralio_sms_phone_send_permits, public.corralio_sms_webhook_claims,
  public.corralio_sms_daily_segment_budgets, public.corralio_sms_destination_segment_budgets
  from public, anon, authenticated, service_role;

create function public.corralio_authorize_sms_otp_request_v1(
  p_destination_hmac text,
  p_ip_hmac text
)
returns table(decision text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_policy public.corralio_sms_test_policy%rowtype;
  v_phone public.corralio_sms_request_rate_state%rowtype;
  v_ip public.corralio_sms_request_rate_state%rowtype;
  v_now timestamptz := clock_timestamp();
  v_window timestamptz := date_trunc('hour', v_now at time zone 'UTC') at time zone 'UTC';
  v_first_lock bigint;
  v_second_lock bigint;
  v_decision text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted SMS request boundary is required' using errcode = '42501';
  end if;
  if coalesce(p_destination_hmac, '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_ip_hmac, '') !~ '^[0-9a-f]{64}$' then
    return query select 'blocked'::text; return;
  end if;

  select * into v_policy from public.corralio_sms_test_policy where id = 1 for update;
  if not found or not v_policy.enabled then v_decision := 'policy_disabled';
  elsif v_policy.send_mode <> 'test_allowlist' then v_decision := 'invalid_mode';
  elsif not exists (select 1 from public.corralio_sms_test_allowlist a
      where a.destination_hmac = p_destination_hmac and a.policy_id = 1 and a.active)
    then v_decision := 'not_allowlisted';
  end if;
  if v_decision is not null then
    insert into public.corralio_sms_request_decisions
      (destination_hmac, ip_hmac, decision, decided_at, retain_until)
      values (p_destination_hmac, p_ip_hmac, v_decision, v_now, v_now + interval '7 days');
    return query select v_decision; return;
  end if;

  v_first_lock := hashtextextended('destination:' || p_destination_hmac, 0);
  v_second_lock := hashtextextended('ip:' || p_ip_hmac, 0);
  if v_first_lock > v_second_lock then
    perform pg_advisory_xact_lock(v_second_lock); perform pg_advisory_xact_lock(v_first_lock);
  else
    perform pg_advisory_xact_lock(v_first_lock); perform pg_advisory_xact_lock(v_second_lock);
  end if;

  update public.corralio_sms_phone_send_permits permit
    set closed_at = v_now, close_reason = 'expired'
    where permit.destination_hmac = p_destination_hmac and permit.consumed_at is null
      and permit.closed_at is null and permit.expires_at <= v_now;

  select * into v_phone from public.corralio_sms_request_rate_state state
    where state.bucket_type = 'destination' and state.bucket_hmac = p_destination_hmac for update;
  select * into v_ip from public.corralio_sms_request_rate_state state
    where state.bucket_type = 'ip' and state.bucket_hmac = p_ip_hmac for update;

  if v_phone.cooldown_until is not null and v_phone.cooldown_until > v_now
     or exists (select 1 from public.corralio_sms_phone_send_permits permit
       where permit.destination_hmac = p_destination_hmac and permit.consumed_at is null and permit.closed_at is null)
    then v_decision := 'cooldown';
  elsif v_phone.window_started_at = v_window and v_phone.request_count >= v_policy.phone_requests_per_hour
    then v_decision := 'rate_limited';
  elsif v_ip.window_started_at = v_window and v_ip.request_count >= v_policy.ip_requests_per_hour
    then v_decision := 'rate_limited';
  end if;
  if v_decision is not null then
    insert into public.corralio_sms_request_decisions
      (destination_hmac, ip_hmac, decision, decided_at, retain_until)
      values (p_destination_hmac, p_ip_hmac, v_decision, v_now, v_now + interval '7 days');
    return query select v_decision; return;
  end if;

  insert into public.corralio_sms_request_rate_state
    (bucket_type, bucket_hmac, window_started_at, request_count, cooldown_until, updated_at)
    values ('destination', p_destination_hmac, v_window, 1,
      v_now + make_interval(secs => v_policy.resend_cooldown_seconds), v_now)
  on conflict (bucket_type, bucket_hmac) do update set
    window_started_at = case when public.corralio_sms_request_rate_state.window_started_at = v_window
      then public.corralio_sms_request_rate_state.window_started_at else v_window end,
    request_count = case when public.corralio_sms_request_rate_state.window_started_at = v_window
      then public.corralio_sms_request_rate_state.request_count + 1 else 1 end,
    cooldown_until = v_now + make_interval(secs => v_policy.resend_cooldown_seconds), updated_at = v_now;
  insert into public.corralio_sms_request_rate_state
    (bucket_type, bucket_hmac, window_started_at, request_count, cooldown_until, updated_at)
    values ('ip', p_ip_hmac, v_window, 1, null, v_now)
  on conflict (bucket_type, bucket_hmac) do update set
    window_started_at = case when public.corralio_sms_request_rate_state.window_started_at = v_window
      then public.corralio_sms_request_rate_state.window_started_at else v_window end,
    request_count = case when public.corralio_sms_request_rate_state.window_started_at = v_window
      then public.corralio_sms_request_rate_state.request_count + 1 else 1 end,
    cooldown_until = null, updated_at = v_now;

  insert into public.corralio_sms_phone_send_permits
    (destination_hmac, issued_at, expires_at, retain_until)
    values (p_destination_hmac, v_now,
      v_now + make_interval(secs => v_policy.permit_ttl_seconds), v_now + interval '7 days');
  insert into public.corralio_sms_request_decisions
    (destination_hmac, ip_hmac, decision, decided_at, retain_until)
    values (p_destination_hmac, p_ip_hmac, 'authorized', v_now, v_now + interval '7 days');
  return query select 'authorized'::text;
end;
$function$;

create function public.corralio_authorize_sms_hook_attempt_v1(
  p_webhook_id text,
  p_destination_hmac text,
  p_segments smallint
)
returns table(decision text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_policy public.corralio_sms_test_policy%rowtype;
  v_permit public.corralio_sms_phone_send_permits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_date date := (v_now at time zone 'UTC')::date;
  v_rows integer;
  v_global smallint;
  v_destination smallint;
  v_decision text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted SMS hook boundary is required' using errcode = '42501';
  end if;
  if coalesce(p_webhook_id, '') !~ '^[A-Za-z0-9_-]{1,128}$'
     or coalesce(p_destination_hmac, '') !~ '^[0-9a-f]{64}$'
     or p_segments is null or p_segments < 1 then
    return query select 'blocked'::text; return;
  end if;

  insert into public.corralio_sms_webhook_claims
    (webhook_id, destination_hmac, decision, first_seen_at, retain_until)
    values (p_webhook_id, p_destination_hmac, 'blocked', v_now, v_now + interval '30 days')
    on conflict (webhook_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return query select 'duplicate'::text; return; end if;

  select * into v_permit from public.corralio_sms_phone_send_permits permit
    where permit.destination_hmac = p_destination_hmac and permit.consumed_at is null
      and permit.closed_at is null and permit.expires_at <= v_now
    order by permit.issued_at, permit.id limit 1 for update;
  if found then
    update public.corralio_sms_phone_send_permits set closed_at = v_now, close_reason = 'expired'
      where id = v_permit.id;
    update public.corralio_sms_webhook_claims set permit_id = v_permit.id, decision = 'expired_permit'
      where webhook_id = p_webhook_id;
    return query select 'expired_permit'::text; return;
  end if;

  select * into v_permit from public.corralio_sms_phone_send_permits permit
    where permit.destination_hmac = p_destination_hmac and permit.consumed_at is null
      and permit.closed_at is null and permit.expires_at > v_now
    order by permit.issued_at, permit.id limit 1 for update;
  if not found then
    update public.corralio_sms_webhook_claims set decision = 'missing_permit' where webhook_id = p_webhook_id;
    return query select 'missing_permit'::text; return;
  end if;

  select * into v_policy from public.corralio_sms_test_policy where id = 1 for update;
  if not found or not v_policy.enabled then v_decision := 'policy_disabled';
  elsif v_policy.send_mode <> 'test_allowlist' then v_decision := 'invalid_mode';
  elsif not exists (select 1 from public.corralio_sms_test_allowlist a
      where a.destination_hmac = p_destination_hmac and a.policy_id = 1 and a.active)
    then v_decision := 'not_allowlisted';
  elsif p_segments <> 1 or p_segments > v_policy.max_segments_per_message then v_decision := 'segment_limit';
  end if;
  if v_decision is not null then
    update public.corralio_sms_phone_send_permits set closed_at = v_now, close_reason = v_decision where id = v_permit.id;
    update public.corralio_sms_webhook_claims set permit_id = v_permit.id, decision = v_decision where webhook_id = p_webhook_id;
    return query select v_decision; return;
  end if;

  insert into public.corralio_sms_daily_segment_budgets (utc_date, reserved_segments, updated_at)
    values (v_date, 0, v_now) on conflict (utc_date) do nothing;
  select budget.reserved_segments into v_global from public.corralio_sms_daily_segment_budgets budget
    where budget.utc_date = v_date for update;
  insert into public.corralio_sms_destination_segment_budgets
    (utc_date, destination_hmac, reserved_segments, updated_at)
    values (v_date, p_destination_hmac, 0, v_now) on conflict (utc_date, destination_hmac) do nothing;
  select budget.reserved_segments into v_destination from public.corralio_sms_destination_segment_budgets budget
    where budget.utc_date = v_date and budget.destination_hmac = p_destination_hmac for update;

  if v_global + p_segments > v_policy.global_daily_segment_limit then v_decision := 'global_cap';
  elsif v_destination + p_segments > v_policy.destination_daily_segment_limit then v_decision := 'destination_cap';
  end if;
  if v_decision is not null then
    update public.corralio_sms_phone_send_permits set closed_at = v_now, close_reason = v_decision where id = v_permit.id;
    update public.corralio_sms_webhook_claims set permit_id = v_permit.id, decision = v_decision where webhook_id = p_webhook_id;
    return query select v_decision; return;
  end if;

  update public.corralio_sms_daily_segment_budgets
    set reserved_segments = reserved_segments + p_segments, updated_at = v_now where utc_date = v_date;
  update public.corralio_sms_destination_segment_budgets
    set reserved_segments = reserved_segments + p_segments, updated_at = v_now
    where utc_date = v_date and destination_hmac = p_destination_hmac;
  update public.corralio_sms_phone_send_permits
    set consumed_at = v_now, consumed_by_webhook_id = p_webhook_id where id = v_permit.id;
  update public.corralio_sms_webhook_claims set permit_id = v_permit.id, decision = 'authorized',
    provider_attempt_authorized_at = v_now, utc_budget_date = v_date, reserved_segments = p_segments
    where webhook_id = p_webhook_id;
  return query select 'authorized'::text;
end;
$function$;

revoke all on function public.corralio_authorize_sms_otp_request_v1(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.corralio_authorize_sms_hook_attempt_v1(text, text, smallint)
  from public, anon, authenticated, service_role;
grant execute on function public.corralio_authorize_sms_otp_request_v1(text, text) to service_role;
grant execute on function public.corralio_authorize_sms_hook_attempt_v1(text, text, smallint) to service_role;

alter function public.corralio_authorize_sms_otp_request_v1(text, text) owner to postgres;
alter function public.corralio_authorize_sms_hook_attempt_v1(text, text, smallint) owner to postgres;
