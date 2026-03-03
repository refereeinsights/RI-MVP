alter table public.tournament_partner_nearby
  add column if not exists venue_id uuid references public.venues(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'tournament_partner_nearby_category_check'
  ) then
    alter table public.tournament_partner_nearby
      drop constraint tournament_partner_nearby_category_check;
  end if;
end $$;

alter table public.tournament_partner_nearby
  add constraint tournament_partner_nearby_category_check
  check (category ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

create index if not exists tournament_partner_nearby_tournament_idx
  on public.tournament_partner_nearby (tournament_id, venue_id, is_active, category, sort_order, created_at desc);
