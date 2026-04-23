-- TI: generated field maps (v1) scaffolding
-- Production-safe, idempotent schema changes:
-- - Track generated map provenance on public.venue_field_maps
-- - Store generated draft + approval state on public.venue_url_review_queue
-- - (Optional) add lat/lng to public.venues for map centering

do $$
begin
  if to_regclass('public.venues') is null then
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- Optional: coordinates on public.venues (only if missing)
  -- ---------------------------------------------------------------------------
  alter table public.venues
    add column if not exists latitude double precision null,
    add column if not exists longitude double precision null;

  create index if not exists venues_lat_lng_idx
    on public.venues (latitude, longitude)
    where latitude is not null and longitude is not null;

  -- ---------------------------------------------------------------------------
  -- Extend public.venue_field_maps (canonical multi-map table)
  -- ---------------------------------------------------------------------------
  if to_regclass('public.venue_field_maps') is not null then
    alter table public.venue_field_maps
      add column if not exists map_origin text null,
      add column if not exists is_generated boolean not null default false,
      add column if not exists generator text null,
      add column if not exists generator_version text null,
      add column if not exists generated_at timestamptz null,
      add column if not exists status text not null default 'active',
      add column if not exists archived_at timestamptz null;

    begin
      alter table public.venue_field_maps
        add constraint venue_field_maps_origin_check
        check (
          map_origin is null
          or map_origin in ('official','staff_uploaded','discovered','generated_mapbox')
        );
    exception when duplicate_object then
      null;
    end;

    begin
      alter table public.venue_field_maps
        add constraint venue_field_maps_status_check
        check (status in ('active','archived'));
    exception when duplicate_object then
      null;
    end;

    begin
      alter table public.venue_field_maps
        add constraint venue_field_maps_generated_origin_check
        check (is_generated = false or map_origin = 'generated_mapbox');
    exception when duplicate_object then
      null;
    end;

    create index if not exists venue_field_maps_venue_origin_idx
      on public.venue_field_maps (venue_id, map_origin);

    create index if not exists venue_field_maps_venue_status_updated_idx
      on public.venue_field_maps (venue_id, status, updated_at desc);

    create index if not exists venue_field_maps_generated_updated_idx
      on public.venue_field_maps (updated_at desc)
      where is_generated = true;
  end if;

  -- ---------------------------------------------------------------------------
  -- Extend public.venue_url_review_queue (review / approval queue)
  -- ---------------------------------------------------------------------------
  if to_regclass('public.venue_url_review_queue') is not null then
    alter table public.venue_url_review_queue
      add column if not exists generated_map_object_path text null,
      add column if not exists generated_map_url text null,
      add column if not exists generated_map_hash text null,
      add column if not exists generated_map_version text null,
      add column if not exists generated_map_source text null,
      add column if not exists approve_generated_map boolean not null default false,
      add column if not exists generated_map_applied_id bigint null,
      add column if not exists generation_attempt_count integer not null default 0,
      add column if not exists generation_error text null,
      add column if not exists generated_at timestamptz null;

    begin
      alter table public.venue_url_review_queue
        add constraint venue_url_review_queue_generated_map_applied_fk
        foreign key (generated_map_applied_id)
        references public.venue_field_maps(id)
        on delete set null;
    exception when duplicate_object then
      null;
    end;

    create index if not exists venue_url_review_queue_generated_pending_idx
      on public.venue_url_review_queue (status, updated_at desc)
      where (generated_map_url is null or generated_map_url = '');
  end if;
end $$;

