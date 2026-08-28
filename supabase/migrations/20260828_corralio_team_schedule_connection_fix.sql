-- Repair two production gaps found while connecting an ArbiterSports calendar
-- through an existing team editor. Team assignment continues to use the
-- established exactly-one persisted child/team representation; the adapter
-- supplies team-only assignment. This migration restores only the column
-- privilege required by the authenticated team editor.

grant update (arrival_buffer_minutes)
  on table public.corralio_teams to authenticated;
