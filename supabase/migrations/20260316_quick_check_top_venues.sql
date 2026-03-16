-- Extend TI Quick Venue Check metrics RPC with top venues.

create or replace function public.get_venue_quick_check_metrics(p_days integer default 30)
returns jsonb
language sql
stable
set search_path = public
as $$
with
  w as (
    select greatest(coalesce(p_days, 30), 1) as days
  ),
  events as (
    select e.*
    from public.venue_quick_check_events e, w
    where e.created_at >= now() - make_interval(days => w.days)
  ),
  submissions as (
    select s.*
    from public.venue_quick_checks s, w
    where s.created_at >= now() - make_interval(days => w.days)
  ),
  top_tournaments as (
    select
      e.source_tournament_id as tournament_id,
      count(*)::integer as started_count
    from events e
    where e.event_type = 'Venue Quick Check Started'
      and e.source_tournament_id is not null
    group by e.source_tournament_id
    order by started_count desc
    limit 20
  ),
  top_tournaments_enriched as (
    select
      tt.tournament_id,
      tt.started_count,
      t.name as tournament_name,
      t.slug as tournament_slug,
      t.sport as tournament_sport,
      t.state as tournament_state
    from top_tournaments tt
    left join public.tournaments t on t.id = tt.tournament_id
  ),
  top_venues as (
    select
      s.venue_id,
      count(*)::integer as submission_count,
      max(s.created_at) as last_submission_at
    from submissions s
    where s.venue_id is not null
    group by s.venue_id
    order by submission_count desc, last_submission_at desc
    limit 20
  ),
  top_venues_enriched as (
    select
      tv.venue_id,
      tv.submission_count,
      tv.last_submission_at,
      v.name as venue_name,
      v.city as venue_city,
      v.state as venue_state,
      v.seo_slug as venue_seo_slug
    from top_venues tv
    left join public.venues v on v.id = tv.venue_id
  )
select jsonb_build_object(
  'windowDays', (select days from w),
  'totalOpened', (select count(*)::integer from events where event_type = 'Venue Quick Check Opened'),
  'totalStarted', (select count(*)::integer from events where event_type = 'Venue Quick Check Started'),
  'totalDismissed', (select count(*)::integer from events where event_type = 'Venue Quick Check Dismissed'),
  'totalSubmitted', (select count(*)::integer from events where event_type = 'Venue Quick Check Submitted'),
  'totalSubmissions', (select count(*)::integer from submissions),
  'avgFieldsCompleted', (
    select coalesce(round(avg(
      (case when restroom_type is not null then 1 else 0 end) +
      (case when restroom_cleanliness is not null then 1 else 0 end) +
      (case when parking_distance is not null then 1 else 0 end) +
      (case when shade_score is not null then 1 else 0 end) +
      (case when bring_field_chairs is not null then 1 else 0 end)
    )::numeric, 2), 0)
    from submissions
  ),
  'submissionFieldCounts', jsonb_build_object(
    'restroom_type', (select count(*)::integer from submissions where restroom_type is not null),
    'restroom_cleanliness', (select count(*)::integer from submissions where restroom_cleanliness is not null),
    'parking_distance', (select count(*)::integer from submissions where parking_distance is not null),
    'shade_score', (select count(*)::integer from submissions where shade_score is not null),
    'bring_field_chairs', (select count(*)::integer from submissions where bring_field_chairs is not null)
  ),
  'submissionPageTypeCounts', jsonb_build_object(
    'venue', (select count(*)::integer from submissions where source_page_type = 'venue'),
    'tournament', (select count(*)::integer from submissions where source_page_type = 'tournament'),
    'unknown', (select count(*)::integer from submissions where source_page_type is null)
  ),
  'topTournamentsByStarted', coalesce((
    select jsonb_agg(jsonb_build_object(
      'tournamentId', tournament_id,
      'startedCount', started_count,
      'tournamentName', tournament_name,
      'tournamentSlug', tournament_slug,
      'tournamentSport', tournament_sport,
      'tournamentState', tournament_state
    ) order by started_count desc)
    from top_tournaments_enriched
  ), '[]'::jsonb),
  'topVenuesBySubmissions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'venueId', venue_id,
      'submissionCount', submission_count,
      'lastSubmissionAt', last_submission_at,
      'venueName', venue_name,
      'venueCity', venue_city,
      'venueState', venue_state,
      'venueSeoSlug', venue_seo_slug
    ) order by submission_count desc, last_submission_at desc)
    from top_venues_enriched
  ), '[]'::jsonb)
);
$$;

