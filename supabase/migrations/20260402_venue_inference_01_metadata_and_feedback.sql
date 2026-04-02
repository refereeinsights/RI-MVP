-- Tournament venue inference metadata + feedback (v1)
-- Adds additive metadata fields to `public.tournament_venues` for inferred links.
-- Adds a lightweight feedback table to persist admin decisions (reject/confirm) so
-- bad inferred pairs are not repeatedly suggested.
--
-- Safety rules:
-- - `tournament_venues.is_inferred = false` remains the "confirmed/default" read behavior.
-- - Inference tooling must never mark inferred rows as primary.

do $$
begin
  if to_regclass('public.tournament_venues') is null then
    return;
  end if;

  -- Inference metadata (applies primarily to inferred rows; confirmed rows may leave null).
  alter table public.tournament_venues
    add column if not exists inference_confidence numeric(5,4),
    add column if not exists inference_method text,
    add column if not exists inferred_at timestamptz,
    add column if not exists inference_run_id uuid;

  -- Helpful partial indexes for admin/inference workflows.
  create index if not exists tournament_venues_tournament_inferred_idx
    on public.tournament_venues (tournament_id)
    where is_inferred = true;

  create index if not exists tournament_venues_inferred_method_idx
    on public.tournament_venues (inference_method)
    where is_inferred = true;

  create index if not exists tournament_venues_inferred_run_idx
    on public.tournament_venues (inference_run_id)
    where is_inferred = true;

  comment on column public.tournament_venues.is_inferred is
    'Guardrail: default/confirmed reads should filter is_inferred=false. Inferred rows are non-authoritative until promoted.';
end $$;

-- Rejection / confirmation memory for inference suggestions.
create table if not exists public.tournament_venue_inference_feedback (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  inference_method text not null,
  feedback_status text not null check (feedback_status in ('rejected','confirmed')),
  feedback_notes text,
  feedback_at timestamptz not null default now(),
  feedback_by uuid
);

create unique index if not exists tournament_venue_inference_feedback_unique_idx
  on public.tournament_venue_inference_feedback (tournament_id, venue_id, inference_method);

create index if not exists tournament_venue_inference_feedback_status_idx
  on public.tournament_venue_inference_feedback (feedback_status);

create index if not exists tournament_venue_inference_feedback_tournament_idx
  on public.tournament_venue_inference_feedback (tournament_id);

alter table public.tournament_venue_inference_feedback enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_venue_inference_feedback'
      and policyname = 'admin_all_tournament_venue_inference_feedback'
  ) then
    create policy admin_all_tournament_venue_inference_feedback
      on public.tournament_venue_inference_feedback
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;

