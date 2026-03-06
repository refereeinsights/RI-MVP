-- Add enrichment fields for tournament contacts/comp and date candidates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'referee_contact_email'
  ) THEN
    ALTER TABLE public.tournaments ADD COLUMN referee_contact_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'referee_contact_phone'
  ) THEN
    ALTER TABLE public.tournaments ADD COLUMN referee_contact_phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'tournament_director_email'
  ) THEN
    ALTER TABLE public.tournaments ADD COLUMN tournament_director_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'tournament_director_phone'
  ) THEN
    ALTER TABLE public.tournaments ADD COLUMN tournament_director_phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'referee_hotel_info'
  ) THEN
    ALTER TABLE public.tournaments ADD COLUMN referee_hotel_info text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.tournament_date_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  date_text text,
  start_date date,
  end_date date,
  source_url text,
  evidence_text text,
  confidence numeric,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
