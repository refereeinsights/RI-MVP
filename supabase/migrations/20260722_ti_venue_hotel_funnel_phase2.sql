-- TI venue hotel funnel phase 2: additive identifiers and attribution fields.

do $$
begin
  if to_regclass('public.lodging_search_session') is not null then
    alter table public.lodging_search_session
      add column if not exists cta_instance_id uuid,
      add column if not exists cta_interaction_id uuid,
      add column if not exists cta_type text,
      add column if not exists cta_placement text,
      add column if not exists flow_type text,
      add column if not exists page_type text,
      add column if not exists page_url text,
      add column if not exists device_type text,
      add column if not exists traffic_source text,
      add column if not exists referrer text,
      add column if not exists venue_id uuid,
      add column if not exists tournament_id uuid;

    create index if not exists lodging_search_session_cta_interaction_id_idx
      on public.lodging_search_session (cta_interaction_id);

    create index if not exists lodging_search_session_cta_placement_created_at_idx
      on public.lodging_search_session (cta_placement, created_at desc);
  end if;

  if to_regclass('public.ti_outbound_clicks') is not null then
    alter table public.ti_outbound_clicks
      add column if not exists session_id uuid,
      add column if not exists cta_instance_id uuid,
      add column if not exists cta_interaction_id uuid,
      add column if not exists cta_type text,
      add column if not exists cta_placement text,
      add column if not exists flow_type text,
      add column if not exists page_type text,
      add column if not exists page_url text,
      add column if not exists device_type text,
      add column if not exists traffic_source text,
      add column if not exists lodging_search_id uuid,
      add column if not exists outbound_partner text,
      add column if not exists outbound_request_id uuid;

    create index if not exists ti_outbound_clicks_cta_interaction_id_idx
      on public.ti_outbound_clicks (cta_interaction_id);

    create index if not exists ti_outbound_clicks_cta_placement_created_at_idx
      on public.ti_outbound_clicks (cta_placement, created_at desc);

    create unique index if not exists ti_outbound_clicks_outbound_request_id_uidx_v2
      on public.ti_outbound_clicks (outbound_request_id);

    drop index if exists public.ti_outbound_clicks_outbound_request_id_uidx;

    alter index if exists public.ti_outbound_clicks_outbound_request_id_uidx_v2
      rename to ti_outbound_clicks_outbound_request_id_uidx;
  end if;
end $$;
