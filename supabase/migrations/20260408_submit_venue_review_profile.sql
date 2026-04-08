-- Venue reviews: support venue_sport_profile_id in submit_venue_review (v1)
-- Enables sport/surface-specific venue feedback for multi-sport complexes.

drop function if exists public.submit_venue_review(
  uuid,
  uuid,
  text,
  smallint,
  numeric,
  text,
  smallint,
  text,
  boolean,
  text,
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
  p_parking_notes text,
  p_bring_field_chairs boolean,
  p_seating_notes text,
  p_shade_score smallint,
  p_food_vendors boolean,
  p_coffee_vendors boolean,
  p_vendor_score smallint,
  p_venue_notes text default null,
  p_venue_sport_profile_id uuid default null
)
returns table(ok boolean, venue_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_notes text;
  v_parking_notes text;
  v_seating_notes text;
  v_email_confirmed_at timestamptz;
  v_profile_venue_id uuid;
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

  if p_venue_sport_profile_id is not null then
    select vsp.venue_id
    into v_profile_venue_id
    from public.venue_sport_profiles vsp
    where vsp.id = p_venue_sport_profile_id;

    if v_profile_venue_id is null or v_profile_venue_id <> p_venue_id then
      raise exception 'Invalid venue_sport_profile_id';
    end if;
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
  v_parking_notes := nullif(left(coalesce(p_parking_notes, ''), 60), '');
  v_seating_notes := nullif(left(coalesce(p_seating_notes, ''), 60), '');

  if p_venue_sport_profile_id is null then
    insert into public.venue_reviews (
      venue_id,
      venue_sport_profile_id,
      tournament_id,
      user_id,
      restrooms,
      restroom_cleanliness,
      player_parking_fee,
      parking_distance,
      parking_convenience_score,
      parking_notes,
      bring_field_chairs,
      seating_notes,
      shade_score,
      food_vendors,
      coffee_vendors,
      vendor_score,
      venue_notes,
      status,
      updated_at
    ) values (
      p_venue_id,
      null,
      p_tournament_id,
      v_user_id,
      p_restrooms,
      p_restroom_cleanliness,
      p_player_parking_fee,
      p_parking_distance,
      p_parking_convenience_score,
      v_parking_notes,
      p_bring_field_chairs,
      v_seating_notes,
      p_shade_score,
      p_food_vendors,
      p_coffee_vendors,
      p_vendor_score,
      v_notes,
      'active',
      now()
    )
    on conflict (user_id, venue_id) where venue_sport_profile_id is null
    do update set
      tournament_id = excluded.tournament_id,
      restrooms = excluded.restrooms,
      restroom_cleanliness = excluded.restroom_cleanliness,
      player_parking_fee = excluded.player_parking_fee,
      parking_distance = excluded.parking_distance,
      parking_convenience_score = excluded.parking_convenience_score,
      parking_notes = excluded.parking_notes,
      bring_field_chairs = excluded.bring_field_chairs,
      seating_notes = excluded.seating_notes,
      shade_score = excluded.shade_score,
      food_vendors = excluded.food_vendors,
      coffee_vendors = excluded.coffee_vendors,
      vendor_score = excluded.vendor_score,
      venue_notes = excluded.venue_notes,
      status = 'active',
      updated_at = now();
  else
    insert into public.venue_reviews (
      venue_id,
      venue_sport_profile_id,
      tournament_id,
      user_id,
      restrooms,
      restroom_cleanliness,
      player_parking_fee,
      parking_distance,
      parking_convenience_score,
      parking_notes,
      bring_field_chairs,
      seating_notes,
      shade_score,
      food_vendors,
      coffee_vendors,
      vendor_score,
      venue_notes,
      status,
      updated_at
    ) values (
      p_venue_id,
      p_venue_sport_profile_id,
      p_tournament_id,
      v_user_id,
      p_restrooms,
      p_restroom_cleanliness,
      p_player_parking_fee,
      p_parking_distance,
      p_parking_convenience_score,
      v_parking_notes,
      p_bring_field_chairs,
      v_seating_notes,
      p_shade_score,
      p_food_vendors,
      p_coffee_vendors,
      p_vendor_score,
      v_notes,
      'active',
      now()
    )
    on conflict (user_id, venue_sport_profile_id) where venue_sport_profile_id is not null
    do update set
      tournament_id = excluded.tournament_id,
      restrooms = excluded.restrooms,
      restroom_cleanliness = excluded.restroom_cleanliness,
      player_parking_fee = excluded.player_parking_fee,
      parking_distance = excluded.parking_distance,
      parking_convenience_score = excluded.parking_convenience_score,
      parking_notes = excluded.parking_notes,
      bring_field_chairs = excluded.bring_field_chairs,
      seating_notes = excluded.seating_notes,
      shade_score = excluded.shade_score,
      food_vendors = excluded.food_vendors,
      coffee_vendors = excluded.coffee_vendors,
      vendor_score = excluded.vendor_score,
      venue_notes = excluded.venue_notes,
      status = 'active',
      updated_at = now();
  end if;

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
  text,
  boolean,
  text,
  smallint,
  boolean,
  boolean,
  smallint,
  text,
  uuid
) to authenticated;

