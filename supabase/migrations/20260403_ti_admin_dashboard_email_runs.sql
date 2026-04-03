-- TI admin dashboard email: run logging (v1)
-- Stores a durable record of each cron execution (dry-run or sent) so we can audit whether it fired.

do $$
begin
  create table if not exists public.ti_admin_dashboard_email_runs (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    run_at timestamptz not null default now(),
    dry_run boolean not null default false,
    recipients text[] not null default '{}'::text[],
    subject text not null default '',
    ok boolean not null default false,
    error text null,
    payload jsonb null
  );

  create index if not exists ti_admin_dashboard_email_runs_run_at_idx
    on public.ti_admin_dashboard_email_runs (run_at desc);

  -- Lock down: only service role should be able to write/read.
  alter table public.ti_admin_dashboard_email_runs enable row level security;

  revoke all on table public.ti_admin_dashboard_email_runs from public;
  revoke all on table public.ti_admin_dashboard_email_runs from anon;
  revoke all on table public.ti_admin_dashboard_email_runs from authenticated;
  grant select, insert on table public.ti_admin_dashboard_email_runs to service_role;
end $$;

