alter table public.email_outreach_previews
  add column if not exists variant text,
  add column if not exists provider_message_id text;

create index if not exists email_outreach_previews_variant_idx
  on public.email_outreach_previews (campaign_id, variant, created_at desc);
