-- Admin-managed overrides for venue duplicate review.
-- Allows explicitly keeping a pair of venues as distinct (e.g., same complex split by sport).

create table if not exists public.venue_duplicate_overrides (
  id uuid primary key default gen_random_uuid(),
  venue_a_id uuid not null references public.venues(id) on delete cascade,
  venue_b_id uuid not null references public.venues(id) on delete cascade,
  status text not null default 'keep_both',
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_duplicate_overrides_pair_check check (venue_a_id <> venue_b_id),
  constraint venue_duplicate_overrides_status_check check (status in ('keep_both'))
);

create unique index if not exists venue_duplicate_overrides_pair_unique
  on public.venue_duplicate_overrides (
    least(venue_a_id, venue_b_id),
    greatest(venue_a_id, venue_b_id)
  );

create index if not exists venue_duplicate_overrides_status_idx
  on public.venue_duplicate_overrides(status);

create trigger trg_venue_duplicate_overrides_updated_at
before update on public.venue_duplicate_overrides
for each row execute function public.set_updated_at();
