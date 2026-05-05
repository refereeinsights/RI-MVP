-- Admin: API usage alarms (per-API thresholds) for /admin/api-usage
-- Calendar windows (UTC) + cooldown + "window rolled" support.
-- Phase 1: service_role only (no public/authenticated access).

do $$
begin
  if to_regclass('public.api_usage_alarms') is null then
    create table public.api_usage_alarms (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      api text not null,
      metric text not null, -- 'calls' | 'errors' | 'error_rate'
      window_type text not null, -- 'day' | 'week' | 'month' (calendar windows, UTC)
      threshold numeric not null,

      notify_email text not null,
      cooldown_minutes integer not null default 60,
      last_alerted_at timestamptz null,
      last_alerted_window_start timestamptz null,
      enabled boolean not null default true,
      notes text null,

      constraint api_usage_alarms_window_type_chk check (window_type in ('day', 'week', 'month')),
      constraint api_usage_alarms_metric_chk check (metric in ('calls', 'errors', 'error_rate')),
      constraint api_usage_alarms_threshold_nonneg_chk check (threshold >= 0),
      constraint api_usage_alarms_error_rate_threshold_chk check (metric != 'error_rate' or threshold <= 100)
    );

    create unique index api_usage_alarms_uniq
      on public.api_usage_alarms (api, metric, window_type, notify_email);

    create index api_usage_alarms_enabled_api_idx
      on public.api_usage_alarms (enabled, api);

    create index api_usage_alarms_updated_at_idx
      on public.api_usage_alarms (updated_at desc);

    alter table public.api_usage_alarms enable row level security;
    revoke all on table public.api_usage_alarms from public, anon, authenticated;
    grant all on table public.api_usage_alarms to service_role;
  end if;
end $$;

-- Keep updated_at current on updates (service-role only).
do $$
begin
  if to_regclass('public._api_usage_alarms_set_updated_at') is null then
    create or replace function public._api_usage_alarms_set_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;

  if to_regclass('public.api_usage_alarms') is not null then
    drop trigger if exists api_usage_alarms_set_updated_at on public.api_usage_alarms;
    create trigger api_usage_alarms_set_updated_at
    before update on public.api_usage_alarms
    for each row
    execute function public._api_usage_alarms_set_updated_at();
  end if;
end $$;

