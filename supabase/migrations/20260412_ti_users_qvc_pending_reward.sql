-- TI: pending QVC Weekend Pro reward status (v1)
-- Tracks when a user signed up via the Quick Venue Check reward flow, so we can
-- show a "pending reward" state and make the claim flow resilient across browsers.

do $$
begin
  if to_regclass('public.ti_users') is null then
    return;
  end if;

  alter table public.ti_users
    add column if not exists qvc_pending_quick_check_id uuid null,
    add column if not exists qvc_pending_browser_hash text null,
    add column if not exists qvc_pending_set_at timestamptz null;
end $$;

