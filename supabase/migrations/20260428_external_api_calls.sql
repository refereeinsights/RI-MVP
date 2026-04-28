-- External API call tracking (v1)
-- One lightweight row per outbound API call: Google Places, Mapbox, Resend, Open-Meteo.
-- Used by the RI admin /admin/api-usage dashboard.
-- Rows older than 90 days can be purged via cron; daily aggregates in external_api_call_daily_totals
-- preserve long-term history without accumulating raw rows indefinitely.

create table if not exists public.external_api_calls (
  id          bigserial primary key,
  api         text        not null,  -- 'google_places' | 'mapbox' | 'resend' | 'open_meteo'
  operation   text        not null,  -- 'nearby_search' | 'geocode' | 'timezone' | 'static_map' | 'send_email' | etc.
  surface     text        not null,  -- caller context: 'owls_eye_batch' | 'venue_geocode' | 'email_alert' | etc.
  status      text        not null,  -- 'ok' | 'error'
  latency_ms  integer,
  error       text,
  called_at   timestamptz not null default now()
);

create index if not exists external_api_calls_api_called_at_idx
  on public.external_api_calls (api, called_at desc);

create index if not exists external_api_calls_called_at_idx
  on public.external_api_calls (called_at desc);

-- Service role only.
revoke all on table public.external_api_calls from public;
revoke all on table public.external_api_calls from anon;
revoke all on table public.external_api_calls from authenticated;
grant select, insert on table public.external_api_calls to service_role;
grant usage, select on sequence public.external_api_calls_id_seq to service_role;
