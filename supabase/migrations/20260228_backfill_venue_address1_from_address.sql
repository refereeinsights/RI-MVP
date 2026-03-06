update public.venues
set address1 = nullif(btrim(split_part(address, ',', 1)), '')
where coalesce(btrim(address1), '') = ''
  and coalesce(btrim(address), '') <> '';
