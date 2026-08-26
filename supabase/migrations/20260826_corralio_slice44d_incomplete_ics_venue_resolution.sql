-- Corralio Slice 4.4D Stage 1: deterministic incomplete ICS venue resolution.
-- Prepared only. A human must apply this migration before Stage 2 verification.
-- This migration creates no canonical/provisional venue and performs no backfill.

create index if not exists venues_identity_normalized_name_idx
  on public.venues (public.identity_normalize_text(name), id)
  where name is not null;

create table public.corralio_venue_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_kind text not null,
  normalized_alias text not null,
  normalized_city text null,
  state text null,
  canonical_venue_id uuid null references public.venues(id) on delete restrict,
  provisional_venue_id uuid null
    references public.corralio_provisional_venues(id) on delete restrict,
  evidence_source text not null,
  normalizer_version text not null,
  created_at timestamptz not null default now(),
  constraint corralio_venue_aliases_kind_check
    check (alias_kind in ('name', 'address', 'full_location')),
  constraint corralio_venue_aliases_value_check
    check (length(normalized_alias) between 3 and 300),
  constraint corralio_venue_aliases_city_check
    check (normalized_city is null or length(normalized_city) between 2 and 100),
  constraint corralio_venue_aliases_state_check
    check (state is null or state ~ '^[A-Z]{2}$'),
  constraint corralio_venue_aliases_scope_check check (
    (alias_kind = 'name' and normalized_city is null and state is null)
    or (alias_kind in ('address', 'full_location') and normalized_city is not null and state is not null)
  ),
  constraint corralio_venue_aliases_target_exactly_one_check check (
    (canonical_venue_id is not null)::integer
      + (provisional_venue_id is not null)::integer = 1
  ),
  constraint corralio_venue_aliases_evidence_check check (
    evidence_source in (
      'deterministic_canonical_match',
      'validated_provisional_creation',
      'overture_place_match',
      'trusted_manual_verification'
    )
  ),
  constraint corralio_venue_aliases_normalizer_check
    check (normalizer_version = 'corralio-venue-alias-v1'),
  constraint corralio_venue_aliases_identity_unique
    unique nulls not distinct (alias_kind, normalized_alias, normalized_city, state)
);

create index corralio_venue_aliases_canonical_idx
  on public.corralio_venue_aliases (canonical_venue_id, id)
  where canonical_venue_id is not null;
create index corralio_venue_aliases_provisional_idx
  on public.corralio_venue_aliases (provisional_venue_id, id)
  where provisional_venue_id is not null;

alter table public.corralio_venue_aliases enable row level security;
alter table public.corralio_venue_aliases force row level security;
alter table public.corralio_venue_aliases owner to postgres;
revoke all on table public.corralio_venue_aliases
  from public, anon, authenticated, service_role;
grant select, insert on table public.corralio_venue_aliases to service_role;

comment on table public.corralio_venue_aliases is
  'Validated public-place aliases only; never household/source/event identity or private origins.';

create function public.corralio_find_unique_canonical_venue_by_name_v1(
  p_normalized_name text
)
returns table(id uuid, name text, address text, city text, state text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with matches as materialized (
    select venue.id, venue.name, venue.address, venue.city, venue.state
    from public.venues venue
    where public.identity_normalize_text(venue.name) = p_normalized_name
    order by venue.id
    limit 2
  )
  select match.id, match.name, match.address, match.city, match.state
  from matches match
  where (select count(*) from matches) = 1
    and p_normalized_name is not null
    and length(p_normalized_name) between 3 and 200;
$function$;

revoke all on function public.corralio_find_unique_canonical_venue_by_name_v1(text)
  from public, anon, authenticated;
grant execute on function public.corralio_find_unique_canonical_venue_by_name_v1(text)
  to service_role;
alter function public.corralio_find_unique_canonical_venue_by_name_v1(text)
  owner to postgres;
