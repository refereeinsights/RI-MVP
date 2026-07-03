create table if not exists public.tournament_roll_forward_log (
  id uuid primary key default gen_random_uuid(),
  parent_tournament_id uuid not null references public.tournaments(id) on delete cascade,
  target_year integer not null,
  status text not null,
  sibling_id uuid null references public.tournaments(id) on delete set null,
  notes text null,
  researched_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_roll_forward_log_status_check
    check (status in ('pending', 'no_dates_announced', 'discontinued', 'done', 'ambiguous'))
);

create unique index if not exists tournament_roll_forward_log_parent_year_key
  on public.tournament_roll_forward_log(parent_tournament_id, target_year);

create index if not exists tournament_roll_forward_log_status_target_year_idx
  on public.tournament_roll_forward_log(status, target_year);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    if not exists (
      select 1 from pg_trigger where tgname = 'trg_tournament_roll_forward_log_updated_at'
    ) then
      create trigger trg_tournament_roll_forward_log_updated_at
        before update on public.tournament_roll_forward_log
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table public.tournament_roll_forward_log enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_roll_forward_log'
      and policyname = 'admin_all_tournament_roll_forward_log'
  ) then
    create policy admin_all_tournament_roll_forward_log
      on public.tournament_roll_forward_log
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;
