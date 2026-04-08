-- Venue feedback: attach quick checks + reviews to venue_sport_profiles (v1)
-- Allows multi-sport complexes to have sport/surface-specific feedback (shade, chairs, etc.)
-- while keeping legacy venue-level aggregates intact.

create extension if not exists "pgcrypto";

-- Link feedback rows to a sport-specific profile when known.
alter table if exists public.venue_reviews
  add column if not exists venue_sport_profile_id uuid references public.venue_sport_profiles(id) on delete set null;

alter table if exists public.venue_quick_checks
  add column if not exists venue_sport_profile_id uuid references public.venue_sport_profiles(id) on delete set null;

create index if not exists venue_reviews_profile_idx
  on public.venue_reviews (venue_sport_profile_id);

create index if not exists venue_quick_checks_profile_idx
  on public.venue_quick_checks (venue_sport_profile_id, created_at desc);

-- Allow one review per (user, venue) when no profile is set, and one per (user, profile) when set.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'venue_reviews_user_id_venue_id_key') then
    alter table public.venue_reviews
      drop constraint venue_reviews_user_id_venue_id_key;
  end if;
end $$;

create unique index if not exists venue_reviews_user_venue_unique_null_profile
  on public.venue_reviews (user_id, venue_id)
  where venue_sport_profile_id is null;

create unique index if not exists venue_reviews_user_profile_unique
  on public.venue_reviews (user_id, venue_sport_profile_id)
  where venue_sport_profile_id is not null;

-- Store per-profile aggregates (mirrors venues aggregate fields).
alter table if exists public.venue_sport_profiles
  add column if not exists restroom_cleanliness_avg numeric(3,2),
  add column if not exists shade_score_avg numeric(3,2),
  add column if not exists vendor_score_avg numeric(3,2),
  add column if not exists parking_convenience_score_avg numeric(3,2),
  add column if not exists review_count integer not null default 0,
  add column if not exists reviews_last_updated_at timestamptz;

-- Recompute per-profile aggregates (reviews + quick checks).
create or replace function public.recompute_venue_sport_profile_review_aggregates(p_venue_sport_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.venue_sport_profiles p
  set
    restroom_cleanliness_avg = stats.restroom_cleanliness_avg,
    shade_score_avg = stats.shade_score_avg,
    vendor_score_avg = stats.vendor_score_avg,
    parking_convenience_score_avg = stats.parking_convenience_score_avg,
    review_count = stats.review_count,
    reviews_last_updated_at = now()
  from (
    with all_feedback as (
      select
        vr.restroom_cleanliness,
        vr.shade_score,
        vr.vendor_score,
        vr.parking_convenience_score
      from public.venue_reviews vr
      where vr.venue_sport_profile_id = p_venue_sport_profile_id
        and vr.status = 'active'
      union all
      select
        vq.restroom_cleanliness,
        vq.shade_score,
        null::smallint as vendor_score,
        vq.parking_convenience_score
      from public.venue_quick_checks vq
      where vq.venue_sport_profile_id = p_venue_sport_profile_id
    )
    select
      round(avg(all_feedback.restroom_cleanliness)::numeric, 2) as restroom_cleanliness_avg,
      round(avg(all_feedback.shade_score)::numeric, 2) as shade_score_avg,
      round(avg(all_feedback.vendor_score)::numeric, 2) as vendor_score_avg,
      round(avg(all_feedback.parking_convenience_score)::numeric, 2) as parking_convenience_score_avg,
      sum(case
            when all_feedback.restroom_cleanliness is not null
              or all_feedback.shade_score is not null
              or all_feedback.vendor_score is not null
              or all_feedback.parking_convenience_score is not null
            then 1 else 0 end
          )::integer as review_count
    from all_feedback
  ) as stats
  where p.id = p_venue_sport_profile_id;
end;
$$;

-- Refresh venue-level aggregates + profile aggregates when reviews change.
create or replace function public.handle_venue_review_aggregate_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_venue_review_aggregates(old.venue_id);
    if old.venue_sport_profile_id is not null then
      perform public.recompute_venue_sport_profile_review_aggregates(old.venue_sport_profile_id);
    end if;
    return old;
  end if;

  perform public.recompute_venue_review_aggregates(new.venue_id);
  if new.venue_sport_profile_id is not null then
    perform public.recompute_venue_sport_profile_review_aggregates(new.venue_sport_profile_id);
  end if;

  if tg_op = 'UPDATE' and old.venue_id is distinct from new.venue_id then
    perform public.recompute_venue_review_aggregates(old.venue_id);
  end if;
  if tg_op = 'UPDATE' and old.venue_sport_profile_id is distinct from new.venue_sport_profile_id then
    if old.venue_sport_profile_id is not null then
      perform public.recompute_venue_sport_profile_review_aggregates(old.venue_sport_profile_id);
    end if;
  end if;

  return new;
end;
$$;

-- Quick checks previously relied on the API calling recompute_venue_review_aggregates.
-- Add a trigger so future callers (or admin backfills) keep aggregates consistent.
create or replace function public.handle_venue_quick_check_aggregate_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_venue_review_aggregates(old.venue_id);
    if old.venue_sport_profile_id is not null then
      perform public.recompute_venue_sport_profile_review_aggregates(old.venue_sport_profile_id);
    end if;
    return old;
  end if;

  perform public.recompute_venue_review_aggregates(new.venue_id);
  if new.venue_sport_profile_id is not null then
    perform public.recompute_venue_sport_profile_review_aggregates(new.venue_sport_profile_id);
  end if;

  if tg_op = 'UPDATE' and old.venue_id is distinct from new.venue_id then
    perform public.recompute_venue_review_aggregates(old.venue_id);
  end if;
  if tg_op = 'UPDATE' and old.venue_sport_profile_id is distinct from new.venue_sport_profile_id then
    if old.venue_sport_profile_id is not null then
      perform public.recompute_venue_sport_profile_review_aggregates(old.venue_sport_profile_id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_venue_quick_checks_recompute on public.venue_quick_checks;
create trigger trg_venue_quick_checks_recompute
after insert or update or delete on public.venue_quick_checks
for each row
execute function public.handle_venue_quick_check_aggregate_refresh();

