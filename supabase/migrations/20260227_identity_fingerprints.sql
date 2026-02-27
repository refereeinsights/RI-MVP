-- Persisted venue/tournament identity fingerprints for duplicate detection.

create or replace function public.identity_normalize_text(input text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(regexp_replace(regexp_replace(lower(coalesce(input, '')), '[^a-z0-9\s]+', ' ', 'g'), '\s+', ' ', 'g')),
    ''
  );
$$;

create or replace function public.identity_normalize_street(input text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(
                            regexp_replace(
                              regexp_replace(
                                regexp_replace(
                                  regexp_replace(lower(coalesce(input, '')), '#\s*[a-z0-9-]+\m', ' ', 'g'),
                                  '\m(apt|apartment|suite|ste|unit|fl|floor)\M\s*[a-z0-9-]+',
                                  ' ',
                                  'g'
                                ),
                                '[^a-z0-9\s]+',
                                ' ',
                                'g'
                              ),
                              '\m(street|st)\M', ' st ', 'g'
                            ),
                            '\m(avenue|ave)\M', ' ave ', 'g'
                          ),
                          '\m(road|rd)\M', ' rd ', 'g'
                        ),
                        '\m(boulevard|blvd)\M', ' blvd ', 'g'
                      ),
                      '\m(drive|dr)\M', ' dr ', 'g'
                    ),
                    '\m(lane|ln)\M', ' ln ', 'g'
                  ),
                  '\m(court|ct)\M', ' ct ', 'g'
                ),
                '\m(place|pl)\M', ' pl ', 'g'
              ),
              '\m(parkway|pkwy)\M', ' pkwy ', 'g'
            ),
            '\s+', ' ', 'g'
          ),
          '^\s+', ''
        ),
        '\s+$', ''
      )
    ),
    ''
  );
$$;

create or replace function public.identity_normalize_url_host(input text)
returns text
language sql
immutable
as $$
  select nullif(
    split_part(
      split_part(
        split_part(
          regexp_replace(
            regexp_replace(lower(coalesce(input, '')), '^https?://', ''),
            '^www\.',
            ''
          ),
          '/',
          1
        ),
        '?',
        1
      ),
      '#',
      1
    ),
    ''
  );
$$;

create or replace function public.build_venue_address_fingerprint(
  p_address text,
  p_address1 text,
  p_normalized_address text,
  p_city text,
  p_state text
)
returns text
language sql
immutable
as $$
  select case
    when public.identity_normalize_street(coalesce(p_address1, p_address, p_normalized_address)) is null
      or public.identity_normalize_text(p_city) is null
      or public.identity_normalize_text(p_state) is null
    then null
    else concat_ws(
      '|',
      public.identity_normalize_street(coalesce(p_address1, p_address, p_normalized_address)),
      public.identity_normalize_text(p_city),
      public.identity_normalize_text(p_state)
    )
  end;
$$;

create or replace function public.build_venue_name_city_state_fingerprint(
  p_name text,
  p_city text,
  p_state text
)
returns text
language sql
immutable
as $$
  select case
    when public.identity_normalize_text(p_name) is null
      or public.identity_normalize_text(p_city) is null
      or public.identity_normalize_text(p_state) is null
    then null
    else concat_ws(
      '|',
      public.identity_normalize_text(p_name),
      public.identity_normalize_text(p_city),
      public.identity_normalize_text(p_state)
    )
  end;
$$;

create or replace function public.build_tournament_url_fingerprint(
  p_official_website_url text,
  p_source_url text
)
returns text
language sql
immutable
as $$
  select nullif(
    split_part(
      split_part(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(p_official_website_url, p_source_url, '')), '^https?://', ''),
            '^www\.',
            ''
          ),
          '/+$',
          ''
        ),
        '?',
        1
      ),
      '#',
      1
    ),
    ''
  );
$$;

create or replace function public.build_tournament_name_url_fingerprint(
  p_name text,
  p_official_website_url text,
  p_source_url text
)
returns text
language sql
immutable
as $$
  select case
    when public.identity_normalize_text(p_name) is null
      or public.build_tournament_url_fingerprint(p_official_website_url, p_source_url) is null
    then null
    else concat_ws(
      '|',
      public.identity_normalize_text(p_name),
      public.build_tournament_url_fingerprint(p_official_website_url, p_source_url)
    )
  end;
$$;

create or replace function public.build_tournament_name_state_season_fingerprint(
  p_name text,
  p_state text,
  p_start_date date,
  p_end_date date
)
returns text
language sql
immutable
as $$
  select case
    when public.identity_normalize_text(p_name) is null
      or public.identity_normalize_text(p_state) is null
      or coalesce(extract(year from p_start_date)::text, extract(year from p_end_date)::text) is null
    then null
    else concat_ws(
      '|',
      public.identity_normalize_text(p_name),
      public.identity_normalize_text(p_state),
      coalesce(extract(year from p_start_date)::text, extract(year from p_end_date)::text)
    )
  end;
$$;

alter table public.venues
  add column if not exists address_fingerprint text,
  add column if not exists name_city_state_fingerprint text,
  add column if not exists venue_url_host text;

alter table public.tournaments
  add column if not exists url_fingerprint text,
  add column if not exists name_url_fingerprint text,
  add column if not exists name_state_season_fingerprint text;

create or replace function public.set_venue_identity_fingerprints()
returns trigger
language plpgsql
as $$
begin
  new.address_fingerprint := public.build_venue_address_fingerprint(
    new.address,
    new.address1,
    new.normalized_address,
    new.city,
    new.state
  );
  new.name_city_state_fingerprint := public.build_venue_name_city_state_fingerprint(
    new.name,
    new.city,
    new.state
  );
  new.venue_url_host := public.identity_normalize_url_host(new.venue_url);
  return new;
end;
$$;

create or replace function public.set_tournament_identity_fingerprints()
returns trigger
language plpgsql
as $$
begin
  new.url_fingerprint := public.build_tournament_url_fingerprint(new.official_website_url, new.source_url);
  new.name_url_fingerprint := public.build_tournament_name_url_fingerprint(new.name, new.official_website_url, new.source_url);
  new.name_state_season_fingerprint := public.build_tournament_name_state_season_fingerprint(new.name, new.state, new.start_date, new.end_date);
  return new;
end;
$$;

drop trigger if exists trg_venues_identity_fingerprints on public.venues;
create trigger trg_venues_identity_fingerprints
before insert or update of name,address,address1,normalized_address,city,state,venue_url
on public.venues
for each row
execute function public.set_venue_identity_fingerprints();

drop trigger if exists trg_tournaments_identity_fingerprints on public.tournaments;
create trigger trg_tournaments_identity_fingerprints
before insert or update of name,state,start_date,end_date,official_website_url,source_url
on public.tournaments
for each row
execute function public.set_tournament_identity_fingerprints();

update public.venues
set
  address_fingerprint = public.build_venue_address_fingerprint(address, address1, normalized_address, city, state),
  name_city_state_fingerprint = public.build_venue_name_city_state_fingerprint(name, city, state),
  venue_url_host = public.identity_normalize_url_host(venue_url)
where true;

update public.tournaments
set
  url_fingerprint = public.build_tournament_url_fingerprint(official_website_url, source_url),
  name_url_fingerprint = public.build_tournament_name_url_fingerprint(name, official_website_url, source_url),
  name_state_season_fingerprint = public.build_tournament_name_state_season_fingerprint(name, state, start_date, end_date)
where true;

create index if not exists venues_address_fingerprint_idx
  on public.venues(address_fingerprint)
  where address_fingerprint is not null;

create index if not exists venues_name_city_state_fingerprint_idx
  on public.venues(name_city_state_fingerprint)
  where name_city_state_fingerprint is not null;

create index if not exists venues_url_host_idx
  on public.venues(venue_url_host)
  where venue_url_host is not null;

create index if not exists tournaments_url_fingerprint_idx
  on public.tournaments(url_fingerprint)
  where url_fingerprint is not null;

create index if not exists tournaments_name_url_fingerprint_idx
  on public.tournaments(name_url_fingerprint)
  where name_url_fingerprint is not null;

create index if not exists tournaments_name_state_season_fingerprint_idx
  on public.tournaments(name_state_season_fingerprint)
  where name_state_season_fingerprint is not null;
