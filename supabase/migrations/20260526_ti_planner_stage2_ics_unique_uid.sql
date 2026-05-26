-- TI Weekend Planner (Stage 2): enforce idempotency for ICS imports.
-- Supabase `.upsert(..., { onConflict })` requires a UNIQUE index/constraint.

create unique index if not exists planner_events_source_uid_unique_idx
  on public.planner_events (user_id, source_id, source_event_uid)
  where source_event_uid is not null;

