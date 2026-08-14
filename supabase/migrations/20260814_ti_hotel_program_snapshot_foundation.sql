-- TI HotelPlanner fee attribution foundation.
-- Adds an immutable, nullable program snapshot without assigning economics to
-- historical rows. All live application traffic remains standard/non-fee.

do $$
begin
  if to_regclass('public.ti_outbound_clicks') is null then
    return;
  end if;

  alter table public.ti_outbound_clicks
    add column if not exists hotel_program_type text,
    add column if not exists hotel_program_rate_cents integer,
    add column if not exists hotel_program_beneficiary_type text,
    add column if not exists hotel_program_beneficiary_id uuid,
    add column if not exists hotel_program_version text;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ti_outbound_clicks'::regclass
      and conname = 'ti_outbound_clicks_hotel_program_snapshot_check'
  ) then
    alter table public.ti_outbound_clicks
      add constraint ti_outbound_clicks_hotel_program_snapshot_check
      check (
        (
          hotel_program_type is null
          and hotel_program_rate_cents is null
          and hotel_program_beneficiary_type is null
          and hotel_program_beneficiary_id is null
          and hotel_program_version is null
        )
        or (
          hotel_program_type = 'standard'
          and hotel_program_rate_cents = 0
          and hotel_program_beneficiary_type = 'none'
          and hotel_program_beneficiary_id is null
          and hotel_program_version is not null
          and length(btrim(hotel_program_version)) > 0
        )
        or (
          hotel_program_type = 'ti_revenue'
          and hotel_program_rate_cents in (500, 1000)
          and hotel_program_beneficiary_type = 'ti'
          and hotel_program_beneficiary_id is null
          and hotel_program_version is not null
          and length(btrim(hotel_program_version)) > 0
        )
        or (
          hotel_program_type = 'tournament_support'
          and hotel_program_rate_cents in (500, 1000)
          and hotel_program_beneficiary_type = 'tournament'
          and hotel_program_beneficiary_id is not null
          and hotel_program_version is not null
          and length(btrim(hotel_program_version)) > 0
        )
      ) not valid;
  end if;

  alter table public.ti_outbound_clicks
    validate constraint ti_outbound_clicks_hotel_program_snapshot_check;

  comment on column public.ti_outbound_clicks.hotel_program_type is
    'Immutable handoff-time HotelPlanner accounting program: standard, ti_revenue, or tournament_support.';
  comment on column public.ti_outbound_clicks.hotel_program_rate_cents is
    'Immutable USD cents per room night for the handoff-time HotelPlanner program.';
  comment on column public.ti_outbound_clicks.hotel_program_beneficiary_type is
    'Immutable economic owner classification: none, ti, or tournament.';
  comment on column public.ti_outbound_clicks.hotel_program_beneficiary_id is
    'Immutable beneficiary UUID snapshot; intentionally not a foreign key so it survives tournament deletion.';
  comment on column public.ti_outbound_clicks.hotel_program_version is
    'Immutable non-empty identifier for the handoff-time HotelPlanner program configuration.';
end $$;

create or replace function public.prevent_ti_outbound_hotel_program_snapshot_update_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.hotel_program_type is distinct from new.hotel_program_type
    or old.hotel_program_rate_cents is distinct from new.hotel_program_rate_cents
    or old.hotel_program_beneficiary_type is distinct from new.hotel_program_beneficiary_type
    or old.hotel_program_beneficiary_id is distinct from new.hotel_program_beneficiary_id
    or old.hotel_program_version is distinct from new.hotel_program_version
  then
    raise exception 'hotel program snapshot is immutable'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_ti_outbound_hotel_program_snapshot_update_v1() from public, anon, authenticated;
grant execute on function public.prevent_ti_outbound_hotel_program_snapshot_update_v1() to service_role;

do $$
begin
  if to_regclass('public.ti_outbound_clicks') is null then
    return;
  end if;

  drop trigger if exists ti_outbound_hotel_program_snapshot_immutable_v1
    on public.ti_outbound_clicks;

  create trigger ti_outbound_hotel_program_snapshot_immutable_v1
    before update of
      hotel_program_type,
      hotel_program_rate_cents,
      hotel_program_beneficiary_type,
      hotel_program_beneficiary_id,
      hotel_program_version
    on public.ti_outbound_clicks
    for each row
    execute function public.prevent_ti_outbound_hotel_program_snapshot_update_v1();
end $$;

-- Preserve HotelPlanner hotel attribution before the existing tournament FK
-- cascade runs. Tournament-official rows keep their existing constraint and
-- delete behavior.
create or replace function public.preserve_ti_hotel_outbounds_before_tournament_delete_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.ti_outbound_clicks
  set tournament_id = null
  where tournament_id = old.id
    and destination_type = 'hotels'
    and (partner = 'hotelplanner' or outbound_partner = 'hotelplanner');
  return old;
end;
$$;

revoke all on function public.preserve_ti_hotel_outbounds_before_tournament_delete_v1() from public, anon, authenticated;
grant execute on function public.preserve_ti_hotel_outbounds_before_tournament_delete_v1() to service_role;

do $$
begin
  if to_regclass('public.tournaments') is null
    or to_regclass('public.ti_outbound_clicks') is null
  then
    return;
  end if;

  drop trigger if exists preserve_ti_hotel_outbounds_before_tournament_delete_v1
    on public.tournaments;

  create trigger preserve_ti_hotel_outbounds_before_tournament_delete_v1
    before delete on public.tournaments
    for each row
    execute function public.preserve_ti_hotel_outbounds_before_tournament_delete_v1();
end $$;
