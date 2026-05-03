-- TI: Affiliate (Awin/CJ) daily rollups for admin dashboard
-- Stores gross sales + commission totals by day/network/advertiser/status.

do $$
begin
  if to_regclass('public.ti_affiliate_daily_metrics') is not null then
    return;
  end if;

  create table public.ti_affiliate_daily_metrics (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    day date not null,
    network text not null, -- 'awin' | 'cj'
    advertiser_id text not null,
    advertiser_name text null,
    status text not null, -- normalized: 'cleared' | 'pending' | 'declined' | 'unknown'
    currency text not null default 'USD',
    tx_count integer not null default 0,
    gross_sales numeric not null default 0,
    commission numeric not null default 0
  );

  create unique index ti_affiliate_daily_metrics_uniq
    on public.ti_affiliate_daily_metrics (day, network, advertiser_id, status, currency);

  create index ti_affiliate_daily_metrics_day_idx
    on public.ti_affiliate_daily_metrics (day desc);

  create index ti_affiliate_daily_metrics_network_day_idx
    on public.ti_affiliate_daily_metrics (network, day desc);

  alter table public.ti_affiliate_daily_metrics enable row level security;

  revoke all on table public.ti_affiliate_daily_metrics from public, anon, authenticated;
  grant all on table public.ti_affiliate_daily_metrics to service_role;
end $$;

-- Keep updated_at current on updates (service-role only).
do $$
begin
  if to_regclass('public._ti_affiliate_daily_metrics_set_updated_at') is not null then
    return;
  end if;

  create or replace function public._ti_affiliate_daily_metrics_set_updated_at()
  returns trigger
  language plpgsql
  as $fn$
  begin
    new.updated_at = now();
    return new;
  end;
  $fn$;

  create trigger ti_affiliate_daily_metrics_set_updated_at
  before update on public.ti_affiliate_daily_metrics
  for each row
  execute function public._ti_affiliate_daily_metrics_set_updated_at();
end $$;

