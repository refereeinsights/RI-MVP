-- Sport validation rules and ledger

-- Rules table
create table if not exists public.sport_validation_rules (
  id uuid primary key default gen_random_uuid(),
  rule_name text not null,
  rule_type text not null check (rule_type in ('host_contains','url_contains','name_contains','organizer_contains','regex')),
  pattern text not null,
  detected_sport text not null,
  confidence_score numeric default 1.0,
  auto_confirm boolean default true,
  priority integer default 100,
  active boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists sport_validation_rules_active_idx on public.sport_validation_rules(active, priority desc);

-- Validation ledger (one row per tournament, kept up to date)
create table if not exists public.tournament_sport_validation (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  current_sport text,
  validated_sport text,
  validation_status text,
  validation_method text,
  rule_name text,
  confidence_score numeric,
  evidence_summary text,
  source_url text,
  page_fingerprint text,
  processed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tournament_id)
);

-- Rollup columns on tournaments
alter table public.tournaments
  add column if not exists sport_validation_status text,
  add column if not exists sport_validation_method text,
  add column if not exists sport_validation_rule text,
  add column if not exists sport_validated_at timestamptz,
  add column if not exists sport_validation_processed_at timestamptz,
  add column if not exists validated_sport text,
  add column if not exists revalidate boolean not null default false;

-- Seed initial rules (idempotent inserts)
insert into public.sport_validation_rules (rule_name, rule_type, pattern, detected_sport, confidence_score, auto_confirm, priority, active, notes)
values
  ('ayso-name', 'name_contains', 'ayso', 'soccer', 0.95, true, 120, true, 'AYSO tournaments are soccer'),
  ('fastpitch-usssa-host', 'host_contains', 'fastpitch.usssa.com', 'softball', 0.98, true, 140, true, 'USSSA fastpitch host'),
  ('gsl-host', 'host_contains', 'gsltournaments.com', 'baseball', 0.95, true, 130, true, 'GSL baseball series'),
  ('nwyouthbaseball-host', 'host_contains', 'nwyouthbaseball.com', 'baseball', 0.95, true, 130, true, 'NW youth baseball'),
  ('pgnw-name', 'name_contains', 'pgnw', 'baseball', 0.9, true, 110, true, 'PGNW events'),
  ('nwn-name', 'name_contains', 'nwn', 'baseball', 0.9, true, 110, true, 'NWN events'),
  ('nsawa-name', 'name_contains', 'nsawa', 'softball', 0.92, true, 115, true, 'NSAWA softball')
on conflict (rule_name) do update set
  rule_type = excluded.rule_type,
  pattern = excluded.pattern,
  detected_sport = excluded.detected_sport,
  confidence_score = excluded.confidence_score,
  auto_confirm = excluded.auto_confirm,
  priority = excluded.priority,
  active = excluded.active,
  notes = excluded.notes,
  updated_at = now();
