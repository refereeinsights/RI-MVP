-- TI hotel booking attribution phase 2A: additive canonical outbound attribution fields.

do $$
begin
  if to_regclass('public.ti_outbound_clicks') is null then
    return;
  end if;

  alter table public.ti_outbound_clicks
    add column if not exists outbound_attribution_id text,
    add column if not exists source_page_type text,
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
    add column if not exists custom_field8 text;

  create unique index if not exists ti_outbound_clicks_outbound_attribution_id_uidx
    on public.ti_outbound_clicks (outbound_attribution_id)
    where outbound_attribution_id is not null;

  create index if not exists ti_outbound_clicks_source_page_type_created_at_idx
    on public.ti_outbound_clicks (source_page_type, created_at desc);
end $$;
