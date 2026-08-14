-- TI Hotel Fee Program Phase 2.
-- Stores one current, trusted fee-program configuration per tournament.
-- Absence of a row means standard/not enrolled. No fee destinations are stored here.

create table if not exists public.ti_tournament_hotel_programs (
  tournament_id uuid primary key
    references public.tournaments(id) on delete cascade,
  program_type text not null,
  rate_cents integer not null,
  status text not null,
  configuration_version uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  constraint ti_tournament_hotel_programs_program_type_check
    check (program_type in ('ti_revenue', 'tournament_support')),
  constraint ti_tournament_hotel_programs_rate_cents_check
    check (rate_cents in (500, 1000)),
  constraint ti_tournament_hotel_programs_status_check
    check (status in ('pending', 'active', 'paused'))
);

comment on table public.ti_tournament_hotel_programs is
  'Current trusted TI HotelPlanner fee-program configuration. Historical economics live only in immutable ti_outbound_clicks snapshots.';
comment on column public.ti_tournament_hotel_programs.tournament_id is
  'Primary key: at most one current hotel program configuration per tournament.';
comment on column public.ti_tournament_hotel_programs.configuration_version is
  'Opaque concurrency/version UUID regenerated only for a meaningful configuration change.';
comment on column public.ti_tournament_hotel_programs.updated_by is
  'Authorized internal admin who last changed the current configuration.';

alter table public.ti_tournament_hotel_programs enable row level security;

revoke all on table public.ti_tournament_hotel_programs from public, anon, authenticated;
grant select, insert, update, delete on table public.ti_tournament_hotel_programs to service_role;
