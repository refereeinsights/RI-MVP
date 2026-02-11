-- Drop deprecated referee_hotel_info column (replaced by travel_lodging enum).
alter table if exists public.tournaments
  drop column if exists referee_hotel_info;
