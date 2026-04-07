-- TI: Saved tournament change notifications: store last snapshot (v2)
--
-- v1 stored only a hash, which detects changes but can't explain "what changed".
-- v2 stores the last notified public snapshot (jsonb) so the job can produce a
-- per-tournament change summary in the email.
--
-- Also tightens auth role privileges so authenticated users can update only
-- `notify_on_changes` (job-managed fields remain service-role only in practice).

alter table public.ti_saved_tournaments
  add column if not exists last_notified_snapshot jsonb null;

revoke update on public.ti_saved_tournaments from authenticated;
grant update (notify_on_changes) on public.ti_saved_tournaments to authenticated;

