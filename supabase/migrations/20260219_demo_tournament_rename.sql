-- Rename demo tournament display name while keeping slug stable.

update public.tournaments
set name = 'Demo Tournament'
where slug = 'refereeinsights-demo-tournament';
