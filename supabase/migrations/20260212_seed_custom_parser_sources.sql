-- Seed custom parser sources into tournament_sources (idempotent).
insert into public.tournament_sources (
  url,
  source_url,
  normalized_url,
  normalized_host,
  source_type,
  sport,
  state,
  is_active,
  is_custom_source,
  review_status,
  notes
)
values
  (
    'https://usclubsoccer.org/list-of-sanctioned-tournaments/',
    'https://usclubsoccer.org/list-of-sanctioned-tournaments/',
    'https://usclubsoccer.org/list-of-sanctioned-tournaments/',
    'usclubsoccer.org',
    'series_site',
    'soccer',
    null,
    true,
    true,
    'needs_review',
    'US Club Soccer sanctioned tournaments list.'
  ),
  (
    'https://azsoccerassociation.org/sanctioned-club-tournaments/',
    'https://azsoccerassociation.org/sanctioned-club-tournaments/',
    'https://azsoccerassociation.org/sanctioned-club-tournaments/',
    'azsoccerassociation.org',
    'association_directory',
    'soccer',
    'AZ',
    true,
    true,
    'needs_review',
    'Arizona Soccer Association sanctioned club tournaments directory.'
  ),
  (
    'https://www.fysa.com/2026-sanctioned-tournaments/',
    'https://www.fysa.com/2026-sanctioned-tournaments/',
    'https://www.fysa.com/2026-sanctioned-tournaments/',
    'fysa.com',
    'association_directory',
    'soccer',
    'FL',
    true,
    true,
    'needs_review',
    'Florida Youth Soccer Association sanctioned tournaments (2026).'
  ),
  (
    'https://www.ncsoccer.org/events/list/',
    'https://www.ncsoccer.org/events/list/',
    'https://www.ncsoccer.org/events/list/',
    'ncsoccer.org',
    'association_directory',
    'soccer',
    'NC',
    true,
    true,
    'needs_review',
    'North Carolina Youth Soccer Association events list.'
  ),
  (
    'https://www.enysoccer.com/events/category/sanctioned-tournaments/',
    'https://www.enysoccer.com/events/category/sanctioned-tournaments/',
    'https://www.enysoccer.com/events/category/sanctioned-tournaments/',
    'enysoccer.com',
    'association_directory',
    'soccer',
    'NY',
    true,
    true,
    'needs_review',
    'Eastern New York Youth Soccer Association sanctioned tournaments list.'
  )
on conflict (normalized_url) do update
set
  url = excluded.url,
  source_url = excluded.source_url,
  normalized_host = excluded.normalized_host,
  source_type = excluded.source_type,
  sport = excluded.sport,
  state = excluded.state,
  is_active = excluded.is_active,
  is_custom_source = excluded.is_custom_source,
  review_status = excluded.review_status,
  notes = excluded.notes;
