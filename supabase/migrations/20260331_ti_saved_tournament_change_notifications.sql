-- TI: Saved tournament change notifications (v1)
--
-- Adds opt-in notification settings + job-managed last-notified state to ti_saved_tournaments.
-- v1 goals:
-- - user-managed toggle: notify_on_changes
-- - job-managed: last_notified_at + last_notified_hash (+ critical hash)
-- - RLS: users can update only their own rows

alter table public.ti_saved_tournaments
  add column if not exists notify_on_changes boolean not null default false,
  add column if not exists last_notified_at timestamptz null,
  add column if not exists last_notified_hash text null,
  add column if not exists last_notified_critical_hash text null;

create index if not exists ti_saved_tournaments_notify_on_changes_idx
  on public.ti_saved_tournaments (notify_on_changes)
  where notify_on_changes = true;

create index if not exists ti_saved_tournaments_user_notify_idx
  on public.ti_saved_tournaments (user_id, notify_on_changes);

create index if not exists ti_saved_tournaments_user_last_notified_idx
  on public.ti_saved_tournaments (user_id, last_notified_at desc);

-- Allow users to update their own rows (needed for notify_on_changes toggle).
drop policy if exists ti_saved_tournaments_update_own on public.ti_saved_tournaments;
create policy ti_saved_tournaments_update_own
on public.ti_saved_tournaments
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant update on public.ti_saved_tournaments to authenticated;

