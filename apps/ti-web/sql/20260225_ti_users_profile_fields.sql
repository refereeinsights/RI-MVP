-- Add TI profile fields for review attribution and lightweight profile metadata.

alter table public.ti_users
  add column if not exists display_name text,
  add column if not exists reviewer_handle text,
  add column if not exists zip_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ti_users_reviewer_handle_format'
  ) then
    alter table public.ti_users
      add constraint ti_users_reviewer_handle_format
      check (
        reviewer_handle is null
        or reviewer_handle ~ '^[a-z0-9_]{3,20}$'
      );
  end if;
end $$;

create unique index if not exists ti_users_reviewer_handle_unique
  on public.ti_users (reviewer_handle)
  where reviewer_handle is not null;
