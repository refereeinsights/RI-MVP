-- TI: venue_url cleanup + field/court map discovery scaffolding (v1)
-- Production-safe, idempotent schema changes:
-- - Add field map enrichment columns to public.venues
-- - Add review/approval queue table
-- - Add append-only audit log

do $$
begin
  if to_regclass('public.venues') is null then
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- public.venues enrichment columns
  -- ---------------------------------------------------------------------------
  alter table public.venues
    add column if not exists field_map_url text null,
    add column if not exists field_map_source text null,
    add column if not exists field_map_confidence text null,
    add column if not exists field_map_last_checked_at timestamptz null,
    add column if not exists venue_url_last_checked_at timestamptz null,
    add column if not exists venue_url_quality text null,
    add column if not exists field_map_type text null,
    add column if not exists field_map_hash text null;

  -- CHECK constraints (nullable allowed)
  begin
    alter table public.venues
      add constraint venues_field_map_confidence_check
      check (field_map_confidence is null or field_map_confidence in ('high','medium','low'));
  exception when duplicate_object then
    null;
  end;

  begin
    alter table public.venues
      add constraint venues_venue_url_quality_check
      check (venue_url_quality is null or venue_url_quality in ('good','bad','unknown'));
  exception when duplicate_object then
    null;
  end;

  begin
    alter table public.venues
      add constraint venues_field_map_type_check
      check (
        field_map_type is null
        or field_map_type in (
          'complex_layout',
          'parking_map',
          'field_numbering',
          'indoor_court_map',
          'campus_map',
          'general_facility_map',
          'unknown'
        )
      );
  exception when duplicate_object then
    null;
  end;

  -- Indexes (partial where helpful)
  create index if not exists venues_venue_url_quality_idx
    on public.venues (venue_url_quality)
    where venue_url_quality is not null;

  create index if not exists venues_field_map_confidence_idx
    on public.venues (field_map_confidence)
    where field_map_confidence is not null;

  create index if not exists venues_field_map_missing_last_checked_idx
    on public.venues (field_map_last_checked_at desc)
    where field_map_url is null;

  create index if not exists venues_field_map_hash_idx
    on public.venues (field_map_hash)
    where field_map_hash is not null;

  -- ---------------------------------------------------------------------------
  -- Queue table: public.venue_url_review_queue
  -- ---------------------------------------------------------------------------
  create table if not exists public.venue_url_review_queue (
    venue_id uuid primary key references public.venues(id) on delete cascade,
    status text not null default 'pending',
    bad_venue_url_reason text null,

    current_venue_url text null,
    current_field_map_url text null,

    suggested_venue_url text null,
    suggested_field_map_url text null,
    suggested_field_map_source text null,
    suggested_field_map_confidence text null,
    suggested_field_map_type text null,

    approve_venue_url boolean not null default false,
    approve_field_map_url boolean not null default false,
    override_good_venue_url boolean not null default false,

    previous_venue_url text null,
    previous_field_map_url text null,
    decision_summary text null,
    notes text null,
    reviewed_by text null,
    last_reviewed_at timestamptz null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  begin
    alter table public.venue_url_review_queue
      add constraint venue_url_review_queue_status_check
      check (status in ('pending','suggested','manual_review','approved','applied','skipped','error'));
  exception when duplicate_object then
    null;
  end;

  begin
    alter table public.venue_url_review_queue
      add constraint venue_url_review_queue_suggested_confidence_check
      check (suggested_field_map_confidence is null or suggested_field_map_confidence in ('high','medium','low'));
  exception when duplicate_object then
    null;
  end;

  begin
    alter table public.venue_url_review_queue
      add constraint venue_url_review_queue_suggested_type_check
      check (
        suggested_field_map_type is null
        or suggested_field_map_type in (
          'complex_layout',
          'parking_map',
          'field_numbering',
          'indoor_court_map',
          'campus_map',
          'general_facility_map',
          'unknown'
        )
      );
  exception when duplicate_object then
    null;
  end;

  create index if not exists venue_url_review_queue_status_updated_idx
    on public.venue_url_review_queue (status, updated_at desc);

  -- Maintain updated_at if helper exists in this project.
  if exists (select 1 from pg_proc where proname = 'set_updated_at' and pg_function_is_visible(oid)) then
    drop trigger if exists trg_venue_url_review_queue_updated_at on public.venue_url_review_queue;
    create trigger trg_venue_url_review_queue_updated_at
      before update on public.venue_url_review_queue
      for each row execute function public.set_updated_at();
  else
    drop trigger if exists trg_venue_url_review_queue_updated_at on public.venue_url_review_queue;
  end if;

  -- ---------------------------------------------------------------------------
  -- Append-only audit log: public.venue_url_audit_log
  -- ---------------------------------------------------------------------------
  create table if not exists public.venue_url_audit_log (
    id bigserial primary key,
    venue_id uuid not null references public.venues(id) on delete cascade,
    event_type text not null,
    previous_venue_url text null,
    new_venue_url text null,
    previous_field_map_url text null,
    new_field_map_url text null,
    actor text null,
    reason text null,
    created_at timestamptz not null default now()
  );

  create index if not exists venue_url_audit_log_venue_created_idx
    on public.venue_url_audit_log (venue_id, created_at desc);
end $$;

