-- TI: venue field/court maps (multi-map) (v1)
-- Adds a child table so a venue can store multiple map artifacts (e.g. soccer vs basketball),
-- while still allowing a single "primary" map to be cached back onto public.venues if desired.

do $$
begin
  if to_regclass('public.venues') is null then
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- public.venue_field_maps
  -- ---------------------------------------------------------------------------
  create table if not exists public.venue_field_maps (
    id bigserial primary key,
    venue_id uuid not null references public.venues(id) on delete cascade,
    map_url text not null,
    map_hash text null,
    map_source text null,
    map_confidence text null,
    map_type text null,
    sport text null,
    notes text null,
    is_primary boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  begin
    alter table public.venue_field_maps
      add constraint venue_field_maps_confidence_check
      check (map_confidence is null or map_confidence in ('high','medium','low'));
  exception when duplicate_object then
    null;
  end;

  begin
    alter table public.venue_field_maps
      add constraint venue_field_maps_type_check
      check (
        map_type is null
        or map_type in (
          'complex_layout',
          'parking_map',
          'field_numbering',
          'indoor_court_map',
          'campus_map',
          'general_facility_map',
          'unknown'
        )
      );
  exception when duplicate_object then
    null;
  end;

  -- One primary map per venue.
  create unique index if not exists venue_field_maps_one_primary_per_venue_idx
    on public.venue_field_maps (venue_id)
    where is_primary = true;

  create index if not exists venue_field_maps_venue_id_idx
    on public.venue_field_maps (venue_id, updated_at desc);

  create unique index if not exists venue_field_maps_venue_hash_uniq
    on public.venue_field_maps (venue_id, map_hash)
    where map_hash is not null;

  -- Maintain updated_at if helper exists in this project.
  if exists (select 1 from pg_proc where proname = 'set_updated_at' and pg_function_is_visible(oid)) then
    drop trigger if exists trg_venue_field_maps_updated_at on public.venue_field_maps;
    create trigger trg_venue_field_maps_updated_at
      before update on public.venue_field_maps
      for each row execute function public.set_updated_at();
  else
    drop trigger if exists trg_venue_field_maps_updated_at on public.venue_field_maps;
  end if;

  -- ---------------------------------------------------------------------------
  -- Optional audit log for map inserts/deletes/primary changes
  -- ---------------------------------------------------------------------------
  create table if not exists public.venue_field_maps_audit_log (
    id bigserial primary key,
    venue_id uuid not null references public.venues(id) on delete cascade,
    event_type text not null,
    map_id bigint null references public.venue_field_maps(id) on delete set null,
    map_url text null,
    actor text null,
    reason text null,
    created_at timestamptz not null default now()
  );

  create index if not exists venue_field_maps_audit_log_venue_created_idx
    on public.venue_field_maps_audit_log (venue_id, created_at desc);

  -- ---------------------------------------------------------------------------
  -- Extend existing queue schema to capture sport + primary intent (if present)
  -- ---------------------------------------------------------------------------
  if to_regclass('public.venue_url_review_queue') is not null then
    alter table public.venue_url_review_queue
      add column if not exists suggested_field_map_sport text null,
      add column if not exists suggested_field_map_set_primary boolean not null default false,
      add column if not exists applied_field_map_id bigint null;
  end if;
end $$;

