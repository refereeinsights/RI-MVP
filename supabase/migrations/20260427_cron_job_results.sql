-- Cron job run results log (v1)
-- Stores one row per cron execution so admin dashboards can show history and lifetime totals.

create table if not exists public.cron_job_results (
  id            bigserial primary key,
  job_key       text        not null,
  started_at    timestamptz not null,
  scanned       integer     not null default 0,
  processed     integer     not null default 0,
  updated       integer     not null default 0,
  skipped_no_coords   integer not null default 0,
  skipped_up_to_date  integer not null default 0,
  failures      integer     not null default 0,
  ms            integer     not null default 0,
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists cron_job_results_job_key_started_at_idx
  on public.cron_job_results (job_key, started_at desc);

-- Service role only — admin reads via supabaseAdmin, cron writes via supabaseAdmin.
revoke all on table public.cron_job_results from public;
revoke all on table public.cron_job_results from anon;
revoke all on table public.cron_job_results from authenticated;
grant select, insert on table public.cron_job_results to service_role;
grant usage, select on sequence public.cron_job_results_id_seq to service_role;
