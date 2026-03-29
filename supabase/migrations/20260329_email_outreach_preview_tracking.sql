-- Outreach previews: track sending + director replies for follow-up workflows.

alter table public.email_outreach_previews
  add column if not exists sent_at timestamptz,
  add column if not exists send_attempt_count integer not null default 0,
  add column if not exists director_replied_at timestamptz,
  add column if not exists director_replied_note text,
  add column if not exists director_replied_by_email text;

create index if not exists email_outreach_previews_sent_at_idx
  on public.email_outreach_previews (sent_at desc);

create index if not exists email_outreach_previews_replied_at_idx
  on public.email_outreach_previews (director_replied_at desc);

