alter table public.event_codes
  add column if not exists founding_access boolean not null default false;

