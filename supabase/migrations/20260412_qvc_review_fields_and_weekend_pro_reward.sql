-- TI: Quick Venue Check - add missing review fields + optional user association (v1)
-- Adds food/coffee/vendor_score/venue_notes to venue_quick_checks and enables associating a quick check to a TI user.
-- Also adds a small promo-grant ledger to prevent repeat Weekend Pro reward grants.

do $$
begin
  if to_regclass('public.venue_quick_checks') is null then
    return;
  end if;

  alter table public.venue_quick_checks
    add column if not exists food_vendors boolean,
    add column if not exists coffee_vendors boolean,
    add column if not exists vendor_score smallint,
    add column if not exists venue_notes varchar(255),
    add column if not exists user_id uuid;

  -- Add FK only when auth.users exists.
  if to_regclass('auth.users') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'venue_quick_checks_user_id_fkey'
    ) then
      alter table public.venue_quick_checks
        add constraint venue_quick_checks_user_id_fkey
        foreign key (user_id) references auth.users(id) on delete set null;
    end if;
  end if;

  -- Basic validation (only when vendor_score is present).
  if not exists (
    select 1
    from pg_constraint
    where conname = 'venue_quick_checks_vendor_score_range'
  ) then
    alter table public.venue_quick_checks
      add constraint venue_quick_checks_vendor_score_range
      check (vendor_score is null or (vendor_score between 1 and 5));
  end if;
end $$;

-- Recompute aggregates including quick checks (union with venue_reviews)
-- Patch: include vendor_score from quick checks when present.
create or replace function public.recompute_venue_review_aggregates(p_venue_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.venues v
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
      where vr.venue_id = p_venue_id
        and vr.status = 'active'
      union all
      select
        vq.restroom_cleanliness,
        vq.shade_score,
        vq.vendor_score,
        vq.parking_convenience_score
      from public.venue_quick_checks vq
      where vq.venue_id = p_venue_id
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
  where v.id = p_venue_id;
end;
$$;

-- Promo ledger for one-time grants (service role only).
do $$
begin
  if to_regclass('public.ti_users') is null then
    return;
  end if;

  create table if not exists public.ti_promo_grants (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    promo_key text not null,
    granted_at timestamptz not null default now(),
    source text null,
    source_quick_check_id uuid null,
    constraint ti_promo_grants_user_promo_unique unique (user_id, promo_key)
  );

  create index if not exists ti_promo_grants_user_id_idx on public.ti_promo_grants (user_id, granted_at desc);
  create index if not exists ti_promo_grants_promo_key_idx on public.ti_promo_grants (promo_key, granted_at desc);

  alter table public.ti_promo_grants enable row level security;
  revoke all on table public.ti_promo_grants from public, anon, authenticated;
  grant select, insert, update, delete on table public.ti_promo_grants to service_role;
end $$;

