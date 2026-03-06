-- Add review/ignore fields to tournament_sources to support source labeling and skip rules
do $$
begin
  -- review_status column
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'tournament_sources' and column_name = 'review_status'
  ) then
    alter table public.tournament_sources
      add column review_status text not null default 'untested';
  end if;

  -- review_notes column
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'tournament_sources' and column_name = 'review_notes'
  ) then
    alter table public.tournament_sources
      add column review_notes text;
  end if;

  -- ignore_until column (optional temp skip)
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'tournament_sources' and column_name = 'ignore_until'
  ) then
    alter table public.tournament_sources
      add column ignore_until timestamptz;
  end if;

  -- last_tested_at column
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'tournament_sources' and column_name = 'last_tested_at'
  ) then
    alter table public.tournament_sources
      add column last_tested_at timestamptz;
  end if;

  -- status check constraint
  if not exists (
    select 1 from pg_constraint
    where conname = 'tournament_sources_review_status_check'
  ) then
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
        'paywalled',
        'blocked_403',
        'duplicate_source',
        'seasonal',
        'deprecated'
      ));
  end if;
end $$;

-- indexes for filtering
create index if not exists tournament_sources_review_status_idx on public.tournament_sources (review_status);
create index if not exists tournament_sources_active_status_idx on public.tournament_sources (is_active, review_status);
