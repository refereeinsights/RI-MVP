-- TI Partner Management (v1)
-- Source of truth for monetization partners and their outbound tracking links.
-- Click reporting uses `public.ti_map_events` (see TI /go/partner redirect), not a separate clicks table.

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  category text not null,
  status text not null,
  priority text default 'medium',
  partner_type text,
  website_url text,
  application_url text,
  contact_email text,
  disclosure_text text,
  notes text,
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_links (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  label text not null,
  url text not null,
  destination_type text,
  page_type text,
  placement text,
  sport text,
  campaign text,
  shared_id text,
  sub_id_1 text,
  sub_id_2 text,
  sub_id_3 text,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partners_key_idx on public.partners (key);
create index if not exists partners_active_category_status_idx on public.partners (is_active, category, status);

create index if not exists partner_links_partner_id_idx on public.partner_links (partner_id);
create index if not exists partner_links_active_partner_id_idx on public.partner_links (is_active, partner_id);
create index if not exists partner_links_sport_placement_page_type_idx on public.partner_links (sport, placement, page_type);
create index if not exists partner_links_campaign_idx on public.partner_links (campaign);

-- Seed safety: treat (partner_id, label) as the stable identity for seeded links.
create unique index if not exists partner_links_partner_id_label_unique
  on public.partner_links (partner_id, label);

-- Keep updated_at fresh if the shared trigger helper exists.
do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'trg_partners_updated_at') then
      create trigger trg_partners_updated_at
        before update on public.partners
        for each row execute function public.set_updated_at();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'trg_partner_links_updated_at') then
      create trigger trg_partner_links_updated_at
        before update on public.partner_links
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- RLS: partner configuration is read server-side via service role (`supabaseAdmin`).
-- Lock down client access by default and follow existing admin conventions later.
alter table public.partners enable row level security;
alter table public.partner_links enable row level security;

-- Seed partners (idempotent).
insert into public.partners (key, name, category, status, priority, partner_type, disclosure_text, notes, is_active)
values
  (
    'fanatics',
    'Fanatics',
    'sporting_goods_affiliate',
    'active_tracking_links_created',
    'high',
    'affiliate',
    'TournamentInsights may earn a commission when you shop through our links.',
    'Fanatics Impact affiliate tracking links created. Use sport-specific routing where available. General tournament link is fallback. Do not encourage self-purchases, artificial clicks, or non-organic family purchases.',
    true
  ),
  (
    'opentable',
    'OpenTable',
    'restaurant_reservations',
    'application_pending',
    'medium',
    'api_affiliate_possible',
    'TournamentInsights may earn a referral fee when users reserve through partner links. Reservations and support are handled by OpenTable.',
    'Application pending. Researching referral fee, API access, real-time availability, attribution, seated diner reporting, and co-branded booking handoff.',
    true
  ),
  (
    'lucid_travel',
    'Lucid Travel',
    'team_travel_room_blocks',
    'application_pending',
    'high',
    'team_travel_revenue_share',
    'TournamentInsights may earn a referral fee when teams request or book rooms through partner links. Room block requests, bookings, payments, and support are handled by the travel partner.',
    'Best positioned for team hotel blocks and group room requests, not individual hotel search. Position as “Need rooms for your team?”',
    true
  ),
  (
    'dicks_sporting_goods',
    'Dick''s Sporting Goods',
    'sporting_goods_affiliate',
    'application_pending',
    'medium',
    'affiliate',
    'TournamentInsights may earn a commission when you shop through our links.',
    'Application pending. Potential fit for youth sports gear, tournament essentials, and sport-specific shopping modules.',
    true
  ),
  (
    'scheels',
    'Scheels',
    'sporting_goods_affiliate',
    'reapply_next_week',
    'low',
    'affiliate',
    'TournamentInsights may earn a commission when you shop through our links.',
    'Re-apply next week. Position around youth sports families, tournament essentials, and sporting goods.',
    true
  )
on conflict (key) do update set
  name = excluded.name,
  category = excluded.category,
  status = excluded.status,
  priority = excluded.priority,
  partner_type = excluded.partner_type,
  disclosure_text = excluded.disclosure_text,
  notes = excluded.notes,
  is_active = excluded.is_active;

-- Seed Fanatics partner links (idempotent).
do $$
declare
  fanatics_id uuid;
begin
  select id into fanatics_id from public.partners where key = 'fanatics' limit 1;
  if fanatics_id is null then
    return;
  end if;

  insert into public.partner_links (
    partner_id, label, url, destination_type, page_type, placement, sport, campaign,
    shared_id, sub_id_1, sub_id_2, sub_id_3, is_active, sort_order
  )
  values
    (
      fanatics_id,
      'General Gear Hub',
      'https://fanatics.93n6tx.net/MKbLNK',
      'gear_hub',
      'gear_hub',
      'fanatics_module',
      'all_sports',
      'fanatics_launch',
      'tournamentinsights',
      'gear_hub',
      'fanatics_module',
      'all_sports',
      true,
      10
    ),
    (
      fanatics_id,
      'Tournament Pages',
      'https://fanatics.93n6tx.net/k4WqWN',
      'tournament_page',
      'tournament_page',
      'gear_module',
      'all_sports',
      'fanatics_launch',
      'tournamentinsights',
      'tournament_page',
      'gear_module',
      'all_sports',
      true,
      20
    ),
    (
      fanatics_id,
      'Baseball & Softball Tournament Pages',
      'https://fanatics.93n6tx.net/DW3N3d',
      'sport_tournament_page',
      'tournament_page',
      'gear_module',
      'baseball_softball',
      'fanatics_launch',
      'tournamentinsights',
      'tournament_page',
      'gear_module',
      'baseball_softball',
      true,
      30
    ),
    (
      fanatics_id,
      'Basketball Tournament Pages',
      'https://fanatics.93n6tx.net/PzbDbQ',
      'sport_tournament_page',
      'tournament_page',
      'gear_module',
      'basketball',
      'fanatics_launch',
      'tournamentinsights',
      'tournament_page',
      'gear_module',
      'basketball',
      true,
      40
    ),
    (
      fanatics_id,
      'Soccer Tournament Pages',
      'https://fanatics.93n6tx.net/k4WqWd',
      'sport_tournament_page',
      'tournament_page',
      'gear_module',
      'soccer',
      'fanatics_launch',
      'tournamentinsights',
      'tournament_page',
      'gear_module',
      'soccer',
      true,
      50
    ),
    (
      fanatics_id,
      'Hockey Tournament Pages',
      'https://fanatics.93n6tx.net/GbgNgL',
      'sport_tournament_page',
      'tournament_page',
      'gear_module',
      'hockey',
      'fanatics_launch',
      'tournamentinsights',
      'tournament_page',
      'gear_module',
      'hockey',
      true,
      60
    ),
    (
      fanatics_id,
      'Lacrosse Tournament Pages',
      'https://fanatics.93n6tx.net/VON5NE',
      'sport_tournament_page',
      'tournament_page',
      'gear_module',
      'lacrosse',
      'fanatics_launch',
      'tournamentinsights',
      'tournament_page',
      'gear_module',
      'lacrosse',
      true,
      70
    )
  on conflict (partner_id, label) do update set
    url = excluded.url,
    destination_type = excluded.destination_type,
    page_type = excluded.page_type,
    placement = excluded.placement,
    sport = excluded.sport,
    campaign = excluded.campaign,
    shared_id = excluded.shared_id,
    sub_id_1 = excluded.sub_id_1,
    sub_id_2 = excluded.sub_id_2,
    sub_id_3 = excluded.sub_id_3,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order;
end $$;

