create table if not exists public.outbound_clicks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid null references auth.users(id) on delete set null,
  tournament_id uuid null references public.tournaments(id) on delete set null,
  source_id uuid null references public.tournament_sources(id) on delete set null,
  destination_url text not null,
  destination_domain text not null,
  destination_path text null,
  sport text null,
  ua_hash text null,
  ip_hash text null
);

create index if not exists outbound_clicks_tournament_time_idx
  on public.outbound_clicks (tournament_id, created_at desc);

create index if not exists outbound_clicks_source_time_idx
  on public.outbound_clicks (source_id, created_at desc);

create index if not exists outbound_clicks_domain_time_idx
  on public.outbound_clicks (destination_domain, created_at desc);

create index if not exists outbound_clicks_created_at_idx
  on public.outbound_clicks (created_at desc);

alter table public.outbound_clicks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'admin_all_outbound_clicks'
  ) then
    create policy admin_all_outbound_clicks
      on public.outbound_clicks
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;

create or replace view public.tournament_engagement_rolling as
select
  tournament_id,
  count(*) filter (where created_at >= now() - interval '7 days') as clicks_7d,
  count(*) filter (where created_at >= now() - interval '30 days') as clicks_30d,
  count(*) filter (where created_at >= now() - interval '90 days') as clicks_90d,
  count(distinct user_id) filter (
    where created_at >= now() - interval '30 days' and user_id is not null
  ) as unique_users_30d
from public.outbound_clicks
where tournament_id is not null
group by tournament_id;
