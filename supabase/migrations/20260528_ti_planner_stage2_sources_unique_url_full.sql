-- TI Weekend Planner (Stage 2): ensure `planner_event_sources` has a NON-partial unique index
-- matching the Supabase `.upsert(..., { onConflict })` target.
--
-- Why:
-- - Supabase JS uses `ON CONFLICT (user_id, source_type, source_url)` (no predicate).
-- - Our earlier partial unique index (`WHERE source_url IS NOT NULL`) does not satisfy that
--   conflict target, which can cause Postgres error 42P10:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- This index allows multiple NULL `source_url` values (Postgres unique index semantics),
-- but provides a matching unique constraint for non-null source URLs used by ICS sources.

create unique index if not exists planner_event_sources_unique_url_full_idx
  on public.planner_event_sources (user_id, source_type, source_url);

