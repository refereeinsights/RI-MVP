-- TI: Scheduled Tournament Alerts (v1)
--
-- Adds:
-- - public.user_tournament_alerts: per-user scheduled alert preferences (RLS: owner-only)
-- - public.cron_job_locks + RPC helpers: lightweight lock to prevent overlapping cron runs

create table if not exists public.user_tournament_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text null,
  zip_code text not null,
  radius_miles integer not null,
  days_ahead integer not null,
  sport text null,
  cadence text not null,
  is_active boolean not null default true,
  last_sent_at timestamptz null,
  last_result_hash text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_tournament_alerts_radius_positive check (radius_miles > 0),
  constraint user_tournament_alerts_days_ahead_positive check (days_ahead > 0),
  constraint user_tournament_alerts_cadence_allowed check (cadence in ('weekly', 'daily'))
);

create index if not exists user_tournament_alerts_user_id_idx on public.user_tournament_alerts (user_id);
create index if not exists user_tournament_alerts_user_active_idx on public.user_tournament_alerts (user_id, is_active);
create index if not exists user_tournament_alerts_active_cadence_idx on public.user_tournament_alerts (is_active, cadence);

alter table public.user_tournament_alerts enable row level security;

drop policy if exists user_tournament_alerts_select_own on public.user_tournament_alerts;
create policy user_tournament_alerts_select_own
on public.user_tournament_alerts
for select
using (auth.uid() = user_id);

drop policy if exists user_tournament_alerts_insert_own on public.user_tournament_alerts;
create policy user_tournament_alerts_insert_own
on public.user_tournament_alerts
for insert
with check (auth.uid() = user_id);

drop policy if exists user_tournament_alerts_update_own on public.user_tournament_alerts;
create policy user_tournament_alerts_update_own
on public.user_tournament_alerts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_tournament_alerts_delete_own on public.user_tournament_alerts;
create policy user_tournament_alerts_delete_own
on public.user_tournament_alerts
for delete
using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_tournament_alerts to authenticated;

-- updated_at trigger (reuse shared helper if present)
do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'set_user_tournament_alerts_updated_at') then
      create trigger set_user_tournament_alerts_updated_at
        before update on public.user_tournament_alerts
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- Cron/job locks: prevent overlapping scheduled job runs without requiring session-level locks.
create table if not exists public.cron_job_locks (
  key text primary key,
  locked_until timestamptz not null,
  locked_at timestamptz not null default now(),
  locked_by text null
);

alter table public.cron_job_locks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_cron_job_locks') then
    create policy admin_all_cron_job_locks
      on public.cron_job_locks
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

create or replace function public.acquire_cron_job_lock(
  p_key text,
  p_ttl_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_ttl integer := greatest(coalesce(p_ttl_seconds, 900), 60);
  v_until timestamptz := v_now + make_interval(secs => v_ttl);
begin
  insert into public.cron_job_locks (key, locked_until, locked_at, locked_by)
  values (p_key, v_until, v_now, current_setting('request.jwt.claim.sub', true))
  on conflict (key) do update
    set locked_until = excluded.locked_until,
        locked_at = excluded.locked_at,
        locked_by = excluded.locked_by
  where public.cron_job_locks.locked_until < v_now;

  return found;
end;
$$;

create or replace function public.release_cron_job_lock(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.cron_job_locks
  set locked_until = now()
  where key = p_key;
$$;

revoke all on function public.acquire_cron_job_lock(text, integer) from public;
revoke all on function public.release_cron_job_lock(text) from public;
grant execute on function public.acquire_cron_job_lock(text, integer) to service_role;
grant execute on function public.release_cron_job_lock(text) to service_role;

