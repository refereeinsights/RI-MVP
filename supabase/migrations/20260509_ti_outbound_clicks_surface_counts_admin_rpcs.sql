-- TI: outbound click analytics RPCs (extend) (v3)
-- Admin tooling helper for reporting outbound clicks by source_surface.
-- Safe to rerun; function is replaced in-place.

do $$
begin
  if to_regclass('public.ti_outbound_clicks') is null then
    return;
  end if;

  -- Require the hotels extension columns to exist (destination_type + source_surface).
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ti_outbound_clicks'
      and column_name in ('destination_type', 'source_surface', 'created_at')
    group by table_schema, table_name
    having count(*) = 3
  ) then
    return;
  end if;

  execute $fn$
    create or replace function public.list_ti_outbound_clicks_surface_counts_v1(
      p_destination_type text default null,
      p_since timestamptz default null,
      p_until timestamptz default null
    )
    returns table (
      source_surface text,
      click_count bigint
    )
    language sql
    stable
    security definer
    set search_path = public
    as $body$
      select
        c.source_surface,
        count(*)::bigint as click_count
      from public.ti_outbound_clicks c
      where (p_destination_type is null or c.destination_type = p_destination_type)
        and (p_since is null or c.created_at >= p_since)
        and (p_until is null or c.created_at < p_until)
      group by 1
      order by click_count desc, source_surface asc;
    $body$;
  $fn$;

  execute $fn$
    revoke all on function public.list_ti_outbound_clicks_surface_counts_v1(text, timestamptz, timestamptz) from public;
    grant execute on function public.list_ti_outbound_clicks_surface_counts_v1(text, timestamptz, timestamptz) to service_role;
  $fn$;
end $$;

