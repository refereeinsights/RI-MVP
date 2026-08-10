-- TI hotel attribution: a hotel search can be generic or location-based and
-- therefore does not always have venue context.
--
-- This is a no-rewrite schema change. Tournament-official and foreign-key
-- integrity constraints remain unchanged.

alter table if exists public.ti_outbound_clicks
  drop constraint if exists ti_outbound_clicks_destination_type_hotels_requires_venue_id;
