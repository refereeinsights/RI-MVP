-- TI: Stripe revenue rollups (gross/net after tax+fees+refunds)
-- Stores per-invoice metrics and a daily rollup for fast admin dashboard queries.

do $$
begin
  if to_regclass('public.stripe_invoice_metrics') is null then
    create table public.stripe_invoice_metrics (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      livemode boolean not null default false,
      invoice_id text not null,
      customer_id text null,
      subscription_id text null,
      charge_id text null,
      balance_transaction_id text null,
      user_id uuid null,
      currency text not null default 'USD',
      paid_at timestamptz null,
      invoice_total numeric not null default 0,
      invoice_tax numeric not null default 0,
      stripe_fee numeric not null default 0,
      refunded_amount numeric not null default 0,
      net numeric not null default 0,
      payload jsonb null
    );

    create unique index stripe_invoice_metrics_invoice_id_uidx
      on public.stripe_invoice_metrics (invoice_id);

    create index stripe_invoice_metrics_paid_at_idx
      on public.stripe_invoice_metrics (paid_at desc)
      where paid_at is not null;

    create index stripe_invoice_metrics_charge_id_idx
      on public.stripe_invoice_metrics (charge_id)
      where charge_id is not null;

    create index stripe_invoice_metrics_user_id_idx
      on public.stripe_invoice_metrics (user_id)
      where user_id is not null;

    alter table public.stripe_invoice_metrics enable row level security;
    revoke all on table public.stripe_invoice_metrics from public, anon, authenticated;
    grant all on table public.stripe_invoice_metrics to service_role;
  end if;

  if to_regclass('public.stripe_daily_metrics') is null then
    create table public.stripe_daily_metrics (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      day date not null,
      livemode boolean not null default false,
      currency text not null default 'USD',
      invoice_count integer not null default 0,
      gross numeric not null default 0,
      tax numeric not null default 0,
      fees numeric not null default 0,
      refunds numeric not null default 0,
      net numeric not null default 0
    );

    create unique index stripe_daily_metrics_day_uidx
      on public.stripe_daily_metrics (day, livemode, currency);

    create index stripe_daily_metrics_day_idx
      on public.stripe_daily_metrics (day desc);

    alter table public.stripe_daily_metrics enable row level security;
    revoke all on table public.stripe_daily_metrics from public, anon, authenticated;
    grant all on table public.stripe_daily_metrics to service_role;
  end if;
end $$;

-- Keep updated_at current on updates (service-role only).
do $$
begin
  create or replace function public._set_updated_at()
  returns trigger
  language plpgsql
  as $fn$
  begin
    new.updated_at = now();
    return new;
  end;
  $fn$;

  if to_regclass('public.stripe_invoice_metrics') is not null then
    drop trigger if exists stripe_invoice_metrics_set_updated_at on public.stripe_invoice_metrics;
    create trigger stripe_invoice_metrics_set_updated_at
    before update on public.stripe_invoice_metrics
    for each row
    execute function public._set_updated_at();
  end if;

  if to_regclass('public.stripe_daily_metrics') is not null then
    drop trigger if exists stripe_daily_metrics_set_updated_at on public.stripe_daily_metrics;
    create trigger stripe_daily_metrics_set_updated_at
    before update on public.stripe_daily_metrics
    for each row
    execute function public._set_updated_at();
  end if;
end $$;

