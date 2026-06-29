-- TI Lodging: API-level session and lifecycle tracking for hotel search.

create extension if not exists pgcrypto;

create table if not exists public.lodging_search_session (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  search_query jsonb,
  correlation_id text not null,
  session_id text,
  response_snapshot jsonb,
  result_count integer,
  endpoint text not null default '/api/lodging/search',
  status text,
  started_at timestamptz default now(),
  ended_at timestamptz,
  latency_ms integer,
  client_ip text,
  user_agent text,
  error_code text,
  fallback_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists lodging_search_session_client_ip_endpoint_created_at_idx
  on public.lodging_search_session (client_ip, user_agent, endpoint, created_at desc);

create index if not exists lodging_search_session_created_at_idx
  on public.lodging_search_session (created_at desc);

comment on table public.lodging_search_session is 'Tracks lodging search request lifecycle and fallback reasoning.';
