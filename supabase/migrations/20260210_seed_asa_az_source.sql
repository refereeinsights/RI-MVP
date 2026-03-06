-- Seed Arizona Soccer Association sanctioned club tournaments directory
INSERT INTO public.tournament_sources (
  source_url,
  url,
  normalized_url,
  normalized_host,
  sport,
  state,
  is_active,
  review_status,
  source_type,
  notes
)
VALUES (
  'https://azsoccerassociation.org/sanctioned-club-tournaments/',
  'https://azsoccerassociation.org/sanctioned-club-tournaments/',
  'https://azsoccerassociation.org/sanctioned-club-tournaments/',
  'azsoccerassociation.org',
  'soccer',
  'AZ',
  true,
  'needs_review',
  'association_directory',
  'Arizona Soccer Association sanctioned club tournaments directory; contains tournament website links and director names.'
)
ON CONFLICT (normalized_url) DO UPDATE
SET
  source_url = EXCLUDED.source_url,
  url = EXCLUDED.url,
  normalized_host = EXCLUDED.normalized_host,
  sport = EXCLUDED.sport,
  state = EXCLUDED.state,
  is_active = EXCLUDED.is_active,
  review_status = EXCLUDED.review_status,
  source_type = EXCLUDED.source_type,
  notes = EXCLUDED.notes;
