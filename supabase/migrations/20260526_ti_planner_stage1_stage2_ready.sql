-- TI Weekend Planner (Stage 1 hardening / Stage 2 readiness):
-- - Add a stable per-event UID for future ICS/iCal mapping.
-- - Add a compound index for idempotent upserts by (user_id, source_id, source_event_uid).
-- - Add a few non-critical single-column indexes expected by admin validation tooling/specs.

alter table public.planner_events
  add column if not exists source_event_uid text;

create index if not exists planner_events_source_uid_idx
  on public.planner_events (user_id, source_id, source_event_uid);

-- Additional single-column indexes (some are redundant with existing composites/uniques,
-- but are cheap and align with validation expectations).
create index if not exists planner_events_user_id_idx
  on public.planner_events (user_id);

create index if not exists planner_events_starts_at_idx
  on public.planner_events (starts_at);

create index if not exists planner_user_preferences_user_id_idx
  on public.planner_user_preferences (user_id);

