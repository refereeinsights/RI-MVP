-- Tournament enrichment tables and policies
-- Run with service role. Assumes profiles table has role column.
create extension if not exists "pgcrypto";

create table if not exists tournament_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  status text not null default 'queued',
  attempt_count int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  pages_fetched_count int not null default 0,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists tournament_enrichment_jobs_active_idx
  on tournament_enrichment_jobs (tournament_id)
  where status in ('queued', 'running');

create table if not exists tournament_contact_candidates (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  role_raw text,
  role_normalized text,
  name text,
  email text,
  phone text,
  source_url text,
  evidence_text text,
  confidence numeric,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists tournament_contact_candidates_tid_idx on tournament_contact_candidates(tournament_id);
create index if not exists tournament_contact_candidates_email_idx on tournament_contact_candidates(email);
create index if not exists tournament_contact_candidates_role_idx on tournament_contact_candidates(role_normalized);

create unique index if not exists tournament_contact_candidates_dedupe_idx
  on tournament_contact_candidates (
    tournament_id,
    coalesce(email, ''),
    coalesce(phone, ''),
    role_normalized,
    coalesce(source_url, '')
  );

create table if not exists tournament_venue_candidates (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  venue_name text,
  address_text text,
  venue_url text,
  source_url text,
  evidence_text text,
  confidence numeric,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists tournament_venue_candidates_tid_idx on tournament_venue_candidates(tournament_id);
create index if not exists tournament_venue_candidates_name_idx on tournament_venue_candidates(venue_name);

create unique index if not exists tournament_venue_candidates_dedupe_idx
  on tournament_venue_candidates (
    tournament_id,
    lower(coalesce(venue_name, '')),
    lower(coalesce(address_text, '')),
    coalesce(source_url, '')
  );

create table if not exists tournament_referee_comp_candidates (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  rate_text text,
  rate_amount_min numeric,
  rate_amount_max numeric,
  rate_unit text,
  division_context text,
  travel_housing_text text,
  assigning_platforms text[],
  source_url text,
  evidence_text text,
  confidence numeric,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists tournament_referee_comp_candidates_tid_idx on tournament_referee_comp_candidates(tournament_id);

create unique index if not exists tournament_referee_comp_candidates_dedupe_idx
  on tournament_referee_comp_candidates (
    tournament_id,
    coalesce(source_url, ''),
    md5(coalesce(rate_text, '') || '|' || coalesce(travel_housing_text, ''))
  );

-- updated_at trigger
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_tournament_enrichment_jobs_updated_at'
  ) then
    create trigger set_tournament_enrichment_jobs_updated_at
      before update on tournament_enrichment_jobs
      for each row execute function set_updated_at();
  end if;
end $$;

-- RLS
alter table tournament_enrichment_jobs enable row level security;
alter table tournament_contact_candidates enable row level security;
alter table tournament_venue_candidates enable row level security;
alter table tournament_referee_comp_candidates enable row level security;

create or replace function is_admin() returns boolean language sql stable as $$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
$$;

do $$
begin
  -- jobs
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_enrichment_jobs') then
    create policy admin_all_tournament_enrichment_jobs
      on tournament_enrichment_jobs
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  -- contacts
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_contact_candidates') then
    create policy admin_all_tournament_contact_candidates
      on tournament_contact_candidates
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  -- venues
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_venue_candidates') then
    create policy admin_all_tournament_venue_candidates
      on tournament_venue_candidates
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  -- comp
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_referee_comp_candidates') then
    create policy admin_all_tournament_referee_comp_candidates
      on tournament_referee_comp_candidates
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;
