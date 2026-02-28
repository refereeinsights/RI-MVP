alter table public.venues
  drop constraint if exists venues_sport_allowed;

alter table public.venues
  add constraint venues_sport_allowed
  check (
    sport is null
    or sport in (
      'soccer',
      'baseball',
      'softball',
      'lacrosse',
      'basketball',
      'hockey',
      'volleyball',
      'futsal'
    )
  ) not valid;

alter table public.venues
  validate constraint venues_sport_allowed;
