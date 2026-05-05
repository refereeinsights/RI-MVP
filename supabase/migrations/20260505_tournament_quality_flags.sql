-- TI: Tournament quality flags (duration scrubber + invalid date ranges)
-- Phase 1: service_role only (no public/authenticated access).

do $$
begin
  if to_regclass('public.tournament_quality_flags') is null then
    create table public.tournament_quality_flags (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      tournament_id uuid not null references public.tournaments(id) on delete cascade,
      flag_type text not null, -- 'duration_gt_7_days' | 'invalid_date_range'
      severity text not null default 'review',
      reason text not null,
      detected_value jsonb null,
      status text not null default 'open', -- 'open' | 'closed_validated' | 'closed_fixed' | 'closed_duplicate'
      reviewed_by uuid null,
      reviewed_at timestamptz null,
      resolution_notes text null
    );

    create unique index tournament_quality_flags_tournament_flag_uidx
      on public.tournament_quality_flags (tournament_id, flag_type);

    create index tournament_quality_flags_flag_status_updated_idx
      on public.tournament_quality_flags (flag_type, status, updated_at desc);

    create index tournament_quality_flags_status_updated_idx
      on public.tournament_quality_flags (status, updated_at desc);

    alter table public.tournament_quality_flags enable row level security;
    revoke all on table public.tournament_quality_flags from public, anon, authenticated;
    grant all on table public.tournament_quality_flags to service_role;
  end if;
end $$;

-- Keep updated_at current on updates (service-role only).
do $$
begin
  if to_regclass('public._tournament_quality_flags_set_updated_at') is null then
    create or replace function public._tournament_quality_flags_set_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;

  if to_regclass('public.tournament_quality_flags') is not null then
    drop trigger if exists tournament_quality_flags_set_updated_at on public.tournament_quality_flags;
    create trigger tournament_quality_flags_set_updated_at
    before update on public.tournament_quality_flags
    for each row
    execute function public._tournament_quality_flags_set_updated_at();
  end if;
end $$;

-- Helper view for ops review (canonical only).
-- Note: duration_days here is exclusive difference: (end_date - start_date).
do $$
begin
  if to_regclass('public.tournament_duration_issues') is null then
    create view public.tournament_duration_issues as
    with base as (
      select
        t.id,
        t.name,
        t.slug,
        t.sport,
        t.city,
        t.state,
        t.start_date,
        t.end_date,
        (t.end_date - t.start_date) as duration_days,
        t.source_url,
        t.official_website_url,
        t.created_at,
        t.updated_at
      from public.tournaments t
      where
        t.is_canonical = true
        and t.start_date is not null
        and t.end_date is not null
    )
    select *, 'duration_gt_7_days'::text as issue_type
    from base
    where end_date >= start_date and (end_date - start_date) > 7
    union all
    select *, 'invalid_date_range'::text as issue_type
    from base
    where end_date < start_date;
  end if;
end $$;

