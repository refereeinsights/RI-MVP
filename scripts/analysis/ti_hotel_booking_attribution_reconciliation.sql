-- TournamentInsights HotelPlanner booking attribution reconciliation
-- Phase 2A
--
-- Set these before running:
--   \set start_ts '2026-07-27T00:00:00Z'
--   \set end_ts   '2026-07-28T00:00:00Z'
--   \set outbound_attribution_id ''
--   \set outbound_request_id ''
--   \set cta_interaction_id ''
--   \set planner_session_id ''
--   \set lodging_search_id ''

with params as (
  select
    nullif(:'start_ts', '')::timestamptz as start_ts,
    nullif(:'end_ts', '')::timestamptz as end_ts,
    nullif(:'outbound_attribution_id', '') as outbound_attribution_id,
    nullif(:'outbound_request_id', '')::uuid as outbound_request_id,
    nullif(:'cta_interaction_id', '')::uuid as cta_interaction_id,
    nullif(:'planner_session_id', '')::uuid as planner_session_id,
    nullif(:'lodging_search_id', '')::uuid as lodging_search_id
),
outbounds as (
  select c.*
  from public.ti_outbound_clicks c
  cross join params p
  where c.partner = 'hotelplanner'
    and c.destination_type = 'hotels'
    and (p.start_ts is null or c.created_at >= p.start_ts)
    and (p.end_ts is null or c.created_at < p.end_ts)
),
filtered_outbounds as (
  select o.*
  from outbounds o
  cross join params p
  where (p.outbound_attribution_id is null or o.outbound_attribution_id = p.outbound_attribution_id)
    and (p.outbound_request_id is null or o.outbound_request_id = p.outbound_request_id)
    and (p.cta_interaction_id is null or o.cta_interaction_id = p.cta_interaction_id)
    and (p.planner_session_id is null or o.custom_field6 = concat('plan:', p.planner_session_id::text))
    and (p.lodging_search_id is null or o.lodging_search_id = p.lodging_search_id)
),
searches as (
  select s.*
  from public.lodging_search_session s
  cross join params p
  where (p.start_ts is null or s.created_at >= p.start_ts)
    and (p.end_ts is null or s.created_at < p.end_ts)
),
chains as (
  select
    o.created_at as outbound_created_at,
    o.outbound_attribution_id,
    o.outbound_request_id,
    o.cta_interaction_id,
    o.lodging_search_id,
    o.source_page_type,
    o.cta_placement,
    o.job_code,
    o.keyword,
    o.venue_id,
    o.tournament_id,
    o.source_surface,
    s.created_at as search_created_at,
    s.page_type as search_page_type,
    s.cta_placement as search_cta_placement
  from filtered_outbounds o
  left join searches s
    on s.id = o.lodging_search_id
)
select *
from chains
order by outbound_created_at desc;

-- Canonical vs legacy coverage
select
  coalesce(source_page_type, 'unknown') as source_page_type,
  coalesce(cta_placement, 'unknown') as cta_placement,
  count(*) as outbound_count,
  count(*) filter (where outbound_attribution_id is not null) as canonical_token_count,
  count(*) filter (where custom_field1 is not null) as custom1_count,
  count(*) filter (where custom_field2 is not null) as custom2_count,
  count(*) filter (where custom_field3 is not null) as custom3_count,
  count(*) filter (where custom_field4 is not null) as custom4_count,
  count(*) filter (where custom_field5 is not null) as custom5_count
from outbounds
group by 1, 2
order by outbound_count desc, source_page_type asc, cta_placement asc;

-- Missing canonical token diagnostics
select
  id,
  created_at,
  source_page_type,
  cta_placement,
  source_surface,
  target_url,
  redirect_url
from outbounds
where outbound_attribution_id is null
order by created_at desc;

-- Duplicate token diagnostics
select
  outbound_attribution_id,
  count(*) as duplicate_count,
  min(created_at) as first_seen_at,
  max(created_at) as last_seen_at
from outbounds
where outbound_attribution_id is not null
group by outbound_attribution_id
having count(*) > 1
order by duplicate_count desc, outbound_attribution_id asc;

-- Malformed token diagnostics
select
  id,
  created_at,
  outbound_attribution_id,
  custom_field3
from outbounds
where outbound_attribution_id is not null
  and outbound_attribution_id !~ '^[0-9a-f]{32}$'
order by created_at desc;

-- Orphan token diagnostics
select
  o.id,
  o.created_at,
  o.outbound_attribution_id,
  o.lodging_search_id,
  o.source_page_type,
  o.cta_placement
from outbounds o
left join searches s
  on s.id = o.lodging_search_id
where o.lodging_search_id is not null
  and s.id is null
order by o.created_at desc;
