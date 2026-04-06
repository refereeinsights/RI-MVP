-- Venue import run rows: persist per-row venue sweep results (v1)
-- Adds optional columns so the admin import results table can show a per-venue sweep status/counts
-- and allow re-running safely without a parallel tracking system.

alter table if exists public.venue_import_run_rows
  add column if not exists sweep_ran_at timestamptz null,
  add column if not exists sweep_result jsonb null,
  add column if not exists sweep_error text null;

create index if not exists venue_import_run_rows_sweep_ran_at_idx
  on public.venue_import_run_rows (sweep_ran_at desc);

