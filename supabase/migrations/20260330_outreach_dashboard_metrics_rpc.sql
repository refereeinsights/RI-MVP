-- Outreach dashboard: set-based aggregates for admin tooling (TI only).

create or replace function public.get_outreach_dashboard_metrics(
  p_sport text default null,
  p_campaign_id text default null,
  p_start_after timestamptz default null,
  p_start_before timestamptz default null,
  p_followup_days integer default 7
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      nullif(trim(p_sport), '') as sport,
      nullif(trim(p_campaign_id), '') as campaign_id,
      coalesce(p_start_after, '1900-01-01'::timestamptz) as start_after,
      coalesce(p_start_before, now()) as start_before,
      greatest(coalesce(p_followup_days, 7), 1) as followup_days
  ),
  base as (
    select e.*
    from public.email_outreach_previews e, params p
    where e.created_at >= p.start_after
      and e.created_at < p.start_before
      and (p.sport is null or e.sport = p.sport)
      and (p.campaign_id is null or e.campaign_id = p.campaign_id)
  ),
  enriched as (
    select
      e.id,
      e.created_at,
      e.sent_at,
      coalesce(e.send_attempt_count, 0) as send_attempt_count,
      e.director_email,
      e.director_replied_at,
      e.campaign_id,
      e.sport,
      (e.sent_at is not null) as sent,
      (e.director_replied_at is not null) as replied,
      nullif(split_part(lower(trim(e.director_email)), '@', 2), '') as director_domain
    from base e
  ),
  totals as (
    select
      count(*)::bigint as total_previews,
      count(*) filter (where sent)::bigint as sent_count,
      count(*) filter (where not sent)::bigint as not_sent_count,
      count(*) filter (where replied)::bigint as replied_count,
      count(distinct director_email) filter (
        where sent
          and director_email is not null
          and trim(director_email) <> ''
      )::bigint as directors_contacted_count,
      coalesce(sum(send_attempt_count), 0)::bigint as total_send_attempts,
      count(*) filter (
        where sent
          and not replied
          and sent_at < (now() - make_interval(days => (select followup_days from params)))
      )::bigint as needs_followup_count
    from enriched
  ),
  by_campaign as (
    select
      campaign_id,
      count(*)::bigint as previews,
      count(*) filter (where sent)::bigint as sent,
      count(*) filter (where replied)::bigint as replied
    from enriched
    group by campaign_id
  ),
  by_domain as (
    select
      director_domain as domain,
      count(*) filter (where sent)::bigint as sent,
      count(*) filter (where replied)::bigint as replied
    from enriched
    where director_domain is not null and director_domain <> ''
    group by director_domain
  ),
  window as (
    select
      greatest(
        (select start_after from params),
        (select start_before from params) - interval '30 days'
      ) as window_start,
      (select start_before from params) as window_end
  ),
  by_day as (
    select
      (date_trunc('day', created_at))::date as day,
      count(*)::bigint as previews_created,
      count(*) filter (where sent)::bigint as sent,
      count(*) filter (where replied)::bigint as replied
    from enriched, window w
    where created_at >= w.window_start
      and created_at < w.window_end
    group by 1
    order by 1 desc
    limit 30
  )
  select jsonb_build_object(
    'filters',
      jsonb_build_object(
        'sport', (select sport from params),
        'campaign_id', (select campaign_id from params),
        'start_after', (select start_after from params),
        'start_before', (select start_before from params),
        'followup_days', (select followup_days from params)
      ),
    'totals',
      jsonb_build_object(
        'total_previews', (select total_previews from totals),
        'sent_count', (select sent_count from totals),
        'not_sent_count', (select not_sent_count from totals),
        'replied_count', (select replied_count from totals),
        'reply_rate',
          case
            when (select sent_count from totals) > 0
              then round(((select replied_count from totals)::numeric / (select sent_count from totals)::numeric) * 100.0, 2)
            else null
          end,
        'directors_contacted_count', (select directors_contacted_count from totals),
        'total_send_attempts', (select total_send_attempts from totals),
        'needs_followup_count', (select needs_followup_count from totals)
      ),
    'by_campaign',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'campaign_id', campaign_id,
            'sent', sent,
            'replied', replied,
            'reply_rate', case when sent > 0 then round((replied::numeric / sent::numeric) * 100.0, 2) else null end
          )
          order by sent desc, replied desc, campaign_id asc
        )
        from by_campaign
      ), '[]'::jsonb),
    'by_domain',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'domain', domain,
            'sent', sent,
            'replied', replied,
            'reply_rate', case when sent > 0 then round((replied::numeric / sent::numeric) * 100.0, 2) else null end
          )
          order by sent desc, replied desc, domain asc
        )
        from (
          select * from by_domain order by sent desc, replied desc, domain asc limit 20
        ) top_domains
      ), '[]'::jsonb),
    'by_day',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'day', day,
            'previews_created', previews_created,
            'sent', sent,
            'replied', replied,
            'reply_rate', case when sent > 0 then round((replied::numeric / sent::numeric) * 100.0, 2) else null end
          )
          order by day desc
        )
        from by_day
      ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_outreach_dashboard_metrics(text, text, timestamptz, timestamptz, integer) from public;
grant execute on function public.get_outreach_dashboard_metrics(text, text, timestamptz, timestamptz, integer) to service_role;

