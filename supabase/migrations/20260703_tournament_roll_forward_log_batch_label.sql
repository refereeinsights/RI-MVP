alter table public.tournament_roll_forward_log
  add column if not exists batch_label text null;

create index if not exists tournament_roll_forward_log_batch_label_idx
  on public.tournament_roll_forward_log(batch_label);
