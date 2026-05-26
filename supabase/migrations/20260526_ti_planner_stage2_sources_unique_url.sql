-- TI Weekend Planner (Stage 2): prevent duplicate ICS source rows per user.

create unique index if not exists planner_event_sources_unique_url_idx
  on public.planner_event_sources (user_id, source_type, source_url)
  where source_url is not null;

