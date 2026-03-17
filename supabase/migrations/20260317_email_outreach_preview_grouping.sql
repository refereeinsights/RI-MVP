-- Outreach previews: support batching multiple tournaments into one director email.

alter table public.email_outreach_previews
  add column if not exists tournament_ids uuid[] not null default '{}'::uuid[];

