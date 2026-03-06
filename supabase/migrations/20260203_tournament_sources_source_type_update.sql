-- Expand source_type check constraint to allow standardized values
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'tournament_sources_source_type_check'
  ) then
    alter table public.tournament_sources
      drop constraint tournament_sources_source_type_check;
  end if;

  alter table public.tournament_sources
    add constraint tournament_sources_source_type_check
    check (source_type in (
      'tournament_platform',
      'governing_body',
      'league',
      'club',
      'directory',
      -- legacy values (kept for existing rows)
      'venue_calendar',
      'club_calendar',
      'league_calendar',
      'series_site',
      'platform_listing',
      'other'
    ));
end $$;
