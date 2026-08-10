-- Transactional regression validation for
-- 20260810_ti_outbound_clicks_allow_generic_hotels.sql.
--
-- Run only against a local, ephemeral, or explicitly approved non-production
-- database after applying migrations. This script creates no partner traffic
-- and rolls back every fixture and outbound-click row.
--
-- A tournament fixture must already exist because creating one portably would
-- couple this focused check to the much broader tournaments schema.

begin;

create temporary table ti_hotel_constraint_validation (
  case_name text primary key,
  click_id uuid not null,
  expected_venue_id uuid,
  expected_tournament_id uuid,
  expected_tournament_slug text
) on commit drop;

do $$
declare
  fixture_venue_id uuid := gen_random_uuid();
  fixture_tournament_id uuid;
  fixture_tournament_slug text;
  fixture_planner_session_id uuid := gen_random_uuid();
  click_id uuid;
  attribution_id text;
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ti_outbound_clicks'::regclass
      and conname = 'ti_outbound_clicks_destination_type_hotels_requires_venue_id'
  ) then
    raise exception 'obsolete hotel venue constraint is still present';
  end if;

  select id, slug
    into fixture_tournament_id, fixture_tournament_slug
  from public.tournaments
  where slug is not null
  order by id
  limit 1;

  if fixture_tournament_id is null then
    raise exception 'validation requires one existing tournament fixture with a slug';
  end if;

  insert into public.venues (id, name, city, state, sport)
  values (
    fixture_venue_id,
    'TI generic hotel constraint validation ' || fixture_venue_id::text,
    'Validation City',
    'CA',
    'soccer'
  );

  -- Generic Book Travel.
  attribution_id := replace(gen_random_uuid()::text, '-', '');
  insert into public.ti_outbound_clicks (
    destination_type, partner, outbound_partner, source_surface,
    venue_id, tournament_id, tournament_slug, target_url, redirect_url,
    is_localhost, session_id, cta_placement, source_page_type, device_type,
    outbound_request_id, outbound_attribution_id,
    custom_field3, custom_field4, custom_field5
  ) values (
    'hotels', 'hotelplanner', 'hotelplanner', 'book_travel',
    null, null, null, 'https://example.invalid/book-travel', 'https://example.invalid/book-travel',
    false, gen_random_uuid(), 'book_travel_view_all_hotels', 'book_travel', 'desktop',
    gen_random_uuid(), attribution_id,
    'attr:' || attribution_id, 'srcp:book_travel', 'place:book_travel_view_all_hotels'
  ) returning id into click_id;
  insert into ti_hotel_constraint_validation values ('book_travel', click_id, null, null, null);

  -- Generic Weekend Planner, including the planner session in Custom6.
  attribution_id := replace(gen_random_uuid()::text, '-', '');
  insert into public.ti_outbound_clicks (
    destination_type, partner, outbound_partner, source_surface,
    venue_id, tournament_id, tournament_slug, target_url, redirect_url,
    is_localhost, session_id, cta_placement, source_page_type, device_type,
    outbound_request_id, outbound_attribution_id,
    custom_field3, custom_field4, custom_field5, custom_field6
  ) values (
    'hotels', 'hotelplanner', 'hotelplanner', 'weekend_planner',
    null, null, null, 'https://example.invalid/weekend-planner', 'https://example.invalid/weekend-planner',
    false, gen_random_uuid(), 'weekend_planner_view_all_hotels', 'weekend_planner', 'mobile',
    gen_random_uuid(), attribution_id,
    'attr:' || attribution_id, 'srcp:weekend_planner', 'place:weekend_planner_view_all_hotels',
    'plan:' || fixture_planner_session_id::text
  ) returning id into click_id;
  insert into ti_hotel_constraint_validation values ('weekend_planner', click_id, null, null, null);

  -- Tournament location-only fallback: tournament context, but no fake venue.
  attribution_id := replace(gen_random_uuid()::text, '-', '');
  insert into public.ti_outbound_clicks (
    destination_type, partner, outbound_partner, source_surface,
    venue_id, tournament_id, tournament_slug, target_url, redirect_url,
    is_localhost, session_id, cta_placement, source_page_type, device_type,
    outbound_request_id, outbound_attribution_id,
    custom_field3, custom_field4, custom_field5
  ) values (
    'hotels', 'hotelplanner', 'hotelplanner', 'tournament_detail',
    null, fixture_tournament_id, fixture_tournament_slug,
    'https://example.invalid/tournament-fallback', 'https://example.invalid/tournament-fallback',
    false, gen_random_uuid(), 'tournament_view_all_hotels', 'tournament_detail', 'desktop',
    gen_random_uuid(), attribution_id,
    'attr:' || attribution_id, 'srcp:tournament_detail', 'place:tournament_view_all_hotels'
  ) returning id into click_id;
  insert into ti_hotel_constraint_validation
  values ('tournament_fallback', click_id, null, fixture_tournament_id, fixture_tournament_slug);

  -- Venue detail.
  attribution_id := replace(gen_random_uuid()::text, '-', '');
  insert into public.ti_outbound_clicks (
    destination_type, partner, outbound_partner, source_surface,
    venue_id, tournament_id, tournament_slug, target_url, redirect_url,
    is_localhost, session_id, cta_placement, source_page_type, device_type,
    outbound_request_id, outbound_attribution_id,
    custom_field3, custom_field4, custom_field5
  ) values (
    'hotels', 'hotelplanner', 'hotelplanner', 'venue_detail',
    fixture_venue_id, fixture_tournament_id, fixture_tournament_slug,
    'https://example.invalid/venue-detail', 'https://example.invalid/venue-detail',
    false, gen_random_uuid(), 'venue_detail_view_all_hotels', 'venue_detail', 'desktop',
    gen_random_uuid(), attribution_id,
    'attr:' || attribution_id, 'srcp:venue_detail', 'place:venue_detail_view_all_hotels'
  ) returning id into click_id;
  insert into ti_hotel_constraint_validation
  values ('venue_detail', click_id, fixture_venue_id, fixture_tournament_id, fixture_tournament_slug);

  -- Venue map selected-venue path.
  attribution_id := replace(gen_random_uuid()::text, '-', '');
  insert into public.ti_outbound_clicks (
    destination_type, partner, outbound_partner, source_surface,
    venue_id, tournament_id, tournament_slug, target_url, redirect_url,
    is_localhost, session_id, cta_placement, source_page_type, device_type,
    outbound_request_id, outbound_attribution_id,
    custom_field3, custom_field4, custom_field5
  ) values (
    'hotels', 'hotelplanner', 'hotelplanner', 'venue_map',
    fixture_venue_id, fixture_tournament_id, fixture_tournament_slug,
    'https://example.invalid/venue-map', 'https://example.invalid/venue-map',
    false, gen_random_uuid(), 'venue_map_view_all_hotels', 'venue_map', 'mobile',
    gen_random_uuid(), attribution_id,
    'attr:' || attribution_id, 'srcp:venue_map', 'place:venue_map_view_all_hotels'
  ) returning id into click_id;
  insert into ti_hotel_constraint_validation
  values ('venue_map', click_id, fixture_venue_id, fixture_tournament_id, fixture_tournament_slug);

  -- Existing RI venue-detail contract remains venue-backed.
  attribution_id := replace(gen_random_uuid()::text, '-', '');
  insert into public.ti_outbound_clicks (
    destination_type, partner, outbound_partner, source_surface,
    venue_id, tournament_id, tournament_slug, target_url, redirect_url,
    is_localhost, session_id, cta_placement, source_page_type, device_type,
    outbound_request_id, outbound_attribution_id,
    custom_field3, custom_field4, custom_field5
  ) values (
    'hotels', 'hotelplanner', 'hotelplanner', 'ri_venue_detail',
    fixture_venue_id, null, null,
    'https://example.invalid/ri-venue-detail', 'https://example.invalid/ri-venue-detail',
    false, gen_random_uuid(), 'ri_venue_detail_view_all_hotels', 'ri_venue_detail', 'desktop',
    gen_random_uuid(), attribution_id,
    'attr:' || attribution_id, 'srcp:ri_venue_detail', 'place:ri_venue_detail_view_all_hotels'
  ) returning id into click_id;
  insert into ti_hotel_constraint_validation values ('ri_venue_detail', click_id, fixture_venue_id, null, null);

  if (select count(*) from ti_hotel_constraint_validation) <> 6 then
    raise exception 'expected six validation cases';
  end if;

  if exists (
    select 1
    from ti_hotel_constraint_validation expected
    join public.ti_outbound_clicks actual on actual.id = expected.click_id
    where actual.destination_type <> 'hotels'
       or actual.venue_id is distinct from expected.expected_venue_id
       or actual.tournament_id is distinct from expected.expected_tournament_id
       or actual.tournament_slug is distinct from expected.expected_tournament_slug
       or actual.session_id is null
       or actual.cta_placement is null
       or actual.outbound_attribution_id is null
       or actual.custom_field3 is distinct from 'attr:' || actual.outbound_attribution_id
  ) then
    raise exception 'hotel outbound validation mismatch';
  end if;

  if not exists (
    select 1
    from ti_hotel_constraint_validation expected
    join public.ti_outbound_clicks actual on actual.id = expected.click_id
    where expected.case_name = 'weekend_planner'
      and actual.custom_field6 = 'plan:' || fixture_planner_session_id::text
  ) then
    raise exception 'Weekend Planner Custom6 did not preserve the planner session';
  end if;
end $$;

rollback;
