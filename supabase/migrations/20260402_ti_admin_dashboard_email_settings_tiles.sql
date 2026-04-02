-- Extend TI admin dashboard email settings with tile toggles.

do $$
begin
  if to_regclass('public.ti_admin_dashboard_email_settings') is not null then
    alter table public.ti_admin_dashboard_email_settings
      add column if not exists include_tiles boolean not null default true;

    alter table public.ti_admin_dashboard_email_settings
      add column if not exists include_sport_tiles boolean not null default true;
  end if;
end $$;

