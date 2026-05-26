-- TI Weekend Planner (Stage 1): user-owned manual planner entities + future-facing sources/feeds tables.
-- - All tables are user-owned (RLS) except planner_event_venue_matches which is owned via the parent event.
-- - Uses `public.set_updated_at()`; creates it if missing for env safety.

create extension if not exists "pgcrypto";

-- Ensure shared updated_at trigger helper exists.
do $$
begin
  if to_regprocedure('public.set_updated_at()') is null then
    create or replace function public.set_updated_at() returns trigger as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$ language plpgsql;
  end if;
end $$;

-- -------------------------
-- Tables
-- -------------------------

create table if not exists public.planner_weekends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  start_date date not null,
  end_date date not null,
  primary_team_name text,
  tournament_id uuid null references public.tournaments(id) on delete set null,
  location_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planner_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekend_id uuid null references public.planner_weekends(id) on delete set null,
  title text not null,
  event_type text not null default 'game',
  team_name text,
  opponent_name text,
  tournament_id uuid null references public.tournaments(id) on delete set null,
  venue_id uuid null references public.venues(id) on delete set null,
  field_label text,
  address_text text,
  city text,
  state text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text,
  notes text,
  source_type text not null default 'manual',
  source_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planner_event_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_name text,
  source_url text,
  team_name text,
  last_synced_at timestamptz,
  sync_status text,
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planner_event_venue_matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.planner_events(id) on delete cascade,
  venue_id uuid null references public.venues(id) on delete set null,
  match_status text not null default 'unmatched',
  match_confidence numeric,
  raw_location_text text,
  reviewed_by_user boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planner_user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  default_team_name text,
  default_timezone text,
  alert_minutes_before integer not null default 60,
  show_weather boolean not null default true,
  show_hotels boolean not null default true,
  show_venue_intelligence boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planner_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feed_token text not null unique,
  feed_name text,
  is_active boolean not null default true,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------
-- Grants (PostgREST under RLS)
-- -------------------------

grant select, insert, update, delete on table public.planner_weekends to authenticated;
grant select, insert, update, delete on table public.planner_weekends to service_role;

grant select, insert, update, delete on table public.planner_events to authenticated;
grant select, insert, update, delete on table public.planner_events to service_role;

grant select, insert, update, delete on table public.planner_event_sources to authenticated;
grant select, insert, update, delete on table public.planner_event_sources to service_role;

grant select, insert, update, delete on table public.planner_event_venue_matches to authenticated;
grant select, insert, update, delete on table public.planner_event_venue_matches to service_role;

grant select, insert, update, delete on table public.planner_user_preferences to authenticated;
grant select, insert, update, delete on table public.planner_user_preferences to service_role;

grant select, insert, update, delete on table public.planner_calendar_feeds to authenticated;
grant select, insert, update, delete on table public.planner_calendar_feeds to service_role;

-- -------------------------
-- Indexes
-- -------------------------

create index if not exists planner_weekends_user_id_idx on public.planner_weekends (user_id);

create index if not exists planner_events_user_id_starts_at_idx on public.planner_events (user_id, starts_at);
create index if not exists planner_events_weekend_id_idx on public.planner_events (weekend_id);
create index if not exists planner_events_venue_id_idx on public.planner_events (venue_id);

create index if not exists planner_event_sources_user_id_idx on public.planner_event_sources (user_id);

create index if not exists planner_calendar_feeds_user_id_idx on public.planner_calendar_feeds (user_id);

create index if not exists planner_event_venue_matches_event_id_idx on public.planner_event_venue_matches (event_id);
create index if not exists planner_event_venue_matches_venue_id_idx on public.planner_event_venue_matches (venue_id);

-- -------------------------
-- updated_at triggers
-- -------------------------

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'trg_planner_weekends_updated_at') then
      create trigger trg_planner_weekends_updated_at
        before update on public.planner_weekends
        for each row execute function public.set_updated_at();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'trg_planner_events_updated_at') then
      create trigger trg_planner_events_updated_at
        before update on public.planner_events
        for each row execute function public.set_updated_at();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'trg_planner_event_sources_updated_at') then
      create trigger trg_planner_event_sources_updated_at
        before update on public.planner_event_sources
        for each row execute function public.set_updated_at();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'trg_planner_event_venue_matches_updated_at') then
      create trigger trg_planner_event_venue_matches_updated_at
        before update on public.planner_event_venue_matches
        for each row execute function public.set_updated_at();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'trg_planner_user_preferences_updated_at') then
      create trigger trg_planner_user_preferences_updated_at
        before update on public.planner_user_preferences
        for each row execute function public.set_updated_at();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'trg_planner_calendar_feeds_updated_at') then
      create trigger trg_planner_calendar_feeds_updated_at
        before update on public.planner_calendar_feeds
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- -------------------------
-- RLS
-- -------------------------

alter table public.planner_weekends enable row level security;
alter table public.planner_events enable row level security;
alter table public.planner_event_sources enable row level security;
alter table public.planner_event_venue_matches enable row level security;
alter table public.planner_user_preferences enable row level security;
alter table public.planner_calendar_feeds enable row level security;

-- user-owned tables: weekends
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_weekends' and policyname='planner_weekends_select_own') then
    create policy planner_weekends_select_own on public.planner_weekends for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_weekends' and policyname='planner_weekends_insert_own') then
    create policy planner_weekends_insert_own on public.planner_weekends for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_weekends' and policyname='planner_weekends_update_own') then
    create policy planner_weekends_update_own on public.planner_weekends for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_weekends' and policyname='planner_weekends_delete_own') then
    create policy planner_weekends_delete_own on public.planner_weekends for delete using (auth.uid() = user_id);
  end if;
end $$;

-- user-owned tables: events
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_events' and policyname='planner_events_select_own') then
    create policy planner_events_select_own on public.planner_events for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_events' and policyname='planner_events_insert_own') then
    create policy planner_events_insert_own on public.planner_events for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_events' and policyname='planner_events_update_own') then
    create policy planner_events_update_own on public.planner_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_events' and policyname='planner_events_delete_own') then
    create policy planner_events_delete_own on public.planner_events for delete using (auth.uid() = user_id);
  end if;
end $$;

-- user-owned tables: sources
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_event_sources' and policyname='planner_event_sources_select_own') then
    create policy planner_event_sources_select_own on public.planner_event_sources for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_event_sources' and policyname='planner_event_sources_insert_own') then
    create policy planner_event_sources_insert_own on public.planner_event_sources for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_event_sources' and policyname='planner_event_sources_update_own') then
    create policy planner_event_sources_update_own on public.planner_event_sources for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_event_sources' and policyname='planner_event_sources_delete_own') then
    create policy planner_event_sources_delete_own on public.planner_event_sources for delete using (auth.uid() = user_id);
  end if;
end $$;

-- user-owned tables: preferences
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_user_preferences' and policyname='planner_user_preferences_select_own') then
    create policy planner_user_preferences_select_own on public.planner_user_preferences for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_user_preferences' and policyname='planner_user_preferences_insert_own') then
    create policy planner_user_preferences_insert_own on public.planner_user_preferences for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_user_preferences' and policyname='planner_user_preferences_update_own') then
    create policy planner_user_preferences_update_own on public.planner_user_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_user_preferences' and policyname='planner_user_preferences_delete_own') then
    create policy planner_user_preferences_delete_own on public.planner_user_preferences for delete using (auth.uid() = user_id);
  end if;
end $$;

-- user-owned tables: calendar feeds
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_calendar_feeds' and policyname='planner_calendar_feeds_select_own') then
    create policy planner_calendar_feeds_select_own on public.planner_calendar_feeds for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_calendar_feeds' and policyname='planner_calendar_feeds_insert_own') then
    create policy planner_calendar_feeds_insert_own on public.planner_calendar_feeds for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_calendar_feeds' and policyname='planner_calendar_feeds_update_own') then
    create policy planner_calendar_feeds_update_own on public.planner_calendar_feeds for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_calendar_feeds' and policyname='planner_calendar_feeds_delete_own') then
    create policy planner_calendar_feeds_delete_own on public.planner_calendar_feeds for delete using (auth.uid() = user_id);
  end if;
end $$;

-- event-owned table: venue matches
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_event_venue_matches' and policyname='planner_event_venue_matches_select_own') then
    create policy planner_event_venue_matches_select_own
      on public.planner_event_venue_matches
      for select
      using (
        exists (
          select 1
          from public.planner_events e
          where e.id = planner_event_venue_matches.event_id
            and e.user_id = auth.uid()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_event_venue_matches' and policyname='planner_event_venue_matches_insert_own') then
    create policy planner_event_venue_matches_insert_own
      on public.planner_event_venue_matches
      for insert
      with check (
        exists (
          select 1
          from public.planner_events e
          where e.id = planner_event_venue_matches.event_id
            and e.user_id = auth.uid()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_event_venue_matches' and policyname='planner_event_venue_matches_update_own') then
    create policy planner_event_venue_matches_update_own
      on public.planner_event_venue_matches
      for update
      using (
        exists (
          select 1
          from public.planner_events e
          where e.id = planner_event_venue_matches.event_id
            and e.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.planner_events e
          where e.id = planner_event_venue_matches.event_id
            and e.user_id = auth.uid()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_event_venue_matches' and policyname='planner_event_venue_matches_delete_own') then
    create policy planner_event_venue_matches_delete_own
      on public.planner_event_venue_matches
      for delete
      using (
        exists (
          select 1
          from public.planner_events e
          where e.id = planner_event_venue_matches.event_id
            and e.user_id = auth.uid()
        )
      );
  end if;
end $$;

