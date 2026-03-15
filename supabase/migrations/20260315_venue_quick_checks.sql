-- Quick anonymous venue check storage and aggregation updates

create table if not exists public.venue_quick_checks (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  restroom_cleanliness smallint,
  parking_distance text check (parking_distance in ('Close','Medium','Far')),
  parking_convenience_score smallint,
  shade_score smallint,
  bring_field_chairs boolean,
  restroom_type text check (restroom_type in ('Portable','Building','Both')),
  source_page_type text,
  source_tournament_id uuid,
  browser_hash text,
  created_at timestamptz default now()
);

create index if not exists venue_quick_checks_venue_id_idx on public.venue_quick_checks(venue_id, created_at desc);
create index if not exists venue_quick_checks_browser_hash_idx on public.venue_quick_checks(browser_hash, venue_id, created_at desc);

-- Recompute aggregates including quick checks (union with venue_reviews)
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
        null::smallint as vendor_score,
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
