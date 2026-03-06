-- Seed Oregon Youth Soccer sanctioned tournaments custom parser source (idempotent).
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
  'https://www.oregonyouthsoccer.org/sanctioned-tournaments/',
  'https://www.oregonyouthsoccer.org/sanctioned-tournaments/',
  'www.oregonyouthsoccer.org',
  'association_directory',
  'soccer',
  'OR',
  null,
  'Oregon Youth Soccer sanctioned tournaments list.',
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
