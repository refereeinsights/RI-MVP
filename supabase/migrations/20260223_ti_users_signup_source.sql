alter table public.ti_users
  add column if not exists signup_source text not null default 'website',
  add column if not exists signup_source_code text;

update public.ti_users
set signup_source = 'website'
where signup_source is null
   or btrim(signup_source) = '';

alter table public.ti_users
  drop constraint if exists ti_users_signup_source_allowed;

alter table public.ti_users
  add constraint ti_users_signup_source_allowed
  check (signup_source in ('website', 'event_code'));
