create table if not exists public.email_outreach_previews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sport text not null,
  campaign_id text not null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  tournament_name text not null,
  director_email text not null,
  verify_url text not null,
  subject text not null,
  html_body text not null,
  text_body text not null,
  status text not null default 'preview' check (status in ('preview', 'sent', 'error')),
  error text
);

create index if not exists email_outreach_previews_campaign_idx
  on public.email_outreach_previews (campaign_id, sport, created_at desc);

create index if not exists email_outreach_previews_tournament_idx
  on public.email_outreach_previews (tournament_id, created_at desc);

alter table public.email_outreach_previews enable row level security;

-- No policies: service role bypasses RLS, while anon/authenticated clients cannot read or write directly.
