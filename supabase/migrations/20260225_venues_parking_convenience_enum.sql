-- Convert parking_convenience_score from numeric scoring to discrete labels.
-- Allowed values: Close, Medium, Far.

do $$
declare
  col_type text;
begin
  -- Remove legacy numeric range constraint if present.
  if exists (
    select 1
    from pg_constraint
    where conname = 'venues_parking_convenience_score_range'
  ) then
    alter table public.venues drop constraint venues_parking_convenience_score_range;
  end if;

  -- Determine current data type for safe conversion.
  select data_type
  into col_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'venues'
    and column_name = 'parking_convenience_score';

  if col_type is null then
    -- If column does not exist yet, create it as text.
    alter table public.venues
      add column parking_convenience_score text;
  elsif col_type <> 'text' and col_type <> 'character varying' then
    -- Map legacy numeric scores to discrete labels.
    alter table public.venues
      alter column parking_convenience_score type text
      using (
        case
          when parking_convenience_score is null then null
          when parking_convenience_score::numeric >= 4 then 'Close'
          when parking_convenience_score::numeric >= 2 then 'Medium'
          else 'Far'
        end
      );
  end if;
end $$;

-- Normalize any existing text variants to canonical labels.
update public.venues
set parking_convenience_score = case
  when parking_convenience_score is null or btrim(parking_convenience_score) = '' then null
  when lower(btrim(parking_convenience_score)) in ('close', 'near', 'nearby') then 'Close'
  when lower(btrim(parking_convenience_score)) in ('medium', 'mid', 'moderate') then 'Medium'
  when lower(btrim(parking_convenience_score)) in ('far', 'distant') then 'Far'
  else null
end;

alter table public.venues
  drop constraint if exists venues_parking_convenience_score_allowed;

alter table public.venues
  add constraint venues_parking_convenience_score_allowed
  check (
    parking_convenience_score in ('Close', 'Medium', 'Far')
  ) not valid;

alter table public.venues
  validate constraint venues_parking_convenience_score_allowed;

-- Ensure venue notes exists as capped text only when missing.
alter table public.venues
  add column if not exists notes varchar(255);
