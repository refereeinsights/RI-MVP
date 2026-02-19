-- Venue spectator seating signals for planning UX.
alter table public.venues
  add column if not exists spectator_seating text,
  add column if not exists bring_field_chairs boolean,
  add column if not exists seating_notes text;

alter table public.venues
  add constraint venues_spectator_seating_allowed
  check (spectator_seating in ('none', 'limited', 'bleachers', 'covered_bleachers', 'mixed'))
  not valid;

alter table public.venues validate constraint venues_spectator_seating_allowed;
