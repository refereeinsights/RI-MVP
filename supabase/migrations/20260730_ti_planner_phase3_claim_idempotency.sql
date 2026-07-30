-- TI Weekend Planner Phase 3: durable anonymous-claim idempotency fields.

do $$
begin
  if to_regclass('public.planner_events') is null then
    return;
  end if;

  alter table public.planner_events
    add column if not exists planner_session_id uuid,
    add column if not exists claim_source text;

  create index if not exists planner_events_user_planner_session_claim_source_idx
    on public.planner_events (user_id, planner_session_id, claim_source)
    where planner_session_id is not null;
end $$;
