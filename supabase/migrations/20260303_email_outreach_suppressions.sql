create table if not exists public.email_outreach_suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  sport text not null,
  director_email text,
  reason text not null default 'removed',
  status text not null default 'suppressed' check (status in ('suppressed', 'removed')),
  created_by_email text
);

create unique index if not exists email_outreach_suppressions_tournament_idx
  on public.email_outreach_suppressions (tournament_id);

create index if not exists email_outreach_suppressions_sport_idx
  on public.email_outreach_suppressions (sport, created_at desc);

alter table public.email_outreach_suppressions enable row level security;

-- No policies: service role bypasses RLS, while anon/authenticated clients cannot read or write directly.
