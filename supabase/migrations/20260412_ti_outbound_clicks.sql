-- TI: outbound clicks (official site redirects) (v1)
-- Track clicks on tournament "Official site" links via /go/tournament/[slug] redirects.

do $$
begin
  if to_regclass('public.tournaments') is null then
    return;
  end if;

  create table if not exists public.ti_outbound_clicks (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    tournament_id uuid not null references public.tournaments (id) on delete cascade,
    tournament_slug text not null,
    target_url text not null,
    redirect_url text not null,
    source_path text null,
    referer text null,
    host text null,
    user_agent text null,
    is_localhost boolean not null default false
  );

  create index if not exists ti_outbound_clicks_tournament_id_created_at_idx
    on public.ti_outbound_clicks (tournament_id, created_at desc);

  create index if not exists ti_outbound_clicks_created_at_idx
    on public.ti_outbound_clicks (created_at desc);

  alter table public.ti_outbound_clicks enable row level security;
  revoke all on table public.ti_outbound_clicks from public, anon, authenticated;
  grant select, insert, update, delete on table public.ti_outbound_clicks to service_role;
end $$;

