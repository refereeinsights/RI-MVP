-- TI/RI analytics write-volume and index audit (read-only)
--
-- Run only after the current saturation event has cleared. The transaction is
-- read-only and every statement is bounded by a timeout. A timeout is evidence
-- to stop and inspect later, not a reason to rerun repeatedly.
--
-- This script intentionally contains no CREATE/DROP INDEX, DELETE, VACUUM, or
-- retention mutation. Use its evidence before proposing sampling, retention,
-- or index replacement. Revenue-critical ti_outbound_clicks must not be sampled.

begin read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';

-- Confirm how long index-usage counters have been accumulating.
select stats_reset
from pg_stat_database
where datname = current_database();

-- Approximate live/dead rows and write/vacuum activity without count(*).
select
  schemaname,
  relname,
  n_live_tup,
  n_dead_tup,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  last_autovacuum,
  autovacuum_count
from pg_stat_user_tables
where schemaname = 'public'
  and relname in (
    'ti_map_events',
    'ri_analytics_events',
    'venue_quick_check_events',
    'ti_outbound_clicks'
  )
order by n_tup_ins desc;

-- Table and total index footprint.
select
  c.relname,
  pg_size_pretty(pg_relation_size(c.oid)) as table_size,
  pg_size_pretty(pg_indexes_size(c.oid)) as indexes_size,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'ti_map_events',
    'ri_analytics_events',
    'venue_quick_check_events',
    'ti_outbound_clicks'
  )
order by pg_total_relation_size(c.oid) desc;

-- Index usage, size, definition, and scan/read activity. A zero scan count is
-- not sufficient by itself to drop an index; review stats_reset and reporting
-- queries first, and replace rather than merely add when a composite is proven.
select
  s.relname as table_name,
  s.indexrelname as index_name,
  s.idx_scan,
  s.idx_tup_read,
  s.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
  pg_get_indexdef(s.indexrelid) as definition
from pg_stat_user_indexes s
where s.schemaname = 'public'
  and s.relname in (
    'ti_map_events',
    'ri_analytics_events',
    'venue_quick_check_events',
    'ti_outbound_clicks'
  )
order by s.relname, s.idx_scan desc, pg_relation_size(s.indexrelid) desc;

-- TI behavioral volume by event for the last seven complete/partial days.
select
  event_name,
  count(*) as events_7d,
  count(*) filter (where created_at >= now() - interval '24 hours') as events_24h,
  min(created_at) as first_seen_7d,
  max(created_at) as last_seen_7d
from public.ti_map_events
where created_at >= now() - interval '7 days'
group by event_name
order by events_7d desc
limit 100;

-- RI behavioral volume by event for the same window.
select
  event_name,
  count(*) as events_7d,
  count(*) filter (where created_at >= now() - interval '24 hours') as events_24h,
  min(created_at) as first_seen_7d,
  max(created_at) as last_seen_7d
from public.ri_analytics_events
where created_at >= now() - interval '7 days'
group by event_name
order by events_7d desc
limit 100;

-- Peak hourly behavioral write bursts over the last seven days.
select source, max(events_in_hour) as peak_events_per_hour
from (
  select 'ti_map_events'::text as source, date_trunc('hour', created_at) as hour, count(*) as events_in_hour
  from public.ti_map_events
  where created_at >= now() - interval '7 days'
  group by 1, 2
  union all
  select 'ri_analytics_events'::text, date_trunc('hour', created_at), count(*)
  from public.ri_analytics_events
  where created_at >= now() - interval '7 days'
  group by 1, 2
) hourly
group by source
order by peak_events_per_hour desc;

-- Revenue/attribution volume is reported separately because these rows remain
-- individual, immutable where required, and unsampled.
select
  destination_type,
  partner,
  count(*) as outbounds_7d,
  count(*) filter (where created_at >= now() - interval '24 hours') as outbounds_24h
from public.ti_outbound_clicks
where created_at >= now() - interval '7 days'
group by destination_type, partner
order by outbounds_7d desc
limit 100;

-- Check pg_stat_statements availability. If true, query it separately with a
-- narrow filter for INSERT INTO ti_map_events / ri_analytics_events; this file
-- remains portable to projects where the extension is unavailable.
select exists (
  select 1 from pg_extension where extname = 'pg_stat_statements'
) as pg_stat_statements_available;

rollback;
