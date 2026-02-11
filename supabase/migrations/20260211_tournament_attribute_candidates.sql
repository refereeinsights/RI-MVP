-- Candidate attributes discovered via enrichment (enum-like referee logistics).
create table if not exists tournament_attribute_candidates (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  attribute_key text not null,
  attribute_value text not null,
  source_url text,
  evidence_text text,
  confidence numeric,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists tournament_attribute_candidates_tid_idx
  on tournament_attribute_candidates(tournament_id);
create index if not exists tournament_attribute_candidates_key_idx
  on tournament_attribute_candidates(attribute_key);

create unique index if not exists tournament_attribute_candidates_dedupe_idx
  on tournament_attribute_candidates (
    tournament_id,
    attribute_key,
    attribute_value,
    coalesce(source_url, '')
  );

alter table tournament_attribute_candidates enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_attribute_candidates') then
    create policy admin_all_tournament_attribute_candidates
      on tournament_attribute_candidates
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_attribute_candidates_value_check') then
    alter table public.tournament_attribute_candidates
      add constraint tournament_attribute_candidates_value_check check (
        (attribute_key = 'cash_at_field' and attribute_value in ('yes','no'))
        or (attribute_key = 'referee_food' and attribute_value in ('snacks','meal'))
        or (attribute_key = 'facilities' and attribute_value in ('restrooms','portables'))
        or (attribute_key = 'referee_tents' and attribute_value in ('yes','no'))
        or (attribute_key = 'travel_lodging' and attribute_value in ('hotel','stipend'))
        or (attribute_key = 'ref_game_schedule' and attribute_value in ('too close','just right','too much down time'))
        or (attribute_key = 'ref_parking' and attribute_value in ('close','a stroll','a hike'))
        or (attribute_key = 'ref_parking_cost' and attribute_value in ('free','paid'))
        or (attribute_key = 'mentors' and attribute_value in ('yes','no'))
        or (attribute_key = 'assigned_appropriately' and attribute_value in ('yes','no'))
      );
  end if;
end $$;
