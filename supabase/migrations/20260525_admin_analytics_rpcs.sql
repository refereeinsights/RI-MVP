-- Admin analytics helper RPCs for the /admin/ti/clicks dashboard.
-- tournament_id and venue_id live in JSONB `properties` — GROUP BY requires
-- server-side functions that PostgREST cannot express via its query API.

CREATE OR REPLACE FUNCTION admin_top_viewed_tournaments(
  since_iso timestamptz,
  result_limit int DEFAULT 10
)
RETURNS TABLE (
  tournament_id text,
  view_count    bigint,
  name          text,
  start_date    date,
  end_date      date
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    e.tournament_id,
    e.view_count,
    t.name,
    t.start_date,
    t.end_date
  FROM (
    SELECT
      properties->>'tournament_id'  AS tournament_id,
      COUNT(*)::bigint              AS view_count
    FROM ti_map_events
    WHERE event_name = 'tournament_detail_page_viewed'
      AND created_at >= since_iso
      AND properties->>'tournament_id' IS NOT NULL
    GROUP BY properties->>'tournament_id'
    ORDER BY 2 DESC
    LIMIT result_limit
  ) e
  LEFT JOIN tournaments t ON t.id::text = e.tournament_id
  ORDER BY e.view_count DESC;
$$;

CREATE OR REPLACE FUNCTION admin_top_viewed_venues(
  since_iso    timestamptz,
  result_limit int DEFAULT 10
)
RETURNS TABLE (
  venue_id              text,
  view_count            bigint,
  name                  text,
  next_tournament_start date
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    e.venue_id,
    e.view_count,
    v.name,
    (
      SELECT MIN(t.start_date)
      FROM tournament_venues tv
      JOIN tournaments t ON tv.tournament_id = t.id
      WHERE tv.venue_id::text = e.venue_id
        AND t.start_date >= CURRENT_DATE
    ) AS next_tournament_start
  FROM (
    SELECT
      properties->>'venue_id'  AS venue_id,
      COUNT(*)::bigint         AS view_count
    FROM ti_map_events
    WHERE event_name = 'venue_map_opened'
      AND created_at >= since_iso
      AND properties->>'venue_id' IS NOT NULL
    GROUP BY properties->>'venue_id'
    ORDER BY 2 DESC
    LIMIT result_limit
  ) e
  LEFT JOIN venues v ON v.id::text = e.venue_id
  ORDER BY e.view_count DESC;
$$;

CREATE OR REPLACE FUNCTION admin_top_sports_by_views(
  since_iso    timestamptz,
  result_limit int DEFAULT 5
)
RETURNS TABLE (sport text, view_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT sport, COUNT(*)::bigint AS view_count
  FROM ti_map_events
  WHERE event_name = 'tournament_detail_page_viewed'
    AND created_at >= since_iso
    AND sport IS NOT NULL
  GROUP BY sport
  ORDER BY 2 DESC
  LIMIT result_limit;
$$;

CREATE OR REPLACE FUNCTION admin_top_states_by_venue_opens(
  since_iso    timestamptz,
  result_limit int DEFAULT 5
)
RETURNS TABLE (state text, open_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT state, COUNT(*)::bigint AS open_count
  FROM ti_map_events
  WHERE event_name = 'venue_map_opened'
    AND created_at >= since_iso
    AND state IS NOT NULL
  GROUP BY state
  ORDER BY 2 DESC
  LIMIT result_limit;
$$;
