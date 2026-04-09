-- TI analytics: persist map + homepage interactions (v1)
-- Stores lightweight analytics events emitted from `/` and `/heatmap`.
-- Inserted via `apps/ti-web/app/api/analytics/route.ts` using the service role.

create extension if not exists "pgcrypto";

create table if not exists public.ti_map_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  page_type text,
  sport text,
  state text,
  href text,
  filter_name text,
  old_value text,
  new_value text,
  cta text
);

create index if not exists ti_map_events_created_at_idx
  on public.ti_map_events (created_at desc);

create index if not exists ti_map_events_event_name_idx
  on public.ti_map_events (event_name);

create index if not exists ti_map_events_page_type_idx
  on public.ti_map_events (page_type);

create index if not exists ti_map_events_sport_idx
  on public.ti_map_events (sport);

create index if not exists ti_map_events_state_idx
  on public.ti_map_events (state);

alter table public.ti_map_events enable row level security;

revoke all on table public.ti_map_events from public;
revoke all on table public.ti_map_events from anon;
revoke all on table public.ti_map_events from authenticated;

