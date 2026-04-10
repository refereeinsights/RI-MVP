-- Cleanup: remove localhost/dev analytics from ti_map_events (v1)
-- Safe to run repeatedly (idempotent).

delete from public.ti_map_events
where
  coalesce(properties->>'host', '') ilike 'localhost%'
  or coalesce(properties->>'host', '') ilike '127.0.0.1%'
  or coalesce(properties->>'host', '') ilike '[::1]%'
  or coalesce(properties->>'host', '') ilike '%.local'
  or coalesce(properties->>'origin', '') ilike '%://localhost%'
  or coalesce(properties->>'origin', '') ilike '%://127.0.0.1%'
  or coalesce(properties->>'origin', '') ilike '%://[::1]%'
  or coalesce(properties->>'referer', '') ilike '%://localhost%'
  or coalesce(properties->>'referer', '') ilike '%://127.0.0.1%'
  or coalesce(properties->>'referer', '') ilike '%://[::1]%';

