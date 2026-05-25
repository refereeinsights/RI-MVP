-- TI: entitlement grants ledger (v1)
-- Records paid/promo grants (e.g. weekend pass) for attribution + ops without overloading ti_users fields.

create extension if not exists "pgcrypto";

do $$
begin
  if to_regclass('public.ti_entitlement_grants') is not null then
    return;
  end if;

  create table public.ti_entitlement_grants (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    user_id uuid not null references auth.users(id) on delete cascade,
    offer text not null,
    access_days integer not null,
    expires_at timestamptz not null,
    source text null,
    livemode boolean not null default false,
    amount_cents integer null,
    currency text null,
    stripe_event_id text null,
    stripe_customer_id text null,
    stripe_checkout_session_id text null,
    stripe_payment_intent_id text null,
    metadata jsonb not null default '{}'::jsonb
  );

  -- Idempotency / attribution helpers (best-effort: all nullable).
  create unique index if not exists ti_entitlement_grants_stripe_event_id_uidx
    on public.ti_entitlement_grants (stripe_event_id)
    where stripe_event_id is not null;

  create unique index if not exists ti_entitlement_grants_payment_intent_uidx
    on public.ti_entitlement_grants (stripe_payment_intent_id)
    where stripe_payment_intent_id is not null;

  create index if not exists ti_entitlement_grants_user_id_idx
    on public.ti_entitlement_grants (user_id, created_at desc);

  create index if not exists ti_entitlement_grants_offer_idx
    on public.ti_entitlement_grants (offer, created_at desc);

  alter table public.ti_entitlement_grants enable row level security;

  -- Lock down access: service role only.
  revoke all on table public.ti_entitlement_grants from public, anon, authenticated;
  grant all on table public.ti_entitlement_grants to service_role;
end $$;

