-- Tournament staff verification tokens + submissions
alter table if exists public.tournaments
  add column if not exists tournament_staff_verified boolean not null default false,
  add column if not exists tournament_staff_verified_at timestamptz,
  add column if not exists tournament_staff_verified_by_email text;

create table if not exists public.tournament_staff_verify_tokens (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by_user_id uuid null,
  sent_to_email text null
);

create index if not exists tournament_staff_verify_tokens_tournament_idx
  on public.tournament_staff_verify_tokens(tournament_id);
create index if not exists tournament_staff_verify_tokens_expires_idx
  on public.tournament_staff_verify_tokens(expires_at);

create table if not exists public.tournament_staff_verification_submissions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  token_id uuid references public.tournament_staff_verify_tokens(id) on delete set null,
  status text not null default 'pending_admin_review',
  submitted_at timestamptz not null default now(),
  proposed_values jsonb not null,
  snapshot_current jsonb not null,
  diff_fields text[] not null default '{}'::text[],
  submitter_name text null,
  submitter_email text null,
  reviewed_at timestamptz null,
  reviewed_by uuid null,
  review_notes text null
);

create index if not exists tournament_staff_verification_submissions_status_idx
  on public.tournament_staff_verification_submissions(status);
create index if not exists tournament_staff_verification_submissions_tournament_idx
  on public.tournament_staff_verification_submissions(tournament_id);
create index if not exists tournament_staff_verification_submissions_submitted_idx
  on public.tournament_staff_verification_submissions(submitted_at);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_staff_verification_submissions_status_check') then
    alter table public.tournament_staff_verification_submissions
      add constraint tournament_staff_verification_submissions_status_check
      check (status in ('pending_admin_review','approved','rejected'));
  end if;
end $$;

alter table public.tournament_staff_verify_tokens enable row level security;
alter table public.tournament_staff_verification_submissions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_staff_tokens') then
    create policy admin_all_tournament_staff_tokens
      on public.tournament_staff_verify_tokens
      for all
      using (is_admin())
      with check (is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_staff_submissions') then
    create policy admin_all_tournament_staff_submissions
      on public.tournament_staff_verification_submissions
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;
