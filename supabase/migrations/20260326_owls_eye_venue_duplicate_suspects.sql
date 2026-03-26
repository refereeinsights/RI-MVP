-- Persisted Owl's Eye venue duplicate suspects.
-- Owl's Eye duplicate detection is fairly accurate; store the suspect pairs so the
-- `/admin/venues?duplicates=1` duplicate review UI can surface them.

create table if not exists public.owls_eye_venue_duplicate_suspects (
  id uuid primary key default gen_random_uuid(),
  source_venue_id uuid not null references public.venues(id) on delete cascade,
  candidate_venue_id uuid not null references public.venues(id) on delete cascade,
  score integer not null,
  status text not null default 'open',
  note text,
  created_by uuid references auth.users(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint owls_eye_venue_duplicate_suspects_pair_check check (source_venue_id <> candidate_venue_id),
  constraint owls_eye_venue_duplicate_suspects_status_check check (status in ('open', 'ignored', 'resolved'))
);

create unique index if not exists owls_eye_venue_duplicate_suspects_unique
  on public.owls_eye_venue_duplicate_suspects (source_venue_id, candidate_venue_id);

create index if not exists owls_eye_venue_duplicate_suspects_status_idx
  on public.owls_eye_venue_duplicate_suspects (status, last_seen_at desc);

create trigger trg_owls_eye_venue_duplicate_suspects_updated_at
before update on public.owls_eye_venue_duplicate_suspects
for each row execute function public.set_updated_at();

alter table if exists public.owls_eye_venue_duplicate_suspects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'owls_eye_venue_duplicate_suspects'
      and policyname = 'admin_all_owls_eye_venue_duplicate_suspects'
  ) then
    create policy admin_all_owls_eye_venue_duplicate_suspects
      on public.owls_eye_venue_duplicate_suspects
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;

