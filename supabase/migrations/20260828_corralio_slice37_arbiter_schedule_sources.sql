-- Corralio Slice 3.7: allow the two approved Arbiter schedule-source keys in
-- the existing bounded Slice 3.4 interaction measurement.

alter table public.corralio_schedule_connection_events
  drop constraint corralio_schedule_connection_events_platform_check;

alter table public.corralio_schedule_connection_events
  add constraint corralio_schedule_connection_events_platform_check check (platform in (
    'gamechanger', 'teamsnap', 'stack_team_app', 'arbiterlive',
    'arbiter_officials', 'other'
  ));
