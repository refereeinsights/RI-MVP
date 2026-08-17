-- TI/RI tournaments_public hot-path diagnostic (read-only, production-safe default)
--
-- This file does not execute application queries. EXPLAIN without ANALYZE shows
-- planner choices without running the SELECT. Do not add ANALYZE or BUFFERS to
-- this production-safe script during a saturation event.

-- View definition and security options.
select
  n.nspname as schema_name,
  c.relname as view_name,
  c.reloptions,
  pg_get_viewdef(c.oid, true) as definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'tournaments_public'
  and c.relkind = 'v';

-- Approximate base-table row count from planner statistics. The following
-- EXPLAIN plans also report the estimated published/canonical row count without
-- executing a count scan.
select
  c.reltuples::bigint as approximate_rows,
  pg_size_pretty(pg_relation_size(c.oid)) as table_size,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size_including_indexes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'tournaments'
  and c.relkind in ('r', 'p');

-- Existing indexes, validity, size, predicates, and definitions. Review this
-- output before proposing any new index; do not infer absence from migrations.
select
  idx.relname as index_name,
  i.indisunique,
  i.indisvalid,
  i.indisready,
  pg_size_pretty(pg_relation_size(idx.oid)) as index_size,
  pg_get_expr(i.indpred, i.indrelid) as predicate,
  pg_get_indexdef(i.indexrelid) as definition
from pg_index i
join pg_class tbl on tbl.oid = i.indrelid
join pg_namespace n on n.oid = tbl.relnamespace
join pg_class idx on idx.oid = i.indexrelid
where n.nspname = 'public'
  and tbl.relname = 'tournaments'
order by pg_relation_size(idx.oid) desc, idx.relname;

-- Compact signatures help identify duplicate or overlapping index prefixes.
select
  idx.relname as index_name,
  i.indisunique,
  i.indisvalid,
  i.indkey::text as indexed_column_numbers,
  pg_get_expr(i.indexprs, i.indrelid) as expressions,
  pg_get_expr(i.indpred, i.indrelid) as predicate
from pg_index i
join pg_class tbl on tbl.oid = i.indrelid
join pg_namespace n on n.oid = tbl.relnamespace
join pg_class idx on idx.oid = i.indexrelid
where n.nspname = 'public'
  and tbl.relname = 'tournaments'
order by i.indkey::text, pg_get_expr(i.indpred, i.indrelid), idx.relname;

-- Confirm whether pg_stat_statements is available. Query it separately only
-- when installed and only with a narrow statement filter in the SQL editor.
select exists (
  select 1
  from pg_extension
  where extname = 'pg_stat_statements'
) as pg_stat_statements_available;

-- Estimated published/canonical population. The Plan Rows value is the estimate.
explain (costs, verbose, settings, format text)
select id
from public.tournaments_public;

-- Exact metadata slug lookup observed during the saturation event.
explain (costs, verbose, settings, format text)
select name, city, state, start_date, end_date, slug, sport
from public.tournaments_public
where slug = 'heartland-midwest-classic-2026-overland-park-ks';

-- Exact TI public detail core. Keep this synchronized with
-- apps/ti-web/lib/publicTournament.ts and the detail page it serves.
explain (costs, verbose, settings, format text)
select
  id,
  slug,
  name,
  city,
  state,
  zip,
  latitude,
  longitude,
  start_date,
  end_date,
  summary,
  source_url,
  official_website_url,
  sport,
  level,
  tournament_staff_verified,
  venue,
  address,
  static_map_path,
  static_map_status,
  static_map_updated_at
from public.tournaments_public
where slug = 'heartland-midwest-classic-2026-overland-park-ks';

-- Default upcoming directory: 50 visible rows plus one lookahead row.
explain (costs, verbose, settings, format text)
select
  tp.id,
  tp.name,
  tp.slug,
  tp.sport,
  tp.tournament_association,
  tp.state,
  tp.city,
  tp.zip,
  tp.start_date,
  tp.end_date,
  tp.official_website_url,
  tp.source_url,
  tp.level,
  tp.tournament_staff_verified,
  tp.is_demo,
  (
    select count(*)
    from public.tournament_venues tv
    where tv.tournament_id = tp.id
  ) as venue_count
from public.tournaments_public tp
where (coalesce(tp.is_demo, false) = true or tp.start_date >= current_date or tp.end_date >= current_date)
  and tp.name not ilike '%league%'
order by tp.is_demo desc, tp.start_date asc nulls last, tp.id asc
limit 51;

-- Representative high-volume state.
explain (costs, verbose, settings, format text)
select id, name, slug, sport, state, city, start_date, end_date
from public.tournaments_public
where state = 'CA'
  and (start_date >= current_date or end_date >= current_date)
order by start_date asc nulls last, id asc
limit 51;

-- Representative common sport.
explain (costs, verbose, settings, format text)
select id, name, slug, sport, state, city, start_date, end_date
from public.tournaments_public
where sport = 'soccer'
  and (start_date >= current_date or end_date >= current_date)
order by start_date asc nulls last, id asc
limit 51;

-- Representative combined state/sport path.
explain (costs, verbose, settings, format text)
select id, name, slug, sport, state, city, start_date, end_date
from public.tournaments_public
where state = 'CA'
  and sport = 'soccer'
  and (start_date >= current_date or end_date >= current_date)
order by start_date asc nulls last, id asc
limit 51;

-- No index recommendation is embedded here. Review actual production catalog
-- and plan output first; a timed-out point lookup during general saturation does
-- not by itself prove an intrinsic slug-query or missing-index problem.
