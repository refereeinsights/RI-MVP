-- Normalize venue restroom values to capitalized display values and constrain venue sport choices.

-- 1) Replace restrooms constraint with capitalized allowed values.
alter table public.venues
  drop constraint if exists venues_restrooms_allowed;

-- 2) Normalize existing restrooms data.
update public.venues
set restrooms = case
  when restrooms is null or btrim(restrooms) = '' then null
  when lower(btrim(restrooms)) in ('portable', 'portables') then 'Portable'
  when lower(btrim(restrooms)) in ('building', 'bathroom', 'bathrooms') then 'Building'
  when lower(btrim(restrooms)) in ('both', 'portable and building', 'building and portable') then 'Both'
  else null
end;

-- 3) Add the new restrooms constraint.
alter table public.venues
  add constraint venues_restrooms_allowed
  check (restrooms in ('Portable', 'Building', 'Both')) not valid;

alter table public.venues
  validate constraint venues_restrooms_allowed;

-- 4) Normalize existing venue sport values.
update public.venues
set sport = case
  when sport is null or btrim(sport) = '' then null
  when lower(btrim(sport)) in ('soccer', 'baseball', 'lacrosse', 'basketball', 'hockey', 'volleyball', 'futsal')
    then lower(btrim(sport))
  else null
end;

-- 5) Enforce allowed venue sports going forward.
alter table public.venues
  drop constraint if exists venues_sport_allowed;

alter table public.venues
  add constraint venues_sport_allowed
  check (
    sport is null
    or sport in ('soccer', 'baseball', 'lacrosse', 'basketball', 'hockey', 'volleyball', 'futsal')
  ) not valid;

alter table public.venues
  validate constraint venues_sport_allowed;
