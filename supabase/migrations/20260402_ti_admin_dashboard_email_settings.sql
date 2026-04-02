-- TI Admin Dashboard Email Settings
-- Stores recipients + section toggles for the scheduled admin dashboard email.

create table if not exists public.ti_admin_dashboard_email_settings (
  key text primary key,
  recipients text[] not null default '{}',
  include_outreach boolean not null default true,
  include_ri_summary boolean not null default true,
  include_lowest_states boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep `updated_at` current.
create or replace function public.ti_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists ti_admin_dashboard_email_settings_touch on public.ti_admin_dashboard_email_settings;
create trigger ti_admin_dashboard_email_settings_touch
before update on public.ti_admin_dashboard_email_settings
for each row execute function public.ti_touch_updated_at();

alter table public.ti_admin_dashboard_email_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ti_admin_dashboard_email_settings'
      and policyname = 'admin_all_ti_admin_dashboard_email_settings'
  ) then
    create policy admin_all_ti_admin_dashboard_email_settings
      on public.ti_admin_dashboard_email_settings
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

revoke all on table public.ti_admin_dashboard_email_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.ti_admin_dashboard_email_settings to service_role;

