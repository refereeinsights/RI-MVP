-- TI Weekend Planner: preserve user-deleted imported events across ICS refreshes.
--
-- Why:
-- - Deleting an imported ICS event should suppress that source identity so refresh does not recreate it.
-- - We also want read paths to treat these suppressions like merged duplicate suppressions.

alter table public.planner_event_suppressions
  drop constraint if exists planner_event_suppressions_reason_check;

alter table public.planner_event_suppressions
  add constraint planner_event_suppressions_reason_check
  check (reason in ('merged_duplicate', 'kept_separate', 'deleted_source_event'));
