-- Seed Washington Youth Soccer sanctioned tournaments custom parser source (idempotent).
insert into public.tournament_sources (
  source_url,
  normalized_url,
  normalized_host,
  source_type,
  sport,
  state,
  city,
  notes,
  is_active,
  is_custom_source,
  review_status
)
values (
  'https://washingtonyouthsoccer.org/sanctioned-tournaments/',
  'https://washingtonyouthsoccer.org/sanctioned-tournaments/',
  'washingtonyouthsoccer.org',
  'association_directory',
  'soccer',
  'WA',
  null,
  'Washington Youth Soccer sanctioned tournaments list.',
  true,
  true,
  'approved'
)
on conflict (normalized_url) do update
set
  source_type = excluded.source_type,
  sport = excluded.sport,
  state = excluded.state,
  notes = excluded.notes,
  is_active = true,
  is_custom_source = true,
  review_status = 'approved',
  updated_at = now();
