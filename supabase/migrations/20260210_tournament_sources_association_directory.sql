-- Allow association_directory in tournament_sources source_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_sources_source_type_check'
  ) THEN
    ALTER TABLE public.tournament_sources
      DROP CONSTRAINT tournament_sources_source_type_check;
  END IF;

  ALTER TABLE public.tournament_sources
    ADD CONSTRAINT tournament_sources_source_type_check
    CHECK (source_type IN (
      'tournament_platform',
      'governing_body',
      'league',
      'club',
      'directory',
      'association_directory',
      -- legacy values (kept for existing rows)
      'venue_calendar',
      'club_calendar',
      'league_calendar',
      'series_site',
      'platform_listing',
      'other'
    ));
END $$;
