-- TI: tournament seasons (year-specific dates) + scan log for 2027 prep
-- Phase 1: service_role only (no public/authenticated access).

do $$
begin
  if to_regclass('public.tournament_seasons') is null then
    create table public.tournament_seasons (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      tournament_id uuid not null references public.tournaments(id) on delete cascade,
      season_year integer not null,
      start_date date null,
      end_date date null,
      source_url text null,
      official_website_url text null,
      date_precision text null, -- 'day' | 'month' | 'unknown'
      confidence text null, -- 'high' | 'medium' | 'low'
      notes text null
    );

    create unique index tournament_seasons_tournament_year_uidx
      on public.tournament_seasons (tournament_id, season_year);

    create index tournament_seasons_year_start_date_idx
      on public.tournament_seasons (season_year, start_date);

    create index tournament_seasons_tournament_year_desc_idx
      on public.tournament_seasons (tournament_id, season_year desc);

    alter table public.tournament_seasons enable row level security;
    revoke all on table public.tournament_seasons from public, anon, authenticated;
    grant all on table public.tournament_seasons to service_role;
  end if;

  if to_regclass('public.tournament_season_scan_log') is null then
    create table public.tournament_season_scan_log (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      tournament_id uuid not null references public.tournaments(id) on delete cascade,
      season_year integer not null,
      scanned_at timestamptz not null default now(),
      update_action text not null,
      source_checked text null, -- 'source_url' | 'official_website_url' | 'web_search'
      source_url_found text null,
      official_website_url_found text null,
      confidence text null, -- 'high' | 'medium' | 'low'
      notes text null,
      error text null
    );

    create unique index tournament_season_scan_log_tournament_year_uidx
      on public.tournament_season_scan_log (tournament_id, season_year);

    create index tournament_season_scan_log_year_scanned_at_idx
      on public.tournament_season_scan_log (season_year, scanned_at desc);

    create index tournament_season_scan_log_action_scanned_at_idx
      on public.tournament_season_scan_log (update_action, scanned_at desc);

    alter table public.tournament_season_scan_log enable row level security;
    revoke all on table public.tournament_season_scan_log from public, anon, authenticated;
    grant all on table public.tournament_season_scan_log to service_role;
  end if;
end $$;

-- Keep updated_at current on updates (service-role only).
do $$
begin
  if to_regclass('public._tournament_seasons_set_updated_at') is null then
    create or replace function public._tournament_seasons_set_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;

  if to_regclass('public.tournament_seasons') is not null then
    drop trigger if exists tournament_seasons_set_updated_at on public.tournament_seasons;
    create trigger tournament_seasons_set_updated_at
    before update on public.tournament_seasons
    for each row
    execute function public._tournament_seasons_set_updated_at();
  end if;

  if to_regclass('public.tournament_season_scan_log') is not null then
    drop trigger if exists tournament_season_scan_log_set_updated_at on public.tournament_season_scan_log;
    create trigger tournament_season_scan_log_set_updated_at
    before update on public.tournament_season_scan_log
    for each row
    execute function public._tournament_seasons_set_updated_at();
  end if;
end $$;

