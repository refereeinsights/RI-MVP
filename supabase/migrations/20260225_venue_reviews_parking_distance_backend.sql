-- Venue review backend rename:
-- - store discrete label in venue_reviews.parking_distance
-- - store numeric score in venue_reviews.parking_convenience_score (Close=5, Medium=3, Far=1)
-- - add parking_convenience_score_avg aggregate on venues

alter table public.venue_reviews
  add column if not exists parking_distance text;

do $$
declare
  v_type text;
begin
  select data_type
  into v_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'venue_reviews'
    and column_name = 'parking_convenience_score';

  -- If legacy value is text label, backfill parking_distance first.
  if v_type in ('text', 'character varying') then
    -- Drop text-based check before converting to numeric to avoid smallint=text operator errors.
    alter table public.venue_reviews
      drop constraint if exists venue_reviews_parking_convenience_allowed;

    update public.venue_reviews
    set parking_distance = case
      when lower(btrim(parking_convenience_score)) = 'close' then 'Close'
      when lower(btrim(parking_convenience_score)) = 'medium' then 'Medium'
      when lower(btrim(parking_convenience_score)) = 'far' then 'Far'
      else parking_distance
    end
    where parking_distance is null;

    alter table public.venue_reviews
      alter column parking_convenience_score type smallint
      using (
        case
          when parking_convenience_score is null then null
          when lower(btrim(parking_convenience_score::text)) = 'close' then 5
          when lower(btrim(parking_convenience_score::text)) = 'medium' then 3
          when lower(btrim(parking_convenience_score::text)) = 'far' then 1
          when btrim(parking_convenience_score::text) ~ '^-?[0-9]+$' then
            least(5, greatest(1, (parking_convenience_score::text)::int))::smallint
          else null
        end
      );
  end if;
end $$;

-- Backfill each column from the other if needed.
update public.venue_reviews
set parking_distance = case
  when parking_convenience_score >= 4 then 'Close'
  when parking_convenience_score >= 2 then 'Medium'
  when parking_convenience_score is not null then 'Far'
  else null
end
where parking_distance is null;

update public.venue_reviews
set parking_convenience_score = case
  when parking_distance = 'Close' then 5
  when parking_distance = 'Medium' then 3
  when parking_distance = 'Far' then 1
  else parking_convenience_score
end
where parking_convenience_score is null;

alter table public.venue_reviews
  drop constraint if exists venue_reviews_parking_convenience_allowed;

alter table public.venue_reviews
  drop constraint if exists venue_reviews_parking_convenience_score_range;

alter table public.venue_reviews
  drop constraint if exists venue_reviews_parking_distance_allowed;

alter table public.venue_reviews
  add constraint venue_reviews_parking_distance_allowed
  check (parking_distance in ('Close', 'Medium', 'Far')) not valid;

alter table public.venue_reviews
  add constraint venue_reviews_parking_convenience_score_range
  check (parking_convenience_score between 1 and 5) not valid;

alter table public.venue_reviews
  validate constraint venue_reviews_parking_distance_allowed;

alter table public.venue_reviews
  validate constraint venue_reviews_parking_convenience_score_range;

-- Keep this required for future rows.
alter table public.venue_reviews
  alter column parking_distance set not null;

alter table public.venues
  add column if not exists parking_convenience_score_avg numeric(3,2);

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
    select
      round(avg(vr.restroom_cleanliness)::numeric, 2) as restroom_cleanliness_avg,
      round(avg(vr.shade_score)::numeric, 2) as shade_score_avg,
      round(avg(vr.vendor_score)::numeric, 2) as vendor_score_avg,
      round(avg(vr.parking_convenience_score)::numeric, 2) as parking_convenience_score_avg,
      count(*)::integer as review_count
    from public.venue_reviews vr
    where vr.venue_id = p_venue_id
      and vr.status = 'active'
  ) as stats
  where v.id = p_venue_id;
end;
$$;

drop function if exists public.submit_venue_review(
  uuid,
  uuid,
  text,
  smallint,
  numeric,
  text,
  boolean,
  smallint,
  boolean,
  boolean,
  smallint,
  text
);

create or replace function public.submit_venue_review(
  p_venue_id uuid,
  p_tournament_id uuid,
  p_restrooms text,
  p_restroom_cleanliness smallint,
  p_player_parking_fee numeric,
  p_parking_distance text,
  p_parking_convenience_score smallint,
  p_bring_field_chairs boolean,
  p_shade_score smallint,
  p_food_vendors boolean,
  p_coffee_vendors boolean,
  p_vendor_score smallint,
  p_venue_notes text default null
)
returns table(ok boolean, venue_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_notes text;
  v_email_confirmed_at timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select u.email_confirmed_at
  into v_email_confirmed_at
  from auth.users u
  where u.id = v_user_id;

  if v_email_confirmed_at is null then
    raise exception 'Insider required to submit venue reviews';
  end if;

  if p_restrooms not in ('Portable', 'Building', 'Both') then
    raise exception 'Invalid restrooms value';
  end if;

  if p_parking_distance not in ('Close', 'Medium', 'Far') then
    raise exception 'Invalid parking distance';
  end if;

  if p_parking_convenience_score < 1 or p_parking_convenience_score > 5 then
    raise exception 'parking_convenience_score must be between 1 and 5';
  end if;

  if (
    (p_parking_distance = 'Close' and p_parking_convenience_score <> 5)
    or (p_parking_distance = 'Medium' and p_parking_convenience_score <> 3)
    or (p_parking_distance = 'Far' and p_parking_convenience_score <> 1)
  ) then
    raise exception 'parking_distance and parking_convenience_score do not match';
  end if;

  if p_restroom_cleanliness < 1 or p_restroom_cleanliness > 5 then
    raise exception 'restroom_cleanliness must be between 1 and 5';
  end if;

  if p_shade_score < 1 or p_shade_score > 5 then
    raise exception 'shade_score must be between 1 and 5';
  end if;

  if p_vendor_score < 1 or p_vendor_score > 5 then
    raise exception 'vendor_score must be between 1 and 5';
  end if;

  v_notes := nullif(left(coalesce(p_venue_notes, ''), 255), '');

  insert into public.venue_reviews (
    venue_id,
    tournament_id,
    user_id,
    restrooms,
    restroom_cleanliness,
    player_parking_fee,
    parking_distance,
    parking_convenience_score,
    bring_field_chairs,
    shade_score,
    food_vendors,
    coffee_vendors,
    vendor_score,
    venue_notes,
    status,
    updated_at
  ) values (
    p_venue_id,
    p_tournament_id,
    v_user_id,
    p_restrooms,
    p_restroom_cleanliness,
    p_player_parking_fee,
    p_parking_distance,
    p_parking_convenience_score,
    p_bring_field_chairs,
    p_shade_score,
    p_food_vendors,
    p_coffee_vendors,
    p_vendor_score,
    v_notes,
    'active',
    now()
  )
  on conflict (user_id, venue_id)
  do update set
    tournament_id = excluded.tournament_id,
    restrooms = excluded.restrooms,
    restroom_cleanliness = excluded.restroom_cleanliness,
    player_parking_fee = excluded.player_parking_fee,
    parking_distance = excluded.parking_distance,
    parking_convenience_score = excluded.parking_convenience_score,
    bring_field_chairs = excluded.bring_field_chairs,
    shade_score = excluded.shade_score,
    food_vendors = excluded.food_vendors,
    coffee_vendors = excluded.coffee_vendors,
    vendor_score = excluded.vendor_score,
    venue_notes = excluded.venue_notes,
    status = 'active',
    updated_at = now();

  return query select true, p_venue_id;
end;
$$;

grant execute on function public.submit_venue_review(
  uuid,
  uuid,
  text,
  smallint,
  numeric,
  text,
  smallint,
  boolean,
  smallint,
  boolean,
  boolean,
  smallint,
  text
) to authenticated;
