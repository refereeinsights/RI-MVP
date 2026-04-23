-- TI: generated field maps (v1) coordinate validation bypass
-- Production-safe, idempotent schema changes:
-- - Allow staff to explicitly bypass coordinate validation for known-good complex venues.

do $$
begin
  if to_regclass('public.venue_url_review_queue') is null then
    return;
  end if;

  alter table public.venue_url_review_queue
    add column if not exists bypass_coord_validation boolean not null default false;
end $$;

