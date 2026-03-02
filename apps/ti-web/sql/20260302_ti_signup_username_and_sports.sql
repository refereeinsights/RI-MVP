-- TI signup profile expansion:
-- - add username
-- - add sports_interests
-- - keep reviewer_handle for backward compatibility

alter table public.ti_users
  add column if not exists username text,
  add column if not exists sports_interests text[] not null default '{}';

update public.ti_users
set username = reviewer_handle
where username is null
  and reviewer_handle is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ti_users_username_format'
  ) then
    alter table public.ti_users
      add constraint ti_users_username_format
      check (
        username is null
        or username ~ '^[a-z0-9_]{3,20}$'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ti_users_zip_code_format'
  ) then
    alter table public.ti_users
      add constraint ti_users_zip_code_format
      check (
        zip_code is null
        or zip_code ~ '^\d{5}(-\d{4})?$'
      );
  end if;
end $$;

create unique index if not exists ti_users_username_unique
  on public.ti_users (username)
  where username is not null;
