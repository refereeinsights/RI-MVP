-- TI: outbound clicks (extend) (v2)
-- Adds support for venue-level hotel outbound redirects.

do $$
begin
  if to_regclass('public.ti_outbound_clicks') is null then
    return;
  end if;

  -- Allow non-tournament click rows (e.g., venue hotels).
  if exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'ti_outbound_clicks'
      and a.attname = 'tournament_id'
      and a.attnotnull = true
  ) then
    alter table public.ti_outbound_clicks
      alter column tournament_id drop not null;
  end if;

  if exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'ti_outbound_clicks'
      and a.attname = 'tournament_slug'
      and a.attnotnull = true
  ) then
    alter table public.ti_outbound_clicks
      alter column tournament_slug drop not null;
  end if;

  alter table public.ti_outbound_clicks
    add column if not exists destination_type text not null default 'tournament_official',
    add column if not exists partner text not null default 'unknown',
    add column if not exists source_surface text not null default 'unknown',
    add column if not exists venue_id uuid null references public.venues(id) on delete set null;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ti_outbound_clicks_destination_type_requires_tournament_id'
  ) then
    alter table public.ti_outbound_clicks
      add constraint ti_outbound_clicks_destination_type_requires_tournament_id
      check (destination_type <> 'tournament_official' or tournament_id is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ti_outbound_clicks_destination_type_hotels_requires_venue_id'
  ) then
    alter table public.ti_outbound_clicks
      add constraint ti_outbound_clicks_destination_type_hotels_requires_venue_id
      check (destination_type <> 'hotels' or venue_id is not null);
  end if;

  create index if not exists ti_outbound_clicks_destination_type_created_at_idx
    on public.ti_outbound_clicks (destination_type, created_at desc);

  create index if not exists ti_outbound_clicks_venue_id_created_at_idx
    on public.ti_outbound_clicks (venue_id, created_at desc);
end $$;

