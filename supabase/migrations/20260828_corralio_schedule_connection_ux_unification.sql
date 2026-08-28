-- Corralio Schedule Connection UX Unification: admit the founder-approved
-- LeagueApps catalog key to the existing closed Slice 3.4 measurement only.

alter table public.corralio_schedule_connection_events
  drop constraint corralio_schedule_connection_events_platform_check;

alter table public.corralio_schedule_connection_events
  add constraint corralio_schedule_connection_events_platform_check check (platform in (
    'gamechanger', 'teamsnap', 'stack_team_app', 'arbiterlive',
    'arbiter_officials', 'leagueapps', 'other'
  ));
