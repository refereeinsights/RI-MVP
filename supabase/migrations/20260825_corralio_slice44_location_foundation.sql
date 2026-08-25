-- Corralio Slice 4.4: household-private event-to-canonical-venue provenance.
-- Canonical venue truth remains read-only through venues_public. Event
-- geocodes remain the Slice 4.3 Geocodio facts and are never overwritten here.

alter table public.corralio_events
  add constraint corralio_events_household_id_id_unique
  unique (household_id, id);

create table public.corralio_event_venue_matches (
  event_id uuid primary key,
  household_id uuid not null,
  venue_id uuid null,
  match_status text not null,
  location_fingerprint text not null,
  matcher_version text not null,
  evaluated_at timestamptz not null,
  matched_at timestamptz null,
  recheck_after timestamptz null,
  constraint corralio_event_venue_matches_event_household_fk
    foreign key (household_id, event_id)
    references public.corralio_events(household_id, id)
    on delete cascade,
  constraint corralio_event_venue_matches_status_check
    check (match_status in ('matched', 'unmatched', 'private_skipped', 'insufficient_location')),
  constraint corralio_event_venue_matches_fingerprint_check
    check (length(location_fingerprint) = 64 and location_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint corralio_event_venue_matches_matcher_version_check
    check (length(btrim(matcher_version)) between 1 and 80),
  constraint corralio_event_venue_matches_state_check
    check (
      (
        match_status = 'matched'
        and venue_id is not null
        and matched_at is not null
        and recheck_after is null
      )
      or
      (
        match_status = 'unmatched'
        and venue_id is null
        and matched_at is null
        and recheck_after is not null
        and recheck_after > evaluated_at
      )
      or
      (
        match_status in ('private_skipped', 'insufficient_location')
        and venue_id is null
        and matched_at is null
        and recheck_after is null
      )
    ),
  constraint corralio_event_venue_matches_time_check
    check (matched_at is null or matched_at = evaluated_at)
);

create index corralio_event_venue_matches_household_status_idx
  on public.corralio_event_venue_matches (household_id, match_status, evaluated_at desc);

create index corralio_event_venue_matches_recheck_idx
  on public.corralio_event_venue_matches (recheck_after)
  where match_status = 'unmatched';

alter table public.corralio_event_venue_matches enable row level security;
alter table public.corralio_event_venue_matches force row level security;
alter table public.corralio_event_venue_matches owner to postgres;

revoke all on table public.corralio_event_venue_matches
  from public, anon, authenticated;
grant select, insert, update, delete on table public.corralio_event_venue_matches
  to service_role;

comment on table public.corralio_event_venue_matches is
  'Household-private Corralio event association to read-only canonical venue truth; service-role writes only.';
comment on column public.corralio_event_venue_matches.venue_id is
  'Advisory canonical venue UUID without a cross-domain foreign key; absence from venues_public triggers re-evaluation.';
comment on column public.corralio_event_venue_matches.location_fingerprint is
  'SHA-256 of household UUID plus normalized event location; never display or log.';
comment on column public.corralio_event_venue_matches.recheck_after is
  'Unmatched-only bounded reconsideration time; other statuses re-evaluate on fingerprint/version/current-venue change.';
