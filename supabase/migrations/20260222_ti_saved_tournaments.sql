create table if not exists public.ti_saved_tournaments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, tournament_id)
);

alter table public.ti_saved_tournaments enable row level security;

drop policy if exists ti_saved_tournaments_select_own on public.ti_saved_tournaments;
create policy ti_saved_tournaments_select_own
on public.ti_saved_tournaments
for select
using (auth.uid() = user_id);

drop policy if exists ti_saved_tournaments_insert_own on public.ti_saved_tournaments;
create policy ti_saved_tournaments_insert_own
on public.ti_saved_tournaments
for insert
with check (auth.uid() = user_id);

drop policy if exists ti_saved_tournaments_delete_own on public.ti_saved_tournaments;
create policy ti_saved_tournaments_delete_own
on public.ti_saved_tournaments
for delete
using (auth.uid() = user_id);

grant select, insert, delete on public.ti_saved_tournaments to authenticated;
