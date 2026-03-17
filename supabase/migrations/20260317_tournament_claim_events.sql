-- Tournament claim funnel events (TI).
-- Lightweight persistence to understand usage + support basic rate limiting.

create table if not exists public.tournament_claim_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  event_type text not null,
  entered_email text,
  user_id uuid,
  ip_hash text,
  user_agent text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tournament_claim_events_tournament_created_at_idx
  on public.tournament_claim_events(tournament_id, created_at desc);

create index if not exists tournament_claim_events_event_type_created_at_idx
  on public.tournament_claim_events(event_type, created_at desc);

create index if not exists tournament_claim_events_ip_hash_created_at_idx
  on public.tournament_claim_events(ip_hash, created_at desc);

alter table public.tournament_claim_events enable row level security;

