-- TI: generated field maps (v1) optional POI hints
-- Production-safe, idempotent schema changes:
-- - Store optional POI hints (e.g., toilets/parking/food) for staff review
--   before/alongside generated PNG creation. These hints do NOT drive overlays in v1.

do $$
begin
  if to_regclass('public.venue_url_review_queue') is null then
    return;
  end if;

  alter table public.venue_url_review_queue
    add column if not exists poi_hints_json jsonb null,
    add column if not exists poi_hints_source text null,
    add column if not exists poi_hints_fetched_at timestamptz null,
    add column if not exists poi_hints_error text null;

  create index if not exists venue_url_review_queue_poi_hints_fetched_idx
    on public.venue_url_review_queue (poi_hints_fetched_at desc)
    where poi_hints_fetched_at is not null;
end $$;

