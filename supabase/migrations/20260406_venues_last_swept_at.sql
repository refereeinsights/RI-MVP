-- Venues: track last venue sweep time (v1)
-- Used by `/admin/venues/sweep` to hide venues swept recently and show "last swept" timestamps.

alter table if exists public.venues
  add column if not exists last_swept_at timestamptz null;

create index if not exists venues_last_swept_at_idx
  on public.venues (last_swept_at desc);

