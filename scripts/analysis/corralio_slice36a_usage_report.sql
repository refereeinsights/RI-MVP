-- Read-only Slice 3.6A report. Outputs aggregate operational/product signals
-- only; provider acceptance is not device delivery, and post-send return is
-- not deterministic notification-click attribution.

select state, count(*) as subscription_count
from public.corralio_push_subscriptions
group by state
order by state;

select interaction_type, count(*) as interaction_count,
  count(distinct household_id) as household_count
from public.corralio_push_interactions
group by interaction_type
order by interaction_type;

select delivery.state, delivery.error_code,
  count(*) as delivery_count,
  sum(delivery.attempt_count) as provider_attempt_count
from public.corralio_weekend_ready_deliveries delivery
group by delivery.state, delivery.error_code
order by delivery.state, delivery.error_code nulls first;

select
  count(*) as campaign_count,
  count(*) filter (where accepted.accepted_count > 0) as provider_accepted_campaigns,
  count(*) filter (
    where engagement.last_viewed_at >= campaign.created_at
      and engagement.last_viewed_at < campaign.created_at + interval '72 hours'
  ) as post_send_return_campaigns
from public.corralio_weekend_ready_campaigns campaign
left join lateral (
  select count(*) as accepted_count
  from public.corralio_weekend_ready_deliveries delivery
  where delivery.campaign_id = campaign.id and delivery.state = 'accepted'
) accepted on true
left join public.corralio_weekly_engagement engagement
  on engagement.household_id = campaign.household_id
 and engagement.usage_week_start = date_trunc('week', campaign.created_at at time zone 'UTC')::date;
