-- TI: Stripe webhook idempotency + audit log (v1)
-- Keeps billing/entitlement webhooks safe to retry and debuggable without a full transactions table.

do $$
begin
  if to_regclass('public.stripe_webhook_events') is not null then
    return;
  end if;

  create table public.stripe_webhook_events (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    stripe_event_id text not null,
    event_type text not null,
    livemode boolean not null,
    user_id uuid null,
    customer_id text null,
    subscription_id text null,
    status text not null default 'processed',
    error_message text null,
    payload jsonb null
  );

  create unique index stripe_webhook_events_stripe_event_id_uidx
    on public.stripe_webhook_events (stripe_event_id);

  create index stripe_webhook_events_created_at_idx
    on public.stripe_webhook_events (created_at desc);

  create index stripe_webhook_events_subscription_id_idx
    on public.stripe_webhook_events (subscription_id)
    where subscription_id is not null;

  create index stripe_webhook_events_user_id_idx
    on public.stripe_webhook_events (user_id)
    where user_id is not null;

  alter table public.stripe_webhook_events enable row level security;

  -- Allowlist status values.
  alter table public.stripe_webhook_events
    add constraint stripe_webhook_events_status_allowed
    check (status in ('processed', 'skipped', 'error'));

  -- Lock down access: service role only.
  revoke all on table public.stripe_webhook_events from public, anon, authenticated;
  grant all on table public.stripe_webhook_events to service_role;
end $$;

