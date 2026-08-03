-- RI analytics: persist first-party product action events.

create extension if not exists "pgcrypto";

create table if not exists public.ri_analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  source_app text,
  page_type text,
  page_path text,
  source_page_type text,
  source_page text,
  map_list_state text,
  sport text,
  state text,
  city text,
  month text,
  tournament_id text,
  tournament_slug text,
  venue_id text,
  traffic_source text,
  device_type text,
  user_type text,
  href text
);

create index if not exists ri_analytics_events_created_at_idx
  on public.ri_analytics_events (created_at desc);

create index if not exists ri_analytics_events_event_name_idx
  on public.ri_analytics_events (event_name);

create index if not exists ri_analytics_events_page_type_idx
  on public.ri_analytics_events (page_type);

create index if not exists ri_analytics_events_source_page_type_idx
  on public.ri_analytics_events (source_page_type);

create index if not exists ri_analytics_events_sport_idx
  on public.ri_analytics_events (sport);

create index if not exists ri_analytics_events_state_idx
  on public.ri_analytics_events (state);

create index if not exists ri_analytics_events_tournament_id_idx
  on public.ri_analytics_events (tournament_id);

create index if not exists ri_analytics_events_venue_id_idx
  on public.ri_analytics_events (venue_id);

alter table public.ri_analytics_events enable row level security;

revoke all on table public.ri_analytics_events from public;
revoke all on table public.ri_analytics_events from anon;
revoke all on table public.ri_analytics_events from authenticated;
