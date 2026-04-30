-- TI: store last Stripe invoice/payment refs on ti_users (v1)
-- Adds low-risk support fields for billing diagnostics without introducing a transactions table.

do $$
begin
  if to_regclass('public.ti_users') is null then
    return;
  end if;

  alter table public.ti_users
    add column if not exists last_invoice_id text null,
    add column if not exists last_payment_intent_id text null;
end $$;

create index if not exists ti_users_last_invoice_id_idx
  on public.ti_users (last_invoice_id)
  where last_invoice_id is not null;

create index if not exists ti_users_last_payment_intent_id_idx
  on public.ti_users (last_payment_intent_id)
  where last_payment_intent_id is not null;

