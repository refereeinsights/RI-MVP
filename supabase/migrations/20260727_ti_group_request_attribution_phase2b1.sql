-- TI group-request attribution phase 2B.1: additive canonical attribution and payload snapshots.

do $$
begin
  if to_regclass('public.lodging_search_session') is null then
    return;
  end if;

  alter table public.lodging_search_session
    add column if not exists outbound_attribution_id text,
    add column if not exists group_request_id text,
    add column if not exists source_page_type text,
    add column if not exists source_path text,
    add column if not exists job_code text,
    add column if not exists keyword text,
    add column if not exists partner_source_code text,
    add column if not exists custom_field1 text,
    add column if not exists custom_field2 text,
    add column if not exists custom_field3 text,
    add column if not exists custom_field4 text,
    add column if not exists custom_field5 text,
    add column if not exists custom_field6 text,
    add column if not exists custom_field7 text,
    add column if not exists custom_field8 text,
    add column if not exists outbound_partner text,
    add column if not exists destination_type text,
    add column if not exists provider_request_snapshot jsonb;

  create unique index if not exists lodging_search_session_group_request_outbound_attr_uidx
    on public.lodging_search_session (outbound_attribution_id)
    where outbound_attribution_id is not null and endpoint = '/api/lodging/group-request';

  create index if not exists lodging_search_session_group_request_source_page_type_created_at_idx
    on public.lodging_search_session (source_page_type, created_at desc);

  create index if not exists lodging_search_session_group_request_id_created_at_idx
    on public.lodging_search_session (group_request_id, created_at desc);
end $$;
