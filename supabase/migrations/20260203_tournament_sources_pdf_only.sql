-- Add pdf_only status + sport index for tournament_sources
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'tournament_sources_review_status_check'
  ) then
    alter table public.tournament_sources
      drop constraint tournament_sources_review_status_check;
  end if;

  alter table public.tournament_sources
    add constraint tournament_sources_review_status_check
    check (review_status in (
      'untested',
      'keep',
      'needs_review',
      'low_yield',
      'js_only',
      'login_required',
      'dead',
      'pdf_only',
      'paywalled',
      'blocked_403',
      'duplicate_source',
      'seasonal',
      'deprecated'
    ));
end $$;

create index if not exists tournament_sources_sport_idx on public.tournament_sources (sport);
