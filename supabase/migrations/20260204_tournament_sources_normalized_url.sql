-- Add normalized_url for consistent dedupe + skipping
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournament_sources'
      and column_name = 'normalized_url'
  ) then
    alter table public.tournament_sources
      add column normalized_url text;
  end if;
end $$;

-- Best-effort backfill (strip www, fragments, common tracking params).
update public.tournament_sources
set normalized_url = lower(coalesce(url, source_url))
where normalized_url is null
  and (url is not null or source_url is not null);

update public.tournament_sources
set normalized_url = regexp_replace(normalized_url, '^https?://www\\.', 'https://', 1, 1, 'i')
where normalized_url is not null;

update public.tournament_sources
set normalized_url = regexp_replace(normalized_url, '#.*$', '')
where normalized_url is not null;

update public.tournament_sources
set normalized_url = regexp_replace(
  normalized_url,
  '([?&])(utm_[^&]+|gclid=[^&]+|fbclid=[^&]+|mc_cid=[^&]+|mc_eid=[^&]+)',
  '\\1',
  'gi'
)
where normalized_url is not null;

update public.tournament_sources
set normalized_url = regexp_replace(normalized_url, '\\?&', '?', 'g')
where normalized_url is not null;

update public.tournament_sources
set normalized_url = regexp_replace(normalized_url, '[?&]$', '', 'g')
where normalized_url is not null;

create unique index if not exists tournament_sources_normalized_url_key
  on public.tournament_sources (normalized_url);
