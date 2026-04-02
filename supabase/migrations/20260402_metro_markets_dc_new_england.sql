-- Metro markets (v1)
-- Service-role-only reference tables for grouping states into travel markets.
-- NOTE: Public pages will resolve metro markets server-side via service_role.

create table if not exists public.metro_markets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists metro_markets_slug_idx on public.metro_markets (slug);

create table if not exists public.metro_market_states (
  id uuid primary key default gen_random_uuid(),
  metro_market_id uuid not null references public.metro_markets (id) on delete cascade,
  state text not null,
  created_at timestamptz not null default now(),
  constraint metro_market_states_unique unique (metro_market_id, state)
);

create index if not exists metro_market_states_metro_market_id_idx on public.metro_market_states (metro_market_id);
create index if not exists metro_market_states_state_idx on public.metro_market_states (state);

-- Lock down access (service_role only).
alter table public.metro_markets enable row level security;
alter table public.metro_market_states enable row level security;

revoke all on table public.metro_markets from public, anon, authenticated;
revoke all on table public.metro_market_states from public, anon, authenticated;

grant select, insert, update, delete on table public.metro_markets to service_role;
grant select, insert, update, delete on table public.metro_market_states to service_role;

-- Seed (idempotent).
insert into public.metro_markets (name, slug)
values
  ('DC Metro', 'dc-metro'),
  ('New England', 'new-england')
on conflict (slug) do update
set name = excluded.name;

with m as (
  select id, slug
  from public.metro_markets
  where slug in ('dc-metro', 'new-england')
),
desired as (
  select (select id from m where slug = 'dc-metro') as metro_market_id, unnest(array['DC','VA','MD']) as state
  union all
  select (select id from m where slug = 'new-england') as metro_market_id, unnest(array['CT','RI','ME','NH']) as state
)
insert into public.metro_market_states (metro_market_id, state)
select d.metro_market_id, d.state
from desired d
where d.metro_market_id is not null
on conflict (metro_market_id, state) do nothing;

