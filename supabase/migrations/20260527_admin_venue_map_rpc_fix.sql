-- Fix admin_top_viewed_venues: venue_map_opened is a page-level event with no venue_id.
-- Group by tournament_id instead (available in properties) so the panel is non-empty.
-- Return type changes, so we must DROP then recreate.

DROP FUNCTION IF EXISTS admin_top_viewed_venues(timestamptz, int);

CREATE FUNCTION admin_top_viewed_venues(
  since_iso    timestamptz,
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
      properties->>'tournament_id' AS tournament_id,
      COUNT(*)::bigint             AS view_count
    FROM ti_map_events
    WHERE event_name = 'venue_map_opened'
      AND created_at >= since_iso
      AND properties->>'tournament_id' IS NOT NULL
    GROUP BY properties->>'tournament_id'
    ORDER BY 2 DESC
    LIMIT result_limit
  ) e
  LEFT JOIN tournaments t ON t.id::text = e.tournament_id
  ORDER BY e.view_count DESC;
$$;
