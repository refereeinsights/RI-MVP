-- TI partners: add soccer-only World Cup fan gear link (idempotent).
-- Used for a soccer-only placement on `/tournaments/[slug]` via `/go/partner/[partnerLinkId]`.

do $$
declare
  fanatics_id uuid;
begin
  select id into fanatics_id from public.partners where key = 'fanatics' limit 1;
  if fanatics_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.partner_links
    where partner_id = fanatics_id
      and sport = 'soccer'
      and page_type = 'tournament_detail'
      and placement = 'soccer_tournament_world_cup_fan_gear'
      and campaign = 'world_cup_2026'
      and is_active = true
    limit 1
  ) then
    insert into public.partner_links (
      partner_id,
      label,
      url,
      destination_type,
      page_type,
      placement,
      sport,
      campaign,
      shared_id,
      sub_id_1,
      sub_id_2,
      sub_id_3,
      is_active,
      sort_order
    )
    values (
      fanatics_id,
      'Soccer World Cup Fan Gear',
      'https://fanatics.93n6tx.net/3kZYDM',
      'fan_gear',
      'tournament_detail',
      'soccer_tournament_world_cup_fan_gear',
      'soccer',
      'world_cup_2026',
      'tournamentinsights',
      'tournament_detail',
      'soccer_tournament_world_cup_fan_gear',
      'soccer',
      true,
      5
    );
  end if;
end $$;

