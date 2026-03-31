-- TI: Scheduled Tournament Alerts (v1) - send logs for admin KPIs/debugging

create table if not exists public.ti_tournament_alert_send_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  alert_id uuid null references public.user_tournament_alerts(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  cadence text null,
  recipient_email text null,
  tournaments_count integer null,
  result_hash text null,
  outcome text not null,
  error_message text null,
  constraint ti_tournament_alert_send_logs_outcome_allowed check (outcome in ('sent', 'error')),
  constraint ti_tournament_alert_send_logs_cadence_allowed check (cadence is null or cadence in ('weekly', 'daily')),
  constraint ti_tournament_alert_send_logs_tournaments_count_nonneg check (tournaments_count is null or tournaments_count >= 0)
);

create index if not exists ti_tournament_alert_send_logs_created_at_idx
  on public.ti_tournament_alert_send_logs (created_at desc);
create index if not exists ti_tournament_alert_send_logs_outcome_created_at_idx
  on public.ti_tournament_alert_send_logs (outcome, created_at desc);
create index if not exists ti_tournament_alert_send_logs_cadence_created_at_idx
  on public.ti_tournament_alert_send_logs (cadence, created_at desc);
create index if not exists ti_tournament_alert_send_logs_user_created_at_idx
  on public.ti_tournament_alert_send_logs (user_id, created_at desc);

alter table public.ti_tournament_alert_send_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_ti_tournament_alert_send_logs') then
    create policy admin_all_ti_tournament_alert_send_logs
      on public.ti_tournament_alert_send_logs
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

revoke all on table public.ti_tournament_alert_send_logs from public;
revoke all on table public.ti_tournament_alert_send_logs from anon;
revoke all on table public.ti_tournament_alert_send_logs from authenticated;
grant select on table public.ti_tournament_alert_send_logs to service_role;

