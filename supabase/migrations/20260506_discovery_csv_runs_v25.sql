-- TI/RI: Discovery V2.5 run tracking + paste parse log + upload link audit
-- Admin/service-role only (no public/authenticated access).

do $$
begin
  if to_regclass('public.discovery_csv_runs') is null then
    create table public.discovery_csv_runs (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      created_by uuid null,
      sport text not null,
      state text not null,
      date_range_start date not null,
      date_range_end date not null,
      run_mode text not null default 'state_sport_window',
      status text not null default 'draft',
      import_started_at timestamptz null,
      import_finished_at timestamptz null,
      generated_prompt_plan jsonb null,
      master_csv text null,
      master_csv_row_count int not null default 0,
      search_key text not null,
      notes text null,
      constraint discovery_csv_runs_run_mode_chk check (run_mode in ('state_sport_window','venue_focus','organizer_focus')),
      constraint discovery_csv_runs_status_chk check (status in ('draft','queued_to_uploads','imported','imported_partial','failed','canceled'))
    );

    create unique index discovery_csv_runs_search_key_uidx
      on public.discovery_csv_runs (search_key);

    create index discovery_csv_runs_scope_idx
      on public.discovery_csv_runs (sport, state, date_range_start, date_range_end);

    create index discovery_csv_runs_status_updated_idx
      on public.discovery_csv_runs (status, updated_at desc);

    alter table public.discovery_csv_runs enable row level security;
    revoke all on table public.discovery_csv_runs from public, anon, authenticated;
    grant all on table public.discovery_csv_runs to service_role;
  end if;

  if to_regclass('public.discovery_csv_run_batches') is null then
    create table public.discovery_csv_run_batches (
      csv_run_id uuid not null references public.discovery_csv_runs(id) on delete cascade,
      batch_id uuid not null references public.discovery_batches(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (csv_run_id, batch_id)
    );

    create index discovery_csv_run_batches_batch_idx
      on public.discovery_csv_run_batches (batch_id);

    alter table public.discovery_csv_run_batches enable row level security;
    revoke all on table public.discovery_csv_run_batches from public, anon, authenticated;
    grant all on table public.discovery_csv_run_batches to service_role;
  end if;

  if to_regclass('public.discovery_batch_parse_log') is null then
    create table public.discovery_batch_parse_log (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      batch_id uuid not null references public.discovery_batches(id) on delete cascade,
      parse_status text not null,
      error_summary text null,
      warnings jsonb null,
      row_count_detected int not null default 0,
      row_count_accepted int not null default 0,
      constraint discovery_batch_parse_log_status_chk check (parse_status in ('ok','failed'))
    );

    create unique index discovery_batch_parse_log_batch_uidx
      on public.discovery_batch_parse_log (batch_id);

    alter table public.discovery_batch_parse_log enable row level security;
    revoke all on table public.discovery_batch_parse_log from public, anon, authenticated;
    grant all on table public.discovery_batch_parse_log to service_role;
  end if;

  if to_regclass('public.discovery_csv_run_upload_links') is null then
    create table public.discovery_csv_run_upload_links (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      csv_run_id uuid not null references public.discovery_csv_runs(id) on delete cascade,
      notice_text text null,
      created_count int not null default 0,
      updated_count int not null default 0,
      rejected_count int not null default 0,
      failed_count int not null default 0,
      import_status text not null default 'ok',
      import_errors jsonb null,
      store_row_audit boolean not null default false,
      constraint discovery_csv_run_upload_links_status_chk check (import_status in ('ok','partial','failed'))
    );

    create index discovery_csv_run_upload_links_run_created_idx
      on public.discovery_csv_run_upload_links (csv_run_id, created_at desc);

    alter table public.discovery_csv_run_upload_links enable row level security;
    revoke all on table public.discovery_csv_run_upload_links from public, anon, authenticated;
    grant all on table public.discovery_csv_run_upload_links to service_role;
  end if;
end $$;

-- Keep updated_at current on updates (service-role only).
do $$
begin
  if to_regclass('public._discovery_csv_runs_set_updated_at') is null then
    create or replace function public._discovery_csv_runs_set_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;

  if to_regclass('public.discovery_csv_runs') is not null then
    drop trigger if exists discovery_csv_runs_set_updated_at on public.discovery_csv_runs;
    create trigger discovery_csv_runs_set_updated_at
    before update on public.discovery_csv_runs
    for each row
    execute function public._discovery_csv_runs_set_updated_at();
  end if;
end $$;

