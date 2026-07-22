-- Controlled chain lookup by canonical venue hotel funnel identifiers.

with impression as (
  select
    id,
    created_at,
    event_name,
    page_type,
    cta,
    href,
    properties
  from public.ti_map_events
  where event_name = 'hotel_cta_impression'
    and (
      properties->>'cta_instance_id' = :cta_instance_id
      or properties->>'cta_interaction_id' = :cta_interaction_id
    )
),
clicks as (
  select
    id,
    created_at,
    event_name,
    page_type,
    cta,
    href,
    properties
  from public.ti_map_events
  where event_name = 'hotel_cta_clicked'
    and (
      properties->>'cta_instance_id' = :cta_instance_id
      or properties->>'cta_interaction_id' = :cta_interaction_id
    )
),
searches as (
  select
    id,
    created_at,
    provider,
    status,
    cta_instance_id,
    cta_interaction_id,
    cta_placement,
    flow_type,
    page_type,
    page_url,
    venue_id,
    tournament_id
  from public.lodging_search_session
  where (
      cta_instance_id::text = :cta_instance_id
      or cta_interaction_id::text = :cta_interaction_id
      or id::text = :lodging_search_id
    )
    and endpoint = '/api/lodging/search'
),
outbound as (
  select
    id,
    created_at,
    partner,
    source_surface,
    cta_instance_id,
    cta_interaction_id,
    cta_placement,
    flow_type,
    page_type,
    page_url,
    venue_id,
    tournament_id,
    lodging_search_id,
    outbound_request_id,
    redirect_url
  from public.ti_outbound_clicks
  where destination_type = 'hotels'
    and (
      cta_instance_id::text = :cta_instance_id
      or cta_interaction_id::text = :cta_interaction_id
      or lodging_search_id::text = :lodging_search_id
    )
)
select 'impression' as record_type, to_jsonb(impression.*) as record from impression
union all
select 'click' as record_type, to_jsonb(clicks.*) as record from clicks
union all
select 'search' as record_type, to_jsonb(searches.*) as record from searches
union all
select 'outbound' as record_type, to_jsonb(outbound.*) as record from outbound
order by (record->>'created_at')::timestamptz nulls last;

-- Placement performance query using authoritative rows only.

with impressions as (
  select
    properties->>'cta_placement' as cta_placement,
    properties->>'flow_type' as flow_type,
    count(*)::bigint as impressions
  from public.ti_map_events
  where event_name = 'hotel_cta_impression'
  group by 1, 2
),
clicks as (
  select
    properties->>'cta_placement' as cta_placement,
    properties->>'flow_type' as flow_type,
    count(*)::bigint as clicks
  from public.ti_map_events
  where event_name = 'hotel_cta_clicked'
  group by 1, 2
),
searches as (
  select
    cta_placement,
    flow_type,
    count(*)::bigint as lodging_search_starts
  from public.lodging_search_session
  where endpoint = '/api/lodging/search'
  group by 1, 2
),
outbound as (
  select
    cta_placement,
    flow_type,
    count(*)::bigint as outbound_clicks
  from public.ti_outbound_clicks
  where destination_type = 'hotels'
    and partner = 'hotelplanner'
  group by 1, 2
),
placements as (
  select cta_placement, flow_type from impressions
  union
  select cta_placement, flow_type from clicks
  union
  select cta_placement, flow_type from searches
  union
  select cta_placement, flow_type from outbound
)
select
  placements.cta_placement,
  placements.flow_type,
  coalesce(impressions.impressions, 0) as impressions,
  coalesce(clicks.clicks, 0) as clicks,
  case
    when coalesce(impressions.impressions, 0) = 0 then null
    else round((coalesce(clicks.clicks, 0)::numeric / impressions.impressions::numeric) * 100, 2)
  end as ctr,
  case
    when placements.flow_type = 'search_then_outbound' then coalesce(searches.lodging_search_starts, 0)
    else null
  end as lodging_search_starts,
  coalesce(outbound.outbound_clicks, 0) as outbound_clicks,
  case
    when placements.flow_type <> 'search_then_outbound' or coalesce(clicks.clicks, 0) = 0 then null
    else round((coalesce(searches.lodging_search_starts, 0)::numeric / clicks.clicks::numeric) * 100, 2)
  end as click_to_search_rate,
  case
    when placements.flow_type <> 'search_then_outbound' or coalesce(searches.lodging_search_starts, 0) = 0 then null
    else round((coalesce(outbound.outbound_clicks, 0)::numeric / searches.lodging_search_starts::numeric) * 100, 2)
  end as search_to_outbound_rate,
  case
    when coalesce(clicks.clicks, 0) = 0 then null
    else round((coalesce(outbound.outbound_clicks, 0)::numeric / clicks.clicks::numeric) * 100, 2)
  end as click_to_outbound_rate
from placements
left join impressions using (cta_placement, flow_type)
left join clicks using (cta_placement, flow_type)
left join searches using (cta_placement, flow_type)
left join outbound using (cta_placement, flow_type)
order by placements.cta_placement, placements.flow_type;
