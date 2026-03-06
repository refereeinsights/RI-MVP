-- Allow dismissing duplicate groups in admin.
create table if not exists public.tournament_duplicate_dismissals (
  id uuid primary key default gen_random_uuid(),
  key_type text not null,
  key_value text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists tournament_duplicate_dismissals_key_idx
  on public.tournament_duplicate_dismissals(key_type, key_value);

alter table public.tournament_duplicate_dismissals enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_duplicate_dismissals') then
    create policy admin_all_tournament_duplicate_dismissals
      on public.tournament_duplicate_dismissals
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;
