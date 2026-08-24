-- TI hotel bookings: store HotelPlanner getReport records for reconciliation.
-- Dedup key: itinerary_number (HP "Itinerary" column, e.g. "H19847687").
-- Attribution join: outbound_attribution_id parsed from Custom3 ("attr:{id}").
-- Do NOT apply automatically — production DB is live.

create table if not exists public.ti_hotel_bookings (
  id                        uuid primary key default gen_random_uuid(),
  itinerary_number          text not null,
  confirmation_number       text,
  status                    text,
  outbound_attribution_id   text,
  purchased_at              timestamptz,
  checkin_date              date,
  checkout_date             date,
  nights                    numeric,
  rooms_count               numeric,
  hotel_name                text,
  hotel_city                text,
  hotel_state               text,
  hotel_country             text,
  hp_hotel_id               text,
  avg_rate_usd              numeric,
  total_usd                 numeric,
  expected_commission_usd   numeric,
  paid_commission_usd       numeric,
  commission_status         text,
  source                    text,
  keyword                   text,
  job_code                  text,
  custom1                   text,
  custom2                   text,
  custom3                   text,
  custom4                   text,
  custom5                   text,
  custom6                   text,
  custom7                   text,
  custom8                   text,
  cancel_date               date,
  is_mobile                 boolean,
  currency                  text,
  synced_at                 timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  constraint ti_hotel_bookings_itinerary_number_key unique (itinerary_number)
);

create index if not exists ti_hotel_bookings_status_idx
  on public.ti_hotel_bookings (status);

create index if not exists ti_hotel_bookings_purchased_at_idx
  on public.ti_hotel_bookings (purchased_at desc);

create index if not exists ti_hotel_bookings_outbound_attribution_id_idx
  on public.ti_hotel_bookings (outbound_attribution_id)
  where outbound_attribution_id is not null;

alter table public.ti_hotel_bookings enable row level security;

revoke all on table public.ti_hotel_bookings from public;
revoke all on table public.ti_hotel_bookings from anon;
revoke all on table public.ti_hotel_bookings from authenticated;
grant all on table public.ti_hotel_bookings to service_role;
