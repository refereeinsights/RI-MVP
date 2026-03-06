-- Add tournament_director field to tournaments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tournaments'
      AND column_name = 'tournament_director'
  ) THEN
    ALTER TABLE public.tournaments
      ADD COLUMN tournament_director text;
  END IF;
END $$;
