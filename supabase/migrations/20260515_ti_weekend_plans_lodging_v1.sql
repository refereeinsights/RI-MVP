-- TI Weekend Plans: manually entered lodging details (v1)
-- Lodging details are user-entered (no booking sync, no partner imports).

alter table if exists public.ti_weekend_plans
  add column if not exists lodging_name text,
  add column if not exists lodging_address text,
  add column if not exists check_in_date date,
  add column if not exists check_out_date date,
  add column if not exists lodging_notes text;

