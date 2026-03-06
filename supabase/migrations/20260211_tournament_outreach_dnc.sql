-- Tournament outreach tracking + do-not-contact flags
alter table if exists public.tournaments
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists do_not_contact_at timestamptz,
  add column if not exists do_not_contact_reason text;

create table if not exists public.tournament_outreach (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  contact_name text,
  contact_email text not null,
  status text not null default 'draft',
  email_subject_snapshot text,
  email_body_snapshot text,
  followup_subject_snapshot text,
  followup_body_snapshot text,
  sent_at timestamptz,
  followup_due_at timestamptz,
  followup_sent_at timestamptz,
  replied_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournament_outreach_tournament_idx
  on public.tournament_outreach(tournament_id);
create index if not exists tournament_outreach_status_idx
  on public.tournament_outreach(status);
create index if not exists tournament_outreach_followup_due_idx
  on public.tournament_outreach(followup_due_at);

-- Status constraint
 do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_outreach_status_check') then
    alter table public.tournament_outreach
      add constraint tournament_outreach_status_check
      check (status in ('draft','sent','followup_sent','replied','verified','closed','suppressed'));
  end if;
end $$;

-- updated_at trigger
 do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_tournament_outreach_updated_at'
  ) then
    create trigger set_tournament_outreach_updated_at
      before update on public.tournament_outreach
      for each row execute function set_updated_at();
  end if;
end $$;

alter table public.tournament_outreach enable row level security;

 do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_outreach') then
    create policy admin_all_tournament_outreach
      on public.tournament_outreach
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;
